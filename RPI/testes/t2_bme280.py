# testes/t2_bme280.py — leitura contínua do BME280, para conferir na bancada.
#
# Rode e observe:
#   - temperatura deve bater com um termômetro comum (±1 °C)
#   - umidade sobe rápido se você bafejar perto do sensor (e volta devagar)
#   - pressão ao nível do mar fica ~1013 hPa; cai ~1,2 hPa a cada 10 m de altitude
#
# Ctrl-C para parar.
import time
from sensors import bme280

print("Lendo BME280 a cada 2 s. Ctrl-C para parar.\n")
print("  %-10s %-10s %-10s" % ("TEMP(C)", "UMID(%)", "PRESS(hPa)"))
print("  " + "-" * 32)

n = 0
while True:
    try:
        d = bme280.ler()
        n += 1
        print("  %-10.2f %-10s %-10.2f"
              % (d["temperature_c"],
                 ("%.2f" % d["humidity_pct"]) if "humidity_pct" in d else "-- (BMP280)",
                 d["pressure_hpa"]))
    except KeyboardInterrupt:
        print("\nParado apos", n, "leitura(s).")
        break
    except Exception as e:
        print("  ERRO:", type(e).__name__, e)
        print("  -> confira alimentacao 3V3, GND comum e os fios SDA/SCL")
    time.sleep(2)
