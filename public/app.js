import { calcularEscore, classificarGravidade, PADROES } from './escore-apneia.js';
import { criarGrupo, corDoTipo } from './graficos.js';
import { carregarIndiceDemo, carregarNoiteDemo } from './fonte-demo.js';
import { resumirNoite, datasDoPeriodo, buscarHistoricoDispositivo, desenharBarras } from './historico.js';
import { criarModoFeira } from './modo-feira.js';

const $ = (id) => document.getElementById(id);

const NOMES_TIPO = { apneia: 'Apneia', hipopneia: 'Hipopneia', dessaturacao: 'Queda de oxigênio' };
const NOMES_AMIGAVEIS = {
  apneia: 'Parada na respiração',
  hipopneia: 'Respiração fraca',
  dessaturacao: 'Queda de oxigênio',
};
const GRAVIDADE = {
  normal: {
    rotulo: 'Normal',
    titulo: 'Sem apneia relevante',
    faixa: 'menos de 5 por hora',
    cor: '--bom',
    icone: 'ok',
    orientacao: 'Nesta noite não apareceram sinais importantes de apneia.',
  },
  leve: {
    rotulo: 'Leve',
    titulo: 'Apneia leve',
    faixa: '5 a 15 por hora',
    cor: '--atencao',
    icone: 'alerta',
    orientacao: 'Se houver ronco alto, cansaço ao acordar ou sono durante o dia, vale conversar com um médico.',
  },
  moderada: {
    rotulo: 'Moderada',
    titulo: 'Apneia moderada',
    faixa: '15 a 30 por hora',
    cor: '--serio',
    icone: 'alerta',
    orientacao: 'Vale levar este resultado a um médico do sono, que pode confirmar com uma polissonografia.',
  },
  grave: {
    rotulo: 'Grave',
    titulo: 'Apneia grave',
    faixa: '30 ou mais por hora',
    cor: '--critico',
    icone: 'critico',
    orientacao: 'Procure um médico do sono: este padrão merece ser confirmado e tratado.',
  },
};
// Escala exibida: quatro faixas de mesma largura; o marcador anda proporcionalmente dentro de cada uma.
const ESCALA = [
  ['normal', 0, 5],
  ['leve', 5, 15],
  ['moderada', 15, 30],
  ['grave', 30, 60],
];
const TEMAS = [
  ['dark', 'escuro'],
  ['light', 'claro'],
  ['auto', 'automático'],
];
const SEM_MOVIMENTO = matchMedia('(prefers-reduced-motion: reduce)');
const VELOCIDADES = [1, 10, 60, 300];
const JANELA_VIVO_S = 600;

const ICONES = {
  pausa: ['M10 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15z', 'M8.2 7.5v5', 'M11.8 7.5v5'],
  oxigenio: ['M10 2.8c2.9 3.4 4.8 6.1 4.8 8.6a4.8 4.8 0 0 1-9.6 0c0-2.5 1.9-5.2 4.8-8.6z'],
  coracao: ['M10 16.2s-6.2-3.6-6.2-8.1A3.4 3.4 0 0 1 10 6.3a3.4 3.4 0 0 1 6.2 1.8c0 4.5-6.2 8.1-6.2 8.1z'],
  respiracao: ['M2.8 7.2h8.4a2.4 2.4 0 1 0-2.4-2.4', 'M2.8 10.4h11.6a2.4 2.4 0 1 1-2.4 2.4', 'M2.8 13.6h5.2'],
  lua: ['M16.2 12.6A6.8 6.8 0 0 1 7.4 3.8a6.8 6.8 0 1 0 8.8 8.8z'],
  sol: [
    'M10 6.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2z',
    'M10 1.8v1.6M10 16.6v1.6M1.8 10h1.6M16.6 10h1.6M4.2 4.2l1.1 1.1M14.7 14.7l1.1 1.1M4.2 15.8l1.1-1.1M14.7 5.3l1.1-1.1',
  ],
  auto: ['M10 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15z', 'M10 2.5a7.5 7.5 0 0 0 0 15z'],
  baixar: ['M10 3v9.5', 'M6.2 8.8 10 12.6l3.8-3.8', 'M4 16h12'],
  tendencia: ['M3 15l4.5-4.5 3 3L17 7', 'M12.5 7H17v4.5'],
  onda: ['M2 10.5h3.2l1.7-4.6 3 9.2 2.2-6.4 1.4 1.8H18'],
  sensor: ['M2.5 10h3l1.5-4 3 8 2-5 1.2 1h4.3'],
  chip: ['M6 6h8v8H6z', 'M8.5 3v3M11.5 3v3M8.5 14v3M11.5 14v3M3 8.5h3M3 11.5h3M14 8.5h3M14 11.5h3'],
  antena: ['M10 11v7', 'M11.2 9.5a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0z', 'M7 6.5a4.2 4.2 0 0 0 0 6', 'M13 6.5a4.2 4.2 0 0 1 0 6', 'M4.6 4.2a7.6 7.6 0 0 0 0 10.6', 'M15.4 4.2a7.6 7.6 0 0 1 0 10.6'],
  nuvem: ['M6 15.5h8.5a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 6 15.5z'],
  tela: ['M3 4.5h14v9H3z', 'M7 17h6', 'M10 13.5V17', 'M5.5 10.5l2-2 2 1.5 3-3.5 2 1.5'],
};

// Ícones grandes e preenchidos dos sinais ao vivo (viewBox 24).
const ICONES_SINAL = {
  oxigenio: ['M12 2.5c3.6 4.3 6.3 7.8 6.3 11.2a6.3 6.3 0 0 1-12.6 0c0-3.4 2.7-6.9 6.3-11.2z'],
  coracao: ['M12 21s-7.5-4.6-9.3-9.2C1.5 8.6 3.4 5 6.9 5c2 0 3.6 1.1 4.6 2.6l.5.8.5-.8C13.5 6.1 15.1 5 17.1 5c3.5 0 5.4 3.6 4.2 6.8C19.5 16.4 12 21 12 21z'],
  respiracao: [
    'M10.6 9.2C8.2 6.6 5.2 7.3 4.1 10.8c-1.1 3.6-.6 7.1 1.2 8.4 1.6 1.1 3.9.3 4.8-1.3.5-.9.5-2.2.5-3.5V9.2z',
    'M13.4 9.2c2.4-2.6 5.4-1.9 6.5 1.6 1.1 3.6.6 7.1-1.2 8.4-1.6 1.1-3.9.3-4.8-1.3-.5-.9-.5-2.2-.5-3.5V9.2z',
  ],
};

const estado = {
  fonte: 'demo',
  aba: 'noite',
  noite: null,
  origem: null, // de onde veio a noite aberta: { demo: id } ou { dispositivo, data }
  escore: null,
  series: null,
  grupoNoite: null,
  mostrar: { fc: false, fr: false, psg: true },
  noitesDemo: new Map(),
  indiceDemo: null,
  historico: { pedido: 0, graficos: [], resumosDemo: new Map() },
  firebase: null,
  usuario: null,
  vivo: {
    dados: null,
    series: null,
    janela: null,
    faixas: [],
    faixaX: null,
    posicao: 0,
    tocando: false,
    velocidade: 60,
    ultimoCalculo: 0,
    escore: null,
    grupo: null,
    mostrarFc: false,
    pararEscuta: null,
    sinais: null, // elementos dos três sinais grandes, criados uma vez para as animações não recomeçarem
    chaveFeed: '',
  },
};

// ---------- formatação e utilidades ----------

function fmt(x, casas = 1) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return x.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

function hora(epochS, comSegundos = false) {
  return new Date(epochS * 1000).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    ...(comSegundos ? { second: '2-digit' } : {}),
  });
}

function duracao(minutos) {
  if (minutos === null) return '—';
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

function vezes(n) {
  return `${fmt(n, 0)} ${n === 1 ? 'vez' : 'vezes'}`;
}

function guardar(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    /* armazenamento indisponível: só não lembra a escolha */
  }
}

function lembrar(chave) {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function mensagem(texto) {
  const el = $('mensagem');
  el.hidden = !texto;
  el.textContent = texto ?? '';
}

// Último índice de uma lista ordenada com valor <= t (busca binária); -1 se nenhum.
function ultimoAte(lista, t, chave = (x) => x) {
  let lo = 0;
  let hi = lista.length - 1;
  if (hi < 0 || chave(lista[0]) > t) return -1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (chave(lista[m]) <= t) lo = m;
    else hi = m - 1;
  }
  return lo;
}

function ultimoValido(serie, fim, inicio) {
  for (let i = fim; i >= Math.max(0, inicio); i--) if (serie[i] !== null) return serie[i];
  return null;
}

// ---------- ícones e peças visuais ----------

function svg(nome, tamanho = 20) {
  const ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('width', String(tamanho));
  el.setAttribute('height', String(tamanho));
  el.setAttribute('viewBox', '0 0 20 20');
  el.setAttribute('fill', 'none');
  el.setAttribute('stroke', 'currentColor');
  el.setAttribute('stroke-width', '1.6');
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  el.setAttribute('aria-hidden', 'true');
  for (const d of ICONES[nome]) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    el.append(p);
  }
  return el;
}

