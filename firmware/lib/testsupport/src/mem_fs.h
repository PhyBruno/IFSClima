#pragma once
// FS em memória para os testes native. NÃO é compilado para o ESP32
// (lib_ignore = testsupport no platformio.ini).
#include <algorithm>
#include <cstring>
#include <functional>
#include <map>
#include <string>

#include "fs_iface.h"

namespace testsupport {

class ArquivoMemoria : public core::IArquivo {
 public:
  // 'cabe(n)' diz se ainda há espaço para mais n bytes (simula flash cheia).
  ArquivoMemoria(std::string& dados, char modo, std::function<bool(size_t)> cabe)
      : dados_(dados), modo_(modo), pos_(0), cabe_(cabe) {}
  size_t ler(uint8_t* buf, size_t n) override {
    if (modo_ != 'r' || pos_ >= dados_.size()) return 0;
    const size_t k = std::min(n, dados_.size() - pos_);
    std::memcpy(buf, dados_.data() + pos_, k);
    pos_ += k;
    return k;
  }
  size_t escrever(const uint8_t* buf, size_t n) override {
    if (modo_ == 'r' || !cabe_(n)) return 0;
    dados_.append(reinterpret_cast<const char*>(buf), n);
    return n;
  }
  bool posicionar(size_t pos) override {
    if (pos > dados_.size()) return false;
    pos_ = pos;
    return true;
  }

 private:
  std::string& dados_;
  char modo_;
  size_t pos_;
  std::function<bool(size_t)> cabe_;
};

class SistemaArquivosMemoria : public core::ISistemaArquivos {
 public:
  std::map<std::string, std::string> arquivos;
  // Simula FS cujo rename não sobrescreve o destino (força o fallback remove+rename).
  bool renomearFalhaSeDestinoExiste = false;
  // Soma máxima de bytes de todos os arquivos (0 = sem limite): simula a
  // partição do LittleFS cheia.
  size_t capacidade = 0;

  size_t bytesUsados() const {
    size_t total = 0;
    for (const auto& a : arquivos) total += a.second.size();
    return total;
  }

  std::unique_ptr<core::IArquivo> abrir(const char* caminho, char modo) override {
    auto it = arquivos.find(caminho);
    if (modo == 'r' && it == arquivos.end()) return nullptr;
    std::string& dados = arquivos[caminho];
    if (modo == 'w') dados.clear();
    auto cabe = [this](size_t n) { return capacidade == 0 || bytesUsados() + n <= capacidade; };
    return std::unique_ptr<core::IArquivo>(new ArquivoMemoria(dados, modo, cabe));
  }
  bool existe(const char* caminho) override { return arquivos.count(caminho) > 0; }
  long tamanho(const char* caminho) override {
    auto it = arquivos.find(caminho);
    return it == arquivos.end() ? -1 : static_cast<long>(it->second.size());
  }
  bool remover(const char* caminho) override { return arquivos.erase(caminho) > 0; }
  bool renomear(const char* de, const char* para) override {
    auto it = arquivos.find(de);
    if (it == arquivos.end()) return false;
    if (renomearFalhaSeDestinoExiste && arquivos.count(para)) return false;
    std::string dados = it->second;
    arquivos.erase(it);
    arquivos[para] = dados;
    return true;
  }
};

}  // namespace testsupport
