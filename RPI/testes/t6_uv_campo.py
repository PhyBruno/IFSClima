# testes/t6_uv_campo.py — registrador de campo do UV, roda SEM PC.
#
# POR QUE ISTO EXISTE: a etapa B do GUVA-S12SD precisa de sol direto, e vidro
# bloqueia UV. O PC da bancada é desktop, não vai para o quintal. Então a placa
# sai sozinha, alimentada por power bank, grava tudo na flash, e a gente lê o
# arquivo depois.
#
# COMO USAR:
#   1. No PC:  mpremote connect COM3 cp testes/t6_uv_campo.py :t6_uv_campo.py
#              (e um main.py de uma linha:  import t6_uv_campo)
#   2. Desconecta do PC, liga no power bank, ANOTA A HORA do relógio.
#   3. Leva para fora, sol direto na cúpula do sensor.
#   4. O LED da placa pisca proporcional ao UV: quanto mais UV, mais rápido.
#      TAPE O SENSOR COM A MÃO — o LED tem que desacelerar na hora. É esse o
#      teste de resposta: rápida e reversível.
#   5. Volta, liga no PC, lê /uv_campo.csv.
#
# O arquivo guarda também a temperatura do BME280 a cada amostra. Não é enfeite:
# se a tensão subir devagar e monotonicamente junto com a temperatura, é deriva
# térmica do amplificador, não resposta a UV. Sem a temperatura no mesmo arquivo
# não dá para separar as duas coisas depois.
from machine import ADC, Pin
import time
import config

ARQUIVO = "uv_campo.csv"

INTERVALO_MS = 1000          # uma amostra por segundo
AMOSTRAS_ADC = 64            # média por amostra, para baixar o ruído do ADC
LINHAS_POR_GRAVACAO = 10     # grava e fecha a cada 10 s: corte de energia perde 10 s, não o arquivo

LED_PIN = 25                 # LED embutido do Pico 1 (RP2040, não-W)
LED_NOME = "LED"             # nome simbólico: é o caminho certo nas placas W

# Mapa mV -> período de pisca. Em plena luz o LED pisca quase contínuo; no
# escuro, uma piscada lenta só para dizer "estou vivo".
PISCA_LENTO_MS = 1000
PISCA_RAPIDO_MS = 60
MV_SATURACAO = 1000.0        # a partir daqui pisca no máximo

_adc = ADC(config.UV_GUVA_ADC)

def _abrir_led():
    """Abre o LED embutido na placa que estiver rodando.

    No Pico 1 o LED é o GP25. No Pico W e no Pico 2 W NÃO é: lá o LED pertence
    ao chip de rádio CYW43, e o GP25 é o CHIP-SELECT desse chip. Acionar o 25
    numa placa W não acende nada — e ainda fica cutucando o barramento do
    rádio. Daí a ordem: nome simbólico primeiro (funciona nas placas W e nos
    builds recentes do Pico 1), GP25 só como reserva, e só se a placa não for W
    (o MicroPython v1.19.1 do Pico 1 de bancada não conhece o nome "LED").

    Sem LED o registrador continua gravando; ele só perde o display de campo.
    """
    try:
        return Pin(LED_NOME, Pin.OUT)
    except Exception:
        pass
    try:
        import os
        if "W" in os.uname().machine.split():
            return None          # placa W sem nome "LED": nao arriscar o GP25
    except Exception:
        pass
    try:
        return Pin(LED_PIN, Pin.OUT)
    except Exception:
        return None


_led = _abrir_led()


def _ler_mv():
    total = 0
    for _ in range(AMOSTRAS_ADC):
        total += _adc.read_u16()
    bruto = total / AMOSTRAS_ADC
    return bruto, bruto / 65535 * config.UV_ADC_VREF * 1000.0


def _periodo_pisca(mv):
    if mv <= 0:
        return PISCA_LENTO_MS
    fracao = mv / MV_SATURACAO
    if fracao > 1.0:
        fracao = 1.0
    return int(PISCA_LENTO_MS - fracao * (PISCA_LENTO_MS - PISCA_RAPIDO_MS))


