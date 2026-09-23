#include <ArduinoJson.h>
#include <unity.h>

#include <string>
#include <vector>

#include "mem_fs.h"
#include "pendentes.h"

static const char* ARQ = "/buffer.jsonl";
// Sync no boot 7: uptime 905000 ms <-> 2026-01-01T00:15:00.000Z
static const core::RefHora REF{true, 1767226500000LL, 905000};

void setUp() {}
void tearDown() {}

static std::vector<std::string> linhas(testsupport::SistemaArquivosMemoria& fs) {
  std::vector<std::string> v;
  const std::string& s = fs.arquivos[ARQ];
  size_t ini = 0;
  for (size_t i = 0; i < s.size(); ++i) {
    if (s[i] == '\n') {
      v.push_back(s.substr(ini, i - ini));
      ini = i + 1;
    }
  }
  return v;
}

static JsonDocument doc(const std::string& linha) {
  JsonDocument d;
  deserializeJson(d, linha);
  return d;
}

void test_detecta_pendentes() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = "{\"timestamp\":\"2026-01-01T00:00:00.000Z\"}\n";
  TEST_ASSERT_FALSE(core::arquivoTemPendentes(fs, ARQ));
  fs.arquivos[ARQ] += "{\"_boot\":7,\"_up_ms\":5000}\n";
  TEST_ASSERT_TRUE(core::arquivoTemPendentes(fs, ARQ));
  TEST_ASSERT_FALSE(core::arquivoTemPendentes(fs, "/nao_existe"));
}

void test_data_pendente_do_boot_atual() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = "{\"temperature_c\":21.4,\"_boot\":7,\"_up_ms\":5000}\n";
  const core::ResultadoPendentes r = core::resolverPendentes(fs, ARQ, 7, REF, 0.2);
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_UINT32(1, r.datadas);
  const JsonDocument d = doc(linhas(fs)[0]);
  // 900 s antes do sync
  TEST_ASSERT_EQUAL_STRING("2026-01-01T00:00:00.000Z", d["timestamp"].as<const char*>());
  TEST_ASSERT_FALSE(d["_boot"].is<uint32_t>());
  TEST_ASSERT_FALSE(d["_up_ms"].is<uint64_t>());
  TEST_ASSERT_DOUBLE_WITHIN(1e-4, 21.4, d["temperature_c"].as<double>());
  TEST_ASSERT_FALSE(fs.existe("/buffer.jsonl.tmp"));
}

void test_boot_antigo_e_descartado_e_chuva_vai_para_a_proxima() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] =
      "{\"rain_mm\":0.4,\"chuva_tips\":2,\"_boot\":5,\"_up_ms\":1000}\n"
      "{\"rain_mm\":0.2,\"chuva_tips\":1,\"_boot\":7,\"_up_ms\":5000}\n";
  const core::ResultadoPendentes r = core::resolverPendentes(fs, ARQ, 7, REF, 0.2);
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_UINT32(1, r.descartadas);
  TEST_ASSERT_EQUAL_UINT32(1, r.datadas);
  TEST_ASSERT_EQUAL_UINT32(0, r.tipsSobrando);
  const std::vector<std::string> v = linhas(fs);
  TEST_ASSERT_EQUAL_UINT32(1, v.size());
  const JsonDocument d = doc(v[0]);
  TEST_ASSERT_EQUAL_UINT32(3, d["chuva_tips"].as<uint32_t>());
  TEST_ASSERT_DOUBLE_WITHIN(1e-4, 0.6, d["rain_mm"].as<double>());
}

void test_boot_antigo_no_fim_devolve_tips_sobrando() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] =
      "{\"timestamp\":\"2025-12-31T23:00:00.000Z\",\"chuva_tips\":0}\n"
      "{\"chuva_tips\":4,\"_boot\":5,\"_up_ms\":1000}\n";
  const core::ResultadoPendentes r = core::resolverPendentes(fs, ARQ, 7, REF, 0.2);
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_UINT32(4, r.tipsSobrando);
  TEST_ASSERT_EQUAL_UINT32(1, linhas(fs).size());
}

void test_datada_sem_chuva_tips_recebe_a_chuva() {
  // Review Focus: a leitura seguinte teve o pluviômetro com erro.
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] =
      "{\"chuva_tips\":2,\"_boot\":5,\"_up_ms\":1000}\n"
      "{\"timestamp\":\"2026-01-01T00:30:00.000Z\",\"rain_gauge_erro\":\"x\"}\n";
  const core::ResultadoPendentes r = core::resolverPendentes(fs, ARQ, 7, REF, 0.2);
  TEST_ASSERT_TRUE(r.ok);
  const JsonDocument d = doc(linhas(fs)[0]);
  TEST_ASSERT_EQUAL_UINT32(2, d["chuva_tips"].as<uint32_t>());
  TEST_ASSERT_DOUBLE_WITHIN(1e-4, 0.4, d["rain_mm"].as<double>());
  TEST_ASSERT_EQUAL_STRING("2026-01-01T00:30:00.000Z", d["timestamp"].as<const char*>());
}

void test_linha_corrompida_e_preservada() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = "lixo{\n{\"timestamp\":\"2026-01-01T00:30:00.000Z\"}\n";
  const core::ResultadoPendentes r = core::resolverPendentes(fs, ARQ, 7, REF, 0.2);
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_STRING("lixo{", linhas(fs)[0].c_str());
  TEST_ASSERT_EQUAL_STRING("{\"timestamp\":\"2026-01-01T00:30:00.000Z\"}", linhas(fs)[1].c_str());
}

void test_sem_arquivo_nao_falha() {
  testsupport::SistemaArquivosMemoria fs;
  const core::ResultadoPendentes r = core::resolverPendentes(fs, ARQ, 7, REF, 0.2);
  TEST_ASSERT_TRUE(r.ok);
  TEST_ASSERT_EQUAL_UINT32(0, r.datadas);
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_detecta_pendentes);
  RUN_TEST(test_data_pendente_do_boot_atual);
  RUN_TEST(test_boot_antigo_e_descartado_e_chuva_vai_para_a_proxima);
  RUN_TEST(test_boot_antigo_no_fim_devolve_tips_sobrando);
  RUN_TEST(test_datada_sem_chuva_tips_recebe_a_chuva);
  RUN_TEST(test_linha_corrompida_e_preservada);
  RUN_TEST(test_sem_arquivo_nao_falha);
  return UNITY_END();
}
