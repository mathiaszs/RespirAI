# Passo a passo: preparar o teste (sem o hardware)

Objetivo de hoje: deixar tudo pronto para mostrar na escola amanhã o caminho **simulador → Firebase → dashboard**.
Cada tarefa diz *o que é*, *por que*, *como fazer* e *como saber que deu certo*. Faça na ordem.

**Tempo estimado:** 1 a 2 horas. A tarefa 6 (Arduino) é opcional.

---

## Glossário rápido

| Termo | O que é |
|-------|---------|
| **Firebase** | Serviço do Google que guarda dados na nuvem e hospeda o site. Seu projeto se chama `tcc-mecatronica-b7885`. |
| **Authentication** | Parte do Firebase que cadastra usuários (e-mail + senha) e controla quem pode entrar. |
| **Realtime Database** | O "banco de dados" onde ficam as leituras, organizadas como uma árvore (pastas dentro de pastas). |
| **Caminho** | O endereço de um dado na árvore, por exemplo `/leituras/respirai-01/1730000000000`. |
| **Regras de segurança** | Texto no Firebase que define **quem pode ler e escrever** em cada caminho. Sem regras corretas, ou ninguém acessa ou todo mundo acessa. |
| **Índice (`.indexOn`)** | Dica que você dá ao banco para buscar rápido por um campo (aqui, `timestamp`). O dashboard precisa dele para buscar "a noite de ontem". |
| **apiKey** | Código que identifica o seu projeto Firebase para o site. **Não é senha**: é público por design e já está em `public/fonte-firebase.js`. O que protege os dados são as regras e o login. |
| **Gateway** | O ESP32 "ponte" que recebe os dados do sensor por rádio e os envia à internet. |
| **ESP-NOW** | Rádio direto entre dois ESP32, sem roteador. Usado do sensor até o gateway. |
| **NTP** | Serviço da internet que informa a hora certa. O gateway usa para carimbar as leituras. |
| **timestamp** | Carimbo de data/hora, aqui em **milissegundos desde 1970** (formato que os computadores usam). |
| **Node.js** | Programa que executa JavaScript fora do navegador. Usamos para o simulador, os testes e o servidor local. |
| **Terminal** | Janela onde você digita comandos. No Windows: *PowerShell*. |
| **Variável de ambiente** | Valor guardado temporariamente na sessão do terminal. Usamos para passar a senha ao simulador sem escrevê-la em arquivo. |
| **Simulador** | `tools/simular-dispositivo.mjs`: um programa que finge ser o gateway e grava leituras falsas. |

---

## Tarefa 1: Obter o código no seu computador

**Por quê:** o simulador e o dashboard local rodam a partir da pasta do projeto.

1. Entre em https://github.com/mathiaszs/RespirAI/pull/1 e clique em **Merge pull request** (isso junta o trabalho na branch `main`).
2. Se você já tem a pasta do projeto (`tcc-monitor-apneia`): abra o terminal nela e rode `git pull`.
   Se não tiver: `git clone https://github.com/mathiaszs/RespirAI.git`.
