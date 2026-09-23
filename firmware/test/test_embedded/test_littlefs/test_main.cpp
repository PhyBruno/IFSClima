#include <Arduino.h>
#include <unity.h>

#include "buffer.h"
#include "clock_hal.h"
#include "fs_littlefs.h"

static hal::SistemaArquivosLittleFs fs;
static const char* ARQ = "/teste_buffer.jsonl";

void setUp() {
  fs.remover(ARQ);
  fs.remover("/teste_buffer.jsonl.tmp");
  fs.remover("/destino.txt");
}
void tearDown() {}

void test_monta_littlefs() { TEST_ASSERT_TRUE(hal::montarLittleFs()); }

void test_buffer_sobre_littlefs() {
  core::Buffer b(fs, ARQ, 5000);
  TEST_ASSERT_TRUE(b.adicionar("{\"timestamp\":\"2026-01-01T00:00:00.000Z\"}"));
  TEST_ASSERT_TRUE(b.adicionar("{\"timestamp\":\"2026-01-01T00:15:00.000Z\"}"));
  TEST_ASSERT_EQUAL_UINT32(2, b.contar());
  TEST_ASSERT_TRUE(b.removerInicio(1));
  const core::Buffer::Lote l = b.carregarLote(10);
  TEST_ASSERT_EQUAL_UINT32(1, l.leituras.size());
  TEST_ASSERT_EQUAL_STRING("{\"timestamp\":\"2026-01-01T00:15:00.000Z\"}", l.leituras[0].c_str());
}

void test_rename_sobrescreve_destino() {
  // Premissa do Buffer: no LittleFS o rename substitui o destino atomicamente.
  { auto f = fs.abrir("/destino.txt", 'w'); f->escrever(reinterpret_cast<const uint8_t*>("velho"), 5); }
  { auto f = fs.abrir(ARQ, 'w'); f->escrever(reinterpret_cast<const uint8_t*>("novo"), 4); }
  TEST_ASSERT_TRUE(fs.renomear(ARQ, "/destino.txt"));
  TEST_ASSERT_EQUAL(4, fs.tamanho("/destino.txt"));
  TEST_ASSERT_FALSE(fs.existe(ARQ));
}

void test_abrir_inexistente_para_leitura_devolve_nulo() {
  TEST_ASSERT_NULL(fs.abrir("/nao_existe.txt", 'r').get());
  TEST_ASSERT_EQUAL(-1, fs.tamanho("/nao_existe.txt"));
}

void test_uptime_avanca() {
  const uint64_t a = hal::uptimeMs();
  delay(20);
  TEST_ASSERT_TRUE(hal::uptimeMs() - a >= 19);
}

void test_contador_de_boot_incrementa() {
  const uint32_t a = hal::incrementarContadorBoot();
  TEST_ASSERT_EQUAL_UINT32(a + 1, hal::incrementarContadorBoot());
}

void setup() {
  delay(2000);  // tempo para o monitor serial abrir
  UNITY_BEGIN();
  RUN_TEST(test_monta_littlefs);
  RUN_TEST(test_buffer_sobre_littlefs);
  RUN_TEST(test_rename_sobrescreve_destino);
  RUN_TEST(test_abrir_inexistente_para_leitura_devolve_nulo);
  RUN_TEST(test_uptime_avanca);
  RUN_TEST(test_contador_de_boot_incrementa);
  UNITY_END();
}

void loop() {}
