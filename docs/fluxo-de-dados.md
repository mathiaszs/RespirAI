# Fluxo de dados: firmware → Firebase → dashboard

Este documento descreve o formato **exato** que o dashboard (`public/`) espera ler do Firebase Realtime Database,
o que o firmware (`firmware/ESP_NOW_Broadcast_Master`) envia hoje e as **lacunas** para integrar os dois.
Nada aqui foi implementado: a seção 4 é só proposta.

Fontes: `public/fonte-firebase.js`, `public/app.js`, `public/historico.js`, `public/escore-apneia.js` e os dois sketches de `firmware/`.

## 1. O que o dashboard espera do Firebase

### 1.1 Banco e caminhos

- Serviço: **Realtime Database** (`databaseURL` em `fonte-firebase.js`), não Firestore.
- Autenticação: o dashboard só consulta o banco **depois de login por e-mail/senha** (Firebase Auth). Sem login ele nem tenta ler.
- Caminho das leituras: `/leituras/<dispositivoId>/<chaveQualquer> = { ... }`
  - `<dispositivoId>`: texto digitado pelo usuário no campo "dispositivo". Validado por `^[A-Za-z0-9_-]{1,64}$`
    (só letras, números, `-` e `_`, até 64 caracteres). Outro formato é recusado no cliente.
  - `<chaveQualquer>`: o dashboard **ignora a chave**; só usa o valor. Serve `push()` (chave ordenável) ou o próprio timestamp.
- Mensagens de erro do código citam também o caminho `/donos` ("vínculo em /donos") e o índice `".indexOn": ["timestamp"]`.
  Ou seja, as **regras de segurança** esperadas pelo autor são: leitura de `/leituras/<id>` liberada apenas ao usuário vinculado
  àquele dispositivo em `/donos`, e `.indexOn: ["timestamp"]` em `/leituras/$dispositivo`.
  **As regras em si não estão no repositório** (não há `database.rules.json` nem referência a ele no `firebase.json`; o arquivo `firebase.json` só configura o Hosting).
  A estrutura de `/donos` não é lida pelo código do cliente, então o formato exato é desconhecido (ver lacunas).

### 1.2 Formato de cada leitura (um nó por segundo)

```jsonc
// /leituras/<dispositivoId>/<chave>
{
  "timestamp": 1730000000000, // OBRIGATÓRIO. Número, milissegundos desde 1970 (epoch UTC, como Date.now())
  "spo2": 96,                 // saturação de oxigênio, % (número)
  "bpm": 64,                  // frequência cardíaca, batimentos por minuto (número)
  "resp": 0,                  // OPCIONAL. Inteiro: nº de respirações detectadas NAQUELE segundo (0, 1 ou 2)
  "fr": 15                    // OPCIONAL. Frequência respiratória, respirações/min. Só é usado se não houver "resp"
}
```

| Campo       | Tipo     | Unidade                    | Obrigatório | Uso no dashboard |
|-------------|----------|----------------------------|-------------|------------------|
| `timestamp` | número   | ms desde 1970 (UTC)        | **sim**     | Ordenação, janela da noite, eixo X. Registro sem `timestamp` numérico finito é **descartado em silêncio** (`converter()` filtra). |
| `spo2`      | número   | %                          | sim (na prática) | Escore, gráficos. Válido se estiver em **[50, 100]**; fora disso vira "sem leitura" (nulo). |
| `bpm`       | número   | bpm                        | sim (na prática) | Vira `fc` internamente. Válido em **[25, 220]**. |
| `resp`      | inteiro  | respirações no segundo     | não         | Se **algum** registro da consulta tiver `resp` numérico, o dashboard passa a usar o modo "instantes de respiração" (cada unidade de `resp` gera um instante `t`). |
| `fr`        | número   | respirações/min            | não         | Fallback quando não há `resp`. Válido em **[0, 60]**; `0` = nenhuma respiração detectada naquele instante. |