// Ícone de estado: forma + cor + (sempre) um texto ao lado.
function iconeEstado(tipo, corVar) {
  const ns = 'http://www.w3.org/2000/svg';
  const el = document.createElementNS(ns, 'svg');
  el.setAttribute('width', '20');
  el.setAttribute('height', '20');
  el.setAttribute('viewBox', '0 0 18 18');
  el.setAttribute('aria-hidden', 'true');
  const forma = document.createElementNS(ns, 'path');
  const formas = { ok: 'M9 1a8 8 0 1 1 0 16A8 8 0 0 1 9 1z', alerta: 'M9 1.5 17.2 16H.8z', critico: 'M9 .8 17.2 9 9 17.2.8 9z' };
  forma.setAttribute('d', formas[tipo]);
  forma.style.fill = `var(${corVar})`;
  const marca = document.createElementNS(ns, 'path');
  marca.setAttribute('d', tipo === 'ok' ? 'M5.4 9.3l2.4 2.3 4.8-4.9' : tipo === 'alerta' ? 'M9 6.6v4.2M9 13.3v.2' : 'M9 5.4v4.4M9 12.4v.2');
  marca.setAttribute('fill', 'none');
  marca.setAttribute('stroke', tipo === 'alerta' ? '#0b0b0b' : '#ffffff');
  marca.setAttribute('stroke-width', '2');
  marca.setAttribute('stroke-linecap', 'round');
  marca.setAttribute('stroke-linejoin', 'round');
  el.append(forma, marca);
  return el;
}

function selo(el, gravidade) {
  el.replaceChildren();
  const g = GRAVIDADE[gravidade];
  if (!g) {
    el.textContent = 'Sem dados suficientes';
    return;
  }
  const detalhe = document.createElement('span');
  detalhe.className = 'detalhe';
  detalhe.textContent = `(${g.faixa})`;
  el.append(iconeEstado(g.icone, g.cor), g.titulo, detalhe);
}

// Posição de um índice na escala exibida, de 0 a 1: quatro faixas de mesma largura.
function posicaoNaEscala(indice) {
  for (const [i, [, de, ate]] of ESCALA.entries()) {
    if (indice < ate || i === ESCALA.length - 1) return (i + Math.max(0, Math.min(1, (indice - de) / (ate - de)))) / ESCALA.length;
  }
  return 1;
}

function svgEl(tag, atributos = {}, pai) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, String(v));
  pai?.append(e);
  return e;
}

// Medidor semicircular: quatro arcos (normal → grave) e um ponteiro que gira até o índice.
function desenharEscala(el, indice, gravidade) {
  el.replaceChildren();
  if (indice === null) return;
  const cx = 150;
  const cy = 150;
  const r = 118;
  const ponto = (graus, raio) => {
    const a = (graus * Math.PI) / 180;
    return [cx - raio * Math.cos(a), cy - raio * Math.sin(a)];
  };
  const svg = svgEl('svg', { viewBox: '0 0 300 172', 'aria-hidden': 'true' });
  svgEl('path', { d: `M${ponto(0, r).join(' ')} A${r} ${r} 0 0 1 ${ponto(180, r).join(' ')}`, class: 'trilho', 'stroke-width': 26 }, svg);
  const passo = 180 / ESCALA.length;
  ESCALA.forEach(([nome, de], i) => {
    const atual = nome === gravidade;
    const a0 = i * passo + 1.6;
    const a1 = (i + 1) * passo - 1.6;
    const arco = svgEl('path', {
      d: `M${ponto(a0, r).join(' ')} A${r} ${r} 0 0 1 ${ponto(a1, r).join(' ')}`,
      class: `arco${atual ? ' atual' : ''}`,
      'stroke-width': atual ? 24 : 18,
    }, svg);
    arco.style.stroke = `var(${GRAVIDADE[nome].cor})`;
    arco.style.setProperty('--cor', `var(${GRAVIDADE[nome].cor})`);
    const [tx, ty] = ponto((i + 0.5) * passo, r + 26);
    const t = svgEl('text', { x: tx, y: ty, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: `rotulo-arco${atual ? ' atual' : ''}` }, svg);
    t.textContent = GRAVIDADE[nome].rotulo;
    if (i) {
      const [lx, ly] = ponto(i * passo, r - 30);
      const l = svgEl('text', { x: lx, y: ly, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'limite' }, svg);
      l.textContent = String(de);
    }
  });
  const ponteiro = svgEl('g', { class: 'ponteiro' }, svg);
  ponteiro.style.transformOrigin = `${cx}px ${cy}px`;
  svgEl('line', { x1: cx, y1: cy, x2: cx - r + 34, y2: cy }, ponteiro);
  svgEl('circle', { cx, cy, r: 11, class: 'centro' }, svg);
  el.append(svg);
  const graus = posicaoNaEscala(indice) * 180;
  if (SEM_MOVIMENTO.matches) ponteiro.style.transform = `rotate(${graus}deg)`;
  else requestAnimationFrame(() => requestAnimationFrame(() => (ponteiro.style.transform = `rotate(${graus}deg)`)));
  el.setAttribute('aria-label', `Escala de gravidade: ${fmt(indice)} eventos por hora, faixa ${GRAVIDADE[gravidade].rotulo.toLowerCase()}.`);
}

