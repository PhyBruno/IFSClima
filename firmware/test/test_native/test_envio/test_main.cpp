#include <unity.h>

#include <cstdio>
#include <string>
#include <vector>

#include "buffer.h"
#include "envio.h"
#include "mem_fs.h"

static const char* ARQ = "/buffer.jsonl";

static std::string leitura(int i) {
  char s[80];
  snprintf(s, sizeof(s), "{\"timestamp\":\"2026-01-01T%02d:%02d:00.000Z\"}", i / 60, i % 60);
  return s;
}

void setUp() {}
void tearDown() {}

void test_payload_no_formato_do_contrato() {
  TEST_ASSERT_EQUAL_STRING("{\"station_id\":\"main\",\"readings\":[{\"a\":1},{\"b\":2}]}",
                           core::montarPayload("main", {"{\"a\":1}", "{\"b\":2}"}).c_str());
}

void test_payload_vazio_e_station_escapada() {
  TEST_ASSERT_EQUAL_STRING("{\"station_id\":\"main\",\"readings\":[]}", core::montarPayload("main", {}).c_str());
  TEST_ASSERT_EQUAL_STRING("{\"station_id\":\"ma\\\"in\",\"readings\":[]}", core::montarPayload("ma\"in", {}).c_str());
}

void test_buffer_vazio_nao_chama_post() {
  testsupport::SistemaArquivosMemoria fs;
  core::Buffer b(fs, ARQ, 5000);
  int chamadas = 0;
  const core::ResultadoEnvio r = core::enviarBuffer(b, 50, "main", [&](const std::string&) {
    ++chamadas;
    return true;
  });
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_INT(0, chamadas);
}

void test_envia_em_lotes_e_esvazia() {
  testsupport::SistemaArquivosMemoria fs;
  core::Buffer b(fs, ARQ, 5000);
  for (int i = 0; i < 120; ++i) b.adicionar(leitura(i));
  std::vector<size_t> tamanhos;
  const core::ResultadoEnvio r = core::enviarBuffer(b, 50, "main", [&](const std::string& corpo) {
    size_t n = 0;
    for (size_t p = corpo.find("timestamp"); p != std::string::npos; p = corpo.find("timestamp", p + 1)) ++n;
    tamanhos.push_back(n);
    return true;
  });
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_UINT32(120, r.enviadas);
  TEST_ASSERT_EQUAL_UINT32(3, tamanhos.size());
  TEST_ASSERT_EQUAL_UINT32(50, tamanhos[0]);
  TEST_ASSERT_EQUAL_UINT32(20, tamanhos[2]);
  TEST_ASSERT_EQUAL_UINT32(0, b.contar());
}

void test_falha_no_meio_mantem_o_restante() {
  testsupport::SistemaArquivosMemoria fs;
  core::Buffer b(fs, ARQ, 5000);
  for (int i = 0; i < 120; ++i) b.adicionar(leitura(i));
  int chamada = 0;
  const core::ResultadoEnvio r = core::enviarBuffer(b, 50, "main", [&](const std::string&) { return ++chamada == 1; });
  TEST_ASSERT_FALSE(r.ok);
  TEST_ASSERT_EQUAL_UINT32(50, r.enviadas);
  TEST_ASSERT_EQUAL_UINT32(70, b.contar());
  TEST_ASSERT_EQUAL_STRING(leitura(50).c_str(), b.carregarLote(1).leituras[0].c_str());
}

void test_linha_corrompida_no_lote_nao_duplica_envio() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = leitura(1) + "\nlixo\n" + leitura(2) + "\n" + leitura(3) + "\n";
  core::Buffer b(fs, ARQ, 5000);
  std::vector<std::string> corpos;
  const core::ResultadoEnvio r = core::enviarBuffer(b, 2, "main", [&](const std::string& c) {
    corpos.push_back(c);
    return true;
  });
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_UINT32(3, r.enviadas);
  TEST_ASSERT_EQUAL_UINT32(1, r.descartadas);
  TEST_ASSERT_EQUAL_UINT32(2, corpos.size());
  TEST_ASSERT_EQUAL_STRING(core::montarPayload("main", {leitura(3)}).c_str(), corpos[1].c_str());
}

void test_lote_todo_corrompido_e_descartado_sem_post() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = "lixo1\nlixo2\n{\"_boot\":1,\"_up_ms\":5}\n";
  core::Buffer b(fs, ARQ, 5000);
  int chamadas = 0;
  const core::ResultadoEnvio r = core::enviarBuffer(b, 50, "main", [&](const std::string&) {
    ++chamadas;
    return true;
  });
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_INT(0, chamadas);
  TEST_ASSERT_EQUAL_UINT32(3, r.descartadas);
  TEST_ASSERT_EQUAL_UINT32(0, b.contar());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_payload_no_formato_do_contrato);
  RUN_TEST(test_payload_vazio_e_station_escapada);
  RUN_TEST(test_buffer_vazio_nao_chama_post);
  RUN_TEST(test_envia_em_lotes_e_esvazia);
  RUN_TEST(test_falha_no_meio_mantem_o_restante);
  RUN_TEST(test_linha_corrompida_no_lote_nao_duplica_envio);
  RUN_TEST(test_lote_todo_corrompido_e_descartado_sem_post);
  return UNITY_END();
}
