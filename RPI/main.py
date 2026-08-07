# main.py — ciclo principal da estação meteorológica (Raspberry Pi Pico 2 W).
#
# MODELO: laço contínuo com LIGHTSLEEP (não deepsleep).
# Motivo: há um pluviômetro de báscula (sensor Hall) cujos pulsos precisam ser
# contados o tempo todo. O deepsleep apaga a RAM/reinicia o programa e não conta
# pulsos; o lightsleep MANTÉM a RAM e é acordado por interrupção a cada báscula.
# No Pico, o "deepsleep" do MicroPython consome quase o mesmo que o lightsleep,
# então não há perda prática de autonomia.
#
# Fluxo:
#   - dorme em lightsleep até completar 15 min, acordando a cada báscula p/ contar
#   - completou 15 min -> lê todos os sensores, monta o JSON, grava no buffer (flash)
#   - a cada 4 leituras (= 1 h) -> conecta Wi-Fi e envia TODO o buffer
#       * HTTP 2xx (a API usa 202 Accepted) -> apaga o buffer
#       * qualquer outra coisa -> mantém o buffer p/ a próxima hora
import machine
import time
import gc
import config
import storage
import uploader
import sensors


def _timestamp():
    # Vem do RTC, sincronizado em UTC via NTP (uploader.sincronizar_hora_inicial()
    # no boot + resync a cada envio horário).
    t = time.localtime()
    return "%04d-%02d-%02dT%02d:%02d:%02d.000Z" % (t[0], t[1], t[2], t[3], t[4], t[5])


def _dormir_ate(alvo_ms):
    # Dorme (economizando energia) até 'alvo_ms', mas acorda antes se uma báscula
    # da chuva disparar a IRQ — aí o contador incrementa e voltamos a dormir.
    while True:
        restante = time.ticks_diff(alvo_ms, time.ticks_ms())
        if restante <= 0:
            return
        if config.MODO_ECONOMIA:
            machine.lightsleep(restante)   # acorda no timeout OU num pulso (IRQ)
        else:
            # modo debug via USB: não economiza, mas as IRQs de chuva continuam contando
            time.sleep_ms(min(restante, 1000))


def _tentar_envio():
    pendentes = storage.carregar_todas()
    print("Tentando enviar", len(pendentes), "leitura(s)...")
    if uploader.enviar(pendentes):
        storage.limpar()                   # sucesso (2xx) -> só agora apaga
        print("Envio OK. Buffer apagado.")
        return True
    print("Envio falhou. Buffer mantido para a proxima hora.")
    return False


def executar():
    intervalo_ms = config.INTERVALO_LEITURA_MIN * 60 * 1000
    leituras_desde_envio = 0

    # Acerta o RTC ANTES da primeira leitura (senão as leituras do primeiro
    # ciclo gravam timestamp relativo/incorreto de forma permanente).
    uploader.sincronizar_hora_inicial()

    proximo = time.ticks_add(time.ticks_ms(), intervalo_ms)

    while True:
        # 1) dorme até o ALVO FIXO da próxima leitura (contando chuva no caminho).
        #    Uma báscula acorda p/ contar, mas NÃO adia este alvo.
        _dormir_ate(proximo)

        # alvo seguinte = alvo anterior + 15 min (grade fixa; não acumula o
        # tempo gasto lendo/enviando, evitando deriva ao longo do dia)
        proximo = time.ticks_add(proximo, intervalo_ms)

        # 2) lê todos os sensores (rain_gauge devolve o acumulado e zera)
        leitura = sensors.ler_todos()
        leitura["timestamp"] = _timestamp()
        storage.adicionar(leitura)
        print("Leitura salva:", leitura)

        # 3) a cada 1 h -> tenta enviar tudo
        leituras_desde_envio += 1
        if leituras_desde_envio >= config.LEITURAS_POR_ENVIO:
            leituras_desde_envio = 0
            _tentar_envio()

        gc.collect()


# ---- ponto de entrada ----
try:
    executar()
except Exception as e:
    import sys
    sys.print_exception(e)
    # em erro fatal, reinicia (o buffer na flash é preservado)
    time.sleep_ms(1000)
    machine.reset()
