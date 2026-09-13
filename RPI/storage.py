# storage.py — buffer persistente de leituras.
# Formato JSONL: uma leitura (objeto JSON) por linha. Acrescentar uma linha
# é barato e grava pouco na flash; só apagamos as linhas quando a API
# confirma sucesso (2xx).
import json
import os
import config


# Contador de linhas mantido em RAM. Sem ele, adicionar() precisaria varrer o
# arquivo inteiro a cada gravação só para checar o limite de tamanho — custo
# O(n²) ao longo do tempo. Medido na placa: com o buffer no teto (5000), 500
# gravações não terminaram em 180 s; com o contador, 25,4 s.
# Como o ciclo usa lightsleep, a RAM sobrevive e o contador vale entre as
# leituras; ele é recalculado do arquivo na primeira vez e após qualquer
# operação que possa tê-lo dessincronizado.
_n_linhas = None


def _fechar_ultima_linha():
    """Garante que o arquivo termine em '\\n' antes de acrescentar algo.

    Se a energia cair no meio de uma gravação, o buffer fica com uma última
    linha truncada e SEM quebra de linha. Sem este cuidado, a próxima leitura
    seria escrita colada nela, formando uma única linha inválida — ou seja, a
    falha de energia levaria embora não só a leitura interrompida, mas também
    a leitura boa seguinte.
    """
    try:
        tamanho = os.stat(config.ARQ_DADOS)[6]
    except OSError:
        return              # arquivo ainda não existe
    if tamanho == 0:
        return
    with open(config.ARQ_DADOS, "rb") as f:
        f.seek(tamanho - 1)
        ultimo = f.read(1)
    if ultimo != b"\n":
        with open(config.ARQ_DADOS, "a") as f:
            f.write("\n")


def adicionar(leitura):
    global _n_linhas

    # contar() ANTES de escrever: se o contador ainda não existe, ele é
    # recalculado a partir do arquivo sem a linha nova, e o +1 abaixo fecha certo.
    anterior = contar()

    _fechar_ultima_linha()

    with open(config.ARQ_DADOS, "a") as f:
        f.write(json.dumps(leitura))
        f.write("\n")

    _n_linhas = anterior + 1

    # Trava opcional de tamanho: se passar do limite, descarta um BLOCO das
    # mais antigas de uma vez (não 1 por leitura — senão, parado no teto,
    # reescreveria o arquivo inteiro a cada 15 min).
    if config.MAX_LEITURAS_BUFFER and _n_linhas > config.MAX_LEITURAS_BUFFER:
        alvo = int(config.MAX_LEITURAS_BUFFER * 0.9)
        remover_inicio(_n_linhas - alvo)


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
    enviar em lotes sem estourar a heap com um buffer grande de uma vez só.

    Devolve (leituras, linhas_lidas). 'linhas_lidas' conta também as linhas
    corrompidas que foram puladas, para que remover_inicio(linhas_lidas)
    descarte exatamente o trecho processado. Se removêssemos apenas
    len(leituras), uma linha corrompida no lote faria a leitura seguinte
    escorregar para dentro do próximo lote e ser ENVIADA DUAS VEZES.
    """
    leituras = []
    linhas = 0
    try:
        with open(config.ARQ_DADOS) as f:
            for linha in f:
                bruta = linha.strip()
                if not bruta:
                    continue
                linhas += 1
                try:
                    leituras.append(json.loads(bruta))
                except ValueError:
                    pass
                if len(leituras) >= n:
                    break
    except OSError:
        pass
    return leituras, linhas


def _contar_no_arquivo():
    n = 0
    try:
        with open(config.ARQ_DADOS) as f:
            for linha in f:
                if linha.strip():
                    n += 1
    except OSError:
        pass
    return n


def contar():
    """Nº de linhas não vazias no buffer.

    Usa o contador em RAM quando ele é conhecido; só varre o arquivo na
    primeira chamada (ou depois de um reinício). Ver comentário de _n_linhas.
    """
    global _n_linhas
    if _n_linhas is None:
        _n_linhas = _contar_no_arquivo()
    return _n_linhas


def limpar():
    global _n_linhas
    try:
        os.remove(config.ARQ_DADOS)
    except OSError:
        pass
    _n_linhas = 0


def remover_inicio(quantas):
    """Remove as 'quantas' primeiras leituras do buffer (já enviadas, ou
    descartadas pela trava de tamanho). Lê e grava linha a linha — nunca
    carrega o arquivo inteiro na memória, ao contrário da versão antiga.
    Tenta sobrescrever via rename direto (atômico onde o FS suporta); só usa
    remove+rename se o rename direto falhar."""
    global _n_linhas

    if quantas <= 0:
        return

    tmp = config.ARQ_DADOS + ".tmp"
    try:
        with open(config.ARQ_DADOS) as fin, open(tmp, "w") as fout:
            puladas = 0
            mantidas = 0
            for linha in fin:
                if not linha.strip():
                    continue
                if puladas < quantas:
                    puladas += 1
                    continue
                if not linha.endswith("\n"):
                    linha += "\n"
                fout.write(linha)
                mantidas += 1
    except OSError:
        _n_linhas = None   # estado incerto: recontar na próxima vez
        return  # arquivo principal não existe: nada para remover

    try:
        os.rename(tmp, config.ARQ_DADOS)
    except OSError:
        try:
            os.remove(config.ARQ_DADOS)
        except OSError:
            pass
        os.rename(tmp, config.ARQ_DADOS)

    _n_linhas = mantidas


def recuperar_tmp_orfao():
    """Chamar uma vez no boot, ANTES de qualquer leitura/escrita no buffer:
    se uma queda de energia interrompeu remover_inicio() bem entre apagar o
    arquivo principal e renomear o '.tmp' (caminho de fallback), o buffer
    real fica órfão em 'buffer.jsonl.tmp' e nenhuma outra função o enxerga."""
    global _n_linhas
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
        _n_linhas = None   # buffer trocado por baixo: recontar
        print("Buffer orfao recuperado de", tmp)
