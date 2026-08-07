# sensors/bme280.py — Temperatura, umidade e pressão (Bosch BME280, I2C).
# Driver enxuto em modo "forçado" (uma medição por leitura), ideal para
# ligar-medir-dormir. Fórmulas de compensação conforme o datasheet Bosch.
from machine import I2C, Pin
import time
import config

NOME = "bme280"


def _i2c():
    return I2C(config.I2C_ID,
               scl=Pin(config.I2C_SCL),
               sda=Pin(config.I2C_SDA),
               freq=config.I2C_FREQ)


def _s16(v):
    return v - 65536 if v >= 32768 else v


def _s8(v):
    return v - 256 if v >= 128 else v


def _u16(b, i):
    return b[i] | (b[i + 1] << 8)


def _ler_calibracao(i2c, addr):
    t = i2c.readfrom_mem(addr, 0x88, 6)
    p = i2c.readfrom_mem(addr, 0x8E, 18)
    h1 = i2c.readfrom_mem(addr, 0xA1, 1)[0]
    he = i2c.readfrom_mem(addr, 0xE1, 7)

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
    c['H1'] = h1
    c['H2'] = _s16(he[0] | (he[1] << 8))
    c['H3'] = he[2]
    c['H4'] = (_s8(he[3]) << 4) | (he[4] & 0x0F)
    c['H5'] = (_s8(he[5]) << 4) | (he[4] >> 4)
    c['H6'] = _s8(he[6])
    return c


def ler():
    addr = config.BME280_ADDR
    i2c = _i2c()
    c = _ler_calibracao(i2c, addr)

    # oversampling x1 em tudo, modo forçado (0x25 = osrs_t=1, osrs_p=1, mode=01)
    i2c.writeto_mem(addr, 0xF2, b'\x01')   # ctrl_hum = x1
    i2c.writeto_mem(addr, 0xF4, b'\x25')   # ctrl_meas
    time.sleep_ms(50)

    d = i2c.readfrom_mem(addr, 0xF7, 8)
    adc_p = (d[0] << 12) | (d[1] << 4) | (d[2] >> 4)
    adc_t = (d[3] << 12) | (d[4] << 4) | (d[5] >> 4)
    adc_h = (d[6] << 8) | d[7]

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

    # --- umidade ---
    h = t_fine - 76800.0
    h = (adc_h - (c['H4'] * 64.0 + c['H5'] / 16384.0 * h)) * (
        c['H2'] / 65536.0 * (1.0 + c['H6'] / 67108864.0 * h *
                             (1.0 + c['H3'] / 67108864.0 * h)))
    h = h * (1.0 - c['H1'] * h / 524288.0)
    umidade = min(100.0, max(0.0, h))

    return {
        "temperature_c": round(temperatura, 2),
        "humidity_pct": round(umidade, 2),
        "pressure_hpa": round(pressao, 2),
    }
