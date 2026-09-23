#pragma once
#include "fs_iface.h"

namespace hal {

// Monta o LittleFS (formata se a partição estiver vazia/corrompida).
bool montarLittleFs();

class SistemaArquivosLittleFs : public core::ISistemaArquivos {
 public:
  std::unique_ptr<core::IArquivo> abrir(const char* caminho, char modo) override;
  bool existe(const char* caminho) override;
  long tamanho(const char* caminho) override;
  bool remover(const char* caminho) override;
  bool renomear(const char* de, const char* para) override;
};

}  // namespace hal
