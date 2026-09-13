# testes/t5_uv.py — teste do sensor UV GUVA-S12SD (analogico, ADC0/GP26).
#
# DUAS ETAPAS, porque UV precisa de sol:
#
#   ETAPA A (pode ser a qualquer hora, inclusive de noite):
#     valida a LIGACAO ELETRICA. No escuro o sensor deve dar uma tensao baixa e
#     ESTAVEL (tipicamente < 50 mV). Se der ~1.6 V, ou pular muito, o pino esta
#     flutuando -> o fio de sinal nao esta chegando no GP26.
#
#   ETAPA B (precisa de sol, ou de uma lanterna UV de conferir dinheiro):
#     valida a RESPOSTA. Sob sol direto a tensao tem que subir bastante.
#     Lanterna de celular NAO serve: LED branco quase nao emite UV.
#     Vidro e a maioria dos plasticos BLOQUEIAM UV — teste ao ar livre, nao
#     atras da janela.
from machine import ADC, Pin
import time
import config

DURACAO_S = 40

adc = ADC(config.UV_GUVA_ADC)


def amostra(n=32):
    total = 0
    for _ in range(n):
        total += adc.read_u16()
    bruto = total / n
    return bruto, bruto / 65535 * config.UV_ADC_VREF


print("UV GUVA-S12SD no GP%d (ADC0), Vref %.1f V"
      % (config.UV_GUVA_ADC, config.UV_ADC_VREF))
print()

# --- referencia: pino realmente flutuando, para comparar ---
Pin(config.UV_GUVA_ADC, Pin.IN, Pin.PULL_DOWN)
time.sleep_ms(50)
_, v_dn = amostra()
Pin(config.UV_GUVA_ADC, Pin.IN, Pin.PULL_UP)
time.sleep_ms(50)
_, v_up = amostra()
Pin(config.UV_GUVA_ADC, Pin.IN)      # solta os pulls
time.sleep_ms(50)
print("teste de ligacao (pull interno forcado):")
print("  com PULL_DOWN: %.3f V   com PULL_UP: %.3f V" % (v_dn, v_up))
if abs(v_up - v_dn) > 1.0:
    print("  >> o pino SEGUE o pull interno: nada ligado no GP%d."
          % config.UV_GUVA_ADC)
    print("     confira o fio de sinal do modulo ate o pino fisico 31.")
else:
    print("  >> o pino NAO segue o pull interno: ha uma fonte ligada. OK.")
print()

print("Lendo %d s. Se estiver de dia, aponte o sensor para o sol." % DURACAO_S)
print()
print("  %-6s %-10s %-10s %-6s %s" % ("s", "bruto", "tensao(V)", "UV", "grafico"))
vs = []
for i in range(DURACAO_S):
    bruto, v = amostra()
    vs.append(v)
    mv = v * 1000.0
    idx = 11
    for k, lim in enumerate((227, 318, 408, 503, 606, 696, 795, 881, 976, 1079, 1170)):
        if mv < lim:
            idx = k
            break
    print("  %-6d %-10.0f %-10.4f %-6d %s"
          % (i, bruto, v, idx, "#" * min(int(mv / 25), 45)))
    time.sleep(1)

print()
print("minimo  %.4f V | maximo %.4f V | media %.4f V | variacao %.4f V"
      % (min(vs), max(vs), sum(vs)/len(vs), max(vs)-min(vs)))
print()
if max(vs) < 0.05:
    print("Tudo abaixo de 50 mV: coerente com ausencia de UV (noite/sombra).")
    print("A ligacao pode estar certa; repita sob sol para validar a resposta.")
elif max(vs) - min(vs) < 0.01:
    print("Leitura estavel mas nao nula. Anote esse valor como offset do modulo.")
else:
    print("Houve variacao: o sensor esta respondendo.")
