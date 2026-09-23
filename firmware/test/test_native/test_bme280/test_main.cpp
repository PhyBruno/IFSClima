#include <unity.h>

#include "bme280_math.h"

void setUp() {}
void tearDown() {}

// Calibração do exemplo do datasheet, little-endian, a partir de 0x88.
static const uint8_t TP[24] = {
    0x70, 0x6B, 0x43, 0x67, 0x18, 0xFC,  // T1=27504 T2=26435 T3=-1000
    0x7D, 0x8E, 0x43, 0xD6, 0xD0, 0x0B,  // P1=36477 P2=-10685 P3=3024
    0x27, 0x0B, 0x8C, 0x00, 0xF9, 0xFF,  // P4=2855 P5=140 P6=-7
    0x8C, 0x3C, 0xF8, 0xC6, 0x70, 0x17,  // P7=15500 P8=-14600 P9=6000
};
static const uint8_t H1 = 75;
// H2=362 H3=0 H4=313 H5=50 H6=30
static const uint8_t HE[7] = {0x6A, 0x01, 0x00, 0x13, 0x29, 0x03, 0x1E};

// adc_P=415148 (0x655AC), adc_T=519888 (0x7EED0), adc_H=30000 (0x7530)
static const uint8_t DADOS[8] = {0x65, 0x5A, 0xC0, 0x7E, 0xED, 0x00, 0x75, 0x30};

void test_identificar_chip() {
  TEST_ASSERT_TRUE(core::identificarChip(0x60) == core::ChipBme::BME280);
  TEST_ASSERT_TRUE(core::identificarChip(0x58) == core::ChipBme::BMP280);
  TEST_ASSERT_TRUE(core::identificarChip(0x55) == core::ChipBme::DESCONHECIDO);
}

void test_decodificar_calib() {
  const core::CalibBme c = core::decodificarCalib(TP, true, H1, HE);
  TEST_ASSERT_EQUAL_UINT16(27504, c.T1);
  TEST_ASSERT_EQUAL_INT16(26435, c.T2);
  TEST_ASSERT_EQUAL_INT16(-1000, c.T3);
  TEST_ASSERT_EQUAL_UINT16(36477, c.P1);
  TEST_ASSERT_EQUAL_INT16(-10685, c.P2);
  TEST_ASSERT_EQUAL_INT16(-7, c.P6);
  TEST_ASSERT_EQUAL_INT16(-14600, c.P8);
  TEST_ASSERT_EQUAL_INT16(6000, c.P9);
  TEST_ASSERT_EQUAL_UINT8(75, c.H1);
  TEST_ASSERT_EQUAL_INT16(362, c.H2);
  TEST_ASSERT_EQUAL_UINT8(0, c.H3);
  TEST_ASSERT_EQUAL_INT16(313, c.H4);
  TEST_ASSERT_EQUAL_INT16(50, c.H5);
  TEST_ASSERT_EQUAL_INT8(30, c.H6);
}

void test_h4_h5_negativos() {
  // he[3] e he[5] com sinal: H4 = (-2 << 4) | 9 = -23 ; H5 = (-1 << 4) | 2 = -14
  const uint8_t he[7] = {0x6A, 0x01, 0x00, 0xFE, 0x29, 0xFF, 0x1E};
  const core::CalibBme c = core::decodificarCalib(TP, true, H1, he);
  TEST_ASSERT_EQUAL_INT16(-23, c.H4);
  TEST_ASSERT_EQUAL_INT16(-14, c.H5);
}

void test_compensar_exemplo_do_datasheet() {
  const core::CalibBme c = core::decodificarCalib(TP, true, H1, HE);
  const core::MedidaBme m = core::compensarBme(c, DADOS, true);
  TEST_ASSERT_DOUBLE_WITHIN(0.005, 25.0825, m.temperaturaC);
  TEST_ASSERT_DOUBLE_WITHIN(0.005, 1006.5327, m.pressaoHpa);
  TEST_ASSERT_TRUE(m.temUmidade);
  TEST_ASSERT_DOUBLE_WITHIN(0.005, 55.0007, m.umidadePct);
}

void test_umidade_limitada_a_100() {
  const core::CalibBme c = core::decodificarCalib(TP, true, H1, HE);
  const uint8_t dados[8] = {0x65, 0x5A, 0xC0, 0x7E, 0xED, 0x00, 0xEA, 0x60};  // adc_H=60000
  TEST_ASSERT_EQUAL_DOUBLE(100.0, core::compensarBme(c, dados, true).umidadePct);
}

void test_bmp280_sem_umidade() {
  const core::CalibBme c = core::decodificarCalib(TP, false, 0, nullptr);
  const core::MedidaBme m = core::compensarBme(c, DADOS, false);  // só 6 bytes usados
  TEST_ASSERT_FALSE(m.temUmidade);
  TEST_ASSERT_DOUBLE_WITHIN(0.005, 25.0825, m.temperaturaC);
}

void test_p1_zero_nao_divide_por_zero() {
  core::CalibBme c = core::decodificarCalib(TP, false, 0, nullptr);
  c.P1 = 0;
  TEST_ASSERT_EQUAL_DOUBLE(0.0, core::compensarBme(c, DADOS, false).pressaoHpa);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_identificar_chip);
  RUN_TEST(test_decodificar_calib);
  RUN_TEST(test_h4_h5_negativos);
  RUN_TEST(test_compensar_exemplo_do_datasheet);
  RUN_TEST(test_umidade_limitada_a_100);
  RUN_TEST(test_bmp280_sem_umidade);
  RUN_TEST(test_p1_zero_nao_divide_por_zero);
  return UNITY_END();
}
