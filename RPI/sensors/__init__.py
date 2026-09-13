# sensors/__init__.py — registro central de sensores.
#
# CONTRATO: cada sensor é um arquivo próprio em sensors/ que expõe:
#     NOME  -> str
#     ler() -> dict com as grandezas lidas (ex.: {"temperature_c": 21.4})
#
# Para adicionar um sensor (ex.: o de vento, quando chegar): copie
# sensors/_template.py, preencha, e acrescente o import abaixo. Se um sensor
# falhar ao carregar, ele é apenas ignorado (os demais continuam funcionando).
#
# Obs.: o rain_gauge configura sua interrupção JÁ no import (por isso precisa ser
# importado no arranque). Em operação normal (lightsleep) o programa não reinicia,
# então a IRQ permanece ativa contando as básculas. Em erro fatal, main.py ainda
# pode chamar machine.reset() (apagando a RAM e o contador de básculas) — os pontos
# de rede/flash mais propensos a falhar têm try/except para minimizar esse caminho,
# mas não é uma garantia absoluta.

SENSORES = []


def _registrar(mod):
    SENSORES.append(mod)


# ---- sensores ativos ----
try:
    from . import bme280
    _registrar(bme280)
except Exception as e:
    print("Sensor bme280 nao carregado:", e)

try:
    from . import rain_gauge
    _registrar(rain_gauge)
except Exception as e:
    print("Sensor rain_gauge nao carregado:", e)

# DESATIVADO ate o sensor UV existir fisicamente.
# O GUVA-S12SD e analogico: sem nada ligado no ADC o pino fica flutuando e a
# leitura devolve algo como uv_index=1 / uv_tensao_v=0.317 - um valor plausivel
# e completamente inventado, que entra no historico como se fosse medicao.
# E o mesmo principio que bme280.py aplica ao omitir humidity_pct num BMP280:
# melhor nao ter o campo do que ter um campo mentiroso.
# Para reativar: ligue o sensor em GP26 e descomente as 5 linhas abaixo.
# try:
#     from . import uv_guva
#     _registrar(uv_guva)
# except Exception as e:
#     print("Sensor uv_guva nao carregado:", e)

# Quando comprar o sensor de vento, descomente:
# try:
#     from . import wind
#     _registrar(wind)
# except Exception as e:
#     print("Sensor wind nao carregado:", e)
# --------------------------


def ler_todos():
    """Lê todos os sensores ativos e devolve um único dict.
    O erro de um sensor não derruba os outros."""
    dados = {}
    for sensor in SENSORES:
        try:
            valores = sensor.ler()
            if valores:
                dados.update(valores)
        except Exception as e:
            dados[sensor.NOME + "_erro"] = str(e)
    return dados
