#include "net_hal.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <NetworkClientSecure.h>
#include <WiFi.h>
#include <esp_sntp.h>

#include "clock_hal.h"
#include "wdt_hal.h"

namespace hal {

namespace {
volatile bool s_ntpOk = false;
void aoSincronizar(struct timeval*) { s_ntpOk = true; }
}  // namespace

const char* nomeMetodo(MetodoWifi m) {
  switch (m) {
    case MetodoWifi::PSK: return "PSK";
    case MetodoWifi::PEAP: return "PEAP";
    case MetodoWifi::TTLS: return "TTLS";
  }
  return "?";
}

const char* nomeFase2(Fase2 f) {
  switch (f) {
    case Fase2::EAP: return "EAP";
    case Fase2::MSCHAPV2: return "MSCHAPv2";
    case Fase2::MSCHAP: return "MSCHAP";
    case Fase2::PAP: return "PAP";
    case Fase2::CHAP: return "CHAP";
  }
  return "?";
}

bool wifiConectar(const ConfigWifi& c) {
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  if (c.metodo == MetodoWifi::PSK) {
    WiFi.begin(c.ssid, c.senha);
  } else {
    const char* identidade = (c.identidade != nullptr && c.identidade[0] != '\0') ? c.identidade : c.usuario;
    if (c.caPem == nullptr) Serial.println("[AVISO] EAP sem certificado CA: o servidor RADIUS NAO sera validado");
    WiFi.begin(c.ssid, c.metodo == MetodoWifi::PEAP ? WPA2_AUTH_PEAP : WPA2_AUTH_TTLS, identidade, c.usuario, c.senha,
               c.caPem, nullptr, nullptr, c.metodo == MetodoWifi::TTLS ? static_cast<int>(c.fase2) : -1);
  }
  const uint64_t limite = uptimeMs() + c.timeoutS * 1000ULL;
  while (WiFi.status() != WL_CONNECTED) {
    if (uptimeMs() >= limite) {
      Serial.printf("[AVISO] Wi-Fi: timeout de %lus (status %d)\n", static_cast<unsigned long>(c.timeoutS),
                    static_cast<int>(WiFi.status()));
      return false;
    }
    delay(200);
    wdtAlimentar();
  }
  Serial.printf("[INFO] Wi-Fi conectado: %s, RSSI %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
  return true;
}

void wifiDesligar() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}

bool ntpSincronizar(uint32_t timeoutS) {
  s_ntpOk = false;
  sntp_set_time_sync_notification_cb(aoSincronizar);
  configTime(0, 0, "pool.ntp.org", "a.ntp.br", "time.google.com");
  const uint64_t limite = uptimeMs() + timeoutS * 1000ULL;
  while (!s_ntpOk && uptimeMs() < limite) {
    delay(100);
    wdtAlimentar();
  }
  esp_sntp_stop();
  if (!s_ntpOk) Serial.println("[AVISO] NTP: sem resposta");
  return s_ntpOk;
}

int httpPost(const char* url, const char* apiKey, const std::string& corpo, bool tlsInseguro, uint32_t timeoutS) {
  const bool https = strncmp(url, "https://", 8) == 0;
  NetworkClientSecure tls;
  NetworkClient plano;
  if (https) {
    if (tlsInseguro) {
      Serial.println("[AVISO] TLS da API SEM validacao (API_TLS_INSECURE)");
      tls.setInsecure();
    } else {
      tls.useBuiltinCACertBundle();
    }
    tls.setHandshakeTimeout(timeoutS);
  }
  HTTPClient http;
  http.setConnectTimeout(static_cast<int32_t>(timeoutS * 1000));
  http.setTimeout(static_cast<uint16_t>(timeoutS * 1000));
  const bool iniciou = https ? http.begin(tls, url) : http.begin(plano, url);
  if (!iniciou) return -1000;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", apiKey);
  const int codigo = http.POST(reinterpret_cast<uint8_t*>(const_cast<char*>(corpo.data())), corpo.size());
  http.end();
  wdtAlimentar();
  return codigo;
}

}  // namespace hal
