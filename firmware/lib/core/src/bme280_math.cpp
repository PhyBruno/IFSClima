#include "bme280_math.h"

namespace core {

static uint16_t u16(const uint8_t* b, int i) {
  return static_cast<uint16_t>(b[i] | (b[i + 1] << 8));
}

static int16_t s16(const uint8_t* b, int i) { return static_cast<int16_t>(u16(b, i)); }

ChipBme identificarChip(uint8_t chipId) {
  if (chipId == CHIP_ID_BME280) return ChipBme::BME280;
  if (chipId == CHIP_ID_BMP280) return ChipBme::BMP280;
  return ChipBme::DESCONHECIDO;
}

CalibBme decodificarCalib(const uint8_t* tp, bool comUmidade, uint8_t h1, const uint8_t* he) {
  CalibBme c{};
  c.T1 = u16(tp, 0);
  c.T2 = s16(tp, 2);
  c.T3 = s16(tp, 4);
  c.P1 = u16(tp, 6);
  c.P2 = s16(tp, 8);
  c.P3 = s16(tp, 10);
  c.P4 = s16(tp, 12);
  c.P5 = s16(tp, 14);
  c.P6 = s16(tp, 16);
  c.P7 = s16(tp, 18);
  c.P8 = s16(tp, 20);
  c.P9 = s16(tp, 22);
  if (comUmidade) {
    c.H1 = h1;
    c.H2 = s16(he, 0);
    c.H3 = he[2];
    // H4/H5 são de 12 bits com sinal, divididos entre 0xE4/0xE5/0xE6.
    c.H4 = static_cast<int16_t>(static_cast<int8_t>(he[3]) * 16 | (he[4] & 0x0F));
    c.H5 = static_cast<int16_t>(static_cast<int8_t>(he[5]) * 16 | (he[4] >> 4));
    c.H6 = static_cast<int8_t>(he[6]);
  }
  return c;
}

MedidaBme compensarBme(const CalibBme& c, const uint8_t* d, bool comUmidade) {
  const int32_t adcP = (d[0] << 12) | (d[1] << 4) | (d[2] >> 4);
  const int32_t adcT = (d[3] << 12) | (d[4] << 4) | (d[5] >> 4);

  MedidaBme m{};

  // --- temperatura ---
  double var1 = (adcT / 16384.0 - c.T1 / 1024.0) * c.T2;
  const double dt = adcT / 131072.0 - c.T1 / 8192.0;
  double var2 = dt * dt * c.T3;
  const double tFine = var1 + var2;
  m.temperaturaC = tFine / 5120.0;

  // --- pressão ---
  var1 = tFine / 2.0 - 64000.0;
  var2 = var1 * var1 * c.P6 / 32768.0;
  var2 = var2 + var1 * c.P5 * 2.0;
  var2 = var2 / 4.0 + c.P4 * 65536.0;
  var1 = (c.P3 * var1 * var1 / 524288.0 + c.P2 * var1) / 524288.0;
  var1 = (1.0 + var1 / 32768.0) * c.P1;
  if (var1 == 0.0) {
    m.pressaoHpa = 0.0;
  } else {
    double pr = 1048576.0 - adcP;
    pr = (pr - var2 / 4096.0) * 6250.0 / var1;
    const double v1 = c.P9 * pr * pr / 2147483648.0;
    const double v2 = pr * c.P8 / 32768.0;
    pr = pr + (v1 + v2 + c.P7) / 16.0;
    m.pressaoHpa = pr / 100.0;  // Pa -> hPa
  }

  // --- umidade (só no BME280) ---
  m.temUmidade = comUmidade;
  if (comUmidade) {
    const int32_t adcH = (d[6] << 8) | d[7];
    double h = tFine - 76800.0;
    h = (adcH - (c.H4 * 64.0 + c.H5 / 16384.0 * h)) *
        (c.H2 / 65536.0 * (1.0 + c.H6 / 67108864.0 * h * (1.0 + c.H3 / 67108864.0 * h)));
    h = h * (1.0 - c.H1 * h / 524288.0);
    if (h > 100.0) h = 100.0;
    if (h < 0.0) h = 0.0;
    m.umidadePct = h;
  }
  return m;
}

}  // namespace core
