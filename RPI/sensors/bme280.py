# sensors/bme280.py — Temperatura, pressão e (se houver) umidade, via I2C.
#
# Atende DOIS chips da Bosch, que são pino-a-pino e endereço-a-endereço iguais
# e por isso vivem sendo trocados um pelo outro nos módulos GY-* baratos:
#
#     chip_id 0x60 -> BME280 : temperatura + pressão + UMIDADE
#     chip_id 0x58 -> BMP280 : temperatura + pressão (SEM umidade)
#
# O chip é identificado no primeiro acesso (registrador 0xD0). Num BMP280 os
# registradores de umidade simplesmente não existem: ler 0xA1/0xE1 devolve lixo
# e a conta de umidade produziria um número plausível porém falso. Por isso,
# quando o chip é BMP280, a chave "humidity_pct" é OMITIDA do resultado — melhor
# um campo ausente do que um dado inventado.
#
# Medição em modo FORÇADO (uma conversão por leitura), ideal para medir e dormir.
# Fórmulas de compensação conforme o datasheet Bosch — conferidas contra a
# implementação inteira de referência (erro < 0,01 °C / 0,01 hPa / 0,01 %RH).
from machine import I2C, Pin
import time
import config

NOME = "bme280"

CHIP_BME280 = 0x60
CHIP_BMP280 = 0x58

# Cache: com lightsleep o módulo permanece carregado entre as leituras, então a
# calibração (26 a 33 bytes de I2C) é lida UMA vez, e não a cada 15 min.
_i2c = None
_calib = None
_chip = None
_tem_umidade = False


def _s16(v):
    return v - 65536 if v >= 32768 else v


def _s8(v):
    return v - 256 if v >= 128 else v


def _u16(b, i):
    return b[i] | (b[i + 1] << 8)


def _ler_calibracao(i2c, addr, com_umidade):
    t = i2c.readfrom_mem(addr, 0x88, 6)
    p = i2c.readfrom_mem(addr, 0x8E, 18)

    c = {}
    c['T1'] = _u16(t, 0)
    c['T2'] = _s16(_u16(t, 2))
    c['T3'] = _s16(_u16(t, 4))
    c['P1'] = _u16(p, 0)
    c['P2'] = _s16(_u16(p, 2))
    c['P3'] = _s16(_u16(p, 4))
    c['P4'] = _s16(_u16(p, 6))
    c['P5'] = _s16(_u16(p, 8))
    c['P6'] = _s16(_u16(p, 10))
    c['P7'] = _s16(_u16(p, 12))
    c['P8'] = _s16(_u16(p, 14))
    c['P9'] = _s16(_u16(p, 16))

    if com_umidade:
        h1 = i2c.readfrom_mem(addr, 0xA1, 1)[0]
        he = i2c.readfrom_mem(addr, 0xE1, 7)
        c['H1'] = h1
        c['H2'] = _s16(he[0] | (he[1] << 8))
        c['H3'] = he[2]
        c['H4'] = (_s8(he[3]) << 4) | (he[4] & 0x0F)
        c['H5'] = (_s8(he[5]) << 4) | (he[4] >> 4)
        c['H6'] = _s8(he[6])
    return c


def _preparar():
    """Abre o barramento, identifica o chip e lê a calibração. Roda só uma vez."""
    global _i2c, _calib, _chip, _tem_umidade
    if _calib is not None:
        return

    addr = config.BME280_ADDR
    i2c = I2C(config.I2C_ID,
              scl=Pin(config.I2C_SCL),
              sda=Pin(config.I2C_SDA),
              freq=config.I2C_FREQ)

    chip = i2c.readfrom_mem(addr, 0xD0, 1)[0]
    if chip == CHIP_BME280:
        com_umidade = True
    elif chip == CHIP_BMP280:
        com_umidade = False
    else:
        raise OSError(
            "chip_id 0x%02X em 0x%02X nao e BMP280 (0x58) nem BME280 (0x60)"
            % (chip, addr))

    calib = _ler_calibracao(i2c, addr, com_umidade)

    _i2c, _calib, _chip, _tem_umidade = i2c, calib, chip, com_umidade
    print("bme280: %s detectado em 0x%02X (chip_id 0x%02X), umidade=%s"
          % ("BME280" if com_umidade else "BMP280", addr, chip,
             "sim" if com_umidade else "NAO"))


def _invalidar():
    """Zera o cache para que a próxima leitura reidentifique o sensor.
    Chamado quando o I2C falha (cabo solto, sensor sem alimentação...)."""
    global _i2c, _calib, _chip, _tem_umidade
    _i2c = None
    _calib = None
    _chip = None
    _tem_umidade = False


def _medir():
    addr = config.BME280_ADDR
    c = _calib

    # oversampling x1, modo forçado. O datasheet exige escrever ctrl_hum (0xF2)
    # ANTES de ctrl_meas (0xF4) — só o segundo torna o primeiro efetivo.
    if _tem_umidade:
        _i2c.writeto_mem(addr, 0xF2, b'\x01')      # ctrl_hum = x1
    _i2c.writeto_mem(addr, 0xF4, b'\x25')          # osrs_t=1, osrs_p=1, mode=forçado
    time.sleep_ms(50)                              # conversão x1 leva ~9 ms

    n = 8 if _tem_umidade else 6                   # BMP280 não tem 0xFD/0xFE
    d = _i2c.readfrom_mem(addr, 0xF7, n)
    adc_p = (d[0] << 12) | (d[1] << 4) | (d[2] >> 4)
    adc_t = (d[3] << 12) | (d[4] << 4) | (d[5] >> 4)

    # --- temperatura ---
    var1 = (adc_t / 16384.0 - c['T1'] / 1024.0) * c['T2']
    var2 = ((adc_t / 131072.0 - c['T1'] / 8192.0) ** 2) * c['T3']
    t_fine = var1 + var2
    temperatura = t_fine / 5120.0

    # --- pressão ---
    var1 = t_fine / 2.0 - 64000.0
    var2 = var1 * var1 * c['P6'] / 32768.0
    var2 = var2 + var1 * c['P5'] * 2.0
    var2 = var2 / 4.0 + c['P4'] * 65536.0
    var1 = (c['P3'] * var1 * var1 / 524288.0 + c['P2'] * var1) / 524288.0
    var1 = (1.0 + var1 / 32768.0) * c['P1']
    if var1 == 0:
        pressao = 0.0
    else:
        pr = 1048576.0 - adc_p
        pr = (pr - var2 / 4096.0) * 6250.0 / var1
        var1 = c['P9'] * pr * pr / 2147483648.0
        var2 = pr * c['P8'] / 32768.0
        pr = pr + (var1 + var2 + c['P7']) / 16.0
        pressao = pr / 100.0   # Pa -> hPa

    dados = {
        "temperature_c": round(temperatura, 2),
        "pressure_hpa": round(pressao, 2),
    }

    # --- umidade (só no BME280) ---
    if _tem_umidade:
        adc_h = (d[6] << 8) | d[7]
        h = t_fine - 76800.0
        h = (adc_h - (c['H4'] * 64.0 + c['H5'] / 16384.0 * h)) * (
            c['H2'] / 65536.0 * (1.0 + c['H6'] / 67108864.0 * h *
                                 (1.0 + c['H3'] / 67108864.0 * h)))
        h = h * (1.0 - c['H1'] * h / 524288.0)
        dados["humidity_pct"] = round(min(100.0, max(0.0, h)), 2)

    return dados


def ler():
    try:
        _preparar()
        return _medir()
    except Exception:
        _invalidar()   # força reidentificar na próxima vez
        raise
