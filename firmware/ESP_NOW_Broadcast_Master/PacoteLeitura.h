// Formato do pacote ESP-NOW entre o Master (sensor) e o gateway.
// ATENÇÃO: este arquivo existe idêntico em ESP_NOW_Broadcast_Master/ e RespirAI_Gateway/
// (o Arduino IDE não compartilha arquivos entre sketches). Altere os dois juntos.
#pragma once
#include <stdint.h>

#define PACOTE_VERSAO 1
#define RESP_SEM_SENSOR 0xFF  // campo "resp" quando o Master não mede respiração

typedef struct __attribute__((packed)) {
  uint8_t  versao;  // PACOTE_VERSAO
  uint8_t  dedo;    // 1 = dedo no sensor, 0 = sem dedo
  uint16_t seq;     // contador (dá a volta em 65535); permite medir pacotes perdidos
  int16_t  bpm;     // 0 = sem leitura válida
  int16_t  spo2;    // 0 = sem leitura válida
  uint8_t  resp;    // respirações detectadas no último segundo, ou RESP_SEM_SENSOR
} PacoteLeitura;

// Resposta do gateway ao Master: confirma que o canal Wi-Fi atual é o do gateway.
#define ACK_MAGICO 0xA5
typedef struct __attribute__((packed)) {
  uint8_t magico;  // ACK_MAGICO
  uint8_t canal;   // canal Wi-Fi em que o gateway está
} PacoteAck;
