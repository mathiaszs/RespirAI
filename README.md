# RespirAI

Monitor de apneia do sono de baixo custo, desenvolvido como TCC de Mecatrônica. Um sensor óptico no dedo (MAX30102)
mede **frequência cardíaca (BPM)** e **saturação de oxigênio (SpO₂)** durante a noite; os dados vão para a nuvem e
um **dashboard web** calcula um **escore de triagem** (eventos por hora e gravidade) e gera relatório em PDF.

> ⚠️ **Projeto acadêmico, não é dispositivo médico.** O escore é uma triagem baseada em oximetria e não substitui
> polissonografia nem avaliação médica.

## Arquitetura

```
 MAX30102 ──I²C──▶ ESP32 (Master) ──ESP-NOW, 1 Hz──▶ ESP32 (gateway) ──Wi-Fi──▶ Firebase ──▶ Dashboard web
 (BPM, SpO₂)       calcula BPM/SpO₂                    recebe e envia          Realtime DB     (Firebase Hosting)
```

| Etapa | Onde está | Estado |
|-------|-----------|--------|
| Sensor + cálculo de BPM/SpO₂ + envio ESP-NOW | `firmware/ESP_NOW_Broadcast_Master/` | ✅ pronto |
| Receptor ESP-NOW (exemplo) | `firmware/ESP_NOW_Broadcast_Slave/` | ✅ só imprime na serial |
| Gateway ESP32 → Firebase | `firmware/RespirAI_Gateway/` | 🚧 escrito, **ainda não testado em hardware** |
| Dashboard web | `public/` | ✅ funcionando (modo demo e modo Firebase) |

O formato de dados esperado pelo dashboard, o que o firmware envia hoje e as lacunas para a integração estão em
[`docs/fluxo-de-dados.md`](docs/fluxo-de-dados.md).

### Estrutura do repositório

```
public/                  Dashboard (JavaScript puro, sem build), publicado no Firebase Hosting
  index.html, estilo.css
  app.js                 Interface e lógica das telas (Noite, Ao vivo, Histórico)
  escore-apneia.js       Cálculo do índice de eventos/hora e da gravidade
  fonte-firebase.js      Leitura do Realtime Database + login
  fonte-demo.js          Modo demonstração (arquivos em demo/)
  graficos.js, historico.js, relatorio-pdf.js
  demo/                  Noites reais de exemplo (UCD Sleep Apnea Database)
firmware/                Sketches Arduino/ESP32
docs/fluxo-de-dados.md   Contrato de dados e lacunas de integração
tests/                   Testes unitários do escore (node:test)
firebase.json, .firebaserc   Configuração do Firebase Hosting
```

## Como rodar o dashboard localmente

Requisitos: [Node.js](https://nodejs.org) 18 ou superior (só para servir os arquivos).

```bash
npx http-server public -p 5050 -c-1
# abra http://localhost:5050
```

(ou `npm start`, que faz o mesmo). O dashboard usa módulos ES (`import`), então **não funciona abrindo o
`index.html` direto do disco**; precisa de um servidor HTTP, como acima.

O modo **Firebase** exige internet (o SDK é carregado de `gstatic.com`) e um login existente.

## Modo demonstração

O modo demo funciona **sem internet, sem login e sem dispositivo**. Ele carrega noites reais de polissonografia da
base pública *St. Vincent's University Hospital / University College Dublin Sleep Apnea Database* (PhysioNet),
guardadas em `public/demo/*.json`:

- `indice.json` lista as noites (id, IAH de referência e gravidade);
- cada `ucddbNNN.json` traz SpO₂ e FC a 1 Hz, os instantes das respirações e os eventos anotados por especialistas.

O dashboard processa essas noites **exatamente como as do dispositivo** (mesmo formato `amostras` + `respiracoes`) e
mostra, ao lado do resultado calculado, o IAH de referência da base. Na aba "Ao vivo" o demo reproduz a noite
como se estivesse chegando em tempo real. É a forma recomendada de avaliar o escore e de apresentar o trabalho sem hardware.

## Testes

```bash
npm test      # node --test "tests/*.test.js"; precisa de Node 18+, sem dependências
```

Cobrem `public/escore-apneia.js` (classificação de gravidade, dessaturações, apneias/hipopneias, qualidade de dados e
validação de entrada).

## Firebase: segurança

A `apiKey` e os demais valores de `public/fonte-firebase.js` são a configuração **web** do Firebase e são públicos por
design: identificam o projeto, não dão acesso por si. **O que protege os dados são as regras de segurança do Realtime
Database e do Authentication**, então elas **precisam estar restritas**:

- nunca deixar `".read": true` / `".write": true` (modo de teste);
- permitir leitura de `/leituras/<dispositivo>` só a usuários autenticados vinculados àquele dispositivo;
- permitir escrita só à conta do gateway, e só no seu próprio dispositivo;
- manter o índice `".indexOn": ["timestamp"]`;
- considerar restringir a chave de API por domínio no Google Cloud Console e ativar o App Check.

Exemplo de regras em [`docs/fluxo-de-dados.md`](docs/fluxo-de-dados.md#43-regras-mínimas-sugeridas).
**Não commite** senhas, chaves de conta de serviço (`serviceAccount*.json`, `*-adminsdk-*.json`) nem credenciais de
Wi-Fi/Firebase do gateway (o `.gitignore` já cobre alguns padrões; para o firmware use um arquivo `secrets.h` ignorado pelo git).

## Publicação (Firebase Hosting)

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only hosting
```

O projeto configurado em `.firebaserc` é `tcc-mecatronica-b7885`.

## Créditos

- Sketches ESP-NOW baseados nos exemplos de Lucas Saavedra Vaz (2024).
- Dados de demonstração: St. Vincent's University Hospital / UCD Sleep Apnea Database, PhysioNet.

## Testar o Firebase e o dashboard sem hardware

`tools/simular-dispositivo.mjs` age como o gateway: grava leituras falsas (com pausas e dessaturações a cada 5 min)
em `/leituras/<id>`, no formato do dashboard.

```bash
export FIREBASE_USUARIO='gateway@exemplo.com'   # usuário do Authentication (não commitar!)
export FIREBASE_SENHA_USUARIO='...'
node tools/simular-dispositivo.mjs --id respirai-01 --historico 360 --ao-vivo

# uma noite completa (23h às 7h) em uma data passada, para a aba "Noite" e o relatório em PDF:
node tools/simular-dispositivo.mjs --id respirai-01 --noite 2026-10-18
```

No Windows (PowerShell), defina as variáveis com `$env:FIREBASE_USUARIO = '...'`; se `npx` for bloqueado, use `npx.cmd`.

Depois abra o dashboard, entre, digite o mesmo ID em "dispositivo" e veja a noite de hoje (aba Noite) e a aba Ao vivo.
O usuário precisa ter permissão de escrita em `/leituras/<id>` nas regras do banco.
