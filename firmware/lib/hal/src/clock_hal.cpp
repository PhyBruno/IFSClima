#include "clock_hal.h"

#include <Preferences.h>
#include <esp_timer.h>
#include <sys/time.h>

namespace hal {

uint64_t uptimeMs() { return static_cast<uint64_t>(esp_timer_get_time() / 1000); }

uint32_t incrementarContadorBoot() {
  Preferences p;
  p.begin("estacao", false);
  const uint32_t n = p.getUInt("boot", 0) + 1;
  p.putUInt("boot", n);
  p.end();
  return n;
}

int64_t epochMsDoSistema() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  return static_cast<int64_t>(tv.tv_sec) * 1000 + tv.tv_usec / 1000;
}

int64_t epochSDoSistema() { return epochMsDoSistema() / 1000; }

void definirHoraSistema(int64_t epochS) {
  struct timeval tv;
  tv.tv_sec = static_cast<time_t>(epochS);
  tv.tv_usec = 0;
  settimeofday(&tv, nullptr);
}

}  // namespace hal
