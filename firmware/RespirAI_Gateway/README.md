# RespirAI Gateway (ESP32)

Recebe as leituras do Master por ESP-NOW e grava no Firebase Realtime Database em
`/leituras/<DISPOSITIVO_ID>/<timestamp>`, o formato que o dashboard lê
(ver [`docs/fluxo-de-dados.md`](../../docs/fluxo-de-dados.md)).

> ⚠️ **Escrito sem acesso a hardware nem a compilador. Ainda não foi compilado nem testado.**
> Espere ajustes na primeira compilação (nomes de API entre versões do núcleo ESP32/biblioteca).

## Como funciona o canal Wi-Fi (roteador sem canal fixo)

O gateway entra no Wi-Fi do roteador e o ESP-NOW passa a usar **o mesmo canal**. O Master não sabe qual é:
enquanto não recebe o ACK do gateway, ele varre os canais 1–13 (300 ms cada) enviando as leituras em broadcast.
Quando o gateway recebe um pacote, responde um ACK (broadcast); ao recebê-lo o Master **fica nesse canal**. Se o ACK
sumir por 5 s (ex.: o roteador mudou de canal), o Master varre de novo. Não é preciso configurar MAC nem canal.

## Preparação

1. **Bibliotecas** (Library Manager) e núcleo: *Firebase Arduino Client Library for ESP8266 and ESP32* (mobizt) e o núcleo ESP32 para Arduino 3.x.
2. **Firebase Console**:
   - Authentication → Método de login → ative *E-mail/senha*.
   - Crie um usuário só para o gateway (ex.: `gateway@...`).
   - Regras do Realtime Database: o usuário do gateway precisa de **escrita** em `/leituras/<DISPOSITIVO_ID>` e o seu usuário do dashboard de **leitura**, com `".indexOn": ["timestamp"]`. Exemplo em `docs/fluxo-de-dados.md` (seção 4.3). Não deixe o banco aberto.
3. `cp secrets.h.example secrets.h` e preencha Wi-Fi, `FIREBASE_API_KEY`, usuário/senha do gateway e `DISPOSITIVO_ID`. O `secrets.h` **é ignorado pelo git**; nunca o commite.
4. Grave o gateway em um ESP32 e o `ESP_NOW_Broadcast_Master` em outro. O `PacoteLeitura.h` é idêntico nas duas pastas; se mudar um, mude o outro.

## Teste em bancada

1. Abra o monitor serial do gateway (115200): deve mostrar `Wi-Fi OK, canal N` e `Sincronizando horário ... OK`.
2. Abra o do Master: `Enviando: ... (procurando gateway)` e depois `Gateway encontrado.`
3. No gateway: `Enviadas N leituras (fila: ..., recebidas: ..., perdidas: ...)` a cada ~3 s.
4. No Firebase Console, veja `/leituras/<DISPOSITIVO_ID>`; no dashboard, aba **Ao vivo**, digite o mesmo ID.

## Limitações conhecidas

- **Respiração ainda não é medida**: o piezo fica neste ESP32 (na cinta do peito), mas o algoritmo que conta as respirações ainda não foi escrito. Enquanto isso o campo `resp` não é gravado e o dashboard calcula só pelas dessaturações. (O Master envia `resp = RESP_SEM_SENSOR`: a respiração não vem por ESP-NOW.)
- Fila em RAM (≈15 min); se o gateway reiniciar, perde o que não foi enviado.
- Sem criptografia no ESP-NOW (broadcast). Os dados trafegam para o Firebase via TLS.
