// main.cpp — ciclo principal da estação meteorológica (NodeMCU ESP32).
//
// MODELO: laço contínuo com LIGHTSLEEP (não deepsleep): a RAM é preservada e o
// pluviômetro acorda a placa a cada transição (wake por nível alternado).
//
// Fluxo:
//   boot: monta o LittleFS, recupera .tmp órfão, restaura tips/hora da RTC
//         memory, Wi-Fi + NTP, envia o que sobrou no buffer
//   laço: dorme até o alvo fixo da próxima leitura (15 min, contando chuva)
//         -> lê os sensores -> grava no buffer
//         -> a cada 4 leituras (1 h): Wi-Fi + NTP + envio em lotes
//            (só remove do buffer com HTTP 2xx; a API usa 202)
//
// SENSOR UV: temporariamente DESCONECTADO (hardware ainda não instalado). Para
// religar: descomentar g_uv, incluí-lo em g_sensores e chamar g_uv.iniciar().
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Wire.h>

#include "agenda.h"
#include "buffer.h"
#include "clock_hal.h"
#include "config.h"
#include "envio.h"
#include "fs_littlefs.h"
#include "iso_time.h"
#include "net_hal.h"
#include "pendentes.h"
#include "rain_hal.h"
#include "rtc_hal.h"
#include "secrets.h"
#include "sensor.h"
#include "sensores_hal.h"
#include "sleep_hal.h"
#include "wdt_hal.h"