// Número que "conta" até o valor final.
function contar(el, valor, casas = 1) {
  if (valor === null || valor === undefined || SEM_MOVIMENTO.matches) {
    el.textContent = fmt(valor, casas);
    return;
  }
  const inicio = performance.now();
  const duracaoMs = 1100;
  const passo = (agora) => {
    const p = Math.min(1, (agora - inicio) / duracaoMs);
    const suave = 1 - (1 - p) ** 3;
    el.textContent = fmt(p < 1 ? Math.round(valor * suave * 10 ** casas) / 10 ** casas : valor, casas);
    if (p < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

// Régua com o resultado do monitor e o do exame de referência lado a lado.
function desenharComparacao(el, indice, gravidade, referencia) {
  el.replaceChildren();
  const classeRef = classificarGravidade(referencia.iah);
  const mesma = classeRef === gravidade;
  const topo = document.createElement('div');
  topo.className = 'comparacao-topo';
  const titulo = document.createElement('strong');
  titulo.textContent = 'Exame de laboratório (polissonografia) da mesma noite';
  const concorda = document.createElement('span');
  concorda.className = `concorda${mesma ? '' : ' nao'}`;
  concorda.append(iconeEstado(mesma ? 'ok' : 'alerta', mesma ? '--bom' : '--atencao'), mesma ? 'Mesma classificação' : 'Classificação diferente');
  topo.append(titulo, concorda);

  const regua = document.createElement('div');
  regua.className = 'regua';
  regua.setAttribute('aria-hidden', 'true');
  const faixas = document.createElement('div');
  faixas.className = 'regua-faixas';
  for (const [nome] of ESCALA) {
    const i = document.createElement('i');
    i.style.setProperty('--cor', `var(${GRAVIDADE[nome].cor})`);
    faixas.append(i);
  }
  const pino = (classe, valor) => {
    const p = document.createElement('span');
    p.className = `pino ${classe}`;
    p.style.left = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => (p.style.left = `${posicaoNaEscala(valor) * 100}%`)));
    return p;
  };
  regua.append(faixas, pino('exame', referencia.iah), pino('monitor', indice));

  const numeros = document.createElement('div');
  numeros.className = 'comparacao-numeros';
  numeros.setAttribute('aria-hidden', 'true');
  for (const [classe, rotulo, valor] of [['monitor', 'RespirAI', indice], ['exame', 'Polissonografia', referencia.iah]]) {
    const item = document.createElement('div');
    item.className = classe;
    const t = document.createElement('span');
    t.textContent = rotulo;
    const b = document.createElement('b');
    b.textContent = fmt(valor);
    item.append(t, b);
    numeros.append(item);
  }

  const texto = document.createElement('p');
  texto.className = 'visualmente-oculto';
  texto.textContent =
    `O exame encontrou ${fmt(referencia.iah)} eventos por hora (${GRAVIDADE[classeRef].titulo.toLowerCase()}); ` +
    `o RespirAI, ${fmt(indice)} (${GRAVIDADE[gravidade].titulo.toLowerCase()}).`;
  el.append(topo, numeros, regua, texto);
}

function metrica({ icone, titulo, valor, unidade, detalhe, classe }) {
  const el = document.createElement('div');
  el.className = `metrica ${classe ?? icone}`;
  const topo = document.createElement('div');
  topo.className = 'metrica-topo';
  const circulo = document.createElement('span');
  circulo.className = 'icone-redondo';
  circulo.append(svg(icone, 18));
  const t = document.createElement('span');
  t.className = 'titulo';
  t.textContent = titulo;
  topo.append(circulo, t);
  const v = document.createElement('p');
  v.className = 'valor';
  v.textContent = valor;
  if (unidade && valor !== '—') {
    const u = document.createElement('small');
    u.textContent = unidade;
    v.append(u);
  }
  el.append(topo, v);
  if (detalhe) {
    const d = document.createElement('p');
    d.className = 'detalhe';
    d.textContent = detalhe;
    el.append(d);
  }
  return el;
}

function chaveCor(tipo, texto) {
  const chave = document.createElement('span');
  chave.className = 'chave';
  const i = document.createElement('i');
  i.style.background = corDoTipo(tipo);
  chave.append(i, texto ?? NOMES_TIPO[tipo] ?? tipo);
  return chave;
}

// ---------- séries e gráficos ----------

function montarSeries(noite) {
  const lim = PADROES.limites;
  const valido = (v, [a, b]) => typeof v === 'number' && v >= a && v <= b;
  const { amostras, respiracoes, inicioEpochS } = noite;
  const x = [];
  const spo2 = [];
  const fc = [];
  const fr = [];
  let j = 0;
  let k = 0;
  for (const a of amostras) {
    x.push(inicioEpochS + a.t);
    spo2.push(valido(a.spo2, lim.spo2) ? a.spo2 : null);
    fc.push(valido(a.fc, lim.fc) ? a.fc : null);
    if (respiracoes) {
      // Respirações nos últimos 30 s × 2 = respirações por minuto.
      while (k < respiracoes.length && respiracoes[k] <= a.t) k++;
      while (j < k && respiracoes[j] < a.t - 30) j++;
      fr.push(a.t - amostras[0].t >= 30 ? (k - j) * 2 : null);
    } else {
      fr.push(valido(a.fr, lim.fr) ? a.fr : null);
    }
  }
  return { x, spo2, fc, fr };
}

const SINAIS = {
  spo2: (s) => ({
    titulo: 'Oxigênio no sangue (SpO₂, %)',
    cor: '--c-oxigenio',
    valores: s.spo2,
    altura: 170,
    faixaY: (min) => [Math.min(80, Math.floor(min / 5) * 5), 100],
  }),
  fc: (s) => ({
    titulo: 'Batimentos do coração (por minuto)',
    cor: '--c-coracao',
    valores: s.fc,
    altura: 120,
    faixaY: (min, max) => [Math.floor((min - 5) / 10) * 10, Math.ceil((max + 5) / 10) * 10],
  }),
  fr: (s) => ({
    titulo: 'Respiração (por minuto)',
    cor: '--c-respiracao',
    valores: s.fr,
    altura: 120,
    faixaY: (min, max) => [0, Math.max(30, Math.ceil(max / 10) * 10)],
  }),
};

// Leitura única para todos os gráficos na posição do cursor: valores primeiro, nomes depois.
function atualizarLeitura(el, s, faixas, idx) {
  if (idx === null || !s || s.x[idx] === undefined) {
    el.textContent = 'Passe o cursor (ou o dedo) sobre o gráfico para ver os valores de cada momento.';
    return;
  }
  const t = s.x[idx];
  el.replaceChildren();
  const partes = [
    [hora(t, true), ''],
    [s.spo2[idx] === null ? '—' : `${fmt(s.spo2[idx])}%`, 'oxigênio'],
    [s.fc[idx] === null ? '—' : fmt(s.fc[idx], 0), 'batimentos/min'],
    [s.fr[idx] === null ? '—' : fmt(s.fr[idx], 0), 'respirações/min'],
  ];
  for (const f of faixas) {
    const e = f.eventos.find((ev) => t >= f.base + ev.inicio && t <= f.base + ev.fim);
    if (e) partes.push([NOMES_AMIGAVEIS[e.tipo] ?? e.tipo, f.rotulo === 'Exame' ? 'no exame' : '']);
  }
  partes.forEach(([valor, nome], i) => {
    if (i) el.append(' · ');
    const forte = document.createElement('strong');
    forte.textContent = valor;
    el.append(forte);
    if (nome) el.append(` ${nome}`);
  });
}

// ---------- resumo da noite ----------

function fraseResultado(e) {
  const n = e.eventos.length;
  const porHora = fmt(Math.round(e.indiceEventos ?? 0), 0);
  if (!e.respiracao.fonte) return `O oxigênio caiu ${vezes(n)} durante a noite, em média ${porHora} por hora.`;
  if (!n) return 'Nenhuma pausa na respiração foi registrada durante a noite.';
  return `Durante a noite, a respiração parou ou ficou fraca ${vezes(n)}, em média ${porHora} por hora.`;
}

function avisosAmigaveis(e) {
  const lista = [];
  if (!e.qualidade.suficiente) {
    lista.push(`A gravação teve só ${fmt(e.qualidade.horasValidas)} h de leitura válida. O ideal são 4 h ou mais; use este resultado com cuidado.`);
  }
  if (!e.respiracao.fonte) lista.push('O sensor de respiração não enviou dados; o resultado usa só o oxigênio.');
  if (e.oximetria.spo2Minima !== null && e.oximetria.spo2Minima < 80) {
    lista.push(
      `Em algum momento o oxigênio marcou ${fmt(e.oximetria.spo2Minima, 0)}%. Valores abaixo de 80% merecem atenção, ` +
        'mas também podem ser o sensor saindo do dedo.',
    );
  }
  return lista;
}

function mostrarNoite(noite) {
  estado.noite = noite;
  estado.escore = calcularEscore({ amostras: noite.amostras, respiracoes: noite.respiracoes });
  estado.series = montarSeries(noite);
  const e = estado.escore;
  const o = e.oximetria;
  const r = e.respiracao;
  const c = e.cardiaco;

  const inicio = noite.inicioEpochS + noite.amostras[0].t;
  const fim = noite.inicioEpochS + noite.amostras.at(-1).t;
  $('periodo').textContent = `${noite.rotulo} · das ${hora(inicio)} às ${hora(fim)}`;
  $('periodo-analise').textContent = $('periodo').textContent;
  const g = GRAVIDADE[e.gravidade];
  $('cartao-heroi').style.setProperty('--cor-g', g ? `var(${g.cor})` : 'var(--c-oxigenio)');
  contar($('ier'), e.indiceEventos);
  selo($('gravidade'), e.gravidade);
  const origem = $('selo-origem');
  origem.hidden = !estado.origem;
  origem.textContent = estado.origem?.demo ? 'Noite de exemplo · dados reais da base PhysioNet' : `Dispositivo ${estado.origem?.dispositivo ?? ''}`;
  desenharEscala($('escala'), e.indiceEventos, e.gravidade);
  $('frase').textContent = fraseResultado(e);
  $('orientacao').textContent = GRAVIDADE[e.gravidade]?.orientacao ?? '';
  $('avisos').replaceChildren(
    ...avisosAmigaveis(e).map((texto) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = texto;
      li.append(iconeEstado('alerta', '--atencao'), span);
      return li;
    }),
  );

  const comparacao = $('comparacao');
  comparacao.hidden = !noite.referencia || e.indiceEventos === null;
  if (!comparacao.hidden) desenharComparacao(comparacao, e.indiceEventos, e.gravidade, noite.referencia);

  const minutosBaixo = o.t90Pct === null ? null : (o.t90Pct / 100) * e.qualidade.horasValidas * 60;
  $('cartoes-noite').replaceChildren(
    metrica({
      icone: 'pausa',
      titulo: 'Pausas na respiração',
      valor: fmt(e.eventos.length, 0),
      unidade: 'na noite',
      detalhe: r.fonte
        ? `${fmt(r.apneias, 0)} paradas (apneias) e ${fmt(r.hipopneias, 0)} respirações fracas (hipopneias)`
        : 'quedas de oxigênio (sem dados de respiração)',
    }),
    metrica({
      icone: 'oxigenio',
      titulo: 'Oxigênio no sangue',
      valor: fmt(o.spo2Media, 0),
      unidade: '% em média',
      detalhe: `Ficou abaixo de 90% por ${duracao(minutosBaixo)}`,
    }),
    metrica({
      icone: 'coracao',
      titulo: 'Batimentos do coração',
      valor: fmt(c.fcMedia, 0),
      unidade: 'por minuto',
      detalhe: `Variaram de ${fmt(c.fcMinima, 0)} a ${fmt(c.fcMaxima, 0)} por minuto`,
    }),
    metrica({
      icone: 'respiracao',
      titulo: 'Respiração',
      valor: fmt(r.frMedia, 0),
      unidade: 'por minuto',
      detalhe: 'Média de respirações por minuto',
    }),
  );

  preencherMetricas(noite, e);
  preencherTabelaEventos(noite, e);
  preencherTabelaDados(noite, e);
  // A preferência fica guardada mesmo em noites sem exame; só não há o que mostrar nelas.
  $('chip-psg').hidden = !noite.referencia;
  $('mostrar-psg').checked = estado.mostrar.psg;
  marcarNoiteNaValidacao();
  $('baixar-pdf').disabled = false;
  estado.grupoNoite?.destruir();
  estado.grupoNoite = null;
  if (estado.aba === 'analise') desenharNoite();
}

function faixasDaNoite() {
  const { noite, escore } = estado;
  const faixas = [{ rotulo: 'Monitor', base: noite.inicioEpochS, eventos: escore.eventos }];
  if (estado.mostrar.psg && noite.referencia) {
    faixas.push({ rotulo: 'Exame', base: noite.inicioEpochS, eventos: noite.referencia.eventos });
  }
  return faixas;
}

// O gráfico da noite fica na aba Análise; desenhado com a aba escondida, ele nasceria com largura zero.
function desenharNoite() {
  if (!estado.noite || estado.grupoNoite || estado.aba !== 'analise') return;
  const s = estado.series;
  const faixas = faixasDaNoite();
  const sinais = [SINAIS.spo2(s)];
  if (estado.mostrar.fc) sinais.push(SINAIS.fc(s));
  if (estado.mostrar.fr) sinais.push(SINAIS.fr(s));
  const leitura = $('leitura-noite');
  atualizarLeitura(leitura, s, faixas, null);
  estado.grupoNoite = criarGrupo($('graficos-noite'), {
    x: s.x,
    faixas,
    sinais,
    aoMoverCursor: (idx) => atualizarLeitura(leitura, s, faixas, idx),
  });
}

function preencherMetricas(noite, e) {
  const o = e.oximetria;
  const r = e.respiracao;
  const c = e.cardiaco;
  const itens = [
    ['Índice de eventos respiratórios (IER)', `${fmt(e.indiceEventos)} /h`],
    ['Classificação (cortes da AASM)', GRAVIDADE[e.gravidade]?.rotulo ?? '—'],
  ];
  if (noite.referencia) itens.push(['IAH da polissonografia (referência)', `${fmt(noite.referencia.iah)} /h`]);
  itens.push(
    ['Apneias (pausa ≥ 10 s)', fmt(r.apneias, 0)],
    ['Hipopneias prováveis (queda ≥ 3% sem pausa)', fmt(r.hipopneias, 0)],
    [`IDO ${o.criterioPct}%`, `${fmt(o.ido)} /h (${fmt(o.dessaturacoes, 0)} dessaturações)`],
    ['T90 (tempo com SpO₂ < 90%)', `${fmt(o.t90Pct)}%`],
    ['SpO₂ média · mínima', `${fmt(o.spo2Media)}% · ${fmt(o.spo2Minima)}%`],
    ['FC média (mín.–máx.)', `${fmt(c.fcMedia, 0)} bpm (${fmt(c.fcMinima, 0)}–${fmt(c.fcMaxima, 0)})`],
    ['FR média', `${fmt(r.frMedia, 0)} rpm`],
    ['Eventos com resposta da FC (≥ 6 bpm)', `${fmt(c.eventosComRespostaPct, 0)}%`],
    ['Registro válido', `${fmt(e.qualidade.horasValidas)} h de ${fmt(e.qualidade.horasTotais)} h`],
  );
  if (e.alertas.length) itens.push(['Alertas do escore', e.alertas.join(' ')]);
  $('metricas').replaceChildren(
    ...itens.map(([termo, valor]) => {
      const div = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = termo;
      const dd = document.createElement('dd');
      dd.textContent = valor;
      div.append(dt, dd);
      return div;
    }),
  );
}

