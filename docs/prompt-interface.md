# Prompt: redesenho da interface do RespirAI para a feira

> Como usar: copie tudo a partir de "## Prompt" e cole numa sessão de IA com acesso ao repositório
> `mathiaszs/RespirAI`. Antes, ajuste a seção "Decisões do autor" se quiser algo diferente.

---

## Prompt

Você vai redesenhar a interface web do **RespirAI**, um monitor de apneia do sono feito como TCC de Mecatrônica
(ensino técnico). O dashboard fica em `public/` (JavaScript puro, sem build, hospedado no Firebase Hosting). Leia
`README.md`, `docs/fluxo-de-dados.md`, `public/index.html`, `public/estilo.css`, `public/app.js` e
`public/graficos.js` antes de propor qualquer coisa.

O objetivo é uma interface **extraordinária para apresentar numa feira de ciências/tecnologia**: precisa
impressionar em 5 segundos quem passa pelo estande, ser entendida por um leigo em 30 segundos e aguentar
perguntas técnicas da banca. Hoje a interface é correta e limpa, mas parece um relatório: muito texto, muitas
tabelas e pouca emoção visual.

### Público e situação de uso

1. **Visitante da feira** (leigo, de pé, a 1–2 m de um notebook ou TV): precisa entender "o que é", "o que está
   medindo agora" e "o resultado" sem ler parágrafos.
2. **Avaliador/banca** (técnico): quer ver o método, a validação contra a polissonografia e os números.
3. **Apresentador** (o aluno): precisa de controles rápidos para conduzir a demonstração e de um modo que rode
   sozinho quando ele estiver conversando.

Telas prováveis: notebook 1366×768 e 1920×1080, TV/projetor (fonte grande) e celular de visitante (só leitura).
O Wi-Fi da feira pode ser ruim ou inexistente.

### Visão: como a interface incrível se parece

**Identidade**
- Nome **RespirAI** no topo (hoje está "Monitor de Apneia"), com um logo simples em SVG (ex.: onda de respiração
  formando um "A" ou um pulmão estilizado). Tagline curta: "Seu sono, respiração por respiração."
- Visual de "tecnologia médica noturna": **tema escuro como padrão** (azul-noite profundo, não preto puro), com
  um tema claro bem cuidado como alternativa. Uma cor de destaque fria (ciano/azul) para os sinais, e as cores de
  gravidade (verde → amarelo → laranja → vermelho) reservadas **só** para classificar resultados.
- Tipografia com personalidade e números tabulares grandes (ex.: "Inter" ou "Manrope" para texto e
  "JetBrains Mono"/"IBM Plex Mono" para números ao vivo). Hierarquia forte: um número herói por tela.
- Movimento com propósito: transições suaves (150–300 ms), números que "contam" até o valor, o pulso do coração
  e a respiração animados no ritmo real do dado. Respeitar `prefers-reduced-motion`.

**Tela "Agora" (a estrela da feira)**
- Ocupa a tela inteira como um monitor de UTI elegante: três sinais grandes (SpO₂, batimentos, respiração),
  cada um com valor enorme, unidade, mini-tendência e um ícone animado (coração batendo no BPM real, pulmão
  expandindo a cada respiração detectada).
- Uma **onda contínua** rolando da direita para a esquerda (estilo monitor cardíaco) com os últimos 60–120 s.
- Quando ocorre uma pausa respiratória: o fundo da faixa de respiração muda suavemente de cor, aparece um contador
  "pausa há 12 s", e ao terminar o evento entra numa linha do tempo de eventos com animação discreta.
- Um "estado em uma frase" grande e humano: "Respirando normalmente", "Pausa na respiração", "Oxigênio caindo",
  "Sensor fora do dedo".
- Placar da noite até agora: eventos, eventos/hora (marcado como parcial) e tempo de registro.

**Tela "Resumo da noite"**
- Abre com um **resultado herói**: o índice de eventos/hora gigante, a gravidade numa escala semicircular ou
  linear animada (normal/leve/moderada/grave) e uma frase em linguagem simples.
