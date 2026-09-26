#include "sensores_hal.h"

#include <Arduino.h>

#include "rain_hal.h"
#include "texto.h"
#include "uv_math.h"

namespace hal {

// ---------------- BME280 ----------------

SensorBme280::SensorBme280(TwoWire& wire, uint8_t endereco)
    : wire_(wire), endereco_(endereco), pronto_(false), comUmidade_(false), calib_{} {}

bool SensorBme280::lerRegs(uint8_t reg, uint8_t* buf, size_t n) {
  wire_.beginTransmission(endereco_);
  wire_.write(reg);
  if (wire_.endTransmission(false) != 0) return false;
  if (wire_.requestFrom(static_cast<uint16_t>(endereco_), n, true) != n) return false;
  for (size_t i = 0; i < n; ++i) buf[i] = static_cast<uint8_t>(wire_.read());
  return true;
}

bool SensorBme280::escreverReg(uint8_t reg, uint8_t valor) {
  wire_.beginTransmission(endereco_);
  wire_.write(reg);
  wire_.write(valor);
  return wire_.endTransmission() == 0;
}

bool SensorBme280::preparar(std::string& erro) {
  if (pronto_) return true;
  uint8_t chip = 0;
  if (!lerRegs(0xD0, &chip, 1)) {
    erro = "sem resposta no I2C";
    return false;
  }
  const core::ChipBme tipo = core::identificarChip(chip);
  if (tipo == core::ChipBme::DESCONHECIDO) {
    char msg[80];
    snprintf(msg, sizeof(msg), "chip_id 0x%02X em 0x%02X nao e BMP280 (0x58) nem BME280 (0x60)", chip, endereco_);
    erro = msg;
    return false;
  }
  const bool comUmidade = tipo == core::ChipBme::BME280;
  uint8_t tp[24];
  uint8_t h1 = 0;
  uint8_t he[7] = {};
  if (!lerRegs(0x88, tp, sizeof(tp)) || (comUmidade && (!lerRegs(0xA1, &h1, 1) || !lerRegs(0xE1, he, 7)))) {
    erro = "falha lendo calibracao";
    return false;
  }
  calib_ = core::decodificarCalib(tp, comUmidade, h1, he);
  comUmidade_ = comUmidade;
  pronto_ = true;
  Serial.printf("[INFO] bme280: %s em 0x%02X (chip_id 0x%02X), umidade=%s\n", comUmidade ? "BME280" : "BMP280",
                endereco_, chip, comUmidade ? "sim" : "NAO");
  return true;
}

bool SensorBme280::ler(JsonObject saida, std::string& erro) {
  if (!preparar(erro)) return false;
  // O datasheet exige ctrl_hum (0xF2) ANTES de ctrl_meas (0xF4).
  const bool disparou = (!comUmidade_ || escreverReg(0xF2, 0x01)) && escreverReg(0xF4, 0x25);
  uint8_t d[8];
  if (!disparou) {
    pronto_ = false;
    erro = "falha I2C ao disparar medicao";
    return false;
  }
  delay(50);  // conversão x1 leva ~9 ms
  if (!lerRegs(0xF7, d, comUmidade_ ? 8 : 6)) {
    pronto_ = false;
    erro = "falha I2C ao ler medicao";
    return false;
  }
  const core::MedidaBme m = core::compensarBme(calib_, d, comUmidade_);
  saida["temperature_c"] = core::arredondar(m.temperaturaC, 2);
  saida["pressure_hpa"] = core::arredondar(m.pressaoHpa, 2);
  if (m.temUmidade) saida["humidity_pct"] = core::arredondar(m.umidadePct, 2);
  return true;
}

// ---------------- UV ----------------

SensorUv::SensorUv(int pino, double limiteSoltoMv) : pino_(pino), limiteSoltoMv_(limiteSoltoMv) {}

void SensorUv::iniciar() {
  // Atenuação GLOBAL, não por pino: no Arduino-ESP32 3.x a calibração que
  // converte a leitura crua em mV é criada uma vez por unidade de ADC com a
  // atenuação global (esp32-hal-adc.c). Com analogSetPinAttenuation o canal
  // lia em 6 dB e convertia pela curva de 11 dB, dando mV errados (no b5, o
  // PULL_UP lia 3160 mV, impossível em 6 dB). O UV é a única entrada analógica
  // da estação, então mexer no global não afeta nenhum outro sensor.
  analogSetAttenuation(ADC_6db);
}

double SensorUv::lerMv() {
  double grupos[15];
  for (double& g : grupos) {
    uint32_t soma = 0;
    for (int i = 0; i < 8; ++i) soma += analogReadMilliVolts(pino_);
    g = soma / 8.0;
  }
  return core::mediana(grupos, 15);
}

bool SensorUv::ler(JsonObject saida, std::string& erro) {
  const double mv = lerMv();
  const core::AvaliacaoUv a = core::avaliarUv(mv, limiteSoltoMv_);
  if (a.status == core::StatusUv::SINAL_SOLTO) {
    char msg[64];
    snprintf(msg, sizeof(msg), "ADC em %.0f mV: sinal solto, nao UV", mv);
    erro = msg;
    return false;
  }
  saida["uv_index"] = a.indice;
  saida["uv_voltage_v"] = a.tensaoV;
  return true;
}

// ---------------- Pluviômetro ----------------

bool SensorChuva::ler(JsonObject saida, std::string& /*erro*/) {
  core::escreverChuva(saida, chuvaRetirar(), mmPorTip_);
  return true;
}

}  // namespace hal
