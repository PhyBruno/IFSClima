# testes/t9_instalar_requests.py — instala o módulo 'requests' na placa.
#
# O firmware rp2 padrão NÃO traz 'requests' nem 'urequests'. Sem ele o
# uploader.py fica desabilitado (a estação continua medindo, mas não envia).
# Rode UMA vez, com a placa já conectada à internet. Só funciona em placa com
# Wi-Fi (Pico W / Pico 2 W).
import time
import config

try:
    import network
except ImportError:
    raise SystemExit("Esta placa nao tem Wi-Fi (sem modulo 'network'). "
                     "O 'requests' so e necessario no Pico W / Pico 2 W.")

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
if not wlan.isconnected():
    print("Conectando em", config.WIFI_SSID, "...")
    wlan.connect(config.WIFI_SSID, config.WIFI_PASS)
    limite = time.ticks_add(time.ticks_ms(), config.WIFI_TIMEOUT_S * 1000)
    while not wlan.isconnected():
        if time.ticks_diff(limite, time.ticks_ms()) <= 0:
            raise SystemExit("Timeout de Wi-Fi. Confira WIFI_SSID/WIFI_PASS no config.py.")
        time.sleep_ms(200)
print("Conectado:", wlan.ifconfig()[0])

import mip
for pacote in ("requests", "ntptime"):
    print("Instalando", pacote, "...")
    try:
        mip.install(pacote)
    except Exception as e:
        print("  falhou:", e)

print("\nConferindo:")
for m in ("requests", "ntptime"):
    try:
        __import__(m)
        print("  [ok ]", m)
    except Exception as e:
        print("  [X  ]", m, "->", e)
