#include "buffer.h"

#include <ArduinoJson.h>

#include "leitor_linhas.h"
#include "texto.h"

namespace core {

bool leituraValida(const std::string& linha) {
  JsonDocument doc;
  if (deserializeJson(doc, linha)) return false;
  return doc.is<JsonObject>() && doc["timestamp"].is<const char*>();
}

Buffer::Buffer(ISistemaArquivos& fs, std::string caminho, uint32_t maxLinhas)
    : fs_(fs), caminho_(caminho), tmp_(caminho + ".tmp"), max_(maxLinhas), contagemConhecida_(false), n_(0) {}

void Buffer::invalidarContagem() { contagemConhecida_ = false; }

uint32_t Buffer::contarNoArquivo() {
  auto f = fs_.abrir(caminho_.c_str(), 'r');
  if (!f) return 0;
  LeitorLinhas lr(*f);
  std::string linha;
  bool completa;
  uint32_t n = 0;
  while (lr.proxima(linha, completa)) {
    if (!aparar(linha).empty()) ++n;
  }
  return n;
}

uint32_t Buffer::contar() {
  if (!contagemConhecida_) {
    n_ = contarNoArquivo();
    contagemConhecida_ = true;
  }
  return n_;
}

bool Buffer::fecharUltimaLinha() {
  const long tamanho = fs_.tamanho(caminho_.c_str());
  if (tamanho <= 0) return true;
  uint8_t ultimo = 0;
  {
    auto f = fs_.abrir(caminho_.c_str(), 'r');
    if (!f || !f->posicionar(static_cast<size_t>(tamanho - 1)) || f->ler(&ultimo, 1) != 1) return false;
  }
  if (ultimo == '\n') return true;
  auto f = fs_.abrir(caminho_.c_str(), 'a');
  const uint8_t nl = '\n';
  return f && f->escrever(&nl, 1) == 1;
}

bool Buffer::adicionar(const std::string& linhaJson) {
  // contar() ANTES de escrever: se a contagem ainda não existe, ela sai do
  // arquivo sem a linha nova e o +1 abaixo fecha certo.
  const uint32_t anterior = contar();
  if (!fecharUltimaLinha()) {
    invalidarContagem();
    return false;
  }
  const std::string linha = linhaJson + "\n";
  {
    auto f = fs_.abrir(caminho_.c_str(), 'a');
    if (!f || f->escrever(reinterpret_cast<const uint8_t*>(linha.data()), linha.size()) != linha.size()) {
      invalidarContagem();
      return false;
    }
  }
  n_ = anterior + 1;
  contagemConhecida_ = true;
  // Teto: descarta um BLOCO das mais antigas de uma vez (não 1 por leitura —
  // parado no teto, reescreveria o arquivo inteiro a cada 15 min).
  if (max_ != 0 && n_ > max_) removerInicio(n_ - max_ * 9 / 10);
  return true;
}

Buffer::Lote Buffer::carregarLote(size_t n) {
  Lote lote;
  auto f = fs_.abrir(caminho_.c_str(), 'r');
  if (!f) return lote;
  LeitorLinhas lr(*f);
  std::string linha;
  bool completa;
  while (lr.proxima(linha, completa)) {
    const std::string l = aparar(linha);
    if (l.empty()) continue;
    ++lote.linhasLidas;
    if (leituraValida(l)) lote.leituras.push_back(l);
    if (lote.leituras.size() >= n) break;
  }
  return lote;
}

bool Buffer::removerInicio(uint32_t quantas) {
  if (quantas == 0) return true;
  uint32_t mantidas = 0;
  {
    auto in = fs_.abrir(caminho_.c_str(), 'r');
    if (!in) {
      invalidarContagem();
      return false;
    }
    auto out = fs_.abrir(tmp_.c_str(), 'w');
    if (!out) {
      invalidarContagem();
      return false;
    }
    LeitorLinhas lr(*in);
    std::string linha;
    bool completa;
    uint32_t puladas = 0;
    while (lr.proxima(linha, completa)) {
      if (aparar(linha).empty()) continue;
      if (puladas < quantas) {
        ++puladas;
        continue;
      }
      linha.push_back('\n');
      if (out->escrever(reinterpret_cast<const uint8_t*>(linha.data()), linha.size()) != linha.size()) {
        invalidarContagem();
        return false;
      }
      ++mantidas;
    }
  }
  // rename direto (atômico no LittleFS); só usa remove+rename se falhar.
  if (!fs_.renomear(tmp_.c_str(), caminho_.c_str())) {
    fs_.remover(caminho_.c_str());
    if (!fs_.renomear(tmp_.c_str(), caminho_.c_str())) {
      invalidarContagem();
      return false;
    }
  }
  n_ = mantidas;
  contagemConhecida_ = true;
  return true;
}

bool Buffer::recuperarTmpOrfao() {
  const bool temPrincipal = fs_.existe(caminho_.c_str());
  const bool temTmp = fs_.existe(tmp_.c_str());
  if (temTmp && !temPrincipal) {
    if (!fs_.renomear(tmp_.c_str(), caminho_.c_str())) return false;
    invalidarContagem();
    return true;
  }
  if (temTmp) fs_.remover(tmp_.c_str());
  return false;
}

}  // namespace core
