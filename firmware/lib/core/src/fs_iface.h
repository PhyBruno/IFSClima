#pragma once
#include <stddef.h>
#include <stdint.h>

#include <memory>

namespace core {

// Abstração mínima de sistema de arquivos: o buffer roda sobre o LittleFS na
// placa e sobre um FS em memória nos testes do PC.
class IArquivo {
 public:
  virtual ~IArquivo() = default;
  virtual size_t ler(uint8_t* buf, size_t n) = 0;  // 0 = fim do arquivo
  virtual size_t escrever(const uint8_t* buf, size_t n) = 0;
  virtual bool posicionar(size_t pos) = 0;
};

class ISistemaArquivos {
 public:
  virtual ~ISistemaArquivos() = default;
  // modo: 'r' leitura (nullptr se não existe), 'w' trunca/cria, 'a' acrescenta/cria.
  virtual std::unique_ptr<IArquivo> abrir(const char* caminho, char modo) = 0;
  virtual bool existe(const char* caminho) = 0;
  virtual long tamanho(const char* caminho) = 0;  // -1 se não existe
  virtual bool remover(const char* caminho) = 0;
  virtual bool renomear(const char* de, const char* para) = 0;
};

}  // namespace core
