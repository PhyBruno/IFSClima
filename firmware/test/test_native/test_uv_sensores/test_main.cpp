#include <ArduinoJson.h>
#include <unity.h>

#include "sensor.h"
#include "uv_math.h"

void setUp() {}
void tearDown() {}

void test_indice_uv_nos_limiares() {
  TEST_ASSERT_EQUAL_INT(0, core::indiceUv(0));
  TEST_ASSERT_EQUAL_INT(0, core::indiceUv(226.9));
  TEST_ASSERT_EQUAL_INT(1, core::indiceUv(227));
  TEST_ASSERT_EQUAL_INT(10, core::indiceUv(1169));
  TEST_ASSERT_EQUAL_INT(11, core::indiceUv(1170));
  TEST_ASSERT_EQUAL_INT(11, core::indiceUv(1600));
}

void test_mediana_descarta_transitorio_nos_trilhos() {
  // Mau contato joga o nó nos trilhos (0 e ~2000 mV) por instantes.
  double v[7] = {0, 2000, 500, 510, 505, 0, 2000};
  TEST_ASSERT_EQUAL_DOUBLE(505, core::mediana(v, 7));
}

void test_mediana_par_pega_o_elemento_superior() {
  double v[4] = {4, 1, 3, 2};  // igual ao sorted(v)[n // 2] do Python
  TEST_ASSERT_EQUAL_DOUBLE(3, core::mediana(v, 4));
}

void test_avaliar_uv_ok() {
  const core::AvaliacaoUv a = core::avaliarUv(120.4, 1650.0);
  TEST_ASSERT_TRUE(a.status == core::StatusUv::OK);
  TEST_ASSERT_EQUAL_INT(0, a.indice);
  TEST_ASSERT_EQUAL_DOUBLE(0.12, a.tensaoV);
}

void test_avaliar_uv_sinal_solto() {
  TEST_ASSERT_TRUE(core::avaliarUv(1650.0, 1650.0).status == core::StatusUv::SINAL_SOLTO);
  TEST_ASSERT_TRUE(core::avaliarUv(1649.9, 1650.0).status == core::StatusUv::OK);
}

class SensorFalso : public core::Sensor {
 public:
  SensorFalso(const char* nome, bool ok, const char* erro) : nome_(nome), ok_(ok), erro_(erro) {}
  const char* nome() const override { return nome_; }
  bool ler(JsonObject saida, std::string& erro) override {
    if (ok_) {
      saida[std::string(nome_) + "_valor"] = 1;
      return true;
    }
    erro = erro_;
    return false;
  }

 private:
  const char* nome_;
  bool ok_;
  const char* erro_;
};

void test_ler_todos_isola_falha_de_um_sensor() {
  SensorFalso a("a", true, ""), b("b", false, "quebrou"), c("c", true, "");
  core::Sensor* const lista[] = {&a, &b, &c};
  JsonDocument doc;
  core::lerTodos(lista, 3, doc.to<JsonObject>());
  TEST_ASSERT_EQUAL_INT(1, doc["a_valor"].as<int>());
  TEST_ASSERT_EQUAL_STRING("quebrou", doc["b_erro"].as<const char*>());
  TEST_ASSERT_EQUAL_INT(1, doc["c_valor"].as<int>());
}

void test_ler_todos_erro_sem_descricao() {
  SensorFalso b("b", false, "");
  core::Sensor* const lista[] = {&b};
  JsonDocument doc;
  core::lerTodos(lista, 1, doc.to<JsonObject>());
  TEST_ASSERT_EQUAL_STRING("falha sem descricao", doc["b_erro"].as<const char*>());
}

void test_escrever_chuva() {
  JsonDocument doc;
  core::escreverChuva(doc.to<JsonObject>(), 3, 0.2);
  TEST_ASSERT_EQUAL_DOUBLE(0.6, doc["rain_mm"].as<double>());
  TEST_ASSERT_EQUAL_UINT32(3, doc["chuva_tips"].as<uint32_t>());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_indice_uv_nos_limiares);
  RUN_TEST(test_mediana_descarta_transitorio_nos_trilhos);
  RUN_TEST(test_mediana_par_pega_o_elemento_superior);
  RUN_TEST(test_avaliar_uv_ok);
  RUN_TEST(test_avaliar_uv_sinal_solto);
  RUN_TEST(test_ler_todos_isola_falha_de_um_sensor);
  RUN_TEST(test_ler_todos_erro_sem_descricao);
  RUN_TEST(test_escrever_chuva);
  return UNITY_END();
}