function preencherTabelaEventos(noite, escore) {
  $('n-eventos').textContent = escore.eventos.length;
  const corpo = document.createDocumentFragment();
  for (const ev of escore.eventos) {
    const tr = document.createElement('tr');
    const celulas = [
      hora(noite.inicioEpochS + ev.inicio, true),
      chaveCor(ev.tipo),
      fmt(ev.duracaoS, 0),
      ev.quedaSpo2 === null ? '—' : `${fmt(ev.quedaSpo2)} pontos`,
      ev.aumentoFc === null ? '—' : fmt(ev.aumentoFc, 0),
    ];
    celulas.forEach((conteudo, i) => {
      const td = document.createElement('td');
      if (i >= 2) td.className = 'num';
      td.append(conteudo);
      tr.append(td);
    });
    corpo.append(tr);
  }
  $('tabela-eventos').tBodies[0].replaceChildren(corpo);
}

function preencherTabelaDados(noite, escore) {
  const s = estado.series;
  const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const corpo = document.createDocumentFragment();
  const t0 = noite.amostras[0].t;
  const tFim = noite.amostras.at(-1).t;
  for (let de = t0; de <= tFim; de += 600) {
    const idx = [];
    noite.amostras.forEach((a, i) => {
      if (a.t >= de && a.t < de + 600) idx.push(i);
    });
    const vals = (serie) => idx.map((i) => serie[i]).filter((v) => v !== null);
    const spo2 = vals(s.spo2);
    const eventos = escore.eventos.filter((ev) => ev.inicio >= de && ev.inicio < de + 600).length;
    const tr = document.createElement('tr');
    const celulas = [
      `${hora(noite.inicioEpochS + de)}–${hora(noite.inicioEpochS + de + 600)}`,
      fmt(media(spo2)),
      spo2.length ? fmt(Math.min(...spo2)) : '—',
      fmt(media(vals(s.fc)), 0),
      fmt(media(vals(s.fr)), 0),
      fmt(eventos, 0),
    ];
    celulas.forEach((texto, i) => {
      const td = document.createElement('td');
      if (i) td.className = 'num';
      td.textContent = texto;
      tr.append(td);
    });
    corpo.append(tr);
  }
  $('tabela-dados').tBodies[0].replaceChildren(corpo);
}

// ---------- validação contra o exame de referência ----------

// Um evento do monitor coincide com um do exame se os intervalos se tocam. A queda de SpO₂ chega depois da pausa,
// então o fim do evento do exame é estendido pela mesma janela usada para associar dessaturação a apneia.
function coincide(monitor, exame) {
  return monitor.inicio <= exame.fim + PADROES.associacaoS && monitor.fim >= exame.inicio;
}

function compararComExame(noite, escore) {
  const ref = noite.referencia.eventos;
  const mon = escore.eventos;
  const encontrados = ref.filter((r) => mon.some((m) => coincide(m, r))).length;
  const confirmados = mon.filter((m) => ref.some((r) => coincide(m, r))).length;
  return {
    ier: escore.indiceEventos,
    iah: noite.referencia.iah,
    classeMonitor: escore.gravidade,
    classeExame: classificarGravidade(noite.referencia.iah),
    sensibilidade: ref.length ? (encontrados / ref.length) * 100 : null,
    vpp: mon.length ? (confirmados / mon.length) * 100 : null,
    encontrados,
    totalExame: ref.length,
    confirmados,
    totalMonitor: mon.length,
  };
}

async function noiteDemo(id) {
  if (!estado.noitesDemo.has(id)) estado.noitesDemo.set(id, carregarNoiteDemo(id));
  try {
    return await estado.noitesDemo.get(id);
  } catch (erro) {
    estado.noitesDemo.delete(id); // deixa tentar de novo na próxima vez
    throw erro;
  }
}

async function montarValidacao(indice) {
  const linhas = await Promise.all(
    indice.map(async (item, i) => {
      const noite = await noiteDemo(item.id);
      const escore = calcularEscore({ amostras: noite.amostras, respiracoes: noite.respiracoes });
      return { id: item.id, nome: `Exemplo ${i + 1}`, ...compararComExame(noite, escore) };
    }),
  );

  const iguais = linhas.filter((l) => l.classeMonitor === l.classeExame).length;
  const difMedia = linhas.reduce((s, l) => s + Math.abs(l.ier - l.iah), 0) / linhas.length;
  const total = (campo) => linhas.reduce((s, l) => s + l[campo], 0);
  $('resumo-validacao').textContent =
    `O monitor chegou à mesma classificação do exame em ${iguais} de ${linhas.length} noites. ` +
    `Em média, o índice do monitor ficou a ${fmt(difMedia)} eventos por hora do índice do exame. ` +
    `No total, encontrou ${fmt((total('encontrados') / total('totalExame')) * 100, 0)}% dos eventos marcados no exame, ` +
    `e ${fmt((total('confirmados') / total('totalMonitor')) * 100, 0)}% dos eventos do monitor também estavam no exame.`;

  const corpo = document.createDocumentFragment();
  for (const l of linhas) {
    const tr = document.createElement('tr');
    tr.dataset.id = l.id;
    const igual = l.classeMonitor === l.classeExame;
    const concordancia = document.createElement('span');
    concordancia.className = 'chave';
    concordancia.append(iconeEstado(igual ? 'ok' : 'alerta', igual ? '--bom' : '--atencao'), igual ? 'Mesma' : 'Diferente');
    const diferenca = l.ier - l.iah;
    const celulas = [
      [l.nome, ''],
      [fmt(l.ier), 'num'],
      [fmt(l.iah), 'num'],
      [`${diferenca > 0 ? '+' : diferenca < 0 ? '−' : ''}${fmt(Math.abs(diferenca))}`, 'num'],
      [GRAVIDADE[l.classeMonitor]?.rotulo ?? '—', ''],
      [GRAVIDADE[l.classeExame]?.rotulo ?? '—', ''],
      [concordancia, ''],
      [`${fmt(l.sensibilidade, 0)}% (${l.encontrados} de ${l.totalExame})`, 'num'],
      [`${fmt(l.vpp, 0)}% (${l.confirmados} de ${l.totalMonitor})`, 'num'],
    ];
    for (const [conteudo, classe] of celulas) {
      const td = document.createElement('td');
      if (classe) td.className = classe;
      td.append(conteudo);
      tr.append(td);
    }
    corpo.append(tr);
  }
  $('tabela-validacao').tBodies[0].replaceChildren(corpo);
  $('validacao-visual').replaceChildren(...linhas.map(parDeValidacao));
  $('cartao-validacao').hidden = estado.fonte !== 'demo';
  marcarNoiteNaValidacao();
}

// Um cartão por noite: barra do monitor, barra do exame e se a classificação bateu.
function parDeValidacao(l) {
  const el = document.createElement('div');
  el.className = 'par';
  el.dataset.id = l.id;
  const g = GRAVIDADE[l.classeExame];
  if (g) el.style.setProperty('--cor', `var(${g.cor})`);
  const topo = document.createElement('div');
  topo.className = 'par-topo';
  const nome = document.createElement('span');
  nome.textContent = l.nome;
  const classe = document.createElement('span');
  classe.className = 'par-classe';
  classe.textContent = g?.rotulo ?? '—';
  topo.append(nome, classe);
  const linha = (tipo, rotulo, valor) => {
    const div = document.createElement('div');
    div.className = `par-linha ${tipo}`;
    const t = document.createElement('span');
    t.textContent = rotulo;
    const barra = document.createElement('span');
    barra.className = 'par-barra';
    const i = document.createElement('i');
    i.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => (i.style.width = `${Math.min(100, (valor / 60) * 100)}%`)));
    barra.append(i);
    const b = document.createElement('b');
    b.textContent = fmt(valor);
    div.append(t, barra, b);
    return div;
  };
  const igual = l.classeMonitor === l.classeExame;
  const concorda = document.createElement('span');
  concorda.className = `concorda${igual ? '' : ' nao'}`;
  concorda.append(iconeEstado(igual ? 'ok' : 'alerta', igual ? '--bom' : '--atencao'), igual ? 'Mesma classificação' : 'Classificação diferente');
  el.append(topo, linha('monitor', 'RespirAI', l.ier), linha('exame', 'Exame (IAH)', l.iah), concorda);
  return el;
}

// Destaca na tabela e nos cartões a noite que está aberta no resumo.
function marcarNoiteNaValidacao() {
  const atual = estado.fonte === 'demo' ? $('noite-demo').value : null;
  for (const par of $('validacao-visual').children) {
    if (par.dataset.id === atual) par.setAttribute('aria-current', 'true');
    else par.removeAttribute('aria-current');
  }
  for (const tr of $('tabela-validacao').tBodies[0].rows) {
    if (tr.dataset.id === atual) tr.setAttribute('aria-current', 'true');
    else tr.removeAttribute('aria-current');
  }
}

// ---------- relatório em PDF ----------

