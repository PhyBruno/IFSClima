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
#   - a cada 4 leituras (= 1 h) -> conecta Wi-Fi e envia o buffer em lotes
#     (config.TAMANHO_LOTE_ENVIO por vez, p/ não estourar a RAM se acumulou muito)
#       * HTTP 2xx (a API usa 202 Accepted) -> remove o lote enviado do buffer
#       * qualquer outra coisa -> mantém o restante do buffer p/ a próxima hora
import machine
import time
import gc
import config
import storage
import uploader
import sensors


def _timestamp_bruto():
    # melhor esforço com o RTC cru (só usado como fallback)
    t = time.localtime()
    return "%04d-%02d-%02dT%02d:%02d:%02d.000Z" % (t[0], t[1], t[2], t[3], t[4], t[5])


def _timestamp():
    # NÃO confiar em time.localtime()/time.time() "cru" depois de qualquer
    # sono: o RTC do rp2 fica congelado durante machine.lightsleep() em
    # builds atuais do MicroPython no RP2350, confirmado ainda aberto na
    # v1.28.0 (https://github.com/micropython/micropython/issues/16519).
    # Calculamos a hora a partir do último sync NTP bem-sucedido
    # (uploader.hora_referencia()) + tempo decorrido via ticks_ms, que
    # avança corretamente durante o sono.
    epoch_ref, ticks_ref = uploader.hora_referencia()
    if epoch_ref is None:
        return _timestamp_bruto()  # nunca sincronizou nesta sessão

    decorrido_ms = time.ticks_diff(time.ticks_ms(), ticks_ref)
    if decorrido_ms < 0:
        return _timestamp_bruto()  # referência velha demais (ticks_ms deu a volta)

    agora_epoch = epoch_ref + decorrido_ms // 1000
    ms = decorrido_ms % 1000
    t = time.localtime(agora_epoch)
    return "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ" % (t[0], t[1], t[2], t[3], t[4], t[5], ms)


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
    # Envia em lotes (config.TAMANHO_LOTE_ENVIO) em vez de carregar o buffer
    # inteiro de uma vez: se a estação ficou muito tempo offline, carregar
    # tudo + serializar o JSON simultaneamente pode estourar a RAM do Pico.
    if storage.contar() == 0:
        return True

    enviados_total = 0
    while True:
        try:
            pendentes = storage.carregar_lote(config.TAMANHO_LOTE_ENVIO)
        except Exception as e:
            print("Falha ao carregar buffer:", e)
            return False
        if not pendentes:
            break

        print("Tentando enviar", len(pendentes), "leitura(s)...")
        try:
            ok = uploader.enviar(pendentes)
        except Exception as e:
            print("Falha inesperada no envio:", e)
            ok = False

        if not ok:
            print("Envio falhou. Buffer mantido para a proxima hora.")
            return False

        storage.remover_inicio(len(pendentes))  # sucesso (2xx) -> só agora remove o lote
        enviados_total += len(pendentes)

    print("Envio OK. Buffer esvaziado. Total enviado:", enviados_total)
    return True


def executar():
    intervalo_ms = config.INTERVALO_LEITURA_MIN * 60 * 1000
    leituras_desde_envio = 0

    # Recupera um buffer.jsonl.tmp órfão (queda de energia no meio de uma
    # reescrita anterior) ANTES de qualquer leitura/escrita no buffer.
    storage.recuperar_tmp_orfao()

    # Acerta o RTC ANTES da primeira leitura (senão as leituras do primeiro
    # ciclo gravam timestamp relativo/incorreto de forma permanente). Falha
    # de Wi-Fi/NTP aqui não pode derrubar o laço (por isso o try/except).
    try:
        if not uploader.sincronizar_hora_inicial():
            print("AVISO: RTC pode ter ficado sem sincronizar.")
    except Exception as e:
        print("Falha ao sincronizar hora inicial:", e)

    # Se sobrou algo de antes de um reset/reboot, tenta esvaziar já no boot
    # em vez de esperar até 1 h com o buffer não vazio.
    if storage.contar() > 0:
        try:
            _tentar_envio()
        except Exception as e:
            print("Falha ao tentar envio no boot:", e)

    proximo = time.ticks_add(time.ticks_ms(), intervalo_ms)

    while True:
        # 1) dorme até o ALVO FIXO da próxima leitura (contando chuva no caminho).
        #    Uma báscula acorda p/ contar, mas NÃO adia este alvo.
        _dormir_ate(proximo)

        # alvo seguinte = alvo anterior + 15 min (grade fixa; não acumula o
        # tempo gasto lendo/enviando, evitando deriva ao longo do dia)
        proximo = time.ticks_add(proximo, intervalo_ms)

        # se o ciclo anterior (leitura + envio) demorou mais que o intervalo,
        # pula os alvos já passados em vez de disparar leituras em rajada com
        # timestamp praticamente igual (a chuva acumulada cai inteira, sem
        # perda, na próxima leitura de qualquer forma)
        while time.ticks_diff(proximo, time.ticks_ms()) <= 0:
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
            try:
                _tentar_envio()
            except Exception as e:
                print("Falha inesperada no envio:", e)

        gc.collect()


# ---- ponto de entrada ----
try:
    executar()
except Exception as e:
    import sys
    sys.print_exception(e)
    # tenta salvar a leitura pendente (ex.: tips de chuva ainda não gravados
    # em flash) antes de perder a RAM no reset
    try:
        leitura = sensors.ler_todos()
        leitura["timestamp"] = _timestamp()
        storage.adicionar(leitura)
        print("Leitura de emergencia salva antes do reset.")
    except Exception as e2:
        print("Falha ao salvar leitura de emergencia:", e2)
    # em erro fatal, reinicia (o buffer na flash é preservado)
    time.sleep_ms(1000)
    machine.reset()
