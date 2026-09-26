// b1_i2c_scan — acha o sensor no I2C e diagnostica a fiação.
//  1) nível de repouso de SDA/SCL (um módulo alimentado tem pull-up -> 1)
//  2) varredura 0x03..0x77 nos pinos do config.h
//  3) identificação do chip em 0x76/0x77 (BME280 x BMP280)
#include <Arduino.h>
#include <Wire.h>

#include "config.h"

static void identificar(uint8_t addr) {
  Wire.beginTransmission(addr);
  Wire.write(0xD0);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom(static_cast<uint16_t>(addr), static_cast<size_t>(1), true) != 1) {
    Serial.println("       falha lendo chip_id");
    return;
  }
  const uint8_t chip = Wire.read();
  const char* tipo = chip == 0x60 ? "BME280 (COM umidade)" : chip == 0x58 ? "BMP280 (SEM umidade)" : "desconhecido";
  Serial.printf("       chip_id 0x%02X -> %s\n", chip, tipo);
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.printf("Configurado: SDA=GPIO%d  SCL=GPIO%d  addr esperado 0x%02X\n", I2C_SDA, I2C_SCL, BME280_ADDR);

  pinMode(I2C_SDA, INPUT);
  pinMode(I2C_SCL, INPUT);
  delay(5);
  const int sda = digitalRead(I2C_SDA), scl = digitalRead(I2C_SCL);
  Serial.printf("\n1) Repouso: SDA=%d SCL=%d (esperado 1 e 1)\n", sda, scl);
  if (sda == 0 && scl == 0) Serial.println("   >> AMBAS em 0: modulo sem alimentacao ou SDA/SCL em curto com GND.");
  else if (sda == 0 || scl == 0) Serial.println("   >> Uma linha presa em 0: fio em curto com GND ou pino errado.");
  else Serial.println("   >> OK: ha pull-up, o modulo parece alimentado.");

  Wire.begin(I2C_SDA, I2C_SCL, I2C_FREQ);
  Serial.println("\n2) Varredura:");
  int achados = 0;
  for (uint8_t a = 0x03; a <= 0x77; ++a) {
    Wire.beginTransmission(a);
    if (Wire.endTransmission() == 0) {
      ++achados;
      Serial.printf("   0x%02X encontrado\n", a);
      if (a == 0x76 || a == 0x77) identificar(a);
    }
  }
  if (achados == 0) {
    Serial.println("   nada encontrado. Checklist:");
    Serial.println("     - VCC do modulo no 3V3 (NUNCA no 5V/VIN)");
    Serial.println("     - GND do modulo em um GND da placa");
    Serial.printf("     - SDA no GPIO%d e SCL no GPIO%d, nao trocados\n", I2C_SDA, I2C_SCL);
    Serial.println("     - se o modulo tiver CSB/CS, ele vai em VCC para modo I2C");
  }
}

void loop() { delay(1000); }