Limites de validade vêm de `PADROES.limites` em `escore-apneia.js` (`spo2: [50,100]`, `fc: [25,220]`, `fr: [0,60]`).
**Valores fora da faixa não quebram nada**: são tratados como "sem leitura". Portanto o firmware pode mandar `0` para "inválido".

Observação sobre `resp`/`fr`: se o nó não tem nenhum dos dois, não há dado de respiração, e o dashboard
(a) mostra "—" no cartão de respiração e (b) calcula o índice **apenas pelas dessaturações (IDO)**, com um alerta explícito.

### 1.3 Como as consultas são feitas

Todas usam `orderByChild('timestamp')` em `/leituras/<dispositivoId>` (por isso o índice é necessário):

| Tela | Consulta | Detalhe |
|------|----------|---------|
| Noite | `startAt(de) / endAt(ate)` | Janela da noite = **18:00 do dia escolhido até 12:00 do dia seguinte, no fuso horário local do navegador** (`janelaDaNoite`). |
| Histórico | `temLeitura`: mesma janela + `limitToFirst(1)`; depois `carregarNoite` | Até 3 noites em paralelo; resultado de noites passadas fica em cache no navegador. |
| Ao vivo | `limitToLast(1800)` com `onValue` | Últimas **1800 leituras** (30 min a 1 Hz). Atualiza a cada mudança no banco. |

### 1.4 Transformação interna (`converter()`)

1. Descarta registros sem `timestamp` numérico; ordena por `timestamp`.
2. `t0` = menor timestamp; `inicioEpochS = t0/1000`.
3. Cada amostra vira `{ t: round((timestamp - t0)/1000), spo2, fc: bpm, fr }` — **`t` em segundos inteiros desde a primeira leitura**.
4. Se há `resp`, cada unidade vira um instante em `respiracoes[]` (em segundos, na resolução de 1 s).
5. `ultimaLeituraMs` = timestamp mais recente. No modo ao vivo, se `Date.now() - ultimaLeituraMs > 15 s`, a tela mostra
   "Sem novas leituras". **Isso depende do relógio do dispositivo estar correto** (ver lacunas).

### 1.5 O que o escore precisa (resumo de `escore-apneia.js`)

- Série em ~1 Hz, de preferência **≥ 4 h de SpO₂ válida** (abaixo disso o resultado sai com alerta de "não confiável").
- A linha de base de SpO₂ usa janela de 120 s; eventos têm 10–120 s. Por isso a taxa de 1 amostra/s e a continuidade importam.
- Sem respiração, só dessaturações são contadas (IDO).

## 2. O que o firmware envia hoje

`firmware/ESP_NOW_Broadcast_Master` (ESP32 + MAX30102), a cada 1 s, por **ESP-NOW broadcast** no canal Wi-Fi 6:

```c
int32_t data[3];
data[0] = BPM   (0 = ainda sem BPM válido)
data[1] = SpO2  (0 = sem SpO2 válido)
data[2] = 1 com dedo no sensor, 0 sem dedo
```

- Payload: 12 bytes, 3 × `int32_t`, ordem de bytes nativa (little-endian no ESP32), **sem cabeçalho, versão, ID do dispositivo, contador ou timestamp**.
- `firmware/ESP_NOW_Broadcast_Slave` é o receptor de exemplo: só imprime `BPM`, `SPo2` e um `piezo` lido localmente no momento da recepção (`analogRead(1)`). **Não envia nada ao Firebase** e não repassa o piezo.
- Não existe Wi-Fi com internet, cliente Firebase, NTP nem credenciais em nenhum dos dois sketches.

## 3. Lacunas (o que falta para integrar)

Legenda: 🔴 bloqueia a integração · 🟡 degrada o resultado · ⚪ a definir/confirmar.