function dadosDoRelatorio() {
  const { noite, escore, series, origem } = estado;
  let fonte;
  let dataNoite;
  let citacao = null;
  if (origem?.demo) {
    fonte = `Noite de exemplo, registro ${origem.demo.replace('ucddb', '')} da base UCD`;
    dataNoite = 'anonimizada pela base (horários reais)';
    citacao =
      "Noite de exemplo: St. Vincent's University Hospital / University College Dublin Sleep Apnea Database, PhysioNet, " +
      'doi:10.13026/C26C7D, licença ODC-By 1.0. A polissonografia de referência é a da própria base.';
  } else {
    const [ano, mes, dia] = origem.data.split('-');
    fonte = `Dispositivo ${origem.dispositivo}`;
    dataNoite = `${dia}/${mes}/${ano}`;
  }
  return {
    noite,
    escore,
    series,
    fonte,
    dataNoite,
    citacao,
    gravidade: GRAVIDADE,
    escala: ESCALA,
    nomesTipo: NOMES_TIPO,
    frase: fraseResultado(escore),
    avisos: avisosAmigaveis(escore),
    comparacao: noite.referencia ? compararComExame(noite, escore) : null,
  };
}

function nomeDoRelatorio() {
  const { origem } = estado;
  return origem?.demo
    ? `relatorio-apneia-registro-${origem.demo.replace('ucddb', '')}.pdf`
    : `relatorio-apneia-${origem.dispositivo}-${origem.data}.pdf`;
}

async function baixarRelatorio() {
  if (!estado.noite) return;
  const botao = $('baixar-pdf');
  const rotulo = botao.lastChild;
  botao.disabled = true;
  rotulo.textContent = 'Gerando o PDF…';
  try {
    const { gerarRelatorioPdf } = await import('./relatorio-pdf.js');
    const doc = await gerarRelatorioPdf(dadosDoRelatorio());
    doc.save(nomeDoRelatorio());
  } catch (erro) {
    mensagem(`Não consegui gerar o relatório: ${erro.message}`);
  } finally {
    rotulo.textContent = 'Baixar relatório (PDF)';
    botao.disabled = !estado.noite;
  }
}

function limparResumo(texto) {
  estado.noite = null;
  $('baixar-pdf').disabled = true;
  estado.grupoNoite?.destruir();
  estado.grupoNoite = null;
  $('periodo').textContent = '';
  $('periodo-analise').textContent = '';
  $('ier').textContent = '—';
  $('selo-origem').hidden = true;
  $('cartao-heroi').style.removeProperty('--cor-g');
  $('gravidade').replaceChildren();
  $('escala').replaceChildren();
  $('frase').textContent = texto;
  $('orientacao').textContent = '';
  $('avisos').replaceChildren();
  $('comparacao').hidden = true;
  $('cartoes-noite').replaceChildren();
  $('leitura-noite').textContent = '';
  $('metricas').replaceChildren();
  $('n-eventos').textContent = '0';
  $('tabela-eventos').tBodies[0].replaceChildren();
  $('tabela-dados').tBodies[0].replaceChildren();
}

// ---------- histórico de várias noites ----------

function dataCurta(dataIso) {
  const [, mes, dia] = dataIso.split('-');
  return `${dia}/${mes}`;
}

function dataLonga(dataIso) {
  const [ano, mes, dia] = dataIso.split('-');
  return `${dia}/${mes}/${ano}`;
}

async function resumoDemo(id) {
  const cache = estado.historico.resumosDemo;
  if (!cache.has(id)) {
    const noite = await noiteDemo(id);
    cache.set(id, resumirNoite(noite, calcularEscore({ amostras: noite.amostras, respiracoes: noite.respiracoes })));
  }
  return cache.get(id);
}

function estadoHistorico(texto) {
  $('estado-historico').hidden = !texto;
  $('estado-historico').textContent = texto ?? '';
}

function limparHistorico() {
  for (const g of estado.historico.graficos) g.destruir();
  estado.historico.graficos = [];
  $('conteudo-historico').hidden = true;
  $('historico-periodo').textContent = '';
  estadoHistorico(null);
}

async function carregarHistorico() {
  const h = estado.historico;
  const pedido = ++h.pedido;
  const atual = () => pedido === h.pedido && estado.aba === 'historico';
  limparHistorico();
  const demo = estado.fonte === 'demo';
  $('aviso-historico').hidden = !demo;

  if (demo) {
    if (!estado.indiceDemo) return;
    const slots = await Promise.all(
      estado.indiceDemo.map(async (item, i) => ({
        chave: item.id,
        rotulo: `Exemplo ${i + 1}`,
        titulo: `Exemplo ${i + 1} (registro ${item.id.replace('ucddb', '')})`,
        resumo: await resumoDemo(item.id),
      })),
    );
    if (atual()) mostrarHistorico(slots);
    return;
  }

  const dispositivo = $('dispositivo').value.trim();
  if (!estado.usuario || !dispositivo) {
    estadoHistorico(estado.usuario ? 'Informe o ID do dispositivo para ver o histórico.' : 'Entre para ver o histórico do seu dispositivo.');
    return;
  }
  const datas = datasDoPeriodo(Number($('periodo-historico').value));
  estadoHistorico('Procurando as noites gravadas…');
  try {
    const lista = await buscarHistoricoDispositivo({
      dispositivo,
      datas,
      fonte: estado.firebase,
      calcular: (noite) => resumirNoite(noite, calcularEscore({ amostras: noite.amostras, respiracoes: noite.respiracoes })),
      aoProgredir: (feitas, total) => {
        if (atual()) estadoHistorico(`Analisando as noites: ${feitas} de ${total}…`);
      },
      cancelado: () => !atual(),
    });
    if (!atual()) return;
    guardar('dispositivo', dispositivo);
    mostrarHistorico(
      lista.map(({ data, resumo }) => ({ chave: data, rotulo: dataCurta(data), titulo: `Noite de ${dataLonga(data)}`, resumo })),
    );
  } catch (erro) {
    if (atual()) estadoHistorico(erro.message);
  }
}

function dicaHistorico(slot) {
  const r = slot.resumo;
  const frag = document.createDocumentFragment();
  const linha = (texto, classe) => {
    const p = document.createElement('p');
    if (classe) p.className = classe;
    p.append(texto);
    frag.append(p);
    return p;
  };
  linha(slot.titulo, 'titulo-dica');
  if (!r) {
    linha('Sem leituras nesta noite.', 'secundario');
    return frag;
  }
  linha(`${fmt(r.ier)} eventos por hora`);
  const g = GRAVIDADE[r.gravidade];
  if (g) {
    const selo = document.createElement('span');
    selo.className = 'chave';
    selo.append(iconeEstado(g.icone, g.cor), g.titulo);
    linha(selo);
  }
  linha(`Abaixo de 90%: ${duracao(r.t90Min)} · IDO ${fmt(r.ido)} por hora`, 'secundario');
  linha(`${fmt(r.horasValidas)} h de leitura válida${r.suficiente ? '' : ' (menos de 4 h: fora da média)'}`, 'secundario');
  linha('Clique para abrir esta noite', 'secundario');
  return frag;
}

async function abrirNoiteDoHistorico(slot) {
  if (!slot.resumo) return;
  trocarAba('noite');
  window.scrollTo({ top: 0 });
  if (estado.fonte === 'demo') {
    $('noite-demo').value = slot.chave;
    await carregarDemo(slot.chave);
  } else {
    $('data-noite').value = slot.chave;
    await carregarNoiteFirebase();
  }
}

