# testes/t3_chuva.py — contador de basculas ao vivo, para validar o pluviometro.
#
# Mostra o estado do pino em tempo real e conta os pulsos pela mesma IRQ que a
# estacao usa em campo. Aproxime e afaste o ima do reed (ou encoste um jumper
# entre GP16 e GND) e confira se cada acionamento conta EXATAMENTE 1.
#
# O que observar:
#   - em repouso o pino deve ficar em 1 (pull-up interno ligado)
#   - fechando o reed, o pino vai a 0 e o contador sobe 1
#   - se contar 2 ou 3 por acionamento, aumente RAIN_DEBOUNCE_MS no config.py
#   - se nao contar nada, inverta RAIN_ON_FALLING no config.py
import time
import config
from sensors import rain_gauge

print("Pluviometro: GP%d, debounce %d ms, %.4f mm por bascula"
      % (config.RAIN_GAUGE_PIN, config.RAIN_DEBOUNCE_MS, config.MM_PER_TIP))
print("pull-up=%s, conta na borda de %s"
      % (config.RAIN_PULL_UP, "DESCIDA" if config.RAIN_ON_FALLING else "SUBIDA"))
print()
print("Acione o reed com o ima (ou encoste GP%d no GND). 60 s."
      % config.RAIN_GAUGE_PIN)
print()

total = 0
anterior = rain_gauge._pin.value()
print("  estado inicial do pino:", anterior,
      "(esperado 1 em repouso)" if anterior == 1 else "(!! esperado 1 em repouso)")
print()
print("  %-5s %-6s %-8s %-10s %s" % ("s", "pino", "novas", "total", "evento"))

for i in range(120):
    d = rain_gauge.ler()          # devolve o acumulado e zera
    novas = d["chuva_tips"]
    total += novas
    agora = rain_gauge._pin.value()
    evento = ""
    if novas:
        evento = "BASCULA! " + "*" * min(novas, 20)
    elif agora != anterior:
        evento = "pino mudou %d -> %d" % (anterior, agora)
    if novas or agora != anterior or i % 10 == 0:
        print("  %-5.1f %-6d %-8d %-10d %s" % (i * 0.5, agora, novas, total, evento))
    anterior = agora
    time.sleep_ms(500)

print()
print("TOTAL: %d bascula(s) = %.3f mm de chuva" % (total, total * config.MM_PER_TIP))
if total == 0:
    print("Nenhum pulso. Confira:")
    print("  - reed entre GP%d e GND (sem polaridade)" % config.RAIN_GAUGE_PIN)
    print("  - o ima precisa passar perto o bastante para fechar o contato")
    print("  - se o pino nunca sai de 1, o contato nao esta fechando")