| # | Gravidade | Lacuna | Detalhe |
|---|-----------|--------|---------|
| 1 | 🔴 | **Não há gateway Firebase** | Ninguém escreve em `/leituras/...`. O Slave só imprime na serial. É preciso um ESP32 gateway (pode ser o Slave) que receba o ESP-NOW **e** grave no Realtime Database. |
| 2 | 🔴 | **Falta `timestamp` (epoch, ms)** | O pacote não tem tempo e o dashboard descarta o registro sem ele. O gateway precisa de hora real (NTP via Wi-Fi) e gravar `timestamp` em **milissegundos** como inteiro de 64 bits (`int64_t`/`uint64_t`; 32 bits estouram). Alternativa: o Firebase preencher com `ServerValue.TIMESTAMP` (`{".sv":"timestamp"}`), que dá ms do servidor. |
| 3 | 🔴 | **Nomes dos campos diferem** | Firmware: `data[0]`, `data[1]`, `data[2]`. Dashboard: `bpm`, `spo2`, `timestamp`. O gateway precisa mapear `data[0]→bpm`, `data[1]→spo2`. |
| 4 | 🔴 | **Sem ID de dispositivo** | O caminho é `/leituras/<dispositivoId>/`. O gateway precisa de um ID configurável (regex `^[A-Za-z0-9_-]{1,64}$`), que o usuário digita no dashboard. Pode vir do MAC do Master (`info->src_addr` no callback do ESP-NOW), mas aí o usuário teria que digitar o MAC sem `:` (e o ID deve casar com a regra de `/donos`). |
| 5 | 🔴 | **Autorização de escrita no banco** | O dashboard lê com login de e-mail/senha. O gateway não tem usuário humano: precisa de uma conta de serviço/dispositivo (ex.: usuário Firebase Auth dedicado ao dispositivo, ou REST com segredo) e de regras que permitam **escrita** só em `/leituras/<seuId>`. Hoje as regras não estão versionadas. Credenciais **não** devem ir para o repositório (usar arquivo ignorado pelo git, ver `.gitignore`). |
| 6 | 🔴 | **Wi-Fi: ESP-NOW × roteador** | O ESP-NOW está fixo no **canal 6** (`ESPNOW_WIFI_CHANNEL`). Para falar com o Firebase, o gateway entra no Wi-Fi do roteador, e na ESP32 o rádio só opera em **um canal**: o ESP-NOW passa a usar o canal do roteador. O Master precisa estar no mesmo canal (ou o roteador fixado no canal 6, ou o canal do Master configurável). Esse é o ponto de maior risco técnico. |
| 7 | 🟡 | **Sem dado de respiração** | O dashboard e o escore dependem de `resp` (ou `fr`) para detectar **apneias** (pausas respiratórias). O Master não mede respiração e o campo não existe no pacote. O `piezo` do Slave é lido localmente na recepção (valor instantâneo, sem processamento) e não é enviado. Sem isso o índice vira só IDO (dessaturações), com alerta na tela. Decisão necessária: de onde vem a respiração (piezo na cinta? PPG derivado?) e se será enviada como `resp` (contagem/segundo) ou `fr` (resp/min). |
| 8 | 🟡 | **Leituras inválidas viram dados** | Sem dedo ou antes de ter medida válida, o firmware manda `0`. O dashboard ignora valores fora das faixas, então não quebra, mas o gateway deveria decidir: gravar mesmo assim (mantém o "buraco" visível e a contagem de horas válidas correta) ou pular. Sugestão: gravar `spo2: 0`/`bpm: 0` quando `data[2]==0`, para o dashboard mostrar "sem leitura de oxigênio" em vez de "sem novas leituras". |
| 9 | 🟡 | **Perda de pacotes e ordem** | Broadcast ESP-NOW não confirma entrega nem tem contador. Perdas viram buracos na série. O escore usa a mediana dos intervalos como período, então perdas pequenas são toleradas, mas um contador de sequência no pacote permitiria medir a perda. |
| 10 | 🟡 | **Falta de conexão com a internet durante a noite** | Se o Wi-Fi cair, as leituras se perdem (não há buffer). Considerar fila em RAM/flash e envio retroativo com os timestamps originais (o timestamp precisa ser da leitura, não do envio). |
| 11 | 🟡 | **Relógio do dispositivo** | O alerta de 15 s de "sem novas leituras" compara `Date.now()` do navegador com o `timestamp` gravado. Relógio do gateway errado ⇒ alerta falso ou nunca disparado. NTP resolve; `ServerValue.TIMESTAMP` evita o problema. |
| 12 | 🟡 | **Volume de escrita** | 1 nó/s ≈ 28 800 nós por noite de 8 h por dispositivo. Funciona no Realtime Database, mas confira cotas/custo no plano (Spark: 1 GB armazenado, 10 GB/mês de download). Dá para reduzir enviando lotes com um único `update()` multi-caminho. |
| 13 | ⚪ | **Regras de segurança fora do repositório** | `/donos` e o `.indexOn` são citados em mensagens de erro, mas `database.rules.json` não existe aqui. Sugestão: versioná-lo (e referenciar em `firebase.json` → `"database": {"rules": ...}`) para o TCC ser reprodutível. |
| 14 | ⚪ | **Quem cria o vínculo em `/donos`** | O formato (ex.: `/donos/<dispositivoId>/<uid>: true`) não está no código. Definir e documentar. |
| 15 | ⚪ | **Sem versionamento do payload** | O `int32_t[3]` sem cabeçalho dificulta evoluir (adicionar respiração, contador, bateria). Sugestão de `struct` com `versao`, `seq`, `bpm`, `spo2`, `dedo`, `resp`. |

