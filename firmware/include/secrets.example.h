#pragma once
// ======================================================================
// secrets.h — credenciais da estação. NÃO VERSIONAR.
// Copie este arquivo para include/secrets.h e preencha.
// Os tipos hal::MetodoWifi / hal::Fase2 vêm de lib/hal/src/net_hal.h.
// ======================================================================

// ---------------- Wi-Fi ----------------
// Precisa ser uma rede de 2,4 GHz: as "-Turbo" do IFSC são 5 GHz e o ESP32
// não as enxerga.
#define WIFI_SSID "IFSC-ADM"
// hal::MetodoWifi::PSK  (WPA2 pessoal — rede de casa/bancada)
// hal::MetodoWifi::PEAP ou hal::MetodoWifi::TTLS (WPA2-Enterprise)
#define WIFI_METODO hal::MetodoWifi::PEAP
// Só vale para TTLS: EAP, MSCHAPV2, MSCHAP, PAP ou CHAP.
// Use bench/b7_wifi_eap para descobrir qual a rede aceita.
#define WIFI_FASE2 hal::Fase2::MSCHAPV2
// Identidade externa (anônima). Vazio = usa o próprio usuário.
#define WIFI_IDENTIDADE ""
#define WIFI_USUARIO "usuario@ifsc.edu.br"
#define WIFI_SENHA "SUA_SENHA"
// Certificado CA do servidor RADIUS em PEM (R"(-----BEGIN CERTIFICATE----- ...)"),
// ou nullptr para NÃO validar o servidor (fica um aviso no log).
#define WIFI_CA_PEM nullptr

// ---------------- API ----------------
#define API_URL "https://sua-api.exemplo.com/api/v1/ingest"
#define API_KEY "whs_test_ABC123"   // INGEST_API_KEY da API
#define STATION_ID "main"
// true SÓ em bancada: aceita qualquer certificado TLS da API.
#define API_TLS_INSECURE false
