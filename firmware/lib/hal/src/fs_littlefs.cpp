#include "fs_littlefs.h"

#include <LittleFS.h>

namespace hal {

namespace {

class ArquivoLittleFs : public core::IArquivo {
 public:
  explicit ArquivoLittleFs(File f) : f_(f) {}
  ~ArquivoLittleFs() override { f_.close(); }
  size_t ler(uint8_t* buf, size_t n) override { return f_.read(buf, n); }
  size_t escrever(const uint8_t* buf, size_t n) override { return f_.write(buf, n); }
  bool posicionar(size_t pos) override { return f_.seek(pos); }

 private:
  File f_;
};

}  // namespace

bool montarLittleFs() { return LittleFS.begin(true); }

std::unique_ptr<core::IArquivo> SistemaArquivosLittleFs::abrir(const char* caminho, char modo) {
  // Checar antes evita o log de erro do VFS ao abrir inexistente para leitura.
  if (modo == 'r' && !LittleFS.exists(caminho)) return nullptr;
  const char* m = modo == 'w' ? FILE_WRITE : (modo == 'a' ? FILE_APPEND : FILE_READ);
  File f = LittleFS.open(caminho, m);
  if (!f) return nullptr;
  return std::unique_ptr<core::IArquivo>(new ArquivoLittleFs(f));
}

bool SistemaArquivosLittleFs::existe(const char* caminho) { return LittleFS.exists(caminho); }

long SistemaArquivosLittleFs::tamanho(const char* caminho) {
  if (!LittleFS.exists(caminho)) return -1;
  File f = LittleFS.open(caminho, FILE_READ);
  if (!f) return -1;
  const long t = static_cast<long>(f.size());
  f.close();
  return t;
}

bool SistemaArquivosLittleFs::remover(const char* caminho) {
  return LittleFS.exists(caminho) && LittleFS.remove(caminho);
}

bool SistemaArquivosLittleFs::renomear(const char* de, const char* para) { return LittleFS.rename(de, para); }

}  // namespace hal