- Um **hipnograma da noite**: uma faixa horizontal com a noite inteira, mostrando SpO₂ como área preenchida e os
  eventos como marcas. Clicar/arrastar amplia (o zoom sincronizado de `graficos.js` já existe; reaproveite).
- Cartões curtos com as métricas mais importantes (SpO₂ média e mínima, tempo abaixo de 90%, FC média, eventos).
  No máximo 4–6 cartões; o resto vai para "Detalhes técnicos".
- **Comparação com o exame de referência** (noites de exemplo): visual, não tabela. Ex.: dois marcadores na mesma
  escala ("Monitor 22,4" vs. "Polissonografia 24,7") e um selo "mesma classificação ✓".

**Tela "Histórico"**
- Gráfico de barras das noites com a faixa de gravidade ao fundo (já existe), com aparência mais refinada, e
  cartões de tendência ("melhorou 18% nas últimas 7 noites").

**Novo: Modo Feira (apresentação)**
- Ativado por um botão discreto ou pela URL `?feira=1`. Tela cheia, fonte maior, sem formulários.
- **Roteiro automático em loop** quando ninguém mexe por ~60 s: (1) abertura "O que é apneia do sono?" em uma
  frase + animação de respiração; (2) "Agora" reproduzindo uma noite de exemplo acelerada; (3) resultado herói
  de uma noite; (4) comparação com a polissonografia; (5) "Como funciona": diagrama animado
  sensor → ESP-NOW → gateway → nuvem → dashboard. Qualquer toque/tecla volta ao controle manual.
- Atalhos de teclado para o apresentador (ex.: ←/→ trocam de cena, espaço pausa, 1/2/3 escolhem a noite de
  exemplo de cada gravidade).
- QR code no canto apontando para o dashboard hospedado (para o visitante abrir no celular).

**Nova cena: "Como funciona"**
- Diagrama da arquitetura com pacotes "viajando" entre os blocos, uma frase por bloco e fotos/ícones do
  hardware (MAX30102 no dedo, piezo na cinta do peito, ESP32 Master, ESP32 gateway, Firebase, dashboard).

### O que a IA PODE modificar

- **Todo o visual**: `public/estilo.css` pode ser reescrito do zero; `public/index.html` pode ser reestruturado.
- **A camada de apresentação de `public/app.js`** (montagem do DOM, textos, ordem dos elementos, animações,
  navegação, novo Modo Feira). Pode dividir `app.js` em módulos menores (ex.: `tela-agora.js`, `modo-feira.js`).
- **A aparência dos gráficos** em `public/graficos.js` (cores, espessuras, áreas preenchidas, animação de
  rolagem), mantendo uPlot.
- **Os textos**: pode reescrever para frases mais curtas e humanas, em português do Brasil.
- **Ícones e logo**: criar SVGs inline próprios.
- **Fontes**: usar Google Fonts **ou**, de preferência, arquivos de fonte locais em `public/` (ver "offline").
- Acrescentar pequenas bibliotecas por CDN com versão fixa (ex.: um gerador de QR code), sempre com cópia local.

### O que a IA PODE diminuir, esconder ou remover

- **Parágrafos explicativos longos** (ex.: o texto sob "A noite, minuto a minuto" e as notas metodológicas):
  encurtar para uma linha ou mover para um ícone "ⓘ" com popover.
- **Tabela de validação** (9 colunas): substituir na tela principal por uma visualização; manter a tabela
  completa dentro de "Detalhes técnicos / Para a banca".
- **"Médias a cada 10 minutos" e lista completa de eventos**: manter só em "Detalhes técnicos", recolhidos.
- **Tabela "Todas as noites" do histórico**: recolher por padrão.
- **Chips e controles secundários** (mostrar batimentos/respiração/exame): agrupar num único menu de camadas.
- **Seletor de fonte de dados e login**: tirar do topo; mover para um menu de configurações. No Modo Feira, não
  aparecem.