function mostrarHistorico(slots) {
  const h = estado.historico;
  const demo = estado.fonte === 'demo';
  const comDados = slots.filter((s) => s.resumo && s.resumo.ier !== null);
  if (!comDados.length) {
    estadoHistorico(`Nenhuma noite gravada nas últimas ${slots.length} noites para esse dispositivo.`);
    return;
  }
  estadoHistorico(null);
  $('conteudo-historico').hidden = false;
  $('historico-periodo').textContent = demo
    ? `${comDados.length} noites de exemplo`
    : `De ${dataLonga(slots[0].chave)} a ${dataLonga(slots.at(-1).chave)}`;

  // A média só usa noites com leitura suficiente, como nos exames de mais de uma noite.
  const validas = comDados.filter((s) => s.resumo.suficiente);
  const media = validas.length ? Math.round((validas.reduce((soma, s) => soma + s.resumo.ier, 0) / validas.length) * 10) / 10 : null;
  const classeMedia = classificarGravidade(media);
  const pior = comDados.reduce((a, b) => (b.resumo.ier > a.resumo.ier ? b : a));
  const melhor = comDados.reduce((a, b) => (b.resumo.ier < a.resumo.ier ? b : a));
  const t90 = validas.map((s) => s.resumo.t90Min).filter((v) => v !== null);
  const t90Medio = t90.length ? t90.reduce((a, b) => a + b, 0) / t90.length : null;
  const curtas = comDados.length - validas.length;

  $('cartoes-historico').replaceChildren(
    metrica({
      icone: 'lua',
      classe: 'noites',
      titulo: 'Noites gravadas',
      valor: fmt(comDados.length, 0),
      unidade: demo ? 'de exemplo' : `de ${slots.length}`,
      detalhe: curtas ? `${curtas} com menos de 4 h de leitura` : 'Todas com 4 h ou mais de leitura',
    }),
    metrica({
      icone: 'pausa',
      titulo: 'Média de eventos',
      valor: fmt(media),
      unidade: 'por hora',
      detalhe: classeMedia ? `${GRAVIDADE[classeMedia].titulo}, na média de ${validas.length} ${validas.length === 1 ? 'noite' : 'noites'}` : 'Nenhuma noite com 4 h de leitura',
    }),
    metrica({
      icone: 'tendencia',
      titulo: 'Noite com mais eventos',
      valor: fmt(pior.resumo.ier),
      unidade: 'por hora',
      detalhe: pior.titulo,
    }),
    metrica({
      icone: 'oxigenio',
      titulo: 'Oxigênio abaixo de 90%',
      valor: duracao(t90Medio),
      unidade: 'por noite',
      detalhe: 'Média das noites com 4 h ou mais de leitura',
    }),
  );

  const classes = new Set(validas.map((s) => s.resumo.gravidade));
  let frase = '';
  if (demo) {
    frase = `As noites vão de ${fmt(melhor.resumo.ier)} a ${fmt(pior.resumo.ier)} eventos por hora, uma em cada faixa de gravidade.`;
  } else if (validas.length >= 2) {
    frase =
      `Nas ${validas.length} noites com leitura suficiente, a média foi de ${fmt(media)} eventos por hora ` +
      `(${GRAVIDADE[classeMedia].titulo.toLowerCase()}). De uma noite para outra, variou de ${fmt(melhor.resumo.ier)} a ${fmt(pior.resumo.ier)} por hora.` +
      (classes.size > 1 ? ' Como as noites caíram em faixas diferentes, a média de várias noites é mais confiável que uma noite só.' : '');
  } else if (validas.length === 1) {
    frase = 'Só uma noite teve 4 h ou mais de leitura. Grave mais noites para ver a tendência: o resultado varia de uma noite para outra.';
  }
  $('frase-historico').textContent = frase;
  $('frase-historico').hidden = !frase;

  for (const g of h.graficos) g.destruir();
  const faixas = ESCALA.map(([nome, de, ate], i) => ({
    de,
    ate: i === ESCALA.length - 1 ? Infinity : ate,
    rotulo: GRAVIDADE[nome].rotulo,
    cor: GRAVIDADE[nome].cor,
  }));
  h.graficos = [
    desenharBarras($('grafico-tendencia'), {
      slots,
      valor: (r) => r.ier,
      corBarra: (r) => (GRAVIDADE[r.gravidade] ? `var(${GRAVIDADE[r.gravidade].cor})` : null),
      faixas,
      media,
      altura: 260,
      formatar: (v) => fmt(v),
      dica: dicaHistorico,
      aoEscolher: abrirNoiteDoHistorico,
    }),
    desenharBarras($('grafico-t90'), {
      slots,
      valor: (r) => (r.t90Min === null ? null : Math.round(r.t90Min)),
      altura: 170,
      formatar: (v) => fmt(v, 0),
      dica: dicaHistorico,
      aoEscolher: abrirNoiteDoHistorico,
    }),
  ];

  const corpo = document.createDocumentFragment();
  for (const s of [...comDados].reverse()) {
    const r = s.resumo;
    const tr = document.createElement('tr');
    const g = GRAVIDADE[r.gravidade];
    const classe = document.createElement('span');
    classe.className = 'chave';
    if (g) classe.append(iconeEstado(g.icone, g.cor), g.rotulo);
    const abrir = document.createElement('button');
    abrir.type = 'button';
    abrir.className = 'botao botao-fantasma botao-pequeno';
    abrir.textContent = 'Abrir';
    abrir.setAttribute('aria-label', `Abrir ${s.titulo}`);
    const celulas = [
      [s.titulo, ''],
      [`${fmt(r.horasValidas)} h${r.suficiente ? '' : ' (pouco)'}`, 'num'],
      [fmt(r.ier), 'num'],
      [classe, ''],
      [fmt(r.ido), 'num'],
      [duracao(r.t90Min), 'num'],
      [r.spo2Minima === null ? '—' : `${fmt(r.spo2Minima, 0)}%`, 'num'],
      [abrir, ''],
    ];
    for (const [conteudo, classeCelula] of celulas) {
      const td = document.createElement('td');
      if (classeCelula) td.className = classeCelula;
      td.append(conteudo);
      tr.append(td);
    }
    tr.addEventListener('click', () => abrirNoiteDoHistorico(s));
    corpo.append(tr);
  }
  $('tabela-historico').tBodies[0].replaceChildren(corpo);
}

// ---------- agora (ao vivo) ----------

function definirDadosVivo(dados) {
  const v = estado.vivo;
  v.dados = dados;
  v.series = dados ? montarSeries(dados) : null;
  v.escore = null;
  v.ultimoCalculo = 0;
  v.grupo?.destruir();
  v.grupo = null;
  if (dados && estado.fonte === 'demo') {
    $('posicao').max = String(dados.amostras.at(-1).t);
    v.posicao = Math.min(v.posicao, dados.amostras.at(-1).t);
  }
  desenharVivo();
}

// O que está acontecendo neste momento, em uma frase.
function situacaoAgora(d, s, fim, tAtual, demo) {
  if (!demo) {
    const atraso = Math.round((Date.now() - d.ultimaLeituraMs) / 1000);
    if (atraso > 15) return { estado: 'sem-sinal', icone: 'alerta', cor: '--atencao', texto: 'Sem novas leituras', detalhe: `Última há ${atraso} s. O dispositivo está ligado?` };
  }
  const spo2 = ultimoValido(s.spo2, fim, fim - 10);
  if (spo2 === null) return { estado: 'sem-sinal', icone: 'alerta', cor: '--atencao', texto: 'Sem leitura de oxigênio', detalhe: 'O sensor pode ter saído do dedo.' };
  if (d.respiracoes) {
    const i = ultimoAte(d.respiracoes, tAtual);
    const pausa = i >= 0 ? tAtual - d.respiracoes[i] : null;
    if (pausa !== null && pausa >= PADROES.pausaMinimaS && pausa <= PADROES.pausaMaximaS) {
      return { estado: 'pausa', icone: 'critico', cor: '--serie-2', texto: 'Pausa na respiração', detalhe: 'sem respirar há', contador: `${fmt(pausa, 0)} s` };
    }
  }
  if (spo2 < 90) return { estado: 'baixo', icone: 'alerta', cor: '--atencao', texto: 'Oxigênio baixo', detalhe: `${fmt(spo2)}%` };
  // Sem sensor de respiração não dá para afirmar que a pessoa está respirando normalmente.
  const semRespiracao = !d.respiracoes && ultimoValido(s.fr, fim, fim - 60) === null;
  if (semRespiracao) return { estado: 'ok', icone: 'ok', cor: '--bom', texto: 'Oxigênio normal', detalhe: 'respiração ainda não medida' };
  return { estado: 'ok', icone: 'ok', cor: '--bom', texto: 'Respirando normalmente', detalhe: '' };
}

function svgSinal(nome) {
  const el = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1.2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  for (const d of ICONES_SINAL[nome]) svgEl('path', { d }, el);
  if (nome === 'respiracao') svgEl('path', { d: 'M12 3v8.2M12 11.2l-1.6 1.7M12 11.2l1.6 1.7', fill: 'none', 'stroke-width': '1.8' }, el);
  return el;
}