## 4. Proposta (não implementada)

### 4.1 Pacote ESP-NOW (Master → gateway)

```c
typedef struct __attribute__((packed)) {
  uint8_t  versao;   // 1
  uint8_t  dedo;     // 0/1
  uint16_t seq;      // contador, para medir perda
  int16_t  bpm;      // 0 = inválido
  int16_t  spo2;     // 0 = inválido
  uint8_t  resp;     // respirações detectadas no segundo (0xFF = sem sensor)
} PacoteLeitura;
```

Se o Master ainda não tiver sensor de respiração, `resp = 0xFF` e o gateway **omite** o campo (o dashboard, ao ver `resp` ausente, segue só com SpO₂).

### 4.2 Documento no Firebase (gateway → banco)

Caminho: `/leituras/<dispositivoId>/<push-id>` com exatamente os campos da seção 1.2:

```json
{ "timestamp": 1730000000000, "spo2": 96, "bpm": 64 }
```

(+ `"resp": 1` quando existir). Cada nó é gravado com `timestamp` em ms.

### 4.3 Regras mínimas sugeridas

```json
{
  "rules": {
    "leituras": {
      "$dispositivo": {
        ".indexOn": ["timestamp"],
        ".read": "auth != null && root.child('donos').child($dispositivo).child(auth.uid).val() === true",
        ".write": "auth != null && auth.token.dispositivo === $dispositivo"
      }
    },
    "donos": { ".read": false, ".write": false }
  }
}
```

(`auth.token.dispositivo` seria um *custom claim* da conta do gateway; é só um exemplo de como restringir a escrita. O formato de `/donos` acima é uma suposição — confirmar com o autor.)

### 4.4 Ordem sugerida de trabalho

1. Resolver o canal Wi-Fi (lacuna 6) em bancada: gateway conectado ao roteador recebendo do Master.
2. Gateway: NTP + gravação de `{timestamp, spo2, bpm}` em `/leituras/<id>`; conferir no dashboard (aba "Ao vivo").
3. Definir a fonte de respiração e acrescentar `resp`.
4. Versionar regras e documentar `/donos`.
5. Buffer offline e contador de sequência.