- **Rodapé**: reduzir a uma linha, mantendo os créditos obrigatórios (ver abaixo).

### O que a IA NÃO pode mudar

1. **A lógica de cálculo**: `public/escore-apneia.js` não muda (nem limiares nem resultados). Os testes
   `npm test` precisam continuar passando.
2. **O contrato de dados**: `public/fonte-firebase.js` e `public/fonte-demo.js` mantêm a API e os caminhos
   (`/leituras/<dispositivo>`, campos `timestamp`, `spo2`, `bpm`, `resp`/`fr`). O firmware e o simulador dependem
   disso.
3. **Honestidade científica**:
   - O aviso "triagem, não substitui diagnóstico médico" continua visível (pode ficar menor).
   - O crédito da base de dados (St. Vincent's / UCD Sleep Apnea Database, PhysioNet, doi:10.13026/C26C7D,
     ODC-By 1.0) continua presente.
   - Dados simulados ou de exemplo devem ser identificados como tal (selo "Noite de exemplo" / "Simulação").
     **Nunca** apresentar dado de exemplo como se fosse medição real do aparelho.
   - Resultados parciais (ao vivo, menos de 4 h) continuam marcados como parciais.
4. **Sem framework pesado nem etapa de build**: nada de React/Vue/Tailwind compilado/bundler. Continua sendo
   HTML + CSS + módulos ES servidos por `npx http-server public`.
5. **Acessibilidade mínima**: contraste AA, navegação por teclado, `aria-*` nas abas e status, textos alternativos
   nos gráficos (o resumo em frase serve), e nada que dependa só de cor (gravidade sempre com texto também).
6. **O relatório em PDF** (`relatorio-pdf.js`) continua funcionando (pode ganhar o novo visual, se der tempo).

### Requisitos técnicos

- **Funcionar offline no modo de exemplo**: hoje uPlot (jsDelivr) e jsPDF (cdnjs) vêm de CDN, então **sem
  internet o modo de exemplo não desenha gráficos**. Copiar essas bibliotecas (e as fontes) para
  `public/vendor/` e carregar de lá. O modo Firebase continua exigindo internet.
- Desempenho: a tela "Agora" a 60 fps num notebook comum; não recriar gráficos a cada leitura (atualizar dados).
- Responsivo: excelente em 1366×768, 1920×1080 e em TV; utilizável em celular (390 px), sem rolagem horizontal.
- Tema claro e escuro com variáveis CSS (como hoje), escuro por padrão.
- Compatível com Chrome e Edge atuais (Windows é o computador do autor).

### Como trabalhar

1. Primeiro, **proponha** (sem codar): um resumo da direção visual, a lista de telas/cenas e o que será
   removido/movido. Espere aprovação do autor.
2. Implemente em etapas pequenas, uma tela por vez, começando pelo **Modo Feira + tela "Agora"** (maior
   impacto), depois "Resumo da noite", "Como funciona" e "Histórico".
3. A cada etapa: rode `npm test`, abra o dashboard com Playwright (Chromium já instalado) em 1366×768 e 390×844,
   tire capturas de tela e confira tema claro e escuro.
4. Entregue numa branch com PR, descrevendo o que mudou, o que foi removido/movido e como ativar o Modo Feira.

### Critérios de aceitação

- Um visitante entende o que o aparelho faz e o resultado de uma noite **sem ler mais de duas frases**.
- O Modo Feira roda sozinho por 30 minutos sem erro e sem internet (noites de exemplo).
- Todas as funções atuais continuam acessíveis (algumas dentro de "Detalhes técnicos").
- `npm test` passa; nenhum arquivo de cálculo ou de fonte de dados teve comportamento alterado.
- Os avisos e créditos obrigatórios continuam presentes.

### Decisões do autor (ajuste antes de usar)

- Tema padrão: **escuro**.
- Cor de destaque: **ciano/azul**.
- Prioridade: **Modo Feira e tela "Agora"** primeiro.
- Idioma: português do Brasil.
- Prazo: [preencher a data da feira].
