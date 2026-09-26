// b2_bme280 — leitura contínua a cada 2 s. Confira:
//  - temperatura bate com um termômetro comum (±1 °C)
//  - umidade sobe rápido ao bafejar no sensor (e volta devagar)
//  - pressão ~1013 hPa ao nível do mar; cai ~1,2 hPa a cada 10 m de altitude
#include <Arduino.h>
#include <ArduinoJson.h>
#include <Wire.h>

#include "config.h"
#include "sensores_hal.h"

static hal::SensorBme280 bme(Wire, BME280_ADDR);

void setup() {
  Serial.begin(115200);
  delay(1500);
  Wire.begin(I2C_SDA, I2C_SCL, I2C_FREQ);
  Serial.println("  TEMP(C)    UMID(%)          PRESS(hPa)");
}

void loop() {
  JsonDocument doc;
  std::string erro;
  if (bme.ler(doc.to<JsonObject>(), erro)) {
    Serial.printf("  %-10.2f %-16s %-10.2f\n", doc["temperature_c"].as<double>(),
                  doc["humidity_pct"].is<double>() ? String(doc["humidity_pct"].as<double>(), 2).c_str() : "-- (BMP280)",
                  doc["pressure_hpa"].as<double>());
  } else {
    Serial.printf("  ERRO: %s -> confira 3V3, GND comum e SDA/SCL\n", erro.c_str());
  }
  delay(2000);
}
