#include <unity.h>

#include "rain_logic.h"
#include "rtc_state.h"

void setUp() {}
void tearDown() {}

// KY-025: repouso em 0, pulso (ímã perto) em 1.
static const bool ALTO = true;
static const bool BAIXO = false;

void test_uma_bascula_conta_uma_vez() {
  core::ContadorChuva c(true, 150);
  TEST_ASSERT_TRUE(c.observar(ALTO, 1000));
  TEST_ASSERT_FALSE(c.observar(BAIXO, 1400));  // fim do pulso não conta
  TEST_ASSERT_EQUAL_UINT32(1, c.pendentes());
}

void test_repique_dentro_do_debounce_nao_conta() {
  core::ContadorChuva c(true, 150);
  c.observar(ALTO, 1000);
  c.observar(BAIXO, 1050);
  TEST_ASSERT_FALSE(c.observar(ALTO, 1100));  // 100 ms < 150 ms
  c.observar(BAIXO, 1400);
  TEST_ASSERT_TRUE(c.observar(ALTO, 1150 + 1000));
  TEST_ASSERT_EQUAL_UINT32(2, c.pendentes());
}

void test_debounce_na_fronteira_conta() {
  core::ContadorChuva c(true, 150);
  c.observar(ALTO, 1000);
  c.observar(BAIXO, 1100);
  TEST_ASSERT_TRUE(c.observar(ALTO, 1150));  // exatamente 150 ms
}

void test_mesmo_nivel_repetido_nao_conta() {
  core::ContadorChuva c(true, 150);
  c.observar(ALTO, 1000);
  TEST_ASSERT_FALSE(c.observar(ALTO, 5000));  // ímã parado: nível não mudou
  TEST_ASSERT_EQUAL_UINT32(1, c.pendentes());
}

void test_ima_parado_no_boot_nao_conta() {
  // Review Focus: placa liga com o ímã em cima do sensor.
  core::ContadorChuva c(true, 150);
  c.sincronizar(ALTO);
  TEST_ASSERT_FALSE(c.observar(ALTO, 1000));
  TEST_ASSERT_EQUAL_UINT32(0, c.pendentes());
  TEST_ASSERT_FALSE(c.acordarEmAlto());  // espera o fim do pulso -> sem loop de despertares
}

void test_nivel_de_despertar_alterna() {
  core::ContadorChuva c(true, 150);
  TEST_ASSERT_TRUE(c.acordarEmAlto());   // em repouso, acorda no pulso
  c.observar(ALTO, 1000);
  TEST_ASSERT_FALSE(c.acordarEmAlto());  // em pulso, acorda na volta ao repouso
  c.observar(BAIXO, 1300);
  TEST_ASSERT_TRUE(c.acordarEmAlto());
}

void test_polaridade_invertida_reed_puro() {
  // Reed puro para o GND com pull-up: repouso em 1, pulso em 0.
  core::ContadorChuva c(false, 150);
  TEST_ASSERT_FALSE(c.acordarEmAlto());
  TEST_ASSERT_TRUE(c.observar(BAIXO, 1000));
  TEST_ASSERT_FALSE(c.observar(ALTO, 1300));
  TEST_ASSERT_EQUAL_UINT32(1, c.pendentes());
}

void test_retirar_zera_e_somar_restaura() {
  core::ContadorChuva c(true, 150);
  c.observar(ALTO, 1000);
  c.somar(4);
  TEST_ASSERT_EQUAL_UINT32(5, c.retirar());
  TEST_ASSERT_EQUAL_UINT32(0, c.pendentes());
}

void test_debounce_nao_trava_apos_muito_tempo() {
  // No Pico o ticks_ms dava a volta e travava a contagem após estiagem longa;
  // aqui o tempo é de 64 bits.
  core::ContadorChuva c(true, 150);
  c.observar(ALTO, 1000);
  c.observar(BAIXO, 1300);
  TEST_ASSERT_TRUE(c.observar(ALTO, 1000 + 60ULL * 24 * 3600 * 1000));
}

void test_rtc_ida_e_volta() {
  core::EstadoRtc e{};
  core::selarRtc(e, 7, true);
  uint32_t tips = 0;
  bool hora = false;
  TEST_ASSERT_TRUE(core::lerRtc(e, tips, hora));
  TEST_ASSERT_EQUAL_UINT32(7, tips);
  TEST_ASSERT_TRUE(hora);
}

void test_rtc_corrompido_e_rejeitado() {
  core::EstadoRtc e{};
  core::selarRtc(e, 7, false);
  uint32_t tips = 0;
  bool hora = false;
  e.tips = 8;
  TEST_ASSERT_FALSE(core::lerRtc(e, tips, hora));
  core::selarRtc(e, 7, false);
  e.magico = 0xDEADBEEF;
  TEST_ASSERT_FALSE(core::lerRtc(e, tips, hora));
  core::selarRtc(e, 7, false);
  e.horaOk = 2;
  TEST_ASSERT_FALSE(core::lerRtc(e, tips, hora));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_uma_bascula_conta_uma_vez);
  RUN_TEST(test_repique_dentro_do_debounce_nao_conta);
  RUN_TEST(test_debounce_na_fronteira_conta);
  RUN_TEST(test_mesmo_nivel_repetido_nao_conta);
  RUN_TEST(test_ima_parado_no_boot_nao_conta);
  RUN_TEST(test_nivel_de_despertar_alterna);
  RUN_TEST(test_polaridade_invertida_reed_puro);
  RUN_TEST(test_retirar_zera_e_somar_restaura);
  RUN_TEST(test_debounce_nao_trava_apos_muito_tempo);
  RUN_TEST(test_rtc_ida_e_volta);
  RUN_TEST(test_rtc_corrompido_e_rejeitado);
  return UNITY_END();
}
