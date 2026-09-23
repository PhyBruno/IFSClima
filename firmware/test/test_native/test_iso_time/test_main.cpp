#include <unity.h>

#include "iso_time.h"

void setUp() {}
void tearDown() {}

static void confere_iso(int64_t epochMs, const char* esperado) {
  char s[core::TAM_ISO];
  core::formatarIso(epochMs, s);
  TEST_ASSERT_EQUAL_STRING(esperado, s);
}

void test_formatar_iso() {
  confere_iso(0, "1970-01-01T00:00:00.000Z");
  confere_iso(1767225600123LL, "2026-01-01T00:00:00.123Z");
  confere_iso(1835440496789LL, "2028-02-29T12:34:56.789Z");  // dia bissexto
  confere_iso(946684799999LL, "1999-12-31T23:59:59.999Z");
}

void test_dias_desde_epoch() {
  TEST_ASSERT_EQUAL_INT64(0, core::diasDesdeEpoch(1970, 1, 1));
  TEST_ASSERT_EQUAL_INT64(20454, core::diasDesdeEpoch(2026, 1, 1));
}

void test_epoch_da_data_de_build() {
  TEST_ASSERT_EQUAL_INT64(1790121600LL, core::epochDaDataDeBuild("Sep 23 2026"));
  TEST_ASSERT_EQUAL_INT64(1767225600LL, core::epochDaDataDeBuild("Jan  1 2026"));  // formato do __DATE__
}

void test_epoch_da_data_de_build_invalida() {
  TEST_ASSERT_EQUAL_INT64(-1, core::epochDaDataDeBuild("Xyz 1 2026"));
  TEST_ASSERT_EQUAL_INT64(-1, core::epochDaDataDeBuild("anF  1 2026"));  // achado fora do alinhamento de 3 letras
  TEST_ASSERT_EQUAL_INT64(-1, core::epochDaDataDeBuild(""));
  TEST_ASSERT_EQUAL_INT64(-1, core::epochDaDataDeBuild(nullptr));
}

void test_epoch_ms_em_depois_da_referencia() {
  const core::RefHora ref{true, 1767225600000LL, 5000};
  // 900 s depois da referência -> 00:15:00
  TEST_ASSERT_EQUAL_INT64(1767226500000LL, core::epochMsEm(ref, 905000));
}

void test_epoch_ms_em_antes_da_referencia() {
  // Review Focus: leitura pendente feita ANTES do sync (up < ref.upMs)
  // tem que cair no passado.
  const core::RefHora ref{true, 1767225600000LL, 5000};
  TEST_ASSERT_EQUAL_INT64(1767225596000LL, core::epochMsEm(ref, 1000));
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_formatar_iso);
  RUN_TEST(test_dias_desde_epoch);
  RUN_TEST(test_epoch_da_data_de_build);
  RUN_TEST(test_epoch_da_data_de_build_invalida);
  RUN_TEST(test_epoch_ms_em_depois_da_referencia);
  RUN_TEST(test_epoch_ms_em_antes_da_referencia);
  return UNITY_END();
}
