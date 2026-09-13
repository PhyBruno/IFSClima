# testes/t0_placa.py — identifica a placa e o firmware. Nao mexe em hardware.
import sys, os, gc, machine

print("=" * 46)
print("MicroPython :", sys.version)
print("Implementacao:", sys.implementation)
print("Plataforma  :", sys.platform)
try:
    print("Placa       :", os.uname().machine)
except Exception as e:
    print("Placa       : ? (", e, ")")
print("Clock       :", machine.freq(), "Hz")
print("unique_id   :", "".join("%02x" % b for b in machine.unique_id()))

gc.collect()
print("RAM livre   :", gc.mem_free(), "bytes")
print("RAM usada   :", gc.mem_alloc(), "bytes")

s = os.statvfs("/")
print("Flash livre :", s[0] * s[3], "de", s[0] * s[2], "bytes")
print("Arquivos /  :", os.listdir("/"))

print("-" * 46)
for mod in ("network", "requests", "urequests", "ntptime", "socket", "ssl"):
    try:
        __import__(mod)
        print("  [ok ] modulo", mod)
    except Exception as e:
        print("  [X  ] modulo", mod, "->", e)
print("=" * 46)
