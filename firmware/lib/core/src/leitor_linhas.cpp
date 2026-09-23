#include "leitor_linhas.h"

namespace core {

LeitorLinhas::LeitorLinhas(IArquivo& arquivo) : arquivo_(arquivo), bloco_{}, ini_(0), fim_(0), acabou_(false) {}

bool LeitorLinhas::proxima(std::string& linha, bool& completa) {
  linha.clear();
  completa = false;
  for (;;) {
    if (ini_ == fim_) {
      if (acabou_) return !linha.empty();
      fim_ = arquivo_.ler(bloco_, sizeof(bloco_));
      ini_ = 0;
      if (fim_ == 0) {
        acabou_ = true;
        return !linha.empty();
      }
    }
    while (ini_ < fim_) {
      const char c = static_cast<char>(bloco_[ini_++]);
      if (c == '\n') {
        completa = true;
        return true;
      }
      if (linha.size() < MAX_LINHA) linha.push_back(c);
    }
  }
}

}  // namespace core
