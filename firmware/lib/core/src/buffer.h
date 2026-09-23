#pragma once
#include <stddef.h>
#include <stdint.h>

#include <string>
#include <vector>

#include "fs_iface.h"

namespace core {

// JSON objeto com "timestamp" string. Linhas sem hora (_boot/_up_ms) ou
// corrompidas NÃO são enviáveis.
bool leituraValida(const std::string& linha);

// Buffer persistente de leituras em JSONL (uma leitura por linha). Acrescentar
// é barato e grava pouco na flash; as linhas só saem quando a API confirma
// (2xx). Mesma semântica do storage.py do Pico:
//  - fecha a última linha truncada por queda de energia antes de acrescentar;
//  - nº de linhas em RAM (válido entre leituras, pois o lightsleep preserva a
//    RAM) — sem ele, cada gravação varreria o arquivo (O(n²));
//  - remoção via .tmp linha a linha + rename.
class Buffer {
 public:
  // maxLinhas: teto em linhas (0 = sem). maxBytes: teto em bytes (0 = sem) —
  // removerInicio() reescreve via .tmp, então o buffer e o .tmp precisam
  // caber JUNTOS na partição: use maxBytes <= ~40% do LittleFS.
  Buffer(ISistemaArquivos& fs, std::string caminho, uint32_t maxLinhas, uint32_t maxBytes = 0);

  bool adicionar(const std::string& linhaJson);  // sem '\n'
  uint32_t contar();                              // linhas não vazias

  struct Lote {
    std::vector<std::string> leituras;  // só as válidas
    uint32_t linhasLidas = 0;           // inclui corrompidas/inválidas puladas
  };
  // Primeiras 'n' leituras válidas. Remover 'linhasLidas' (e não
  // leituras.size()) após o envio: senão uma linha corrompida no meio do
  // lote faria a leitura seguinte escorregar para o próximo lote e ser
  // ENVIADA DUAS VEZES.
  Lote carregarLote(size_t n);

  bool removerInicio(uint32_t quantas);

  // Chamar no boot, antes de qualquer leitura/escrita. Se uma queda de energia
  // interrompeu o fallback remove+rename, o buffer real ficou só no .tmp.
  // Se os dois existem, o .tmp é sobra parcial e é apagado.
  bool recuperarTmpOrfao();

  void invalidarContagem();
  const std::string& caminho() const { return caminho_; }

 private:
  bool fecharUltimaLinha();
  uint32_t contarNoArquivo();

  ISistemaArquivos& fs_;
  std::string caminho_;
  std::string tmp_;
  uint32_t max_;
  uint32_t maxBytes_;
  bool contagemConhecida_;
  uint32_t n_;
};

}  // namespace core
