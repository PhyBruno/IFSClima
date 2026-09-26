// b0_placa — identifica placa, firmware e partições. Não mexe em hardware externo.
#include <Arduino.h>
#include <LittleFS.h>
#include <esp_chip_info.h>
#include <esp_flash.h>
#include <esp_mac.h>
#include <esp_partition.h>

void setup() {
  Serial.begin(115200);
  delay(1500);
  esp_chip_info_t ci;
  esp_chip_info(&ci);
  uint32_t flash = 0;
  esp_flash_get_size(nullptr, &flash);
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);

  Serial.println("==============================================");
  Serial.printf("Chip        : %s rev %d.%d, %d nucleo(s)\n", ESP.getChipModel(), ci.revision / 100, ci.revision % 100, ci.cores);
  Serial.printf("CPU         : %lu MHz\n", static_cast<unsigned long>(getCpuFrequencyMhz()));
  Serial.printf("Flash       : %lu bytes\n", static_cast<unsigned long>(flash));
  Serial.printf("PSRAM       : %lu bytes\n", static_cast<unsigned long>(ESP.getPsramSize()));
  Serial.printf("Heap livre  : %lu bytes\n", static_cast<unsigned long>(ESP.getFreeHeap()));
  Serial.printf("MAC         : %02x:%02x:%02x:%02x:%02x:%02x\n", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  Serial.printf("Reset       : motivo %d\n", static_cast<int>(esp_reset_reason()));
  Serial.printf("ESP-IDF     : %s\n", ESP.getSdkVersion());
  Serial.println("Particoes   :");
  esp_partition_iterator_t it = esp_partition_find(ESP_PARTITION_TYPE_ANY, ESP_PARTITION_SUBTYPE_ANY, nullptr);
  while (it != nullptr) {
    const esp_partition_t* p = esp_partition_get(it);
    Serial.printf("  %-10s tipo %d/%-3d 0x%06lx %8lu bytes\n", p->label, p->type, p->subtype,
                  static_cast<unsigned long>(p->address), static_cast<unsigned long>(p->size));
    it = esp_partition_next(it);
  }
  esp_partition_iterator_release(it);
  if (LittleFS.begin(true)) {
    Serial.printf("LittleFS    : %u de %u bytes usados\n", static_cast<unsigned>(LittleFS.usedBytes()),
                  static_cast<unsigned>(LittleFS.totalBytes()));
  } else {
    Serial.println("LittleFS    : FALHOU ao montar");
  }
  Serial.println("==============================================");
}

void loop() { delay(1000); }
