#include "sleep_hal.h"

#include <Arduino.h>
#include <esp_sleep.h>

#include "clock_hal.h"
#include "rain_hal.h"
#include "wdt_hal.h"

namespace hal {

namespace {
uint32_t s_despertares = 0;
Despertar s_ultimo = Despertar::OUTRO;
}  // namespace

void dormirAte(uint64_t alvoUptimeMs, bool economia) {
  for (;;) {
    const uint64_t agora = uptimeMs();
    if (agora >= alvoUptimeMs) return;
    const uint64_t restante = alvoUptimeMs - agora;
    if (!economia) {
      // Só no modo debug (acordado): 'R' pela Serial força um reset POR
      // SOFTWARE — é assim que se testa a restauração dos tips da RTC memory
      // (o botão EN gera POWERON_RESET, que zera a RTC memory de propósito).
      if (Serial.available() && Serial.read() == 'R') {
        Serial.println("[INFO] reset por software pedido pela Serial");
        Serial.flush();
        ESP.restart();
      }
      delay(restante > 1000 ? 1000 : static_cast<uint32_t>(restante));
      wdtAlimentar();
      continue;
    }
    Serial.flush();  // sem isto o log sai truncado ao dormir
    wdtPausar();
    chuvaAntesDeDormir();
    esp_sleep_enable_timer_wakeup(restante * 1000ULL);
    esp_light_sleep_start();
    chuvaDepoisDeAcordar();
    wdtRetomar();
    ++s_despertares;
    const esp_sleep_wakeup_cause_t causa = esp_sleep_get_wakeup_cause();
    s_ultimo = causa == ESP_SLEEP_WAKEUP_TIMER ? Despertar::TIMER
               : causa == ESP_SLEEP_WAKEUP_GPIO ? Despertar::GPIO
                                                : Despertar::OUTRO;
  }
}

uint32_t contadorDespertares() { return s_despertares; }

Despertar ultimoDespertar() { return s_ultimo; }

}  // namespace hal
