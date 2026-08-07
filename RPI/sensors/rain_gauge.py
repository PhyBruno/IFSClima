# sensors/rain_gauge.py — Pluviômetro de báscula (reed switch KY-025).
#
# Cada báscula move um ímã que fecha o reed switch, gerando um pulso. Contamos
# os pulsos por interrupção (IRQ), que acorda o Pico do lightsleep. O contador
# vive na RAM (preservada no lightsleep) e é zerado a cada leitura.
#
# WIRING — duas opções:
#   A) Recomendada e mais simples: use o REED direto. Ligue um terminal do reed
#      ao GP16 e o outro ao GND. Deixe RAIN_PULL_UP=True e RAIN_ON_FALLING=True.
#      (Um pluviômetro de báscula já traz um reed interno; o módulo KY-025 é
#      opcional nesse caso.)
#   B) Usando o módulo KY-025: alimente VCC/GND do módulo e ligue D0 -> GP16.
#      Com um ímã perto, confira o nível de D0 (imprima _pin.value()) e ajuste
#      RAIN_ON_FALLING/RAIN_PULL_UP em config.py conforme a polaridade.
#
# A IRQ é configurada UMA vez, no import (válido porque o programa não reinicia).
from machine import Pin
import machine
import time
import config

NOME = "rain_gauge"

_tips = 0
_ultimo_ms = 0


def _on_tip(pin):
    # roda em contexto de interrupção: mantenha curtíssimo
    global _tips, _ultimo_ms
    agora = time.ticks_ms()
    if time.ticks_diff(agora, _ultimo_ms) < config.RAIN_DEBOUNCE_MS:
        return  # debounce: ignora o repique mecânico da mesma báscula
    _ultimo_ms = agora
    _tips += 1


_pull = Pin.PULL_UP if config.RAIN_PULL_UP else Pin.PULL_DOWN
_edge = Pin.IRQ_FALLING if config.RAIN_ON_FALLING else Pin.IRQ_RISING
_pin = Pin(config.RAIN_GAUGE_PIN, Pin.IN, _pull)
_pin.irq(handler=_on_tip, trigger=_edge)


def ler():
    # troca atômica do contador (a IRQ pode disparar a qualquer momento)
    global _tips
    estado = machine.disable_irq()
    tips = _tips
    _tips = 0
    machine.enable_irq(estado)

    return {
        "rain_mm": round(tips * config.MM_PER_TIP, 3),
        "chuva_tips": tips,
    }
