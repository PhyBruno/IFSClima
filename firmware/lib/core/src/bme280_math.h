#pragma once
#include <stdint.h>

namespace core {

// BME280 (temperatura + pressão + UMIDADE) e BMP280 (sem umidade) são pino a
// pino e endereço a endereço iguais e vivem sendo trocados nos módulos GY-*.
// O chip é identificado pelo registrador 0xD0. Num BMP280 os registradores de
// umidade não existem: a conta produziria um número plausível porém falso, por
// isso a umidade é OMITIDA (melhor campo ausente que dado inventado).
enum class ChipBme { BME280, BMP280, DESCONHECIDO };
constexpr uint8_t CHIP_ID_BME280 = 0x60;
constexpr uint8_t CHIP_ID_BMP280 = 0x58;

ChipBme identificarChip(uint8_t chipId);

struct CalibBme {
  uint16_t T1;
  int16_t T2, T3;
  uint16_t P1;
  int16_t P2, P3, P4, P5, P6, P7, P8, P9;
  uint8_t H1;
  int16_t H2;
  uint8_t H3;
  int16_t H4, H5;
  int8_t H6;
};

// tp: 24 bytes lidos a partir de 0x88. h1: byte em 0xA1. he: 7 bytes a partir
// de 0xE1. Com comUmidade=false, h1/he são ignorados (podem ser nullptr/0).
CalibBme decodificarCalib(const uint8_t* tp, bool comUmidade, uint8_t h1, const uint8_t* he);

struct MedidaBme {
  double temperaturaC;
  double pressaoHpa;
  bool temUmidade;
  double umidadePct;  // limitada a [0, 100]; só vale se temUmidade
};

// dados: bytes lidos a partir de 0xF7 — 8 no BME280, 6 no BMP280.
// Fórmulas em ponto flutuante do datasheet Bosch (as mesmas do firmware do Pico).
MedidaBme compensarBme(const CalibBme& c, const uint8_t* dados, bool comUmidade);

}  // namespace core
