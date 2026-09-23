#include <unity.h>

#include <string>

#include "buffer.h"
#include "leitor_linhas.h"
#include "mem_fs.h"

static const char* ARQ = "/buffer.jsonl";
static const char* TMP = "/buffer.jsonl.tmp";

static std::string leitura(int i) {
  return "{\"timestamp\":\"2026-01-01T00:" + std::string(i < 10 ? "0" : "") + std::to_string(i) +
         ":00.000Z\",\"n\":" + std::to_string(i) + "}";
}

void setUp() {}
void tearDown() {}

void test_primeiro_boot_sem_arquivo() {
  // Review Focus: nada existe ainda.
  testsupport::SistemaArquivosMemoria fs;
  core::Buffer b(fs, ARQ, 5000);
  TEST_ASSERT_EQUAL_UINT32(0, b.contar());
  const core::Buffer::Lote l = b.carregarLote(50);
  TEST_ASSERT_EQUAL_UINT32(0, l.linhasLidas);
  TEST_ASSERT_FALSE(b.removerInicio(3));
  TEST_ASSERT_TRUE(b.adicionar(leitura(1)));
  TEST_ASSERT_EQUAL_STRING((leitura(1) + "\n").c_str(), fs.arquivos[ARQ].c_str());
  TEST_ASSERT_EQUAL_UINT32(1, b.contar());
}

void test_adicionar_e_contar() {
  testsupport::SistemaArquivosMemoria fs;
  core::Buffer b(fs, ARQ, 5000);
  for (int i = 0; i < 3; ++i) b.adicionar(leitura(i));
  TEST_ASSERT_EQUAL_UINT32(3, b.contar());
  core::Buffer outro(fs, ARQ, 5000);  // recontagem a partir do arquivo (reboot)
  TEST_ASSERT_EQUAL_UINT32(3, outro.contar());
}

void test_linha_truncada_por_queda_de_energia_e_fechada() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = leitura(1) + "\n{\"timest";
  core::Buffer b(fs, ARQ, 5000);
  TEST_ASSERT_TRUE(b.adicionar(leitura(2)));
  TEST_ASSERT_EQUAL_STRING((leitura(1) + "\n{\"timest\n" + leitura(2) + "\n").c_str(), fs.arquivos[ARQ].c_str());
  TEST_ASSERT_EQUAL_UINT32(3, b.contar());
  const core::Buffer::Lote l = b.carregarLote(50);
  TEST_ASSERT_EQUAL_UINT32(2, l.leituras.size());  // a truncada é descartada, a seguinte sobrevive
  TEST_ASSERT_EQUAL_UINT32(3, l.linhasLidas);
}

void test_lote_conta_linha_corrompida_para_nao_duplicar_envio() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = leitura(1) + "\nlixo\n" + leitura(2) + "\n" + leitura(3) + "\n";
  core::Buffer b(fs, ARQ, 5000);
  const core::Buffer::Lote l = b.carregarLote(2);
  TEST_ASSERT_EQUAL_UINT32(2, l.leituras.size());
  TEST_ASSERT_EQUAL_STRING(leitura(1).c_str(), l.leituras[0].c_str());
  TEST_ASSERT_EQUAL_STRING(leitura(2).c_str(), l.leituras[1].c_str());
  TEST_ASSERT_EQUAL_UINT32(3, l.linhasLidas);
  TEST_ASSERT_TRUE(b.removerInicio(l.linhasLidas));
  TEST_ASSERT_EQUAL_STRING((leitura(3) + "\n").c_str(), fs.arquivos[ARQ].c_str());
  TEST_ASSERT_EQUAL_UINT32(1, b.contar());
}

void test_linha_sem_timestamp_e_invalida_para_envio() {
  TEST_ASSERT_TRUE(core::leituraValida(leitura(1)));
  TEST_ASSERT_FALSE(core::leituraValida("{\"_boot\":3,\"_up_ms\":1000}"));
  TEST_ASSERT_FALSE(core::leituraValida("[1,2]"));
  TEST_ASSERT_FALSE(core::leituraValida("{\"timestamp\":5}"));
}

void test_remover_inicio_ignora_linhas_em_branco() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = "\n" + leitura(1) + "\n\n" + leitura(2) + "\n" + leitura(3);
  core::Buffer b(fs, ARQ, 5000);
  TEST_ASSERT_TRUE(b.removerInicio(1));
  TEST_ASSERT_EQUAL_STRING((leitura(2) + "\n" + leitura(3) + "\n").c_str(), fs.arquivos[ARQ].c_str());
  TEST_ASSERT_EQUAL_UINT32(2, b.contar());
  TEST_ASSERT_FALSE(fs.existe(TMP));
}

