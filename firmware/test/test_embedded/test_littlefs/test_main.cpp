#include <Arduino.h>
#include <esp_task_wdt.h>
#include <unity.h>

#include <string>

#include "buffer.h"
#include "clock_hal.h"
#include "fs_littlefs.h"
#include "wdt_hal.h"

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

void test_buffer_cheio_realista_ainda_remove_do_inicio() {
  // Revisão C1: o buffer no teto (5000 leituras de ~170 B) e o .tmp da
  // remoção precisam caber JUNTOS na partição do LittleFS — senão o envio
  // nunca consegue tirar o lote do buffer e a estação trava.
  const std::string linha =
      "{\"temperature_c\":21.43,\"pressure_hpa\":1006.53,\"humidity_pct\":61.27,\"rain_mm\":0.2,"
      "\"chuva_tips\":1,\"uv_index\":3,\"uv_voltage_v\":0.412,\"timestamp\":\"2026-01-01T00:15:00.000Z\"}\n";
  {
    auto f = fs.abrir(ARQ, 'w');
    for (int i = 0; i < 5000; ++i) {
      TEST_ASSERT_EQUAL(linha.size(), f->escrever(reinterpret_cast<const uint8_t*>(linha.data()), linha.size()));
    }
  }
  core::Buffer b(fs, ARQ, 5000);
  TEST_ASSERT_EQUAL_UINT32(5000, b.contar());
  TEST_ASSERT_TRUE(b.removerInicio(50));
  TEST_ASSERT_EQUAL_UINT32(4950, b.contar());
  TEST_ASSERT_FALSE(fs.existe("/teste_buffer.jsonl.tmp"));
}

void test_wdt_funciona_mesmo_com_a_task_ja_inscrita() {
  // Revisão: se a task já estava inscrita no watchdog, o wdt_hal não podia
  // achar que não estava — ninguém alimentaria e a placa reiniciaria.
  esp_task_wdt_config_t cfg = {};
  cfg.timeout_ms = 3000;
  cfg.idle_core_mask = 0;
  cfg.trigger_panic = true;
  if (esp_task_wdt_reconfigure(&cfg) != ESP_OK) esp_task_wdt_init(&cfg);
  esp_task_wdt_add(nullptr);
  hal::wdtIniciar(3);
  for (int i = 0; i < 50; ++i) {  // 5 s > 3 s de timeout: só sobrevive se alimentar
    hal::wdtAlimentar();
    delay(100);
  }
  TEST_ASSERT_EQUAL(ESP_OK, esp_task_wdt_status(nullptr));
  hal::wdtPausar();
  TEST_ASSERT_EQUAL(ESP_ERR_NOT_FOUND, esp_task_wdt_status(nullptr));
  delay(4000);  // pausado (como no lightsleep): não pode disparar
  hal::wdtRetomar();
  TEST_ASSERT_EQUAL(ESP_OK, esp_task_wdt_status(nullptr));
  hal::wdtPausar();
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
  RUN_TEST(test_buffer_cheio_realista_ainda_remove_do_inicio);
  RUN_TEST(test_wdt_funciona_mesmo_com_a_task_ja_inscrita);
  UNITY_END();
}

void loop() {}
