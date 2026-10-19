/*
    RespirAI Gateway
    Recebe as leituras do Master por ESP-NOW e grava no Firebase Realtime Database,
    no formato lido pelo dashboard (ver docs/fluxo-de-dados.md):

      /leituras/<DISPOSITIVO_ID>/<timestamp> = { timestamp (ms desde 1970), spo2, bpm, resp? }

    - Wi-Fi do roteador + ESP-NOW compartilham o mesmo canal. Como o canal do roteador
      não é fixo, o Master varre os canais até receber o ACK deste gateway (broadcast).
    - O horário vem de NTP. Sem horário válido, as leituras são descartadas.
    - As leituras ficam numa fila e são enviadas em lote (uma requisição a cada ~3 s).
      Se o Wi-Fi cair, a fila guarda os últimos minutos e reenvia depois, com os
      timestamps originais.
    - Chave = timestamp, então reenviar a mesma leitura não duplica.

    Bibliotecas: "Firebase Arduino Client Library for ESP8266 and ESP32" (mobizt), núcleo ESP32 3.x.
    Configuração: copie secrets.h.example para secrets.h e preencha.
*/

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <sys/time.h>

#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>

#include "PacoteLeitura.h"
#include "secrets.h"

/* Fila de leituras */

struct Leitura {
  uint64_t timestampMs;
  int16_t bpm, spo2;
  uint8_t dedo, resp;
};

const int TAM_FILA = 900;  // ~15 min a 1 leitura/s (≈ 15 KB de RAM)
Leitura fila[TAM_FILA];
volatile int filaInicio = 0, filaTamanho = 0;
portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;

const int MAX_POR_LOTE = 30;
const unsigned long INTERVALO_ENVIO_MS = 3000;

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

unsigned long ultimoEnvio = 0;
uint16_t ultimaSeq = 0;
bool temSeq = false;
uint32_t recebidos = 0, perdidos = 0, descartados = 0;
uint8_t macMaster[6];
volatile bool precisaAck = false;
const uint8_t BROADCAST[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

uint64_t agoraMs() {
  struct timeval tv;
  gettimeofday(&tv, nullptr);
  return (uint64_t)tv.tv_sec * 1000ULL + tv.tv_usec / 1000;
}

bool horaValida() {
  return time(nullptr) > 1700000000;  // depois de nov/2023: NTP já sincronizou
}

/* Recepção ESP-NOW (roda na tarefa do Wi-Fi: só copia e sai) */

void aoReceber(const esp_now_recv_info_t *info, const uint8_t *dados, int tam) {
  if (tam != sizeof(PacoteLeitura)) return;
  PacoteLeitura p;
  memcpy(&p, dados, sizeof(p));
  if (p.versao != PACOTE_VERSAO) return;

  precisaAck = true;  // avisa o Master de que este é o canal certo
  recebidos++;
  if (temSeq) perdidos += (uint16_t)(p.seq - ultimaSeq - 1);
  ultimaSeq = p.seq;
  temSeq = true;

  if (!horaValida()) {
    descartados++;
    return;
  }
  Leitura l = {agoraMs(), p.bpm, p.spo2, p.dedo, p.resp};
  portENTER_CRITICAL(&mux);
  if (filaTamanho == TAM_FILA) {  // cheia: descarta a mais antiga
    filaInicio = (filaInicio + 1) % TAM_FILA;
    filaTamanho--;
    descartados++;
  }
  fila[(filaInicio + filaTamanho) % TAM_FILA] = l;
  filaTamanho++;
  portEXIT_CRITICAL(&mux);
}

void enviaAck() {
  uint8_t canal;
  wifi_second_chan_t sec;
  esp_wifi_get_channel(&canal, &sec);
  PacoteAck ack = {ACK_MAGICO, canal};
  esp_now_send(BROADCAST, (uint8_t *)&ack, sizeof(ack));
}

/* Wi-Fi e Firebase */

bool conectaWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.begin(WIFI_SSID, WIFI_SENHA);
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 15000) delay(250);
  return WiFi.status() == WL_CONNECTED;
}

