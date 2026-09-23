#pragma once
#include <stddef.h>

namespace core {

// Limiares (mV) -> índice UV 0..11, tabela típica dos módulos GUVA-S12SD
// (estilo DFRobot). A RECONFERIR contra um medidor de referência.
int indiceUv(double mv);

// Mediana (ordena 'valores' in place). Com n par devolve o elemento superior,
// igual ao firmware do Pico. Não é preciosismo: mau contato na fiação joga o
// nó nos trilhos por até 1 s; a mediana só se desloca se a maioria da janela
// estiver ruim.
double mediana(double* valores, size_t n);

enum class StatusUv { OK, SINAL_SOLTO };

struct AvaliacaoUv {
  StatusUv status;
  int indice;
  double tensaoV;  // 3 casas; vai para "uv_voltage_v"
};

// Tensão >= limiteSoltoMv é eletricamente impossível para a saída do GUVA
// (índice 11 = 1170 mV): é fio solto ou ADC saturado, não sol.
AvaliacaoUv avaliarUv(double medianaMv, double limiteSoltoMv);

}  // namespace core