// Os três sinais grandes são criados uma vez; depois só valores, classes e o ritmo das animações mudam.
function criarSinaisVivo() {
  const sinais = {};
  const nomes = [
    ['oxigenio', 'Oxigênio no sangue', '%'],
    ['coracao', 'Batimentos', 'bpm'],
    ['respiracao', 'Respiração', 'por min'],
  ];
  $('cartoes-vivo').replaceChildren(
    ...nomes.map(([chave, titulo, unidade]) => {
      const el = document.createElement('div');
      el.className = `sinal ${chave}`;
      const topo = document.createElement('div');
      topo.className = 'sinal-topo';
      const nome = document.createElement('span');
      nome.className = 'sinal-nome';
      nome.textContent = titulo;
      const icone = document.createElement('span');
      icone.className = 'sinal-icone';
      icone.append(svgSinal(chave));
      topo.append(nome, icone);
      const valor = document.createElement('p');
      valor.className = 'sinal-valor';
      const numero = document.createElement('span');
      const u = document.createElement('small');
      u.textContent = unidade;
      valor.append(numero, u);
      const detalhe = document.createElement('p');
      detalhe.className = 'sinal-detalhe';
      const faisca = svgEl('svg', { class: 'faisca', viewBox: '0 0 120 40', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
      const area = svgEl('path', { class: 'area' }, faisca);
      const linha = svgEl('path', { class: 'linha' }, faisca);
      el.append(topo, valor, detalhe, faisca);
      sinais[chave] = { el, numero, detalhe, area, linha };
      return el;
    }),
  );
  return sinais;
}

// Mini gráfico dos últimos 2 minutos de um sinal.
function desenharFaisca(sinal, valores) {
  const pontos = valores.map((v, i) => [i, v]).filter(([, v]) => v !== null);
  if (pontos.length < 2) {
    sinal.linha.setAttribute('d', '');
    sinal.area.setAttribute('d', '');
    return;
  }
  const vs = pontos.map(([, v]) => v);
  let min = Math.min(...vs);
  let max = Math.max(...vs);
  if (max - min < 4) {
    const meio = (max + min) / 2;
    min = meio - 2;
    max = meio + 2;
  }
  const n = Math.max(1, valores.length - 1);
  const xy = pontos.map(([i, v]) => [(i / n) * 120, 36 - ((v - min) / (max - min)) * 32]);
  const d = xy.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  sinal.linha.setAttribute('d', d);
  sinal.area.setAttribute('d', `${d}L${xy.at(-1)[0].toFixed(1)} 40L${xy[0][0].toFixed(1)} 40Z`);
}

function atualizarSinal(sinal, valor, { detalhe = '', periodo = null, parado = false } = {}) {
  sinal.numero.textContent = fmt(valor, 0);
  sinal.detalhe.textContent = detalhe;
  sinal.el.classList.toggle('sem-valor', valor === null);
  sinal.el.classList.toggle('parado', parado);
  if (periodo) sinal.el.style.setProperty('--periodo', `${periodo.toFixed(2)}s`);
}

function desenharVivo() {
  const v = estado.vivo;
  const d = v.dados;
  if (estado.aba !== 'vivo') return;
  if (!d) {
    $('estado-agora').replaceChildren();
    $('cartoes-vivo').replaceChildren();
    v.sinais = null;
    $('resumo-vivo').replaceChildren();
    $('feed').replaceChildren();
    v.chaveFeed = '';
    $('leitura-vivo').textContent = '';
    return;
  }
  const s = v.series;
  const demo = estado.fonte === 'demo';
  const fim = demo ? Math.max(0, ultimoAte(d.amostras, v.posicao, (a) => a.t)) : d.amostras.length - 1;
  const tAtual = d.amostras[fim].t;
  const ini = Math.max(0, ultimoAte(d.amostras, tAtual - JANELA_VIVO_S, (a) => a.t));

  const agora = performance.now();
  if (agora - v.ultimoCalculo > 1000) {
    v.ultimoCalculo = agora;
    v.escore =
      fim >= 1
        ? calcularEscore({ amostras: d.amostras.slice(0, fim + 1), respiracoes: d.respiracoes?.filter((t) => t <= tAtual) })
        : null;
  }
  const e = v.escore;

  const sit = situacaoAgora(d, s, fim, tAtual, demo);
  const banner = $('estado-agora');
  if (banner.dataset.estado !== sit.estado) banner.dataset.estado = sit.estado;
  const textoSit = document.createElement('span');
  textoSit.textContent = sit.texto;
  const detalheSit = document.createElement('span');
  detalheSit.className = 'detalhe';
  detalheSit.textContent = sit.detalhe;
  const partes = [iconeEstado(sit.icone, sit.cor), textoSit, detalheSit];
  if (sit.contador) {
    const contador = document.createElement('span');
    contador.className = 'contador';
    contador.textContent = sit.contador;
    partes.push(contador);
  }
  banner.replaceChildren(...partes);

  let frMinuto = null;
  if (d.respiracoes && tAtual - d.amostras[0].t >= 60) {
    frMinuto = d.respiracoes.filter((t) => t > tAtual - 60 && t <= tAtual).length;
  } else if (!d.respiracoes) {
    frMinuto = ultimoValido(s.fr, fim, ini);
  }
  v.sinais ??= criarSinaisVivo();
  const de = Math.max(0, fim - 119);
  const spo2Agora = ultimoValido(s.spo2, fim, fim - 10);
  const fcAgora = ultimoValido(s.fc, fim, fim - 10);
  atualizarSinal(v.sinais.oxigenio, spo2Agora, { detalhe: spo2Agora !== null && spo2Agora < 90 ? 'abaixo de 90%' : 'normal: 95% ou mais' });
  atualizarSinal(v.sinais.coracao, fcAgora, { detalhe: 'batimentos por minuto', periodo: fcAgora ? 60 / fcAgora : null });
  atualizarSinal(v.sinais.respiracao, frMinuto, {
    detalhe: sit.estado === 'pausa' ? 'respiração parada' : 'respirações no último minuto',
    periodo: frMinuto ? Math.min(10, Math.max(1.5, 60 / frMinuto)) : null,
    parado: sit.estado === 'pausa',
  });
  desenharFaisca(v.sinais.oxigenio, s.spo2.slice(de, fim + 1));
  desenharFaisca(v.sinais.coracao, s.fc.slice(de, fim + 1));
  desenharFaisca(v.sinais.respiracao, s.fr.slice(de, fim + 1));

  const placar = [];
  const item = (valor, texto, classe = '') => {
    const span = document.createElement('span');
    span.className = `item ${classe}`;
    const b = document.createElement('b');
    b.textContent = valor;
    span.append(b, texto);
    placar.push(span);
  };
  if (e) {
    item(fmt(e.eventos.length, 0), e.eventos.length === 1 ? 'pausa esta noite' : 'pausas esta noite');
    if (e.indiceEventos !== null) {
      item(fmt(Math.round(e.indiceEventos), 0), `por hora · ${GRAVIDADE[e.gravidade]?.rotulo.toLowerCase() ?? '—'} (parcial)`, 'parcial');
    }
    item(duracao((tAtual - d.amostras[0].t) / 60), 'de gravação');
  }
  $('resumo-vivo').replaceChildren(...placar);

  $('relogio').textContent = hora(d.inicioEpochS + tAtual, true);
  if (demo) $('posicao').value = String(Math.round(v.posicao));

  const janela = {
    x: s.x.slice(ini, fim + 1),
    spo2: s.spo2.slice(ini, fim + 1),
    fc: s.fc.slice(ini, fim + 1),
    fr: s.fr.slice(ini, fim + 1),
  };
  v.janela = janela;
  // A janela tem sempre 10 min, mesmo no começo da gravação, para o eixo de tempo não encolher.
  const xAtual = d.inicioEpochS + tAtual;
  v.faixaX = [xAtual - JANELA_VIVO_S, xAtual];
  v.faixas = [{ rotulo: 'Monitor', base: d.inicioEpochS, eventos: e?.eventos ?? [] }];
  const valores = v.mostrarFc ? [janela.spo2, janela.fc] : [janela.spo2];
  if (!v.grupo) {
    const leitura = $('leitura-vivo');
    atualizarLeitura(leitura, janela, v.faixas, null);
    v.grupo = criarGrupo($('graficos-vivo'), {
      x: janela.x,
      faixas: v.faixas,
      sinais: v.mostrarFc ? [SINAIS.spo2(janela), SINAIS.fc(janela)] : [SINAIS.spo2(janela)],
      zoom: false,
      faixaX: () => v.faixaX,
      aoMoverCursor: (idx) => atualizarLeitura(leitura, v.janela, v.faixas, idx),
    });
  } else {
    v.grupo.atualizar(janela.x, valores, v.faixas);
  }

  // O feed só é refeito quando muda, para a animação de entrada valer só para a pausa nova.
  const recentes = (e?.eventos ?? []).slice(-8).reverse();
  const chave = `${d.inicioEpochS}:${recentes.map((ev) => ev.inicio).join(',')}`;
  if (chave === v.chaveFeed) return;
  v.chaveFeed = chave;
  if (!recentes.length) {
    const li = document.createElement('li');
    li.className = 'vazio';
    li.textContent = 'Nenhuma pausa até agora.';
    $('feed').replaceChildren(li);
  } else {
    $('feed').replaceChildren(
      ...recentes.map((ev) => {
        const li = document.createElement('li');
        const h = document.createElement('span');
        h.className = 'hora';
        h.textContent = hora(d.inicioEpochS + ev.inicio);
        const info = document.createElement('span');
        info.className = 'info';
        info.textContent = `${fmt(ev.duracaoS, 0)} s${ev.quedaSpo2 === null ? '' : ` · oxigênio caiu ${fmt(ev.quedaSpo2, 0)} pontos`}`;
        li.append(h, chaveCor(ev.tipo, NOMES_AMIGAVEIS[ev.tipo]), info);
        return li;
      }),
    );
  }
}

function tocar(sim) {
  estado.vivo.tocando = sim;
  $('tocar').textContent = sim ? 'Pausar' : 'Reproduzir';
}

function escolherVelocidade(vel) {
  estado.vivo.velocidade = vel;
  for (const b of $('velocidades').children) b.setAttribute('aria-pressed', String(Number(b.dataset.vel) === vel));
}

setInterval(() => {
  const v = estado.vivo;
  if (!v.tocando || !v.dados || estado.fonte !== 'demo') return;
  const max = v.dados.amostras.at(-1).t;
  v.posicao = Math.min(v.posicao + 0.25 * v.velocidade, max);
  if (v.posicao >= max) tocar(false);
  desenharVivo();
}, 250);

async function iniciarVivoFirebase() {
  pararVivoFirebase();
  const dispositivo = $('dispositivo').value.trim();
  if (!estado.usuario || !dispositivo || estado.aba !== 'vivo') return;
  $('estado-agora').textContent = 'Conectando ao dispositivo…';
  try {
    estado.vivo.pararEscuta = await estado.firebase.ouvirAoVivo(
      dispositivo,
      (dados) => {
        if (!dados) $('estado-agora').textContent = 'Nenhuma leitura recebida desse dispositivo ainda.';
        definirDadosVivo(dados);
      },
      (erro) => mensagem(erro.message),
    );
  } catch (erro) {
    mensagem(erro.message);
  }
}

function pararVivoFirebase() {
  estado.vivo.pararEscuta?.();
  estado.vivo.pararEscuta = null;
}

// ---------- navegação, fonte e tema ----------

// Campos do topo que fazem sentido em cada tela: o histórico não escolhe uma noite só.
function ajustarSeletor() {
  const historico = estado.aba === 'historico';
  const demo = estado.fonte === 'demo';
  document.querySelector('.seletor').hidden = estado.aba === 'como';
  $('campo-demo').hidden = !demo || historico;
  $('campo-data').hidden = historico;
  $('carregar').hidden = historico;
  $('campo-periodo').hidden = demo;
}

function trocarAba(aba) {
  estado.aba = aba;
  for (const [nome, tela] of [['noite', 'tela-noite'], ['analise', 'tela-analise'], ['vivo', 'tela-vivo'], ['historico', 'tela-historico'], ['como', 'tela-como']]) {
    $(`aba-${nome}`).setAttribute('aria-selected', String(nome === aba));
    $(tela).hidden = nome !== aba;
  }
  ajustarSeletor();
  if (aba === 'noite' || aba === 'analise') {
    tocar(false);
    pararVivoFirebase();
    desenharNoite();
  } else if (aba === 'historico') {
    tocar(false);
    pararVivoFirebase();
    carregarHistorico();
  } else if (aba === 'como') {
    tocar(false);
    pararVivoFirebase();
  } else if (estado.fonte === 'demo') {
    if (estado.vivo.dados !== estado.noite) definirDadosVivo(estado.noite);
    else desenharVivo();
  } else {
    iniciarVivoFirebase();
  }
}

async function carregarDemo(id) {
  document.querySelector('main').classList.add('carregando');
  try {
    const noite = await noiteDemo(id);
    estado.origem = { demo: id };
    mostrarNoite(noite);
    estado.vivo.posicao = 0;
    if (estado.aba === 'vivo') definirDadosVivo(noite);
    mensagem(null);
  } catch (erro) {
    mensagem(erro.message);
  } finally {
    document.querySelector('main').classList.remove('carregando');
  }
}

async function trocarFonte(fonte) {
  estado.fonte = fonte;
  const demo = fonte === 'demo';
  ajustarSeletor();
  $('controles-demo').hidden = !demo;
  tocar(false);
  pararVivoFirebase();
  definirDadosVivo(null);
  mensagem(null);

  // A validação só existe para as noites de exemplo, que têm o exame de referência.
  $('cartao-validacao').hidden = !demo || !$('tabela-validacao').tBodies[0].rows.length;
  if (demo) {
    $('campos-firebase').hidden = true;
    $('login').hidden = true;
    await carregarDemo($('noite-demo').value);
    if (estado.aba === 'historico') carregarHistorico();
    return;
  }
  // Descarta um histórico de exemplo ainda carregando; o observador de login abaixo recarrega o do dispositivo.
  estado.historico.pedido++;
  limparHistorico();

  limparResumo('Escolha o dispositivo e a noite e toque em "Ver noite".');
  try {
    estado.firebase ??= await import('./fonte-firebase.js');
    await estado.firebase.observarLogin((usuario) => {
      estado.usuario = usuario;
      if (estado.fonte !== 'firebase') return;
      $('login').hidden = Boolean(usuario);
      $('campos-firebase').hidden = !usuario;
      if (usuario && estado.aba === 'vivo') iniciarVivoFirebase();
      if (estado.aba === 'historico') carregarHistorico();
    });
  } catch (erro) {
    mensagem(`Não consegui carregar o Firebase: ${erro.message}`);
  }
}

async function carregarNoiteFirebase() {
  const dispositivo = $('dispositivo').value.trim();
  const data = $('data-noite').value;
  if (!dispositivo || !data) {
    mensagem('Informe o ID do dispositivo e a data da noite.');
    return;
  }
  guardar('dispositivo', dispositivo);
  document.querySelector('main').classList.add('carregando');
  try {
    const noite = await estado.firebase.carregarNoite(dispositivo, data);
    estado.origem = { dispositivo, data };
    mostrarNoite(noite);
    mensagem(null);
    if (estado.aba === 'vivo') iniciarVivoFirebase();
  } catch (erro) {
    mensagem(erro.message);
  } finally {
    document.querySelector('main').classList.remove('carregando');
  }
}

function aplicarTema(tema) {
  if (tema === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', tema);
  const nome = TEMAS.find(([t]) => t === tema)[1];
  const botao = $('tema');
  botao.replaceChildren(svg(tema === 'auto' ? 'auto' : tema === 'light' ? 'sol' : 'lua'));
  botao.setAttribute('aria-label', `Tema: ${nome}. Trocar tema`);
  botao.title = `Tema: ${nome}`;
  guardar('tema', tema);
  redesenharTudo();
}

// As cores entram no canvas na criação; mudar o tema exige recriar os gráficos.
function redesenharTudo() {
  estado.grupoNoite?.destruir();
  estado.grupoNoite = null;
  estado.vivo.grupo?.destruir();
  estado.vivo.grupo = null;
  if (estado.aba === 'analise') desenharNoite();
  else desenharVivo();
  if (estado.noite) preencherTabelaEventos(estado.noite, estado.escore);
}

// O que o Modo Feira pode comandar no painel.
let avisarDemoPronto;
const demoPronto = new Promise((ok) => (avisarDemoPronto = ok));
const feira = criarModoFeira({
  indiceDemo: () => estado.indiceDemo,
  trocarAba,
  tocar,
  escolherVelocidade,
  async garantirDemo() {
    await demoPronto;
    if (estado.fonte !== 'demo') {
      $('fonte').value = 'demo';
      await trocarFonte('demo');
    }
  },
  async selecionarDemo(id) {
    if ($('noite-demo').value === id && estado.origem?.demo === id) return;
    $('noite-demo').value = id;
    await carregarDemo(id);
  },
  // Começa 3 s antes da pausa (apneia) mais longa da noite: em tempo real, o aviso aparece com o contador correndo.
  irParaTrechoComEventos() {
    const v = estado.vivo;
    const apneias = (estado.escore?.eventos ?? []).filter((ev) => ev.tipo === 'apneia' && ev.inicio > 300);
    const alvo = apneias.reduce((a, b) => (!a || b.duracaoS > a.duracaoS ? b : a), null);
    v.posicao = alvo ? Math.max(0, alvo.inicio - 3) : 0;
    v.ultimoCalculo = 0;
    desenharVivo();
  },
});

async function iniciar() {
  $('logo').append(svg('onda', 28));
  for (const el of document.querySelectorAll('[data-icone]')) el.append(svg(el.dataset.icone, 26));
  $('baixar-pdf').prepend(svg('baixar', 18));
  $('baixar-pdf').addEventListener('click', baixarRelatorio);
  let tema = lembrar('tema') ?? 'dark';
  if (!TEMAS.some(([t]) => t === tema)) tema = 'dark';
  aplicarTema(tema);
  $('tema').addEventListener('click', () => {
    const atual = document.documentElement.getAttribute('data-theme') ?? 'auto';
    const i = TEMAS.findIndex(([t]) => t === atual);
    aplicarTema(TEMAS[(i + 1) % TEMAS.length][0]);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!document.documentElement.hasAttribute('data-theme')) redesenharTudo();
  });

  $('aba-noite').addEventListener('click', () => trocarAba('noite'));
  $('aba-analise').addEventListener('click', () => trocarAba('analise'));
  $('ir-analise').addEventListener('click', () => {
    trocarAba('analise');
    window.scrollTo({ top: 0 });
  });
  $('aba-vivo').addEventListener('click', () => trocarAba('vivo'));
  $('aba-historico').addEventListener('click', () => trocarAba('historico'));
  $('aba-como').addEventListener('click', () => trocarAba('como'));
  $('botao-feira').addEventListener('click', () => feira.entrar({ telaCheia: true }));
  if (new URLSearchParams(location.search).has('feira')) feira.entrar();
  $('periodo-historico').addEventListener('change', carregarHistorico);
  // Trocar o ID do dispositivo troca também a escuta ao vivo; senão a aba Agora seguiria mostrando o ID anterior.
  $('dispositivo').addEventListener('change', () => {
    const dispositivo = $('dispositivo').value.trim();
    if (dispositivo) guardar('dispositivo', dispositivo);
    if (estado.aba === 'historico') carregarHistorico();
    if (estado.aba === 'vivo' && estado.fonte === 'firebase') {
      pararVivoFirebase();
      definirDadosVivo(null);
      iniciarVivoFirebase();
    }
  });
  $('fonte').addEventListener('change', (ev) => trocarFonte(ev.target.value));
  $('noite-demo').addEventListener('change', (ev) => carregarDemo(ev.target.value));
  $('carregar').addEventListener('click', carregarNoiteFirebase);
  $('sair').addEventListener('click', async () => {
    pararVivoFirebase();
    await estado.firebase?.sair();
    limparResumo('Você saiu. Entre de novo para ver os dados do dispositivo.');
  });
  $('login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    mensagem('Entrando…');
    try {
      await estado.firebase.entrar($('email').value.trim(), $('senha').value);
      $('senha').value = '';
      mensagem(null);
    } catch (erro) {
      mensagem(erro.message);
    }
  });

  for (const [id, chave] of [['mostrar-fc', 'fc'], ['mostrar-fr', 'fr'], ['mostrar-psg', 'psg']]) {
    $(id).addEventListener('change', (ev) => {
      estado.mostrar[chave] = ev.target.checked;
      estado.grupoNoite?.destruir();
      estado.grupoNoite = null;
      desenharNoite();
    });
  }
  $('mostrar-fc-vivo').addEventListener('change', (ev) => {
    estado.vivo.mostrarFc = ev.target.checked;
    estado.vivo.grupo?.destruir();
    estado.vivo.grupo = null;
    desenharVivo();
  });

  $('velocidades').replaceChildren(
    ...VELOCIDADES.map((vel) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.vel = String(vel);
      b.textContent = `${vel}×`;
      b.addEventListener('click', () => escolherVelocidade(vel));
      return b;
    }),
  );
  escolherVelocidade(estado.vivo.velocidade);
  $('tocar').addEventListener('click', () => {
    const v = estado.vivo;
    if (v.dados && v.posicao >= v.dados.amostras.at(-1).t) v.posicao = 0;
    tocar(!v.tocando);
  });
  $('posicao').addEventListener('input', (ev) => {
    estado.vivo.posicao = Number(ev.target.value);
    estado.vivo.ultimoCalculo = 0;
    desenharVivo();
  });

  $('dispositivo').value = lembrar('dispositivo') ?? '';
  const ontem = new Date(Date.now() - 864e5);
  $('data-noite').value = `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, '0')}-${String(ontem.getDate()).padStart(2, '0')}`;

  try {
    const indice = await carregarIndiceDemo();
    estado.indiceDemo = indice;
    $('noite-demo').replaceChildren(
      ...indice.map((n, i) => {
        const op = document.createElement('option');
        op.value = n.id;
        op.textContent = `Exemplo ${i + 1}: ${GRAVIDADE[n.gravidade].titulo.toLowerCase()}`;
        return op;
      }),
    );
    const padrao = indice.find((n) => n.gravidade === 'moderada') ?? indice[0];
    $('noite-demo').value = padrao.id;
    await carregarDemo(padrao.id);
    montarValidacao(indice).catch((erro) => mensagem(`Não consegui montar a comparação com o exame: ${erro.message}`));
  } catch (erro) {
    mensagem(erro.message);
  }
  avisarDemoPronto();
}

iniciar();
