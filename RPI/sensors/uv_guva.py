# sensors/uv_guva.py — Índice UV (sensor GUVA-S12SD, saída analógica).
#
# O GUVA-S12SD entrega uma tensão proporcional à intensidade de UV. Lemos no ADC
# e convertemos para índice UV usando a tabela de limiares típica dos módulos
# baseados nesse sensor (estilo DFRobot).
#
# CALIBRAÇÃO: o ganho varia de placa para placa. Se os valores não baterem com
# um medidor de referência, ajuste _LIMIARES_MV. Enviamos também a tensão bruta
# em "uv_voltage_v", que a API grava em coluna própria: o índice é quantizado em
# 12 degraus e não permite voltar à tensão, então sem o valor bruto um erro de
# calibração tornaria TODO o histórico de UV irrecuperável.
#
# MEDIDO em bancada (13/09/2026), com o sensor ligado:
#   escuro / tapado com a mão .... 12,6 mV, ruído de ~2 mV
#   sol fraco de inverno ......... 200 a 420 mV
#   impedância da fonte .......... ~4 Ω (deslocamento de 0,2 mV com pull-up interno)
# A resposta é rápida (< 2 s) e reversível: tapar e destapar quatro vezes
# reproduziu os dois patamares, com a temperatura constante em 15,3 °C — ou seja,
# é resposta a UV, não deriva térmica do amplificador.
#
# Dica: à noite o valor fica ~0; teste sob sol para ver a resposta.
from machine import ADC
import config

NOME = "uv_guva"

# Limiares em milivolts -> índice UV (0..11)
_LIMIARES_MV = (227, 318, 408, 503, 606, 696, 795, 881, 976, 1079, 1170)

# Amostragem: a média de um grupo baixa o ruído do ADC; a MEDIANA entre grupos
# descarta transitório. Não é preciosismo — mau contato na fiação do módulo foi
# reproduzido em bancada e joga o nó nos dois trilhos (0 mV e 3300 mV) por até
# um segundo inteiro. Uma média simples desses 8 valores publicaria o transitório
# como se fosse UV; a mediana só se desloca se a maioria da janela estiver ruim.
_AMOSTRAS_POR_GRUPO = 8
_GRUPOS = 15

# O ADC no fundo de escala significa nó no trilho de 3V3, o que é eletricamente
# impossível para a saída de um amplificador alimentado com os mesmos 3V3 (ela
# satura abaixo do trilho). Quando isso acontece, o que existe é fio solto, não
# sol. Melhor um campo ausente do que um índice inventado.
# Não há guarda equivalente por baixo de propósito: o piso de escuro depende do
# offset de cada módulo (neste, 12,6 mV) e um limite inferior fixo rejeitaria
# leitura boa de um módulo com offset menor.
_FUNDO_DE_ESCALA_MV = 3250.0


def _indice_uv(mv):
    for i, limite in enumerate(_LIMIARES_MV):
        if mv < limite:
            return i
    return 11


def _mediana(valores):
    ordenados = sorted(valores)
    return ordenados[len(ordenados) // 2]


def _ler_mv(adc):
    grupos = []
    for _ in range(_GRUPOS):
        total = 0
        for _ in range(_AMOSTRAS_POR_GRUPO):
            total += adc.read_u16()
        grupos.append(total / _AMOSTRAS_POR_GRUPO)
    bruto = _mediana(grupos)
    return bruto / 65535 * config.UV_ADC_VREF * 1000.0


def ler():
    adc = ADC(config.UV_GUVA_ADC)
    mv = _ler_mv(adc)

    if mv >= _FUNDO_DE_ESCALA_MV:
        raise ValueError(
            "ADC no fundo de escala (%.0f mV): sinal solto, nao UV" % mv)

    return {
        "uv_index": _indice_uv(mv),
        "uv_voltage_v": round(mv / 1000.0, 3),
    }