3. Instale o **Node.js** (versão LTS, em https://nodejs.org) se ainda não tiver. Confirme no terminal: `node -v` deve mostrar `v18` ou maior.

✅ **Deu certo se:** existem as pastas `tools/`, `docs/` e `tests/` dentro do projeto.

---

## Tarefa 2: Criar os usuários no Firebase

**Por quê:** o dashboard só mostra dados para quem está logado, e o simulador/gateway também precisa de um login para gravar. Recomendo **dois usuários separados**: um seu (para ver o dashboard) e um do "dispositivo" (para gravar).

1. Acesse https://console.firebase.google.com e abra o projeto **tcc-mecatronica-b7885**.
2. Menu da esquerda: **Build → Authentication** → aba **Sign-in method** (Método de login).
3. Clique em **E-mail/senha**, ative o primeiro botão e salve.
4. Aba **Users** → **Add user**:
   - Usuário 1 (dashboard): seu e-mail e uma senha **forte e nova** (não use a que apareceu na nossa conversa).
   - Usuário 2 (dispositivo): por exemplo `gateway@respirai.com` (não precisa ser um e-mail real) e outra senha forte.
5. Aba **Settings → User actions**: desmarque **Enable create (sign-up)**.
   *Por quê:* como a apiKey é pública, qualquer pessoa poderia criar uma conta no seu projeto. Desligar o cadastro livre impede isso; só você cria usuários.

✅ **Deu certo se:** a lista de *Users* mostra os dois e-mails.

---

## Tarefa 3: Conferir e ajustar as regras do banco

**Por quê:** é a tarefa mais importante. As regras decidem quem lê e escreve. O dashboard dá "Sem permissão" ou "Falta o índice" se isso estiver errado.

1. No console: **Build → Realtime Database**. Se aparecer o botão "Criar banco de dados", o banco ainda não existe: crie e escolha o modo **bloqueado** (locked mode). Anote que a URL do banco tem de ser `https://tcc-mecatronica-b7885-default-rtdb.firebaseio.com` (a mesma de `public/fonte-firebase.js`).
2. Aba **Regras (Rules)**. **Copie o que está lá para um bloco de notas** (backup).
3. Se quiser que eu confira suas regras atuais, cole o texto na conversa antes de mudar.
4. Para o teste de amanhã, substitua por estas regras (troque os dois e-mails pelos reais):

```json
{
  "rules": {
    "leituras": {
      "$dispositivo": {
        ".indexOn": ["timestamp"],
        ".read":  "auth != null && (auth.token.email === 'SEU_EMAIL@exemplo.com' || auth.token.email === 'gateway@respirai.com')",
        ".write": "auth != null && auth.token.email === 'gateway@respirai.com'"
      }
    }
  }
}
```

   O que cada linha faz:
   - `"$dispositivo"`: vale para qualquer ID (`respirai-01`, etc.).
   - `.indexOn: ["timestamp"]`: cria o índice que o dashboard exige.
   - `.read`: só os dois e-mails listados leem.
   - `.write`: só o usuário do dispositivo grava.
   - Tudo o que não está listado (`/donos`, outras pastas) fica **bloqueado** por padrão.
5. Clique em **Publicar**.

⚠️ Essas regras são simples e boas para o teste. Para o TCC final, o ideal é vincular cada usuário a seus dispositivos (era a ideia do `/donos`); podemos fazer depois.

✅ **Deu certo se:** o botão Publicar confirma sem erro de sintaxe.

---

## Tarefa 4: Rodar o simulador

**Por quê:** grava leituras falsas no Firebase como se o sensor estivesse funcionando. Assim você testa o banco, as regras e o dashboard sem hardware.

No terminal, dentro da pasta do projeto:

**Windows (PowerShell):**
```powershell
$env:FIREBASE_USUARIO = 'gateway@respirai.com'
$env:FIREBASE_SENHA_USUARIO = 'a-senha-do-usuario-2'
node tools/simular-dispositivo.mjs --id respirai-01 --historico 360 --ao-vivo
```

**Mac/Linux:**
```bash
export FIREBASE_USUARIO='gateway@respirai.com'
export FIREBASE_SENHA_USUARIO='a-senha-do-usuario-2'
node tools/simular-dispositivo.mjs --id respirai-01 --historico 360 --ao-vivo
```

- `--id respirai-01`: o ID do dispositivo, escolhido por você (só letras, números, `-` e `_`). **Anote-o.**
- `--historico 360`: grava as últimas 6 horas (360 minutos) de uma vez.
- `--ao-vivo`: depois continua gravando 1 leitura por segundo. Deixe a janela aberta; **Ctrl+C** para parar.

Erros comuns:
| Mensagem | Significado / solução |
|----------|----------------------|
| `Login falhou: INVALID_LOGIN_CREDENTIALS` | E-mail ou senha errados (tarefa 2). |
| `Login falhou: OPERATION_NOT_ALLOWED` | Login por e-mail/senha não ativado (tarefa 2, passo 3). |
| `Gravação falhou (401/403)` | Regras bloqueando (tarefa 3): confira o e-mail do `.write`. |
| `Defina FIREBASE_USUARIO...` | As variáveis não foram definidas nessa janela do terminal. |

✅ **Deu certo se:** aparece `Histórico gravado.` e depois `Gravando ao vivo...`. No console, em Realtime Database → Dados, surge `leituras → respirai-01` com muitos itens.

---

## Tarefa 5: Ver no dashboard

1. Em **outro** terminal, na pasta do projeto: `npx http-server public -p 5050 -c-1` e abra http://localhost:5050.
   (O dashboard também está hospedado no Firebase Hosting, mas o local é suficiente para testar.)
2. Clique para entrar (login) com o **usuário 1** (o seu).
3. No campo **dispositivo**, digite `respirai-01`.
4. Aba **Noite**: escolha a data **de hoje** (a "noite" vai das 18h do dia até 12h do dia seguinte) e clique em **Ver noite**.
   Se você rodou o simulador de dia, o histórico de 6 h pode estar fora da janela das 18h–12h. Nesse caso, use a aba **Ao vivo**, que mostra os últimos 30 minutos independentemente do horário. Ou rode o simulador à noite.
5. Aba **Ao vivo**: deve mostrar oxigênio, batimentos e respiração se atualizando.

✅ **Deu certo se:** os gráficos aparecem e o cartão "Ao vivo" não diz "Sem novas leituras".

Se der erro, a mensagem em vermelho diz o que é:
- *"Sem permissão para ler esse dispositivo"* → tarefa 3 (e-mail do `.read`).
- *"Falta o índice .indexOn"* → tarefa 3 (linha do índice).
- *"E-mail ou senha incorretos"* → tarefa 2.

---

## Tarefa 6 (opcional hoje): Preparar o gateway no Arduino

Só **compilar** (verificar se o código não tem erros). Não precisa de placa conectada.

1. Instale o **Arduino IDE 2.x** (https://www.arduino.cc/en/software).
2. *Ferramentas → Placa → Gerenciador de placas*: instale **esp32 by Espressif Systems** (versão 3.x).
3. *Ferramentas → Gerenciar bibliotecas*: instale **Firebase Arduino Client Library for ESP8266 and ESP32** (autor Mobizt) e, para o Master, **SparkFun MAX3010x Pulse and Proximity Sensor Library**.
4. Em `firmware/RespirAI_Gateway/`, copie `secrets.h.example` para `secrets.h` e preencha: nome e senha do Wi-Fi, usuário/senha do usuário 2, `DISPOSITIVO_ID` igual a `respirai-01`. (`secrets.h` não vai para o GitHub.)
5. Abra `RespirAI_Gateway.ino`, escolha o modelo do seu ESP32 em *Placa* e clique em **Verificar** (✓).
6. Copie **todas** as mensagens de erro e me envie; é provável que precisem de pequenos ajustes, pois o código ainda não foi compilado.

✅ **Deu certo se:** aparece "Compilação concluída". Faça o mesmo para o Master.

---

## Plano B para amanhã

Se algo da nuvem falhar na hora: o **modo demonstração** do dashboard (no seletor de fonte, a opção "Noites de exemplo") funciona **sem internet, sem login e sem dispositivo**, com noites reais de polissonografia. Teste-o hoje também.

## Antes de dormir

- [ ] Senhas novas anotadas em local seguro (nunca no GitHub nem em conversa).
- [ ] Simulador rodou e o dashboard mostrou os dados.
- [ ] Modo demo abre normalmente.
- [ ] (Opcional) Gateway e Master compilam.
