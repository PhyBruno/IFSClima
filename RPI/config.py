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

# ---- Pluviômetro de báscula — módulo KY-025 (reed + comparador LM393) ----
# DECISÃO DE PROJETO: usamos o módulo KY-025, não o reed puro. Ligação:
#     +  -> 3V3(OUT)   |   G -> GND   |   D0 -> GP16   |   A0 -> não usado
# NUNCA alimente o módulo em 5 V: o D0 acompanha a alimentação e os GPIOs do
# Pico não toleram 5 V.
RAIN_GAUGE_PIN = 16          # GP16 (digital, com IRQ), ligado ao D0 do módulo

# mm de chuva por báscula. O 0.2 abaixo é PROVISÓRIO.
# O PDF do projeto (pág. 13) mediu 0,21 mm, mas com um funil de automóvel
# comprado — o diâmetro do funil de cada montagem é outro, e o volume por
# virada ainda depende do ajuste dos dois parafusos M3. Não se copia.
# Calibre com testes/t4_calibrar_chuva.py:
#     MM_PER_TIP = (volume_mL / n_basculas) / (pi * (diametro_cm/2)**2) * 10
# Erro aqui é sistemático: 5% de erro vira 5% em toda a chuva acumulada.
MM_PER_TIP = 0.2

# MEDIDO em bancada com este KY-025: as transições saem limpas, sem repique
# (menor intervalo observado entre bordas: 353 ms). O LM393 tem histerese e já
# entrega o sinal tratado. Os 150 ms são folga — mesmo em chuva extrema
# (200 mm/h) as básculas vêm a cada ~3,6 s.
RAIN_DEBOUNCE_MS = 150

RAIN_PULL_UP = True          # saída do LM393 é coletor aberto; o pull-up interno garante o nível alto

# MEDIDO neste KY-025: o D0 fica em 0 em repouso e vai a 1 com o ímã perto,
# logo o evento é a borda de SUBIDA. Validado: 10 acionamentos = 10 contagens,
# zero contagem dupla. (Um reed puro ligado a GND seria o contrário -> True.)
RAIN_ON_FALLING = False

# ---- UV (GUVA-S12SD analógico) ----
UV_GUVA_ADC = 26             # GP26 = ADC0
UV_ADC_VREF = 3.3            # tensão de referência do ADC do Pico

# ---- Vento (ainda não comprado) ----
# Quando comprar, crie sensors/wind.py a partir de sensors/_template.py,
# registre-o em sensors/__init__.py e defina o pino aqui. Sugestão livre:
# WIND_ADC = 27              # GP27 = ADC1 (biruta de direção, se for analógica)