def _piscar_por(duracao_ms, periodo_ms):
    """Pisca o LED durante duracao_ms. É o único display que existe no campo."""
    fim = time.ticks_add(time.ticks_ms(), duracao_ms)
    meio = periodo_ms // 2
    while time.ticks_diff(fim, time.ticks_ms()) > 0:
        if _led:
            _led.value(1)
        time.sleep_ms(min(meio, 40))          # pulso curto: economiza e enxerga bem
        if _led:
            _led.value(0)
        restante = time.ticks_diff(fim, time.ticks_ms())
        espera = periodo_ms - min(meio, 40)
        time.sleep_ms(max(1, min(espera, restante)))


_adc_temp = ADC(4)               # sensor de temperatura interno do RP2040


def _temp_interna():
    """Temperatura do die, pela fórmula do datasheet do RP2040 (seção 4.9.5).

    AO MIGRAR PARA O PICO 2 W: confira as constantes no datasheet do RP2350
    antes de confiar no valor absoluto. Isto aqui é canal de CONTROLE (serve
    para ver se a tensão do UV está subindo junto com a temperatura), e para
    esse uso o que importa é a variação, não o valor absoluto — então um erro
    de constante não invalida o ensaio, só desloca a escala.
    """
    v = _adc_temp.read_u16() / 65535 * config.UV_ADC_VREF
    return 27.0 - (v - 0.706) / 0.001721


def _temperatura():
    """Temperatura de referência para separar deriva térmica de resposta a UV.

    Prefere o BME280, mas ele vive sendo desconectado da bancada — e sem NENHUMA
    temperatura no arquivo a deriva térmica fica indistinguível de resposta a
    UV. O sensor interno do RP2040 não precisa de fio e resolve: é impreciso em
    valor absoluto (±2 °C), o que não importa aqui, porque o que interessa é a
    VARIAÇÃO ao longo da sessão.
    """
    try:
        import sensors.bme280 as bme
        t = bme.ler().get("temperature_c")
        if t is not None:
            return t, "bme280"
    except Exception:
        pass
    try:
        return _temp_interna(), "rp2040"
    except Exception:
        return None, ""


def _proxima_sessao():
    """Conta quantas sessões já existem no arquivo. Cada energização é uma."""
    try:
        n = 0
        with open(ARQUIVO) as f:
            for linha in f:
                if linha.startswith("# --- sessao"):
                    n += 1
        return n + 1
    except Exception:
        return 1


def main(duracao_s=0):
    """duracao_s=0 roda até acabar a energia. Valor > 0 só serve para testar
    o registrador na bancada sem precisar arrancar o cabo."""
    sessao = _proxima_sessao()

    with open(ARQUIVO, "a") as f:
        if sessao == 1:
            f.write("# sessao,t_s,bruto,mv,temp_c\n")
        # Cada energização vira um bloco novo e o t_s recomeça do zero junto
        # com o boot: sem RTC, a hora absoluta é a que o operador anota.
        f.write("# --- sessao %d (t_s=0 na energizacao) ---\n" % sessao)

    t0 = time.ticks_ms()
    buffer = []

    while True:
        bruto, mv = _ler_mv()
        t_s = time.ticks_diff(time.ticks_ms(), t0) // 1000
        temp = _temperatura()
        buffer.append("%d,%d,%.0f,%.1f,%s\n"
                      % (sessao, t_s, bruto, mv,
                         "" if temp is None else "%.2f" % temp))

        if len(buffer) >= LINHAS_POR_GRAVACAO:
            try:
                with open(ARQUIVO, "a") as f:
                    for linha in buffer:
                        f.write(linha)
                buffer = []
            except Exception:
                # flash cheia ou erro de escrita: não adianta insistir a 1 Hz,
                # mas também não pode derrubar a medição em andamento.
                buffer = buffer[-LINHAS_POR_GRAVACAO:]

        _piscar_por(INTERVALO_MS, _periodo_pisca(mv))

        if duracao_s and time.ticks_diff(time.ticks_ms(), t0) >= duracao_s * 1000:
            break

    if buffer:
        with open(ARQUIVO, "a") as f:
            for linha in buffer:
                f.write(linha)


if __name__ == "__main__":
    main()
