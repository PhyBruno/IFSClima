#include <ArduinoJson.h>
#include <unity.h>

#include "texto.h"

void setUp() {}
void tearDown() {}

void test_aparar_remove_brancos_das_pontas() {
  TEST_ASSERT_EQUAL_STRING("abc", core::aparar("  abc \r\n").c_str());
  TEST_ASSERT_EQUAL_STRING("a b", core::aparar("\ta b\t").c_str());
}

void test_aparar_so_brancos_vira_vazio() {
  TEST_ASSERT_EQUAL_STRING("", core::aparar(" \r\n\t ").c_str());
  TEST_ASSERT_EQUAL_STRING("", core::aparar("").c_str());
}

void test_arredondar() {
  TEST_ASSERT_EQUAL_DOUBLE(0.6, core::arredondar(0.2 * 3, 3));
  TEST_ASSERT_EQUAL_DOUBLE(25.08, core::arredondar(25.0824779, 2));
  TEST_ASSERT_EQUAL_DOUBLE(0.126, core::arredondar(0.12649, 3));
}

void test_arduinojson_serializa_no_pc() {
  JsonDocument doc;
  doc["timestamp"] = "2026-01-01T00:15:00.000Z";
  doc["rain_mm"] = core::arredondar(0.2 * 3, 3);
  std::string s;
  serializeJson(doc, s);
  TEST_ASSERT_EQUAL_STRING("{\"timestamp\":\"2026-01-01T00:15:00.000Z\",\"rain_mm\":0.6}", s.c_str());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_aparar_remove_brancos_das_pontas);
  RUN_TEST(test_aparar_so_brancos_vira_vazio);
  RUN_TEST(test_arredondar);
  RUN_TEST(test_arduinojson_serializa_no_pc);
  return UNITY_END();
}