void test_remover_inicio_com_rename_que_nao_sobrescreve() {
  testsupport::SistemaArquivosMemoria fs;
  fs.renomearFalhaSeDestinoExiste = true;
  core::Buffer b(fs, ARQ, 5000);
  for (int i = 0; i < 3; ++i) b.adicionar(leitura(i));
  TEST_ASSERT_TRUE(b.removerInicio(2));
  TEST_ASSERT_EQUAL_STRING((leitura(2) + "\n").c_str(), fs.arquivos[ARQ].c_str());
}

void test_teto_descarta_bloco_das_mais_antigas() {
  testsupport::SistemaArquivosMemoria fs;
  core::Buffer b(fs, ARQ, 10);
  for (int i = 0; i < 11; ++i) b.adicionar(leitura(i));
  TEST_ASSERT_EQUAL_UINT32(9, b.contar());  // 11 > 10 -> volta para 90% = 9
  const core::Buffer::Lote l = b.carregarLote(1);
  TEST_ASSERT_EQUAL_STRING(leitura(2).c_str(), l.leituras[0].c_str());
}

void test_recupera_tmp_orfao() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[TMP] = leitura(1) + "\n" + leitura(2) + "\n";
  core::Buffer b(fs, ARQ, 5000);
  TEST_ASSERT_TRUE(b.recuperarTmpOrfao());
  TEST_ASSERT_FALSE(fs.existe(TMP));
  TEST_ASSERT_EQUAL_UINT32(2, b.contar());
}

void test_tmp_velho_com_principal_intacto_e_apagado() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos[ARQ] = leitura(1) + "\n";
  fs.arquivos[TMP] = "parcial";
  core::Buffer b(fs, ARQ, 5000);
  TEST_ASSERT_FALSE(b.recuperarTmpOrfao());
  TEST_ASSERT_FALSE(fs.existe(TMP));
  TEST_ASSERT_EQUAL_STRING((leitura(1) + "\n").c_str(), fs.arquivos[ARQ].c_str());
}

void test_linha_maior_que_o_bloco_de_leitura() {
  // Review Focus: leitura com vários "*_erro" longos passa de 128 bytes.
  testsupport::SistemaArquivosMemoria fs;
  const std::string longa = "{\"timestamp\":\"2026-01-01T00:00:00.000Z\",\"bme280_erro\":\"" + std::string(300, 'x') + "\"}";
  fs.arquivos[ARQ] = longa + "\n" + leitura(1) + "\n";
  core::Buffer b(fs, ARQ, 5000);
  const core::Buffer::Lote l = b.carregarLote(50);
  TEST_ASSERT_EQUAL_UINT32(2, l.leituras.size());
  TEST_ASSERT_EQUAL_STRING(longa.c_str(), l.leituras[0].c_str());
}

void test_leitor_linhas_marca_linha_incompleta() {
  testsupport::SistemaArquivosMemoria fs;
  fs.arquivos["/x"] = "a\nb";
  auto f = fs.abrir("/x", 'r');
  core::LeitorLinhas lr(*f);
  std::string linha;
  bool completa = false;
  TEST_ASSERT_TRUE(lr.proxima(linha, completa));
  TEST_ASSERT_EQUAL_STRING("a", linha.c_str());
  TEST_ASSERT_TRUE(completa);
  TEST_ASSERT_TRUE(lr.proxima(linha, completa));
  TEST_ASSERT_EQUAL_STRING("b", linha.c_str());
  TEST_ASSERT_FALSE(completa);
  TEST_ASSERT_FALSE(lr.proxima(linha, completa));
}

void test_invalidar_contagem_reconta_do_arquivo() {
  testsupport::SistemaArquivosMemoria fs;
  core::Buffer b(fs, ARQ, 5000);
  b.adicionar(leitura(1));
  fs.arquivos[ARQ] += leitura(2) + "\n";  // alguém reescreveu por baixo (ex.: resolverPendentes)
  b.invalidarContagem();
  TEST_ASSERT_EQUAL_UINT32(2, b.contar());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_primeiro_boot_sem_arquivo);
  RUN_TEST(test_adicionar_e_contar);
  RUN_TEST(test_linha_truncada_por_queda_de_energia_e_fechada);
  RUN_TEST(test_lote_conta_linha_corrompida_para_nao_duplicar_envio);
  RUN_TEST(test_linha_sem_timestamp_e_invalida_para_envio);
  RUN_TEST(test_remover_inicio_ignora_linhas_em_branco);
  RUN_TEST(test_remover_inicio_com_rename_que_nao_sobrescreve);
  RUN_TEST(test_teto_descarta_bloco_das_mais_antigas);
  RUN_TEST(test_recupera_tmp_orfao);
  RUN_TEST(test_tmp_velho_com_principal_intacto_e_apagado);
  RUN_TEST(test_linha_maior_que_o_bloco_de_leitura);
  RUN_TEST(test_leitor_linhas_marca_linha_incompleta);
  RUN_TEST(test_invalidar_contagem_reconta_do_arquivo);
  return UNITY_END();
}
