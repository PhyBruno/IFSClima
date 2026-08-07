# storage.py — buffer persistente de leituras.
# Formato JSONL: uma leitura (objeto JSON) por linha. Acrescentar uma linha
# é barato e grava pouco na flash; só apagamos o arquivo inteiro quando a API
# confirma HTTP 200.
import json
import os
import config


def adicionar(leitura):
    with open(config.ARQ_DADOS, "a") as f:
        f.write(json.dumps(leitura))
        f.write("\n")

    # Trava opcional de tamanho: se passar do limite, descarta as mais antigas.
    if config.MAX_LEITURAS_BUFFER:
        n = contar()
        if n > config.MAX_LEITURAS_BUFFER:
            _truncar_inicio(n - config.MAX_LEITURAS_BUFFER)


def carregar_todas():
    leituras = []
    try:
        with open(config.ARQ_DADOS) as f:
            for linha in f:
                linha = linha.strip()
                if not linha:
                    continue
                try:
                    leituras.append(json.loads(linha))
                except ValueError:
                    pass  # ignora linha corrompida (ex.: queda de energia no meio da escrita)
    except OSError:
        pass  # arquivo ainda não existe
    return leituras


def contar():
    n = 0
    try:
        with open(config.ARQ_DADOS) as f:
            for linha in f:
                if linha.strip():
                    n += 1
    except OSError:
        pass
    return n


def limpar():
    try:
        os.remove(config.ARQ_DADOS)
    except OSError:
        pass


def _truncar_inicio(quantas):
    # remove as 'quantas' primeiras linhas reescrevendo o arquivo
    restantes = carregar_todas()[quantas:]
    tmp = config.ARQ_DADOS + ".tmp"
    with open(tmp, "w") as f:
        for r in restantes:
            f.write(json.dumps(r))
            f.write("\n")
    try:
        os.remove(config.ARQ_DADOS)
    except OSError:
        pass
    os.rename(tmp, config.ARQ_DADOS)
