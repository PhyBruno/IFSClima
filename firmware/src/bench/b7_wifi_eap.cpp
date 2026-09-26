// b7_wifi_eap — descobre qual combinação EAP a rede do IFSC aceita.
// Usa SSID/usuário/senha/identidade/CA do secrets.h e tenta, em sequência:
// PEAP/MSCHAPv2, TTLS/PAP, TTLS/CHAP, TTLS/MSCHAPv2, TTLS/MSCHAP.
// Antes, varre as redes para confirmar que o SSID aparece em 2,4 GHz.
// Copie a combinação que conectar para WIFI_METODO/WIFI_FASE2 no secrets.h.
#include <Arduino.h>
#include <WiFi.h>

#include "config.h"
#include "net_hal.h"
#include "secrets.h"

struct Combinacao {
  hal::MetodoWifi metodo;
  hal::Fase2 fase2;
};

static const Combinacao COMBINACOES[] = {
    {hal::MetodoWifi::PEAP, hal::Fase2::MSCHAPV2}, {hal::MetodoWifi::TTLS, hal::Fase2::PAP},
    {hal::MetodoWifi::TTLS, hal::Fase2::CHAP},     {hal::MetodoWifi::TTLS, hal::Fase2::MSCHAPV2},
    {hal::MetodoWifi::TTLS, hal::Fase2::MSCHAP},
};

void setup() {
  Serial.begin(115200);
  delay(1500);
  WiFi.mode(WIFI_STA);
  Serial.println("Redes visiveis (2,4 GHz):");
  const int n = WiFi.scanNetworks();
  bool achou = false;
  for (int i = 0; i < n; ++i) {
    Serial.printf("  %-32s RSSI %4d  canal %2ld  auth %d\n", WiFi.SSID(i).c_str(), WiFi.RSSI(i),
                  static_cast<long>(WiFi.channel(i)), static_cast<int>(WiFi.encryptionType(i)));
    if (WiFi.SSID(i) == WIFI_SSID) achou = true;
  }
  if (!achou) Serial.printf(">> '%s' NAO apareceu na varredura (fora de alcance ou so 5 GHz).\n", WIFI_SSID);

  Serial.println("\nTestando combinacoes EAP:");
  for (const Combinacao& c : COMBINACOES) {
    hal::ConfigWifi cfg{WIFI_SSID, c.metodo, c.fase2, WIFI_IDENTIDADE, WIFI_USUARIO, WIFI_SENHA, WIFI_CA_PEM, WIFI_TIMEOUT_S};
    Serial.printf("\n--- %s / %s ---\n", hal::nomeMetodo(c.metodo),
                  c.metodo == hal::MetodoWifi::TTLS ? hal::nomeFase2(c.fase2) : "MSCHAPv2");
    const bool ok = hal::wifiConectar(cfg);
    Serial.printf(">> %s\n", ok ? "CONECTOU" : "falhou");
    hal::wifiDesligar();
    delay(2000);
  }
  Serial.println("\nFim. Use a primeira combinacao que CONECTOU no secrets.h.");
}

void loop() { delay(1000); }
