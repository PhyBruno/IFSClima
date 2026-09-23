#pragma once
#include <stdint.h>

#include <string>

#include "fs_iface.h"

namespace core {

// Lê um arquivo linha a linha com um bloco fixo de 128 bytes: nunca carrega o
// arquivo inteiro na RAM (o buffer pode ter ~900 KB).
class LeitorLinhas {
 public:
  // Linhas maiores que isto são cortadas (o resto até o '\n' é descartado):
  // um trecho corrompido sem quebra não pode crescer a string até acabar o
  // heap. Uma leitura real tem ~200 B; a cortada vira JSON inválido e é
  // tratada como corrompida.
  static constexpr size_t MAX_LINHA = 2048;

  explicit LeitorLinhas(IArquivo& arquivo);

  // Próxima linha, sem o '\n'. 'completa' = a linha terminava em '\n'
  // (false na última linha de um arquivo truncado). Devolve false no fim.
  bool proxima(std::string& linha, bool& completa);

 private:
  IArquivo& arquivo_;
  uint8_t bloco_[128];
  size_t ini_;
  size_t fim_;
  bool acabou_;
};

}  // namespace core
