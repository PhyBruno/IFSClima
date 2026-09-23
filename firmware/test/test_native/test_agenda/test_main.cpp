#include <unity.h>

#include "agenda.h"

void setUp() {}
void tearDown() {}

static const uint64_t MIN15 = 15ULL * 60 * 1000;

void test_avanca_um_intervalo_sem_acumular_atraso() {
  // Alvo em 900000, leitura/envio terminou em 905000: o próximo é 1800000
  // (grade fixa), não 905000 + 15 min.
  TEST_ASSERT_EQUAL_UINT64(2 * MIN15, core::proximoAlvo(MIN15, MIN15, MIN15 + 5000));
}

void test_pula_alvos_ja_passados() {
  // Envio demorou 40 min: alvos de 30 e 45 min já passaram -> próximo em 60 min.
  TEST_ASSERT_EQUAL_UINT64(4 * MIN15, core::proximoAlvo(MIN15, MIN15, MIN15 + 40ULL * 60 * 1000));
}

void test_alvo_exatamente_agora_conta_como_passado() {
  TEST_ASSERT_EQUAL_UINT64(3 * MIN15, core::proximoAlvo(MIN15, MIN15, 2 * MIN15));
}

void test_intervalo_zero_nao_trava() {
  TEST_ASSERT_EQUAL_UINT64(12345, core::proximoAlvo(100, 0, 12345));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_avanca_um_intervalo_sem_acumular_atraso);
  RUN_TEST(test_pula_alvos_ja_passados);
  RUN_TEST(test_alvo_exatamente_agora_conta_como_passado);
  RUN_TEST(test_intervalo_zero_nao_trava);
  return UNITY_END();
}
