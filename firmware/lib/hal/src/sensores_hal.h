#pragma once
#include <Wire.h>

#include "bme280_math.h"
#include "sensor.h"

namespace hal {

// BME280/BMP280 por I2C, modo forçado (uma conversão por leitura). Identifica
// o chip e lê a calibração uma vez (o lightsleep preserva a RAM); em erro de
// I2C zera o cache para reidentificar na próxima leitura.
class SensorBme280 : public core::Sensor {
 public:
  SensorBme280(TwoWire& wire, uint8_t endereco);
  const char* nome() const override { return "bme280"; }
  bool ler(JsonObject saida, std::string& erro) override;

 private:
  bool preparar(std::string& erro);
  bool lerRegs(uint8_t reg, uint8_t* buf, size_t n);
  bool escreverReg(uint8_t reg, uint8_t valor);

  TwoWire& wire_;
  uint8_t endereco_;
  bool pronto_;
  bool comUmidade_;
  core::CalibBme calib_;
};

// GUVA-S12SD analógico no ADC1, atenuação de 6 dB (linear até ~1750 mV).
// Mediana de 15 grupos x média de 8 amostras calibradas (eFuse).
// LIMITAÇÃO: o ADC do ESP32 não lê bem abaixo de ~100-150 mV. O escuro, que no
// Pico dava 12,6 mV, aparece com esse piso em uv_voltage_v. O índice não muda (0).
class SensorUv : public core::Sensor {
 public:
  SensorUv(int pino, double limiteSoltoMv);
  void iniciar();
  double lerMv();  // mediana em mV (usado também pelos sketches de bancada)
  const char* nome() const override { return "uv_guva"; }
  bool ler(JsonObject saida, std::string& erro) override;

 private:
  int pino_;
  double limiteSoltoMv_;
};

// Pluviômetro: devolve o acumulado desde a última leitura e zera.
class SensorChuva : public core::Sensor {
 public:
  explicit SensorChuva(double mmPorTip) : mmPorTip_(mmPorTip) {}
  const char* nome() const override { return "rain_gauge"; }
  bool ler(JsonObject saida, std::string& erro) override;

 private:
  double mmPorTip_;
};

}  // namespace hal
