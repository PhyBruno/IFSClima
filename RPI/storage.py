# storage.py — buffer persistente de leituras.
# Formato JSONL: uma leitura (objeto JSON) por linha. Acrescentar uma linha
# é barato e grava pouco na flash; só apagamos o arquivo inteiro quando a API
# confirma sucesso (2xx).
import json
import os
import config


def adicionar(leitura):
    with open(config.ARQ_DADOS, "a") as f:
        f.write(json.dumps(leitura))
        f.write("\n")

    # Trava opcional de tamanho: se passar do limite, descarta um BLOCO das
    # mais antigas de uma vez (não 1 por leitura — senão, parado no teto,
    # reescreveria o arquivo inteiro a cada 15 min).
    if config.MAX_LEITURAS_BUFFER:
        n = contar()
        if n > config.MAX_LEITURAS_BUFFER:
            alvo = int(config.MAX_LEITURAS_BUFFER * 0.9)
            remover_inicio(n - alvo)


def carregar_todas():
    """Carrega o buffer inteiro na memória. Evitar em buffers grandes —
    para enviar, prefira carregar_lote() (ver uploader.py/main.py)."""
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


def carregar_lote(n):
    """Carrega só as primeiras 'n' leituras válidas do buffer — usado para
    enviar em lotes sem estourar a heap com um buffer grande de uma vez só."""
    leituras = []
    try:
        with open(config.ARQ_DADOS) as f:
            for linha in f:
                if len(leituras) >= n:
                    break
                linha = linha.strip()
                if not linha:
                    continue
                try:
                    leituras.append(json.loads(linha))
                except ValueError:
                    pass
    except OSError:
        pass
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


def remover_inicio(quantas):
    """Remove as 'quantas' primeiras leituras do buffer (já enviadas, ou
    descartadas pela trava de tamanho). Lê e grava linha a linha — nunca
    carrega o arquivo inteiro na memória, ao contrário da versão antiga.
    Tenta sobrescrever via rename direto (atômico onde o FS suporta); só usa
    remove+rename se o rename direto falhar."""
    tmp = config.ARQ_DADOS + ".tmp"
    try:
        with open(config.ARQ_DADOS) as fin, open(tmp, "w") as fout:
            puladas = 0
            for linha in fin:
                if not linha.strip():
                    continue
                if puladas < quantas:
                    puladas += 1
                    continue
                fout.write(linha)
    except OSError:
        return  # arquivo principal não existe: nada para remover

    try:
        os.rename(tmp, config.ARQ_DADOS)
    except OSError:
        try:
            os.remove(config.ARQ_DADOS)
        except OSError:
            pass
        os.rename(tmp, config.ARQ_DADOS)


def recuperar_tmp_orfao():
    """Chamar uma vez no boot, ANTES de qualquer leitura/escrita no buffer:
    se uma queda de energia interrompeu remover_inicio() bem entre apagar o
    arquivo principal e renomear o '.tmp' (caminho de fallback), o buffer
    real fica órfão em 'buffer.jsonl.tmp' e nenhuma outra função o enxerga."""
    tmp = config.ARQ_DADOS + ".tmp"
    try:
        os.stat(config.ARQ_DADOS)
        tem_principal = True
    except OSError:
        tem_principal = False
    try:
        os.stat(tmp)
        tem_tmp = True
    except OSError:
        tem_tmp = False
    if tem_tmp and not tem_principal:
        os.rename(tmp, config.ARQ_DADOS)
        print("Buffer orfao recuperado de", tmp)
