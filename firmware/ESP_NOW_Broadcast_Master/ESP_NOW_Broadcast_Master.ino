/*
    ESP-NOW Broadcast Master
    Lucas Saavedra Vaz - 2024

    This sketch demonstrates how to broadcast messages to all devices within the ESP-NOW network.
    This example is intended to be used with the ESP-NOW Broadcast Slave example.

    The master device will broadcast a message every 5 seconds to all devices within the network.
    This will be done using by registering a peer object with the broadcast address.

    The slave devices will receive the broadcasted messages and print them to the Serial Monitor.

    Medição com MAX30102:
    - BPM: algoritmo próprio (filtros, detecção pela subida do pulso, mediana e
      rejeição de batidas falsas), a 100 amostras por segundo.
    - SpO2: algoritmo da Maxim (spo2_algorithm.h), alimentado com a média de cada
      4 amostras (25 amostras por segundo, como ele espera).
    - Envio por ESP-NOW a cada 1 segundo: data[0] = BPM, data[1] = SpO2
      (0 quando não há leitura válida), data[2] = 1 com dedo no sensor, 0 sem dedo.
*/

#include "ESP32_NOW.h"
#include "WiFi.h"

#include <esp_mac.h>  // For the MAC2STR and MACSTR macros


#include <Wire.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"

MAX30105 particleSensor;

byte pulseLED = 11; //Must be on PWM pin
byte readLED = 13; //Blinks with each data read

/* Configuração do sensor */

const byte BRILHO_INICIAL = 127;   // brilho de partida (o código ajusta sozinho)
byte ledBrightness = BRILHO_INICIAL; //Options: 0=Off to 255=50mA
byte sampleAverage = 4; //Options: 1, 2, 4, 8, 16, 32
byte ledMode = 2; //Options: 1 = Red only, 2 = Red + IR, 3 = Red + IR + Green
int sampleRate = 400; //Options: 50, 100, 200, 400, 800, 1000, 1600, 3200 (int: 400 não cabe em byte)
int pulseWidth = 411; //Options: 69, 118, 215, 411
int adcRange = 16384; //Options: 2048, 4096, 8192, 16384

/* Parâmetros do algoritmo de BPM */

const bool  DEBUG = false;                    // true: mostra o valor bruto de cada batida
const float FS = 100.0;                       // amostras por segundo efetivas (400 / 4)
const long  IR_DEDO = 30000;                  // abaixo disso: sem dedo
const long  IR_MIN = 80000, IR_MAX = 200000;  // faixa ideal do IR
const int   N_BPM = 7;                        // batidas usadas na mediana

float dc = 0, lp = 0, lpAnt = 0, ds = 0, dPrev = 0, dPrev2 = 0, env = 0;
unsigned long n = 0, ultimoBeat = 0;
float bpmBuf[N_BPM];
int bpmCount = 0, bpmIdx = 0, rejeitados = 0;
float candidato = 0; int confirmacoes = 0;          // validação inicial
float ultimoBpm = 0; unsigned long nUltimoBpm = 0;  // última leitura válida
long somaIR = 0; int contIR = 0;                    // brilho automático
bool dedoPresente = false;

/* SpO2 (algoritmo da Maxim, 25 amostras por segundo) */

uint32_t irBuffer[100]; //infrared LED sensor data
uint32_t redBuffer[100];  //red LED sensor data
int spo2Idx = 0;                     // amostras já guardadas no buffer
uint32_t somaRed4 = 0, somaIR4 = 0;  // média de 4 amostras (100 -> 25 por segundo)
byte cont4 = 0;

int32_t spo2; //SPO2 value
int8_t validSPO2 = 0; //indicator to show if the SPO2 calculation is valid
int32_t heartRate; //heart rate value (Maxim, não usado: o BPM vem do algoritmo próprio)
int8_t validHeartRate; //indicator to show if the heart rate calculation is valid

/* Definitions */

#define ESPNOW_WIFI_CHANNEL 6

/* Classes */

// Creating a new class that inherits from the ESP_NOW_Peer class is required.

class ESP_NOW_Broadcast_Peer : public ESP_NOW_Peer {
public:
  // Constructor of the class using the broadcast address
  ESP_NOW_Broadcast_Peer(uint8_t channel, wifi_interface_t iface, const uint8_t *lmk) : ESP_NOW_Peer(ESP_NOW.BROADCAST_ADDR, channel, iface, lmk) {}

  // Destructor of the class
  ~ESP_NOW_Broadcast_Peer() {
    remove();
  }

  // Function to properly initialize the ESP-NOW and register the broadcast peer
  bool begin() {
    if (!ESP_NOW.begin() || !add()) {
      log_e("Failed to initialize ESP-NOW or register the broadcast peer");
      return false;
    }
    return true;
  }

  // Function to send a message to all devices within the network
  bool send_message(const uint8_t *data, size_t len) {
    if (!send(data, len)) {
      log_e("Failed to broadcast message");
      return false;
    }
    return true;
  }
};

