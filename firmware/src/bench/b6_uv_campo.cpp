// b6_uv_campo — registrador de campo do UV, roda SEM PC (power bank).
// Grava /uv_campo.csv (sessao,t_s,mv,temp_c) e pisca o LED proporcional ao UV:
// quanto mais UV, mais rápido. TAPE O SENSOR COM A MÃO: o LED tem que
// desacelerar na hora. A temperatura do BME280 no mesmo arquivo separa deriva
// térmica de resposta a UV (o ESP32 clássico não tem sensor interno utilizável:
// sem BME, a coluna fica vazia).
// Ler depois: pio run -e bench_b6_uv_campo -t monitor e digitar 'd' para despejar o CSV.
#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <Wire.h>

#include "config.h"
#include "sensores_hal.h"

static const char* ARQUIVO = "/uv_campo.csv";
static hal::SensorUv uv(UV_GUVA_PIN, UV_LIMITE_SOLTO_MV);
static hal::SensorBme280 bme(Wire, BME280_ADDR);
static int sessao = 1;
static String pendente;
static int linhasPendentes = 0;

static int proximaSessao() {
  File f = LittleFS.open(ARQUIVO, FILE_READ);
  if (!f) return 1;
  int n = 0;
  while (f.available()) {
    if (f.readStringUntil('\n').startsWith("# --- sessao")) ++n;
  }
  f.close();
  return n + 1;
}

static void despejar() {
  File f = LittleFS.open(ARQUIVO, FILE_READ);
  if (!f) {
    Serial.println("(sem arquivo)");
    return;
  }
  while (f.available()) Serial.write(f.read());
  f.close();
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  pinMode(LED_PIN, OUTPUT);
  LittleFS.begin(true);
  Wire.begin(I2C_SDA, I2C_SCL, I2C_FREQ);
  uv.iniciar();
  sessao = proximaSessao();
  File f = LittleFS.open(ARQUIVO, FILE_APPEND);
  if (sessao == 1) f.print("# sessao,t_s,mv,temp_c\n");
  f.printf("# --- sessao %d (t_s=0 na energizacao) ---\n", sessao);
  f.close();
  Serial.printf("Registrando sessao %d. Digite 'd' para despejar o CSV.\n", sessao);
}

void loop() {
  if (Serial.available() && Serial.read() == 'd') despejar();
  const double mv = uv.lerMv();
  JsonDocument doc;
  std::string erro;
  const bool temTemp = bme.ler(doc.to<JsonObject>(), erro);
  pendente += String(sessao) + "," + String(millis() / 1000) + "," + String(mv, 1) + "," +
              (temTemp ? String(doc["temperature_c"].as<double>(), 2) : String("")) + "\n";
  // Grava a cada 10 amostras: corte de energia perde 10 s, não o arquivo.
  if (++linhasPendentes >= 10) {
    File f = LittleFS.open(ARQUIVO, FILE_APPEND);
    if (f) {
      f.print(pendente);
      f.close();
      pendente = "";
      linhasPendentes = 0;
    }
  }
  // Pisca por ~1 s: período de 1000 ms (escuro) a 60 ms (>= 1000 mV).
  const double fracao = min(max(mv / 1000.0, 0.0), 1.0);
  const uint32_t periodo = static_cast<uint32_t>(1000 - fracao * (1000 - 60));
  const uint32_t fim = millis() + 1000;
  while (static_cast<int32_t>(fim - millis()) > 0) {
    digitalWrite(LED_PIN, HIGH);
    delay(min<uint32_t>(periodo / 2, 40));
    digitalWrite(LED_PIN, LOW);
    delay(max<uint32_t>(1, periodo - min<uint32_t>(periodo / 2, 40)));
  }
}
