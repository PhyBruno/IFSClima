// Provisório (Task 1): só prova que a toolchain do ESP32 compila e grava.
// Substituído pelo ciclo completo na Task 14.
#include <Arduino.h>

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("[INFO] IFSClima firmware - scaffold");
}

void loop() { delay(1000); }
