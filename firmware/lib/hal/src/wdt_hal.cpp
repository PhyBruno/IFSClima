#include "wdt_hal.h"

#include <esp_task_wdt.h>

namespace hal {

namespace {
bool s_ativo = false;

// Pergunta ao próprio watchdog em vez de guardar um flag: se a task já estava
// inscrita por outro caminho, um flag local diria "não inscrita", ninguém
// alimentaria e a placa reiniciaria a cada timeout.
bool inscrita() { return esp_task_wdt_status(nullptr) == ESP_OK; }
}  // namespace

void wdtIniciar(uint32_t timeoutS) {
  esp_task_wdt_config_t cfg = {};
  cfg.timeout_ms = timeoutS * 1000;
  cfg.idle_core_mask = 1 << 0;  // mantém o idle do core 0 (Wi-Fi/lwIP) vigiado, como o padrão
  cfg.trigger_panic = true;
  if (esp_task_wdt_reconfigure(&cfg) != ESP_OK) esp_task_wdt_init(&cfg);
  s_ativo = true;
  wdtRetomar();
}

void wdtAlimentar() {
  if (s_ativo && inscrita()) esp_task_wdt_reset();
}

void wdtPausar() {
  if (inscrita()) esp_task_wdt_delete(nullptr);
}

void wdtRetomar() {
  if (s_ativo && !inscrita()) esp_task_wdt_add(nullptr);
  wdtAlimentar();
}

}  // namespace hal
