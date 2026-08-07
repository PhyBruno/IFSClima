# sensors/uv_guva.py — Índice UV (sensor GUVA-S12SD, saída analógica).
#
# O GUVA-S12SD entrega uma tensão proporcional à intensidade de UV. Lemos no ADC
# e convertemos para índice UV usando a tabela de limiares típica dos módulos
# baseados nesse sensor (estilo DFRobot).
#
# CALIBRAÇÃO: o ganho varia de placa para placa. Se os valores não baterem com
# um medidor de referência, ajuste _LIMIARES_MV. Guardamos também a tensão bruta
# ("uv_tensao_v") justamente para permitir recalibrar depois.
#
# Dica: à noite o valor fica ~0; teste sob sol para ver a resposta.
from machine import ADC
import config

NOME = "uv_guva"

# Limiares em milivolts -> índice UV (0..11)
_LIMIARES_MV = (227, 318, 408, 503, 606, 696, 795, 881, 976, 1079, 1170)


def _indice_uv(mv):
    for i, limite in enumerate(_LIMIARES_MV):
        if mv < limite:
            return i
    return 11


def ler():
    adc = ADC(config.UV_GUVA_ADC)

    # média de algumas amostras para reduzir ruído do ADC
    n = 8
    total = 0
    for _ in range(n):
        total += adc.read_u16()
    bruto = total // n

    tensao = bruto / 65535 * config.UV_ADC_VREF
    mv = tensao * 1000.0

    return {
        "uv_index": _indice_uv(mv),
        "uv_tensao_v": round(tensao, 3),
    }