// Monta {"<ts>": {"timestamp":..,"spo2":..,"bpm":..[,"resp":..]}, ...} e grava em um único update.
bool enviaLote(const Leitura *lote, int n) {
  String json = "{";
  char buf[160];
  for (int i = 0; i < n; i++) {
    const Leitura &l = lote[i];
    int k = snprintf(buf, sizeof(buf), "\"%llu\":{\"timestamp\":%llu,\"spo2\":%d,\"bpm\":%d",
                     (unsigned long long)l.timestampMs, (unsigned long long)l.timestampMs, l.spo2, l.bpm);
    if (l.resp != RESP_SEM_SENSOR) snprintf(buf + k, sizeof(buf) - k, ",\"resp\":%d", l.resp);
    strlcat(buf, "}", sizeof(buf));
    if (i) json += ",";
    json += buf;
  }
  json += "}";

  FirebaseJson corpo;
  corpo.setJsonData(json);
  String caminho = String("/leituras/") + DISPOSITIVO_ID;
  if (!Firebase.RTDB.updateNode(&fbdo, caminho.c_str(), &corpo)) {
    Serial.printf("Falha ao gravar: %s\n", fbdo.errorReason().c_str());
    return false;
  }
  return true;
}

void enviaFila() {
  if (!Firebase.ready() || WiFi.status() != WL_CONNECTED) return;
  Leitura lote[MAX_POR_LOTE];
  int n;
  portENTER_CRITICAL(&mux);
  n = min((int)filaTamanho, MAX_POR_LOTE);
  for (int i = 0; i < n; i++) lote[i] = fila[(filaInicio + i) % TAM_FILA];
  portEXIT_CRITICAL(&mux);
  if (n == 0) return;

  if (enviaLote(lote, n)) {
    portENTER_CRITICAL(&mux);
    filaInicio = (filaInicio + n) % TAM_FILA;
    filaTamanho -= n;
    portEXIT_CRITICAL(&mux);
    Serial.printf("Enviadas %d leituras (fila: %d, recebidas: %lu, perdidas: %lu, descartadas: %lu)\n", n, (int)filaTamanho,
                  (unsigned long)recebidos, (unsigned long)perdidos, (unsigned long)descartados);
  }
}

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);

  Serial.printf("Conectando a %s...\n", WIFI_SSID);
  if (!conectaWiFi()) {
    Serial.println("Sem Wi-Fi. Reiniciando em 5 s.");
    delay(5000);
    ESP.restart();
  }
  uint8_t canal;
  wifi_second_chan_t sec;
  esp_wifi_get_channel(&canal, &sec);
  Serial.printf("Wi-Fi OK, canal %d. IP %s\n", canal, WiFi.localIP().toString().c_str());

  configTime(0, 0, "pool.ntp.org", "time.google.com");
  Serial.print("Sincronizando horário");
  for (int i = 0; i < 40 && !horaValida(); i++) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(horaValida() ? " OK" : " FALHOU (leituras serão descartadas até sincronizar)");

  if (esp_now_init() != ESP_OK) {
    Serial.println("Falha no ESP-NOW. Reiniciando.");
    delay(2000);
    ESP.restart();
  }
  esp_now_register_recv_cb(aoReceber);
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, BROADCAST, 6);
  peer.channel = 0;  // 0 = canal atual da interface
  peer.encrypt = false;
  esp_now_add_peer(&peer);

  config.api_key = FIREBASE_API_KEY;
  config.database_url = FIREBASE_DATABASE_URL;
  auth.user.email = FIREBASE_USUARIO;
  auth.user.password = FIREBASE_SENHA_USUARIO;
  config.token_status_callback = tokenStatusCallback;
  Firebase.reconnectNetwork(true);
  Firebase.begin(&config, &auth);

  Serial.printf("MAC do gateway: %s | dispositivo: %s\n", WiFi.macAddress().c_str(), DISPOSITIVO_ID);
}

void loop() {
  if (precisaAck) {
    precisaAck = false;
    enviaAck();
  }
  if (WiFi.status() != WL_CONNECTED) {
    // Recuperar o Wi-Fi pode mudar o canal do roteador; o Master varre de novo se precisar.
    conectaWiFi();
  }
  if (millis() - ultimoEnvio >= INTERVALO_ENVIO_MS) {
    ultimoEnvio = millis();
    enviaFila();
  }
  delay(10);
}