/* Global Variables */

uint32_t msg_count = 0;
unsigned long ultimoEnvio = 0;

// Create a broadcast peer object
ESP_NOW_Broadcast_Peer broadcast_peer(ESPNOW_WIFI_CHANNEL, WIFI_IF_STA, NULL);

/* Funções do BPM */

float mediana() {
  float t[N_BPM]; int k = bpmCount;
  for (int i = 0; i < k; i++) t[i] = bpmBuf[i];
  for (int i = 1; i < k; i++) {               // ordena os valores
    float v = t[i]; int j = i - 1;
    while (j >= 0 && t[j] > v) { t[j + 1] = t[j]; j--; }
    t[j + 1] = v;
  }
  return (k % 2) ? t[k / 2] : (t[k / 2 - 1] + t[k / 2]) / 2;
}

void adiciona(float bpm) {
  bpmBuf[bpmIdx] = bpm;
  bpmIdx = (bpmIdx + 1) % N_BPM;
  if (bpmCount < N_BPM) bpmCount++;
}

void registraValido(float bpm) {
  ultimoBpm = bpm; nUltimoBpm = n;
}

void resetar() {
  bpmCount = bpmIdx = rejeitados = confirmacoes = 0;
  env = 0; ultimoBeat = 0;
}

void reiniciaFiltros() { dc = 0; lp = 0; lpAnt = 0; ds = 0; dPrev = 0; dPrev2 = 0; }

void reiniciaSpO2() {
  spo2Idx = 0; validSPO2 = 0;
  somaRed4 = 0; somaIR4 = 0; cont4 = 0;
}

void mudaBrilho(byte b) {
  ledBrightness = b;
  particleSensor.setPulseAmplitudeRed(b);
  particleSensor.setPulseAmplitudeIR(b);
}

void processaBatida(float bpm) {
  if (DEBUG) { Serial.print("  bruto: "); Serial.println(bpm, 0); }
  if (bpm < 40 || bpm > 180) return;          // fora da faixa fisiológica

  if (bpmCount == 0) {                        // início: exige 3 batidas parecidas seguidas
    if (confirmacoes > 0 && fabs(bpm - candidato) <= 0.15 * candidato) {
      candidato = (candidato * confirmacoes + bpm) / (confirmacoes + 1);
      confirmacoes++;
    } else {
      candidato = bpm; confirmacoes = 1;
    }
    if (confirmacoes >= 3) {
      // salto grande logo após uma leitura válida: erro de contagem (dobro/metade)
      if (ultimoBpm > 0 && n - nUltimoBpm < 15 * FS &&
          fabs(candidato - ultimoBpm) > 0.35 * ultimoBpm) {
        confirmacoes = 0;
        return;
      }
      for (int i = 0; i < 3; i++) adiciona(candidato);
      registraValido(candidato);
    }
    return;
  }

  float m = mediana();
  if (fabs(bpm - m) <= 0.20 * m) {            // batida coerente com as anteriores
    rejeitados = 0;
    adiciona(bpm);
    registraValido(mediana());
    return;
  }
  // metade (batida perdida) ou dobro (pico extra): erro de contagem, só ignora
  if (fabs(2 * bpm - m) <= 0.20 * m || fabs(bpm - 2 * m) <= 0.40 * m) return;
  if (++rejeitados >= 4) resetar();           // o ritmo mudou de verdade: revalida
}

/* SpO2: recebe amostras a 100/s, entrega ao algoritmo da Maxim a média de cada 4 */

void adicionaAmostraSpO2(uint32_t red, uint32_t ir) {
  somaRed4 += red; somaIR4 += ir;
  if (++cont4 < 4) return;

  digitalWrite(readLED, !digitalRead(readLED)); //Blink onboard LED with every data read
  redBuffer[spo2Idx] = somaRed4 / 4;
  irBuffer[spo2Idx] = somaIR4 / 4;
  somaRed4 = 0; somaIR4 = 0; cont4 = 0;
  spo2Idx++;

  // buffer de 100 amostras = 4 segundos; recalcula a cada 25 amostras novas (1 segundo)
  if (spo2Idx == 100) {
    maxim_heart_rate_and_oxygen_saturation(irBuffer, 100, redBuffer, &spo2, &validSPO2, &heartRate, &validHeartRate);

    //dumping the first 25 sets of samples in the memory and shift the last 75 sets of samples to the top
    for (byte i = 25; i < 100; i++) {
      redBuffer[i - 25] = redBuffer[i];
      irBuffer[i - 25] = irBuffer[i];
    }
    spo2Idx = 75;
  }
}

/* Lê todas as amostras novas do sensor e processa BPM e SpO2 */

