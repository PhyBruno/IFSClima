# testes/t4_calibrar_chuva.py — conta basculas durante a calibracao do pluviometro.
#
# PROCEDIMENTO (do PDF do projeto, pagina 13):
#   1) Ajuste a altura dos dois parafusos M3 ("calibration header") ate que os
#      dois lados da bascula virem com a MESMA quantidade de agua.
#   2) Meca um volume conhecido de agua (ex.: 100 mL numa seringa ou proveta).
#   3) Rode este script e despeje a agua LENTAMENTE no funil - gota a gota, nao
#      de uma vez. Despejar rapido faz a bascula virar sem encher direito e
#      subestima o volume por pulso.
#   4) Anote o total de basculas e me passe junto com o diametro do funil.
#
# A conta:
#   volume_por_pulso (mL) = volume_total (mL) / n_pulsos
#   area_do_funil  (cm2)  = pi * (diametro_cm / 2) ** 2
#   MM_PER_TIP     (mm)   = volume_por_pulso / area_do_funil * 10
#
# Conta 300 s (5 min). Ctrl-C encerra antes e ja mostra o total.
import time
import config
from sensors import rain_gauge

DURACAO_S = 300

print("Calibracao do pluviometro")
print("GP%d | borda de %s | debounce %d ms"
      % (config.RAIN_GAUGE_PIN,
         "DESCIDA" if config.RAIN_ON_FALLING else "SUBIDA",
         config.RAIN_DEBOUNCE_MS))
print("MM_PER_TIP atual no config.py: %.4f mm (a conferir)" % config.MM_PER_TIP)
print()
print("Despeje a agua LENTAMENTE agora. %d s." % DURACAO_S)
print()

rain_gauge.ler()          # zera o contador antes de comecar
total = 0
ultimo = 0
t0 = time.ticks_ms()
try:
    while time.ticks_diff(time.ticks_ms(), t0) < DURACAO_S * 1000:
        n = rain_gauge.ler()["chuva_tips"]
        if n:
            total += n
            s = time.ticks_diff(time.ticks_ms(), t0) / 1000.0
            print("  t=%6.1fs  +%d  total=%d" % (s, n, total))
            ultimo = s
        time.sleep_ms(250)
except KeyboardInterrupt:
    pass

print()
print("=" * 46)
print("TOTAL DE BASCULAS: %d" % total)
if total:
    print("ultima bascula em t=%.1fs" % ultimo)
    print()
    print("Agora calcule (ou me passe os numeros):")
    print("  volume por pulso = volume_despejado_mL / %d" % total)
    print("  MM_PER_TIP = volume_por_pulso / area_funil_cm2 * 10")
else:
    print("Nenhuma bascula contada. A agua chegou na bascula?")
print("=" * 46)
