#pragma once
#include <stdint.h>

#include <string>

namespace hal {

enum class MetodoWifi : uint8_t { PSK, PEAP, TTLS };
// Valores = esp_eap_ttls_phase2_types do ESP-IDF.
enum class Fase2 : int8_t { EAP = 0, MSCHAPV2 = 1, MSCHAP = 2, PAP = 3, CHAP = 4 };

struct ConfigWifi {
  const char* ssid;
  MetodoWifi metodo;
  Fase2 fase2;             // só TTLS
  const char* identidade;  // externa/anônima; vazio = usuário
  const char* usuario;
  const char* senha;
  const char* caPem;  // nullptr = não valida o RADIUS
  uint32_t timeoutS;
};

bool wifiConectar(const ConfigWifi& c);
// Obrigatório antes de dormir: rádio ligado impede o lightsleep de economizar.
void wifiDesligar();
bool ntpSincronizar(uint32_t timeoutS);
// Status HTTP, ou negativo em erro de conexão/TLS.
int httpPost(const char* url, const char* apiKey, const std::string& corpo, bool tlsInseguro, uint32_t timeoutS);

const char* nomeMetodo(MetodoWifi m);
const char* nomeFase2(Fase2 f);

}  // namespace hal
