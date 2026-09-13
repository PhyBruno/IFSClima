# sensors/_template.py — MODELO para criar um novo sensor.
#
# 1) Copie este arquivo para sensors/nome_do_sensor.py
# 2) Preencha NOME e a função ler()
# 3) Ative o import em sensors/__init__.py
#
# Regras:
#  - ler() deve devolver um dict {chave: valor}. As chaves viram campos do JSON.
#  - Se algo falhar, pode levantar exceção: sensors/__init__.py captura, registra
#    "<NOME>_erro" na leitura e segue com os outros sensores.
#  - Não invente valor quando o hardware não responde. É melhor OMITIR a chave
#    (ou deixar a exceção subir) do que gravar um número falso no histórico.
#
# Sobre inicializar o hardware:
#  - O ciclo usa LIGHTSLEEP, que preserva a RAM: o módulo continua carregado e o
#    estado global sobrevive entre as leituras. Então dá para inicializar uma vez
#    e guardar em cache (é o que sensors/bme280.py faz com a calibração).
#  - Se fizer cache, ZERE o cache quando a leitura falhar, para que a próxima
#    tentativa reinicialize o sensor em vez de repetir o erro para sempre.
import config  # use se precisar de pinos definidos no config.py

NOME = "meu_sensor"

_estado = None   # cache opcional (ver observação acima)


def ler():
    # ... leia o seu hardware aqui ...
    valor = 0
    return {
        "minha_grandeza": valor,
    }