namespace {

const uint64_t INTERVALO_MS = static_cast<uint64_t>(INTERVALO_LEITURA_MIN) * 60 * 1000;
const uint64_t RESYNC_MS = static_cast<uint64_t>(RESYNC_NTP_MAX_H) * 3600 * 1000;

hal::SistemaArquivosLittleFs g_fs;
core::Buffer g_buffer(g_fs, ARQ_DADOS, MAX_LEITURAS_BUFFER, MAX_BYTES_BUFFER);

hal::SensorBme280 g_bme(Wire, BME280_ADDR);
hal::SensorChuva g_chuva(MM_PER_TIP);
// hal::SensorUv g_uv(UV_GUVA_PIN, UV_LIMITE_SOLTO_MV);  // religar quando o GUVA-S12SD for instalado
core::Sensor* const g_sensores[] = {&g_bme, &g_chuva};  // + &g_uv ao religar o UV

core::RefHora g_ref{false, 0, 0};
uint32_t g_boot = 0;
bool g_pendentes = false;
uint64_t g_ultimoNtpMs = 0;
uint64_t g_proximo = 0;
uint32_t g_leiturasDesdeEnvio = 0;

const hal::ConfigWifi CONFIG_WIFI{WIFI_SSID, WIFI_METODO, WIFI_FASE2, WIFI_IDENTIDADE,
                                  WIFI_USUARIO, WIFI_SENHA, WIFI_CA_PEM, WIFI_TIMEOUT_S};

// Hora válida (NTP agora, ou preservada de um reset por software): data as
// leituras pendentes do boot atual e descarta as impossíveis de datar.
void aoTerHoraValida() {
  hal::rtcGravarHoraOk(true);
  if (!g_pendentes) return;
  const core::ResultadoPendentes r = core::resolverPendentes(g_fs, ARQ_DADOS, g_boot, g_ref, MM_PER_TIP);
  if (!r.ok) {
    Serial.println("[ERRO] falha ao datar leituras pendentes; tenta de novo no proximo sync");
    return;
  }
  g_pendentes = false;
  g_buffer.invalidarContagem();
  if (r.tipsSobrando) hal::chuvaSomar(r.tipsSobrando);
  Serial.printf("[INFO] pendentes: %lu datadas, %lu descartadas (boot antigo), %lu tips repassados\n",
                static_cast<unsigned long>(r.datadas), static_cast<unsigned long>(r.descartadas),
                static_cast<unsigned long>(r.tipsSobrando));
}

// Pressupõe Wi-Fi conectado.
bool sincronizarHora() {
  for (uint32_t i = 0; i < NTP_TENTATIVAS; ++i) {
    if (hal::ntpSincronizar(NTP_TIMEOUT_S)) {
      g_ref = core::RefHora{true, hal::epochMsDoSistema(), hal::uptimeMs()};
      g_ultimoNtpMs = g_ref.upMs;
      aoTerHoraValida();
      return true;
    }
    delay(1000);
  }
  return false;
}

void registrarLeitura() {
  JsonDocument doc;
  JsonObject leitura = doc.to<JsonObject>();
  core::lerTodos(g_sensores, sizeof(g_sensores) / sizeof(g_sensores[0]), leitura);
  if (g_ref.valida) {
    char iso[core::TAM_ISO];
    core::formatarIso(core::epochMsEm(g_ref, hal::uptimeMs()), iso);
    leitura["timestamp"] = iso;
  } else {
    // Sem hora: NÃO inventa timestamp. Datada no primeiro sync (pendentes.h).
    leitura["_boot"] = g_boot;
    leitura["_up_ms"] = hal::uptimeMs();
    g_pendentes = true;
  }
  std::string linha;
  serializeJson(doc, linha);
  if (!g_buffer.adicionar(linha)) Serial.println("[ERRO] falha ao gravar a leitura no buffer");
  Serial.printf("[INFO] leitura salva: %s\n", linha.c_str());
}

void tentarEnvio(bool noBoot) {
  const bool precisaHora = !g_ref.valida || hal::uptimeMs() - g_ultimoNtpMs >= RESYNC_MS;
  if (!noBoot && g_buffer.contar() == 0 && !precisaHora) return;
  if (!hal::wifiConectar(CONFIG_WIFI)) {
    hal::wifiDesligar();
    Serial.println("[AVISO] sem Wi-Fi: buffer mantido para a proxima hora");
    return;
  }
  if (!sincronizarHora()) Serial.println("[AVISO] NTP falhou");
  if (!g_ref.valida || g_pendentes) {
    Serial.println("[AVISO] sem hora valida: envio adiado");
  } else if (g_buffer.contar() > 0) {
    const core::ResultadoEnvio r =
        core::enviarBuffer(g_buffer, TAMANHO_LOTE_ENVIO, STATION_ID, [](const std::string& corpo) {
          const int codigo = hal::httpPost(API_URL, API_KEY, corpo, API_TLS_INSECURE, API_TIMEOUT_S);
          Serial.printf("[INFO] HTTP %d\n", codigo);
          return codigo >= 200 && codigo < 300;
        });
    Serial.printf("[INFO] envio %s: %lu enviadas, %lu descartadas, %lu no buffer\n", r.ok ? "OK" : "interrompido",
                  static_cast<unsigned long>(r.enviadas), static_cast<unsigned long>(r.descartadas),
                  static_cast<unsigned long>(g_buffer.contar()));
  }
  hal::wifiDesligar();
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(200);
  const esp_reset_reason_t motivo = esp_reset_reason();
  Serial.printf("\n[INFO] IFSClima - boot (reset %d), heap livre %lu\n", static_cast<int>(motivo),
                static_cast<unsigned long>(ESP.getFreeHeap()));
  hal::wdtIniciar(WDT_TIMEOUT_S);

  if (!hal::montarLittleFs()) Serial.println("[ERRO] LittleFS nao montou: leituras nao serao persistidas");
  if (g_buffer.recuperarTmpOrfao()) Serial.println("[AVISO] buffer orfao recuperado do .tmp");
  g_pendentes = core::arquivoTemPendentes(g_fs, ARQ_DADOS);
  g_boot = hal::incrementarContadorBoot();

  hal::rtcIniciar(motivo == ESP_RST_POWERON);
  uint32_t tipsRestaurados = 0;
  bool horaOk = false;
  hal::rtcLerInicial(tipsRestaurados, horaOk);
  if (tipsRestaurados) Serial.printf("[INFO] %lu tip(s) de chuva restaurados da RTC memory\n", static_cast<unsigned long>(tipsRestaurados));

  const int64_t pisoS = core::epochDaDataDeBuild(__DATE__);
  if (horaOk && hal::epochSDoSistema() >= pisoS) {
    // Reset por software preserva a hora do sistema; horaOk garante que ela
    // veio de um NTP, e não do piso abaixo.
    g_ref = core::RefHora{true, hal::epochMsDoSistema(), hal::uptimeMs()};
    g_ultimoNtpMs = g_ref.upMs;
    aoTerHoraValida();
  } else {
    hal::rtcGravarHoraOk(false);
    // Piso de hora = data do build: a validação do certificado do RADIUS (EAP)
    // falha com o relógio em 1970. NÃO vale como hora das leituras.
    hal::definirHoraSistema(pisoS);
  }

  Wire.begin(I2C_SDA, I2C_SCL, I2C_FREQ);
  // g_uv.iniciar();  // religar junto com o UV
  hal::chuvaIniciar(RAIN_GAUGE_PIN, RAIN_PULL_UP, !RAIN_ON_FALLING, RAIN_DEBOUNCE_MS, tipsRestaurados);

  tentarEnvio(true);
  g_proximo = hal::uptimeMs() + INTERVALO_MS;
}

void loop() {
  hal::dormirAte(g_proximo, MODO_ECONOMIA);
  hal::wdtAlimentar();
  g_proximo = core::proximoAlvo(g_proximo, INTERVALO_MS, hal::uptimeMs());

  registrarLeitura();

  if (++g_leiturasDesdeEnvio >= LEITURAS_POR_ENVIO) {
    g_leiturasDesdeEnvio = 0;
    tentarEnvio(false);
  }
}
