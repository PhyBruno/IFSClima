# testes/t1_i2c_scan.py — encontra o sensor no I2C e diagnostica a fiacao.
#
# Faz tres coisas:
#   1) mede o nivel de repouso de SDA/SCL (diz se o modulo esta alimentado)
#   2) varre o par de pinos configurado em config.py
#   3) se nao achar, varre TODOS os pares I2C validos do RP2040 — assim acha o
#      sensor mesmo que ele esteja ligado em outros pinos
from machine import I2C, Pin
import config

# GPIO -> pino fisico da placa (nao e GPIO+1: existem GNDs no meio)
PINO_FISICO = {0:1, 1:2, 2:4, 3:5, 4:6, 5:7, 6:9, 7:10, 8:11, 9:12,
               10:14, 11:15, 12:16, 13:17, 14:19, 15:20, 16:21, 17:22,
               18:24, 19:25, 20:26, 21:27, 22:29, 26:31, 27:32, 28:34}

CONHECIDOS = {
    0x76: "BMP280 / BME280 (SDO=GND)", 0x77: "BMP280 / BME280 (SDO=VCC)",
    0x23: "BH1750 (ADDR=GND)", 0x5C: "BH1750 (ADDR=VCC)",
    0x53: "LTR390 (UV)", 0x40: "SHT31 / HTU21 / INA219",
    0x44: "SHT31", 0x68: "DS3231 / MPU6050",
}
IDS = {0x58: "BMP280 (SEM umidade)", 0x60: "BME280 (COM umidade)",
       0x61: "BME680", 0x50: "BMP388"}

# Pares (SDA, SCL) validos: I2C0 e I2C1 do RP2040
PARES = [(0,(0,1)), (0,(4,5)), (0,(8,9)), (0,(12,13)), (0,(16,17)), (0,(20,21)),
         (1,(2,3)), (1,(6,7)), (1,(10,11)), (1,(14,15)), (1,(18,19)), (1,(26,27))]


def fisico(gp):
    return PINO_FISICO.get(gp, "?")


def nivel_de_repouso(gp):
    """Le o pino sem pull interno. Um modulo I2C alimentado tem pull-ups
    proprios, entao a linha em repouso deve ficar em 1."""
    try:
        return Pin(gp, Pin.IN).value()
    except Exception:
        return None


def varrer(id_i2c, sda, scl):
    try:
        bus = I2C(id_i2c, sda=Pin(sda), scl=Pin(scl), freq=config.I2C_FREQ)
        return bus, bus.scan()
    except Exception:
        return None, []


def identificar(bus, addr):
    if addr not in (0x76, 0x77):
        return
    try:
        chip = bus.readfrom_mem(addr, 0xD0, 1)[0]
        print("       chip_id 0x%02X -> %s" % (chip, IDS.get(chip, "desconhecido")))
        if chip == 0x58:
            print("       ATENCAO: e BMP280, nao BME280. Nao mede umidade.")
        elif chip == 0x60:
            print("       Confirmado BME280: temperatura + umidade + pressao.")
    except Exception as e:
        print("       falha lendo chip_id:", e)


sda, scl = config.I2C_SDA, config.I2C_SCL
print("Configurado: I2C%d  SDA=GP%d (pino %s)  SCL=GP%d (pino %s)"
      % (config.I2C_ID, sda, fisico(sda), scl, fisico(scl)))

print("\n1) Nivel de repouso das linhas (esperado 1 e 1 com o modulo ligado):")
n_sda, n_scl = nivel_de_repouso(sda), nivel_de_repouso(scl)
print("   SDA GP%d = %s     SCL GP%d = %s" % (sda, n_sda, scl, n_scl))
if n_sda == 0 and n_scl == 0:
    print("   >> AMBAS em 0: sem alimentacao no modulo, ou SDA/SCL trocados com GND.")
elif n_sda == 0 or n_scl == 0:
    print("   >> Uma linha presa em 0: fio em curto com GND ou pino errado.")
elif n_sda == 1 and n_scl == 1:
    print("   >> Linhas em repouso OK: ha pull-up, o modulo parece alimentado.")

print("\n2) Varredura no par configurado:")
bus, achados = varrer(config.I2C_ID, sda, scl)
if achados:
    for a in achados:
        print("   0x%02X  %s" % (a, CONHECIDOS.get(a, "desconhecido")))
        identificar(bus, a)
else:
    print("   nada encontrado.")

if not achados:
    print("\n3) Procurando em TODOS os pares I2C do RP2040:")
    encontrou = False
    for id_i2c, (s, c) in PARES:
        b, ach = varrer(id_i2c, s, c)
        if ach:
            encontrou = True
            print("   >>> ACHOU em I2C%d  SDA=GP%d (pino %s)  SCL=GP%d (pino %s)"
                  % (id_i2c, s, fisico(s), c, fisico(c)))
            for a in ach:
                print("       0x%02X  %s" % (a, CONHECIDOS.get(a, "desconhecido")))
                identificar(b, a)
            print("       -> ajuste I2C_ID/I2C_SDA/I2C_SCL no config.py,")
            print("          ou mova os fios para GP%d/GP%d." % (sda, scl))
    if not encontrou:
        print("   nada em nenhum par. O sensor nao esta respondendo.")
        print("\n   Checklist:")
        print("     - VCC do modulo em 3V3(OUT), pino fisico 36 (NAO no pino 40/VBUS)")
        print("     - GND do modulo em um GND do Pico (pino 8, 3, 13, 18, 23, 28, 33 ou 38)")
        print("     - SDA em GP%d = pino fisico %s" % (sda, fisico(sda)))
        print("     - SCL em GP%d = pino fisico %s" % (scl, fisico(scl)))
        print("     - SDA e SCL NAO trocados entre si")
        print("     - jumpers realmente encaixados (protoboard solta e comum)")
        print("     - se o modulo tiver pino CSB/CS, ele precisa ir em VCC p/ modo I2C")
