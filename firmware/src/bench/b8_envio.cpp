// b8_envio — valida NTP + TLS + chave da API. Envia readings VAZIO: a API
// responde 202 {"accepted":0,...} sem tocar no banco (lote vazio é no-op), então
// o teste não suja os dados de produção. Esperado: HTTP 202.
//  401 -> API_KEY errada | < 0 -> falha de conexão/TLS (URL, DNS, certificado)
#include <Arduino.h>

#include "clock_hal.h"
#include "config.h"
#include "envio.h"
#include "iso_time.h"
#include "net_hal.h"
#include "secrets.h"

void setup() {
  Serial.begin(115200);
  delay(1500);
  const hal::ConfigWifi cfg{WIFI_SSID, WIFI_METODO, WIFI_FASE2, WIFI_IDENTIDADE,
                            WIFI_USUARIO, WIFI_SENHA, WIFI_CA_PEM, WIFI_TIMEOUT_S};
  if (!hal::wifiConectar(cfg)) {
    Serial.println("FALHA: sem Wi-Fi (rode o b7 primeiro).");
    return;
  }
  if (hal::ntpSincronizar(NTP_TIMEOUT_S)) {
    char iso[core::TAM_ISO];
    core::formatarIso(hal::epochMsDoSistema(), iso);
    Serial.printf("NTP OK: %s\n", iso);
  } else {
    Serial.println("FALHA: NTP (o TLS pode falhar por hora errada)");
  }
  const std::string corpo = core::montarPayload(STATION_ID, {});
  Serial.printf("POST %s\n  %s\n", API_URL, corpo.c_str());
  const int codigo = hal::httpPost(API_URL, API_KEY, corpo, API_TLS_INSECURE, API_TIMEOUT_S);
  Serial.printf(">> HTTP %d %s\n", codigo, codigo == 202 ? "(OK)" : "(FALHA)");
  hal::wifiDesligar();
}

void loop() { delay(1000); }
