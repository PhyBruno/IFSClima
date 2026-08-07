# uploader.py — conecta ao Wi-Fi, sincroniza a hora (NTP) e envia à API.
# Só retorna True se a API responder com sucesso (2xx — o contrato usa 202 Accepted).
import network
import time
import json
import config

# Em builds recentes o módulo se chama 'requests'; em antigos, 'urequests'.
try:
    import requests
except ImportError:
    import urequests as requests


def _conectar_wifi():
    wlan = network.WLAN(network.STA_IF)
    try:
        wlan.active(True)
        if not wlan.isconnected():
            wlan.connect(config.WIFI_SSID, config.WIFI_PASS)
            limite = time.ticks_add(time.ticks_ms(), config.WIFI_TIMEOUT_S * 1000)
            while not wlan.isconnected():
                if time.ticks_diff(limite, time.ticks_ms()) <= 0:
                    return wlan, False
                time.sleep_ms(200)
        return wlan, True
    except Exception as e:
        # ex.: "OSError: Wifi Internal Error" do CYW43 — não pode escapar e
        # derrubar o laço principal (perderia _tips ao resetar)
        print("Falha ao conectar Wi-Fi:", e)
        return wlan, False


def desligar_wifi(wlan):
    # IMPORTANTE antes do deepsleep: se o rádio ficar ativo, o Pico pode
    # acordar sozinho na hora errada.
    try:
        wlan.disconnect()
    except Exception:
        pass
    try:
        wlan.active(False)
    except Exception:
        pass
    try:
        wlan.deinit()
    except Exception:
        pass


def _sincronizar_hora():
    try:
        import ntptime
        try:
            ntptime.timeout = config.API_TIMEOUT_S  # builds recentes suportam; ignorado senão
        except Exception:
            pass
        ntptime.settime()   # ajusta o RTC em UTC
        return True
    except Exception as e:
        print("NTP falhou:", e)
        return False


def sincronizar_hora_inicial():
    """Acerta o RTC (NTP) uma vez no boot, ANTES da primeira leitura, com
    algumas tentativas. Sem isso, o RTC só é sincronizado no primeiro envio
    horário (após já terem sido gravadas leituras com timestamp
    relativo/incorreto no buffer, o que fica errado PARA SEMPRE, pois a
    dedupe da API é por timestamp). Retorna True se conseguiu sincronizar."""
    wlan, ok = _conectar_wifi()
    sincronizou = False
    if ok:
        for _tentativa in range(3):
            if _sincronizar_hora():
                sincronizou = True
                break
            time.sleep_ms(1000)
    else:
        print("Wi-Fi indisponível para sync inicial de hora.")
    desligar_wifi(wlan)
    return sincronizou


def enviar(leituras):
    """Envia a lista de leituras. Retorna True SOMENTE com HTTP 2xx (a API usa 202)."""
    if not leituras:
        return True  # nada a enviar = sucesso (nada a apagar)

    wlan, ok = _conectar_wifi()
    if not ok:
        print("Wi-Fi indisponível.")
        desligar_wifi(wlan)
        return False

    _sincronizar_hora()

    payload = {
        "station_id": config.STATION_ID,
        "readings": leituras,
    }

    sucesso = False
    resp = None
    try:
        resp = requests.post(
            config.API_URL,
            headers=config.API_HEADERS,
            data=json.dumps(payload),
            timeout=config.API_TIMEOUT_S,
        )
        print("HTTP", resp.status_code)
        sucesso = (200 <= resp.status_code < 300)
    except Exception as e:
        print("Falha no POST:", e)
        sucesso = False
    finally:
        if resp is not None:
            try:
                resp.close()
            except Exception:
                pass
        desligar_wifi(wlan)

    return sucesso