void leSensor() {
  particleSensor.check();
  while (particleSensor.available()) {
    long red = particleSensor.getFIFORed();
    long ir = particleSensor.getFIFOIR();
    particleSensor.nextSample();
    n++;

    if (ir < IR_DEDO) {                       // sem dedo: zera tudo
      if (dedoPresente) {
        Serial.println("Sem dedo");
        dedoPresente = false;
        mudaBrilho(BRILHO_INICIAL);
      }
      resetar(); reiniciaFiltros(); reiniciaSpO2();
      ultimoBpm = 0; somaIR = 0; contIR = 0;
      continue;
    }
    if (!dedoPresente) { Serial.println("Dedo detectado, medindo..."); dedoPresente = true; }

    // brilho automático: a cada 1 s confere se o IR está na faixa ideal
    somaIR += ir; contIR++;
    if (contIR >= 100) {
      long media = somaIR / contIR;
      somaIR = 0; contIR = 0;
      int novo = ledBrightness;
      if (media > IR_MAX) novo -= 16;
      else if (media < IR_MIN) novo += 16;
      novo = constrain(novo, 16, 255);
      if (novo != ledBrightness) {
        mudaBrilho(novo);
        Serial.print("Ajustando brilho: "); Serial.println(novo);
        resetar(); reiniciaFiltros(); reiniciaSpO2();
        continue;
      }
    }

    adicionaAmostraSpO2(red, ir);

    if (dc == 0) dc = ir;
    dc += 0.01 * (ir - dc);                   // remove o nível DC
    lp += 0.25 * ((dc - ir) - lp);            // passa-baixa (tira ruído rápido)
    ds += 0.5 * ((lp - lpAnt) - ds);          // inclinação do pulso (suavizada)
    lpAnt = lp;
    env *= 0.995;                             // envelope adaptativo da inclinação
    if (ds > env) env = ds;

    // batida = ponto de subida mais rápida do pulso (a onda secundária sobe mais devagar)
    bool pico = dPrev > dPrev2 && dPrev >= ds && dPrev > 0.5 * env;
    if (pico) {
      unsigned long dist = n - 1 - ultimoBeat;
      float refr = FS * 0.33;                 // mínimo: 330 ms (máx. ~180 BPM)
      if (bpmCount > 0) {                     // com BPM definido: 60% do intervalo esperado
        float r = 0.6 * 60.0 * FS / mediana();
        if (r > refr) refr = r;
      }
      if (dist > refr) {
        if (ultimoBeat) processaBatida(60.0 * FS / dist);
        ultimoBeat = n - 1;
      }
    }
    dPrev2 = dPrev; dPrev = ds;
  }
}

/* Main */

void setup() {
  Serial.begin(115200);

  // MAX30102

  pinMode(pulseLED, OUTPUT);
  pinMode(readLED, OUTPUT);
  Wire.begin(1,2);

  // Initialize sensor
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) //Use default I2C port, 400kHz speed
  {
    Serial.println(F("MAX30105 was not found. Please check wiring/power."));
    while (1);
  }

  Serial.println(F("Attach sensor to finger with rubber band. Press any key to start conversion"));
  while (Serial.available() == 0) ; //wait until user presses a key
  Serial.read();

  particleSensor.setup(ledBrightness, sampleAverage, ledMode, sampleRate, pulseWidth, adcRange); //Configure sensor with these settings


// ESP NOW

  // Initialize the Wi-Fi module
  WiFi.mode(WIFI_STA);
  WiFi.setChannel(ESPNOW_WIFI_CHANNEL);
  while (!WiFi.STA.started()) {
    delay(100);
  }

  Serial.println("ESP-NOW Example - Broadcast Master");
  Serial.println("Wi-Fi parameters:");
  Serial.println("  Mode: STA");
  Serial.println("  MAC Address: " + WiFi.macAddress());
  Serial.printf("  Channel: %d\n", ESPNOW_WIFI_CHANNEL);

  // Register the broadcast peer
  if (!broadcast_peer.begin()) {
    Serial.println("Failed to initialize broadcast peer");
    Serial.println("Reebooting in 1 seconds...");
    delay(1000);
    ESP.restart();
  }

  particleSensor.clearFIFO(); // descarta as amostras acumuladas durante a inicialização do Wi-Fi
  Serial.println("Setup complete. Broadcasting messages every 1 seconds.");
}

void loop() {
  leSensor();

  // envia a cada 1 segundo, sem travar a leitura do sensor
  if (millis() - ultimoEnvio >= 1000) {
    ultimoEnvio = millis();

    // Broadcast a message to all devices within the network
    int32_t data[3];
    data[0] = (bpmCount > 0) ? (int32_t)(mediana() + 0.5) : 0;  // 0 = ainda sem BPM válido
    data[1] = (validSPO2 && spo2 > 0) ? spo2 : 0;                // 0 = ainda sem SpO2 válido
    data[2] = dedoPresente ? 1 : 0;
    Serial.printf("Broadcasting message: hr:%i   spo2:%i   dedo:%i\n", data[0], data[1], data[2]);

    if (!broadcast_peer.send_message((uint8_t *)data, sizeof(data))) {
      Serial.println("Failed to broadcast message");
    }
  }
}
