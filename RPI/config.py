# config.py — configurações centrais da estação meteorológica
# Ajuste TUDO desta seção para o seu hardware/rede antes de usar.

# ---------------- Wi-Fi ----------------
WIFI_SSID = "SUA_REDE"
WIFI_PASS = "SUA_SENHA"
WIFI_TIMEOUT_S = 20          # tempo máximo tentando conectar

# ---------------- API na nuvem ----------------
API_URL = "https://sua-api.exemplo.com/api/v1/ingest"
API_HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": "whs_test_ABC123",   # troque pela chave real da estação (INGEST_API_KEY da API)
}
API_TIMEOUT_S = 15

# ---------------- Ciclos ----------------
INTERVALO_LEITURA_MIN = 15   # lê os sensores a cada 15 min
LEITURAS_POR_ENVIO = 4       # 4 x 15 min = 1 h -> tenta enviar tudo
# (Para testar rápido, use INTERVALO_LEITURA_MIN = 1 e LEITURAS_POR_ENVIO = 2.)

# True  = lightsleep (campo/bateria; conta chuva por IRQ; ~1-2 mA)
# False = time.sleep (debug via USB: REPL fica vivo; ainda conta chuva; ~20 mA)
MODO_ECONOMIA = True

# Quantas leituras vão em cada requisição POST. Envio em lotes evita montar
# um payload gigante (e carregar o buffer inteiro na RAM) de uma vez só
# quando a estação ficou muito tempo offline.
TAMANHO_LOTE_ENVIO = 50

# Trava opcional: nº máximo de leituras guardadas se a API ficar fora do ar
# muito tempo (evita encher a flash). 0 = sem limite.
# 5000 leituras = ~52 dias offline (~900 KB em flash). Com envio em lotes
# (TAMANHO_LOTE_ENVIO) isso não estoura a RAM, então dá pra manter alto.
MAX_LEITURAS_BUFFER = 5000

# ---------------- Identificação ----------------
STATION_ID = "estacao-001"

# ---------------- Arquivo de persistência (flash) ----------------
ARQ_DADOS = "buffer.jsonl"   # buffer de leituras (uma por linha)

# =====================================================================
#                         PINOS DOS SENSORES
# =====================================================================

# ---- BME280: temperatura, umidade e pressão (I2C) ----
I2C_ID = 0
I2C_SCL = 5                  # GP5
I2C_SDA = 4                  # GP4
I2C_FREQ = 100000
BME280_ADDR = 0x76           # use 0x77 se o pino SDO estiver em VCC

# ---- Pluviômetro de báscula (reed switch KY-025) ----
RAIN_GAUGE_PIN = 16          # GP16 (digital, com IRQ)
MM_PER_TIP = 0.2             # mm de chuva por báscula — VEJA A FICHA DO SEU PLUVIÔMETRO
RAIN_DEBOUNCE_MS = 150       # reed mecânico repica bastante; 100-200 ms ajuda
RAIN_PULL_UP = True          # reed p/ GND -> PULL_UP (recomendado). D0 do módulo: teste.
RAIN_ON_FALLING = True       # conta na borda de descida (reed fecha). Inverta se usar D0 e contar dobrado/nada.

# ---- UV (GUVA-S12SD analógico) ----
UV_GUVA_ADC = 26             # GP26 = ADC0
UV_ADC_VREF = 3.3            # tensão de referência do ADC do Pico

# ---- Vento (ainda não comprado) ----
# Quando comprar, crie sensors/wind.py a partir de sensors/_template.py,
# registre-o em sensors/__init__.py e defina o pino aqui. Sugestão livre:
# WIND_ADC = 27              # GP27 = ADC1 (biruta de direção, se for analógica)
