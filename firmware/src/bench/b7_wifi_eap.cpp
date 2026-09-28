// b7_wifi_eap — descobre qual combinação EAP a rede do IFSC aceita e, ao
// conectar, prova que há acesso real à internet (DNS + HTTP + NTP).
// Usa SSID/usuário/senha/identidade/CA do secrets.h e tenta, em sequência:
// PEAP/MSCHAPv2, TTLS/PAP, TTLS/CHAP, TTLS/MSCHAPv2, TTLS/MSCHAP.
// Antes, varre as redes para confirmar que o SSID aparece em 2,4 GHz.
// Copie a combinação que conectar para WIFI_METODO/WIFI_FASE2 no secrets.h.
#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>

#include "config.h"
#include "net_hal.h"
#include "secrets.h"

struct Combinacao {
  hal::MetodoWifi metodo;
  hal::Fase2 fase2;
};

static const Combinacao COMBINACOES[] = {
    {hal::MetodoWifi::PEAP, hal::Fase2::MSCHAPV2}, {hal::MetodoWifi::TTLS, hal::Fase2::PAP},
    {hal::MetodoWifi::TTLS, hal::Fase2::CHAP},     {hal::MetodoWifi::TTLS, hal::Fase2::MSCHAPV2},
    {hal::MetodoWifi::TTLS, hal::Fase2::MSCHAP},
};

// Varre o 2,4 GHz e diz se WIFI_SSID apareceu. scanNetworks() é bloqueante e
// pode devolver negativo (WIFI_SCAN_FAILED = -2, WIFI_SCAN_RUNNING = -1) quando
// o rádio ainda não estabilizou; nesse caso tenta de novo em vez de tratar
// como "0 redes" (que antes deixava a lista vazia sem explicar o motivo).
static bool varrerEProcurarSsid() {
  Serial.println("Redes visiveis (2,4 GHz):");
  int n = WIFI_SCAN_FAILED;
  for (int tentativa = 0; tentativa < 3 && n < 0; ++tentativa) {
    if (tentativa > 0) {
      Serial.printf("  (scan retornou %d, tentando de novo...)\n", n);
      delay(500);
    }
    n = WiFi.scanNetworks(/*async=*/false, /*show_hidden=*/true);
  }
  if (n < 0) {
    Serial.printf(">> Falha ao varrer (codigo %d). Verifique a antena/alimentacao.\n", n);
    return false;
  }
  bool achou = false;
  for (int i = 0; i < n; ++i) {
    Serial.printf("  %-32s RSSI %4d  canal %2ld  auth %d\n", WiFi.SSID(i).c_str(), WiFi.RSSI(i),
                  static_cast<long>(WiFi.channel(i)), static_cast<int>(WiFi.encryptionType(i)));
    if (WiFi.SSID(i) == WIFI_SSID) achou = true;
  }
  WiFi.scanDelete();  // libera a lista guardada pelo driver
  return achou;
}

// Prova acesso real à internet (não só IP na LAN), já conectado:
//  1. Resolve um nome (DNS) e mede o RTT do endereco.
//  2. HTTP GET num connectivity-check: 204 = internet liberada; 3xx/redirect
//     ou corpo HTML = portal captivo interceptando; erro = sem saida.
//  3. Sincroniza o relogio via NTP (trafego UDP de saida).
static void testarInternet() {
  Serial.println("  -- Teste de acesso a internet --");

  IPAddress ip;
  const bool dnsOk = WiFi.hostByName("clients3.google.com", ip);
  Serial.printf("  DNS clients3.google.com -> %s\n", dnsOk ? ip.toString().c_str() : "FALHOU");

  HTTPClient http;
  http.setConnectTimeout(8000);
  http.begin("http://clients3.google.com/generate_204");
  const int codigo = http.GET();
  if (codigo == 204) {
    Serial.println("  HTTP generate_204 -> 204: INTERNET OK (sem portal captivo)");
  } else if (codigo > 0) {
    Serial.printf("  HTTP generate_204 -> %d: ha saida, mas provavel PORTAL CAPTIVO/proxy\n", codigo);
  } else {
    Serial.printf("  HTTP generate_204 -> erro %d (%s): SEM saida para a internet\n", codigo,
                  HTTPClient::errorToString(codigo).c_str());
  }
  http.end();

  const bool ntpOk = hal::ntpSincronizar(NTP_TIMEOUT_S);
  if (ntpOk) {
    const time_t agora = time(nullptr);
    Serial.printf("  NTP -> OK, epoch %ld (%s)", static_cast<long>(agora), asctime(gmtime(&agora)));
  } else {
    Serial.println("  NTP -> FALHOU (UDP 123 bloqueado ou sem saida)");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  delay(200);  // deixa o regulador/rádio estabilizar antes do primeiro TX

  const bool achou = varrerEProcurarSsid();
  if (!achou) {
    // Sem o SSID no ar, associar só provoca timeout (ou brownout) e reinício em
    // loop. Para aqui: sem energia gasta à toa e o log fica legível.
    Serial.printf(">> '%s' NAO apareceu na varredura (fora de alcance ou so 5 GHz).\n", WIFI_SSID);
    Serial.println("Sem o SSID no ar nao ha o que testar. Aproxime-se do AP e reinicie.");
    return;
  }

  // O pico de corrente ao associar derruba a tensao em fontes/cabos USB fracos
  // (brownout -> POWERON_RESET em loop). Reduzir a potencia de TX corta esse
  // pico; a -74 dBm de RSSI ainda sobra margem para associar.
  WiFi.setTxPower(WIFI_POWER_13dBm);

  Serial.println("\nTestando combinacoes EAP:");
  for (const Combinacao& c : COMBINACOES) {
    hal::ConfigWifi cfg{WIFI_SSID, c.metodo, c.fase2, WIFI_IDENTIDADE, WIFI_USUARIO, WIFI_SENHA, WIFI_CA_PEM, WIFI_TIMEOUT_S};
    Serial.printf("\n--- %s / %s ---\n", hal::nomeMetodo(c.metodo),
                  c.metodo == hal::MetodoWifi::TTLS ? hal::nomeFase2(c.fase2) : "MSCHAPv2");
    const bool ok = hal::wifiConectar(cfg);
    Serial.printf(">> %s\n", ok ? "CONECTOU" : "falhou");
    if (ok) testarInternet();  // já conectado: confirma saída real para a internet
    hal::wifiDesligar();
    delay(2000);
  }
  Serial.println("\nFim. Use a primeira combinacao que CONECTOU no secrets.h.");
}

void loop() { delay(1000); }
