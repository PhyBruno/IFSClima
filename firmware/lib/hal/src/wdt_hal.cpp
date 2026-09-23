#include "wdt_hal.h"

#include <esp_task_wdt.h>

namespace hal {

namespace {
bool s_ativo = false;
bool s_inscrito = false;
}  // namespace

void wdtIniciar(uint32_t timeoutS) {
  esp_task_wdt_config_t cfg = {};
  cfg.timeout_ms = timeoutS * 1000;
  cfg.idle_core_mask = 0;
  cfg.trigger_panic = true;
  if (esp_task_wdt_reconfigure(&cfg) != ESP_OK) esp_task_wdt_init(&cfg);
  s_ativo = true;
  wdtRetomar();
}

void wdtAlimentar() {
  if (s_inscrito) esp_task_wdt_reset();
}

void wdtPausar() {
  if (s_inscrito && esp_task_wdt_delete(nullptr) == ESP_OK) s_inscrito = false;
}

void wdtRetomar() {
  if (s_ativo && !s_inscrito) s_inscrito = esp_task_wdt_add(nullptr) == ESP_OK;
  wdtAlimentar();
}

}  // namespace hal
