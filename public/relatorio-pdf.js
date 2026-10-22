// Relatório da noite em PDF, gerado no próprio navegador com jsPDF (e AutoTable para as tabelas).
// As bibliotecas (cópias locais em vendor/) só são carregadas quando alguém pede o relatório. O PDF usa sempre as cores do tema claro,
// porque é feito para imprimir; os gráficos são desenhados em vetor, não copiados da tela.

const BIBLIOTECAS = [
  [
    'vendor/jspdf.umd.min.js',
    'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk',
  ],
  [
    'vendor/jspdf.plugin.autotable.min.js',
    'sha384-fCAW/rDWORTbQXSiB7mOg0QtQ5c+r0f544y6XoKjuVva0nMBlCpNUjiFeG5iMdS3',
  ],
];

const COR = {
  texto: '#0b0b0b',
  texto2: '#52514e',
  mudo: '#898781',
  grade: '#e1e0d9',
  eixo: '#c3c2b7',
  lavagem: '#f1f1ee',
  branco: '#ffffff',
  linha: '#2a78d6',
  apneia: '#eb6834',
  hipopneia: '#1baf7a',
  '--bom': '#0ca30c',
  '--atencao': '#fab219',
  '--serio': '#ec835a',
  '--critico': '#d03b3b',
};

const A4 = { largura: 210, altura: 297 };
const MARGEM = 16;
const LARGURA = A4.largura - 2 * MARGEM;
const FIM_UTIL = A4.altura - 20; // abaixo disso fica o rodapé
const EIXO_Y = 12; // espaço à esquerda dos gráficos para os rótulos do eixo Y
const PT = 0.3528; // 1 ponto tipográfico em mm

let carregando = null;

function carregarBibliotecas() {
  carregando ??= (async () => {
    for (const [src, integrity] of BIBLIOTECAS) {
      await new Promise((ok, falha) => {
        const s = document.createElement('script');
        s.src = src;
        s.integrity = integrity;
        s.crossOrigin = 'anonymous';
        s.onload = ok;
        s.onerror = () => falha(new Error('não consegui carregar o gerador de PDF.'));
        document.head.append(s);
      });
    }
    return window.jspdf.jsPDF;
  })().catch((erro) => {
    carregando = null;
    throw erro;
  });
  return carregando;
}

// As fontes padrão do PDF só têm o alfabeto latino básico (WinAnsi): troca o que ficaria ilegível.
const TROCAS = [
  [/₂/g, '2'],
  [/≥/g, '>='],
  [/≤/g, '<='],
  [/[−‑]/g, '-'],
  [/[  ]/g, ' '],
];

function limpar(texto) {
  let s = String(texto ?? '');
  for (const [de, para] of TROCAS) s = s.replace(de, para);
  return s;
}

function fmt(x, casas = 1) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return x.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

function fmtFixo(x, casas = 1) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return x.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function hora(epochS) {
  return new Date(epochS * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function horaSeg(epochS) {
  return new Date(epochS * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function duracao(minutos) {
  if (minutos === null || Number.isNaN(minutos)) return '—';
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

function misturar(hex, fracao, fundo = '#ffffff') {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [rgb(hex), rgb(fundo)];
  return `#${a.map((v, i) => Math.round(b[i] + (v - b[i]) * fracao).toString(16).padStart(2, '0')).join('')}`;
}

function marcasY(min, max) {
  const passo = [1, 2, 5, 10, 20, 25, 50, 100].find((p) => (max - min) / p <= 5) ?? 100;
  const marcas = [];
  for (let v = Math.ceil(min / passo) * passo; v <= max + 1e-9; v += passo) marcas.push(v);
  return marcas;
}

// Horas cheias dentro da noite (a cada 2 h quando a gravação passa de 10 h).
function marcasHora(tIni, tFim) {
  const passo = tFim - tIni > 10 * 3600 ? 7200 : 3600;
  const d = new Date(tIni * 1000);
  d.setMinutes(0, 0, 0);
  let t = d.getTime() / 1000;
  if (t < tIni) t += 3600;
  const marcas = [];
  for (; t <= tFim; t += passo) marcas.push(t);
  return marcas;
}

// Resume a série em `n` intervalos iguais: mínimo, máximo e média de cada um (null quando não há leitura).
function agrupar(x, valores, n, tIni, tFim) {
  const passo = (tFim - tIni) / n;
  const grupos = Array.from({ length: n }, () => ({ min: Infinity, max: -Infinity, soma: 0, n: 0 }));
  for (let i = 0; i < x.length; i++) {
    const v = valores[i];
    if (v === null || v === undefined) continue;
    const g = grupos[Math.min(n - 1, Math.max(0, Math.floor((x[i] - tIni) / passo)))];
    g.min = Math.min(g.min, v);
    g.max = Math.max(g.max, v);
    g.soma += v;
    g.n++;
  }
  return grupos.map((g) => (g.n ? { min: g.min, max: g.max, media: g.soma / g.n } : null));
}

function trechos(grupos) {
  const lista = [];
  let atual = null;
  grupos.forEach((g, i) => {
    if (g) {
      atual ??= [];
      atual.push([i, g]);
    } else if (atual) {
      lista.push(atual);
      atual = null;
    }
  });
  if (atual) lista.push(atual);
  return lista;
}

// d: { noite, escore, series, gravidade, escala, nomesTipo, frase, avisos, comparacao, fonte, dataNoite, citacao }
export async function gerarRelatorioPdf(d) {
  const jsPDF = await carregarBibliotecas();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const { noite, escore: e, series: s } = d;
  const o = e.oximetria;
  const r = e.respiracao;
  const c = e.cardiaco;
  const tIni = s.x[0];
  const tFim = s.x.at(-1);
  const horas = marcasHora(tIni, tFim);
  const periodoTxt = `das ${hora(tIni)} às ${hora(tFim)}`;
  const g = d.gravidade[e.gravidade];
  let y = MARGEM;

  doc.setProperties({
    title: 'Relatório de triagem de apneia do sono',
    subject: limpar(`${d.fonte}, ${periodoTxt}`),
    creator: 'Monitor de Apneia (TCC de Mecatrônica)',
  });
  doc.setLineCap('round');

  // ---------- peças básicas ----------

  function escrever(texto, x, yy, { tamanho = 10, cor = COR.texto, negrito = false, alinhar = 'left', largura } = {}) {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal');
    doc.setFontSize(tamanho);
    doc.setTextColor(cor);
    const linhas = largura ? doc.splitTextToSize(limpar(texto), largura) : [limpar(texto)];
    doc.text(linhas, x, yy, { align: alinhar, baseline: 'top', lineHeightFactor: 1.3 });
    return linhas.length * tamanho * PT * 1.3;
  }

  function alturaTexto(texto, tamanho, largura, negrito = false) {
    doc.setFont('helvetica', negrito ? 'bold' : 'normal');
    doc.setFontSize(tamanho);
    return doc.splitTextToSize(limpar(texto), largura).length * tamanho * PT * 1.3;
  }

  function novaPagina() {
    doc.addPage();
    y = MARGEM + 8;
  }

  function garantir(altura) {
    if (y + altura > FIM_UTIL) novaPagina();
  }

  function titulo(texto, subtitulo) {
    garantir(22);
    escrever(texto, MARGEM, y, { tamanho: 12, negrito: true });
    y += 6.5;
    if (subtitulo) y += escrever(subtitulo, MARGEM, y, { tamanho: 8.5, cor: COR.texto2, largura: LARGURA });
    y += 3;
  }

  function tabela(opcoes) {
    doc.autoTable({
      startY: y,
      margin: { left: MARGEM, right: MARGEM, top: MARGEM + 8, bottom: A4.altura - FIM_UTIL },
      theme: 'plain',
      ...opcoes,
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        textColor: COR.texto,
        cellPadding: { top: 1.7, bottom: 1.7, left: 2, right: 2 },
        lineColor: COR.grade,
        lineWidth: { bottom: 0.2 },
        valign: 'middle',
        ...opcoes.styles,
      },
      headStyles: { fontStyle: 'bold', textColor: COR.texto2, fillColor: COR.lavagem, fontSize: 8, ...opcoes.headStyles },
      // O cabeçalho acompanha o alinhamento da coluna (números à direita).
      didParseCell: (dado) => {
        const alinhar = opcoes.columnStyles?.[dado.column.index]?.halign;
        if (dado.section === 'head' && alinhar) dado.cell.styles.halign = alinhar;
      },
      head: opcoes.head?.map((linha) => linha.map(limpar)),
      body: opcoes.body.map((linha) => linha.map((celula) => (typeof celula === 'object' && celula ? { ...celula, content: limpar(celula.content) } : limpar(celula)))),
    });
    y = doc.lastAutoTable.finalY + 7;
  }

  function iconeEstado(tipo, cor, cx, cy, raio) {
    doc.setFillColor(cor);
    if (tipo === 'ok') doc.circle(cx, cy, raio, 'F');
    else if (tipo === 'alerta') doc.triangle(cx, cy - raio * 1.05, cx + raio * 1.1, cy + raio * 0.85, cx - raio * 1.1, cy + raio * 0.85, 'F');
    else doc.lines([[raio, raio], [-raio, raio], [-raio, -raio]], cx, cy - raio, [1, 1], 'F', true);
    doc.setDrawColor(tipo === 'alerta' ? COR.texto : COR.branco);
    doc.setLineWidth(raio * 0.26);
    if (tipo === 'ok') {
      doc.lines([[raio * 0.32, raio * 0.32], [raio * 0.62, -raio * 0.62]], cx - raio * 0.5, cy, [1, 1], 'S');
    } else {
      doc.line(cx, cy - raio * 0.4, cx, cy + raio * 0.1);
      doc.line(cx, cy + raio * 0.45, cx, cy + raio * 0.47);
    }
  }

  function eixoTempo(x0, largura, topo, altura, comRotulos) {
    const px = (t) => x0 + ((t - tIni) / (tFim - tIni)) * largura;
    doc.setDrawColor(COR.grade);
    doc.setLineWidth(0.15);
    for (const t of horas) {
      doc.line(px(t), topo, px(t), topo + altura);
      if (comRotulos) escrever(hora(t), px(t), topo + altura + 1.2, { tamanho: 6.5, cor: COR.mudo, alinhar: 'center' });
    }
    return px;
  }

  // ---------- página 1: identificação e resultado ----------

  escrever('Relatório de triagem de apneia do sono', MARGEM, y, { tamanho: 17, negrito: true });
  escrever(`Gerado em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`, MARGEM + LARGURA, y + 1.5, {
    tamanho: 8,
    cor: COR.mudo,
    alinhar: 'right',
  });
  y += 8;
  escrever('Monitor de Apneia · protótipo de pesquisa (TCC de Mecatrônica)', MARGEM, y, { tamanho: 9, cor: COR.texto2 });
  y += 7;
  doc.setDrawColor(COR.grade);
  doc.setLineWidth(0.3);
  doc.line(MARGEM, y, MARGEM + LARGURA, y);
  y += 5;

  const metade = LARGURA / 2;
  const identificacao = [
    ['Paciente', null],
    ['Fonte dos dados', d.fonte],
    ['Data de nascimento', null],
    ['Data da noite', d.dataNoite],
    ['Horário do registro', periodoTxt],
    ['Tempo de registro', `${fmt(e.qualidade.horasTotais)} h, sendo ${fmt(e.qualidade.horasValidas)} h com leitura válida`],
  ];
  for (let i = 0; i < identificacao.length; i += 2) {
    let alturaLinha = 0;
    identificacao.slice(i, i + 2).forEach(([rotulo, valor], k) => {
      const x = MARGEM + k * metade;
      escrever(rotulo, x, y, { tamanho: 7.5, cor: COR.texto2 });
      if (valor === null) {
        doc.setDrawColor(COR.eixo);
        doc.setLineWidth(0.2);
        doc.line(x, y + 9, x + metade - 8, y + 9);
        alturaLinha = Math.max(alturaLinha, 11);
      } else {
        alturaLinha = Math.max(alturaLinha, 4 + escrever(valor, x, y + 3.6, { tamanho: 9.5, largura: metade - 8 }));
      }
    });
    y += alturaLinha + 2.5;
  }
  y += 1;

  // Cartão do resultado: número, classificação, escala, explicação e avisos.
  const largTexto = LARGURA - 12;
  const altFrase = alturaTexto(d.frase, 10.5, largTexto);
  const altOrientacao = g ? alturaTexto(g.orientacao, 9.5, largTexto) : 0;
  const altAvisos = d.avisos.reduce((soma, aviso) => soma + alturaTexto(aviso, 8.5, largTexto - 6) + 1.5, d.avisos.length ? 2.5 : 0);
  const altCartao = 33 + altFrase + 1.5 + altOrientacao + altAvisos + 4;
  const topo = y;
  doc.setFillColor(COR.lavagem);
  doc.roundedRect(MARGEM, topo, LARGURA, altCartao, 3, 3, 'F');
  escrever('RESULTADO DA TRIAGEM', MARGEM + 6, topo + 5, { tamanho: 7.5, cor: COR.texto2, negrito: true });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(30);
  const numero = fmt(e.indiceEventos);
  escrever(numero, MARGEM + 6, topo + 10, { tamanho: 30, negrito: true });
  escrever('eventos por hora', MARGEM + 8 + doc.getTextWidth(numero), topo + 15.5, { tamanho: 10, cor: COR.texto2 });
  if (g) {
    iconeEstado(g.icone, COR[g.cor], MARGEM + 8, topo + 27.6, 1.9);
    escrever(g.titulo, MARGEM + 12, topo + 25.5, { tamanho: 11, negrito: true });
    escrever(`(${g.faixa})`, MARGEM + 13.5 + doc.getTextWidth(limpar(g.titulo)), topo + 26.1, { tamanho: 9, cor: COR.texto2 });

    // Escala: quatro faixas iguais, marcador interpolado dentro da faixa (igual à tela).
    const largEscala = 84;
    const x0 = MARGEM + LARGURA - 6 - largEscala;
    const vao = 0.6;
    const largZona = (largEscala - 3 * vao) / 4;
    const yBarra = topo + 15;
    let posicao = 100;
    d.escala.forEach(([nome, de, ate], i) => {
      const zx = x0 + i * (largZona + vao);
      const cor = COR[d.gravidade[nome].cor];
      doc.setFillColor(nome === e.gravidade ? cor : misturar(cor, 0.28, COR.lavagem));
      doc.rect(zx, yBarra, largZona, 3, 'F');
      escrever(d.gravidade[nome].rotulo, zx + largZona / 2, yBarra + 5, {
        tamanho: 7.5,
        cor: nome === e.gravidade ? COR.texto : COR.mudo,
        negrito: nome === e.gravidade,
        alinhar: 'center',
      });
      if (i) escrever(String(de), zx - vao / 2, yBarra - 4.2, { tamanho: 6.5, cor: COR.mudo, alinhar: 'center' });
      if (e.indiceEventos >= de && (e.indiceEventos < ate || i === d.escala.length - 1)) {
        posicao = (i + Math.min(1, (e.indiceEventos - de) / (ate - de))) * 25;
      }
    });
    const mx = x0 + (Math.max(1, Math.min(99, posicao)) / 100) * largEscala;
    doc.setFillColor(COR.lavagem);
    doc.rect(mx - 0.9, yBarra - 1.9, 1.8, 6.8, 'F');
    doc.setFillColor(COR.texto);
    doc.roundedRect(mx - 0.5, yBarra - 1.5, 1, 6, 0.4, 0.4, 'F');
  }
  let yTexto = topo + 33;
  yTexto += escrever(d.frase, MARGEM + 6, yTexto, { tamanho: 10.5, largura: largTexto }) + 1.5;
  if (g) yTexto += escrever(g.orientacao, MARGEM + 6, yTexto, { tamanho: 9.5, cor: COR.texto2, largura: largTexto });
  if (d.avisos.length) yTexto += 2.5;
  for (const aviso of d.avisos) {
    iconeEstado('alerta', COR['--atencao'], MARGEM + 7.6, yTexto + 1.8, 1.5);
    yTexto += escrever(aviso, MARGEM + 12, yTexto, { tamanho: 8.5, cor: COR.texto2, largura: largTexto - 6 }) + 1.5;
  }
  y = topo + altCartao + 7;

  // Principais medidas, com o que cada uma quer dizer.
  const minutosBaixo = o.t90Pct === null ? null : (o.t90Pct / 100) * e.qualidade.horasValidas * 60;
  const medidas = [
    ['Índice de eventos respiratórios (IER)', `${fmt(e.indiceEventos)} por hora`, 'Pausas e respirações fracas por hora de registro válido.'],
  ];
  if (r.fonte) {
    medidas.push(
      ['Apneias', fmt(r.apneias, 0), 'Pausas de 10 s ou mais na respiração.'],
      ['Hipopneias prováveis', fmt(r.hipopneias, 0), 'Quedas de 3 pontos ou mais no oxigênio, sem pausa.'],
    );
  } else {
    medidas.push(['Quedas de oxigênio', fmt(e.eventos.length, 0), 'Sem dados de respiração: o índice usa só o oxigênio.']);
  }
  medidas.push(
    [`Índice de dessaturação (IDO ${o.criterioPct}%)`, `${fmt(o.ido)} por hora`, `${fmt(o.dessaturacoes, 0)} quedas de ${o.criterioPct} pontos ou mais no oxigênio.`],
    ['Oxigênio (SpO2) médio', `${fmt(o.spo2Media)}%`, 'Média da saturação durante o registro válido.'],
    ['Oxigênio (SpO2) mínimo', `${fmt(o.spo2Minima)}%`, 'Abaixo de 80% merece atenção (ou é o sensor fora do dedo).'],
    ['Tempo com SpO2 abaixo de 90% (T90)', `${fmt(o.t90Pct)}% (${duracao(minutosBaixo)})`, 'Parte do registro válido com oxigênio abaixo de 90%.'],
    ['Batimentos do coração', `${fmt(c.fcMedia, 0)} por minuto`, `Variaram de ${fmt(c.fcMinima, 0)} a ${fmt(c.fcMaxima, 0)} por minuto.`],
    ['Eventos com aceleração do coração', `${fmt(c.eventosComRespostaPct, 0)}%`, 'Eventos seguidos de aumento de 6 bpm ou mais.'],
  );
  if (r.frMedia !== null) medidas.push(['Respiração', `${fmt(r.frMedia, 0)} por minuto`, 'Média de respirações por minuto fora das pausas.']);
  titulo('Principais medidas');
  tabela({
    head: [['Medida', 'Valor', 'O que significa']],
    body: medidas,
    styles: { cellPadding: { top: 1.35, bottom: 1.35, left: 2, right: 2 } },
    columnStyles: { 0: { cellWidth: 58 }, 1: { cellWidth: 30, fontStyle: 'bold' }, 2: { textColor: COR.texto2 } },
  });

  if (d.comparacao) {
    const k = d.comparacao;
    const igual = k.classeMonitor === k.classeExame;
    garantir(46); // título e as cinco linhas juntos, sem quebrar a tabela entre páginas
    titulo(
      'Comparação com o exame de referência',
      'Esta noite também foi registrada por polissonografia, o exame padrão para diagnosticar apneia.',
    );
    tabela({
      body: [
        ['Índice do exame (IAH)', `${fmt(k.iah)} por hora: ${d.gravidade[k.classeExame].titulo.toLowerCase()}`],
        ['Índice do monitor (IER)', `${fmt(k.ier)} por hora: ${d.gravidade[k.classeMonitor].titulo.toLowerCase()}`],
        ['Classificação', igual ? 'O monitor chegou à mesma classificação do exame.' : 'O monitor chegou a uma classificação diferente da do exame.'],
        ['Eventos do exame encontrados pelo monitor', `${fmt(k.sensibilidade, 0)}% (${k.encontrados} de ${k.totalExame})`],
        ['Eventos do monitor confirmados pelo exame', `${fmt(k.vpp, 0)}% (${k.confirmados} de ${k.totalMonitor})`],
      ],
      styles: { cellPadding: { top: 1.35, bottom: 1.35, left: 2, right: 2 } },
      columnStyles: { 0: { cellWidth: 72, textColor: COR.texto2 } },
    });
  }

  // ---------- página 2: a noite em gráficos ----------

  novaPagina();
  titulo(
    'A noite, minuto a minuto',
    'Em cada gráfico, a área clara mostra a faixa de valores de cada intervalo de tempo e a linha mostra a média.',
  );

  const x0 = MARGEM + EIXO_Y;
  const largGrafico = LARGURA - EIXO_Y;
  const faixas = [{ rotulo: 'Monitor', eventos: e.eventos }];
  if (noite.referencia) faixas.push({ rotulo: 'Exame', eventos: noite.referencia.eventos });

  // Pausas: uma linha por fonte; apneia em barra alta e hipopneia em barra baixa, para ler também sem cor.
  const altLinha = 6;
  const vaoLinha = 2.5;
  const altFaixas = faixas.length * altLinha + (faixas.length - 1) * vaoLinha;
  escrever(r.fonte ? 'Pausas na respiração' : 'Quedas de oxigênio', MARGEM, y, { tamanho: 9, negrito: true, cor: COR.texto2 });
  // A legenda só mostra os tipos que aparecem na noite, da direita para a esquerda.
  const presentes = new Set(faixas.flatMap((f) => f.eventos.map((ev) => ev.tipo)));
  const legenda = [
    ['dessaturacao', 'Queda de oxigênio: barra baixa', COR.hipopneia, false],
    ['hipopneia', 'Hipopneia (respiração fraca): barra baixa', COR.hipopneia, false],
    ['apneia', 'Apneia (parada): barra alta', COR.apneia, true],
  ].filter(([tipo]) => presentes.has(tipo));
  let xl = MARGEM + LARGURA;
  for (const [, nome, cor, alta] of legenda) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const larg = doc.getTextWidth(limpar(nome));
    escrever(nome, xl, y + 0.4, { tamanho: 7.5, cor: COR.texto2, alinhar: 'right' });
    doc.setFillColor(cor);
    doc.rect(xl - larg - 3.2, y + (alta ? 0.4 : 1.6), 2, alta ? 3 : 1.8, 'F');
    xl -= larg + 8;
  }
  y += 6;
  const pxFaixa = eixoTempo(x0, largGrafico, y, altFaixas, true);
  faixas.forEach((f, i) => {
    const topoLinha = y + i * (altLinha + vaoLinha);
    escrever(f.rotulo, x0 - 1.5, topoLinha + altLinha / 2 - 1.3, { tamanho: 7, cor: COR.texto2, alinhar: 'right' });
    doc.setDrawColor(COR.eixo);
    doc.setLineWidth(0.15);
    doc.line(x0, topoLinha + altLinha, x0 + largGrafico, topoLinha + altLinha);
    for (const ev of f.eventos) {
      const a = pxFaixa(noite.inicioEpochS + ev.inicio);
      const b = pxFaixa(noite.inicioEpochS + ev.fim);
      const alta = ev.tipo === 'apneia';
      const alt = alta ? altLinha : altLinha * 0.5;
      doc.setFillColor(alta ? COR.apneia : COR.hipopneia);
      doc.rect(a, topoLinha + altLinha - alt, Math.max(0.25, b - a), alt, 'F');
    }
  });
  y += altFaixas + 9;

  const graficos = [
    {
      titulo: 'Oxigênio no sangue (SpO2, %)',
      valores: s.spo2,
      altura: 46,
      faixa: (min) => [Math.min(80, Math.floor(min / 5) * 5), 100],
    },
    {
      titulo: 'Batimentos do coração (por minuto)',
      valores: s.fc,
      altura: 32,
      faixa: (min, max) => [Math.floor((min - 5) / 10) * 10, Math.ceil((max + 5) / 10) * 10],
    },
  ];
  if (s.fr.some((v) => v !== null)) {
    graficos.push({
      titulo: 'Respiração (por minuto)',
      valores: s.fr,
      altura: 32,
      faixa: (min, max) => [0, Math.max(30, Math.ceil(max / 10) * 10)],
    });
  }
  const nGrupos = 600;
  for (const graf of graficos) {
    const grupos = agrupar(s.x, graf.valores, nGrupos, tIni, tFim);
    const validos = grupos.filter(Boolean);
    if (!validos.length) continue;
    const [yMin, yMax] = graf.faixa(Math.min(...validos.map((v) => v.min)), Math.max(...validos.map((v) => v.max)));
    garantir(graf.altura + 14);
    escrever(graf.titulo, MARGEM, y, { tamanho: 9, negrito: true, cor: COR.texto2 });
    y += 5;
    const topoG = y;
    const py = (v) => topoG + graf.altura - ((Math.min(yMax, Math.max(yMin, v)) - yMin) / (yMax - yMin)) * graf.altura;
    doc.setDrawColor(COR.grade);
    doc.setLineWidth(0.15);
    for (const v of marcasY(yMin, yMax)) {
      doc.line(x0, py(v), x0 + largGrafico, py(v));
      escrever(String(v), x0 - 1.5, py(v) - 1.1, { tamanho: 6.5, cor: COR.mudo, alinhar: 'right' });
    }
    eixoTempo(x0, largGrafico, topoG, graf.altura, true);
    const larg = largGrafico / nGrupos;
    const px = (i) => x0 + (i + 0.5) * larg;
    for (const trecho of trechos(grupos)) {
      // Área de mínimo a máximo: borda de cima da esquerda para a direita, de baixo na volta.
      const pontos = [
        ...trecho.map(([i, v]) => [px(i), py(v.max)]),
        ...trecho.slice().reverse().map(([i, v]) => [px(i), py(v.min)]),
      ];
      if (trecho.length === 1) {
        pontos.splice(1, 0, [pontos[0][0] + 0.2, pontos[0][1]]);
        pontos.push([pontos.at(-1)[0] - 0.2, pontos.at(-1)[1]]);
      }
      const passos = pontos.slice(1).map(([px1, py1], k) => [px1 - pontos[k][0], py1 - pontos[k][1]]);
      doc.setFillColor(misturar(COR.linha, 0.3));
      doc.lines(passos, pontos[0][0], pontos[0][1], [1, 1], 'F', true);
      if (trecho.length > 1) {
        const media = trecho.map(([i, v]) => [px(i), py(v.media)]);
        doc.setDrawColor(COR.linha);
        doc.setLineWidth(0.3);
        doc.lines(media.slice(1).map(([a, b], k) => [a - media[k][0], b - media[k][1]]), media[0][0], media[0][1], [1, 1], 'S');
      }
    }
    doc.setDrawColor(COR.eixo);
    doc.setLineWidth(0.2);
    doc.line(x0, topoG + graf.altura, x0 + largGrafico, topoG + graf.altura);
    y = topoG + graf.altura + 9;
  }

  // Tempo em cada faixa de oxigênio, com uma barra proporcional ao lado.
  const periodo = s.x.length > 1 ? (tFim - tIni) / (s.x.length - 1) : 1;
  const validasSpo2 = s.spo2.filter((v) => v !== null);
  const faixasSpo2 = [
    ['95% ou mais', (v) => v >= 95],
    ['90% a 94%', (v) => v >= 90 && v < 95],
    ['85% a 89%', (v) => v >= 85 && v < 90],
    ['80% a 84%', (v) => v >= 80 && v < 85],
    ['Abaixo de 80%', (v) => v < 80],
  ].map(([rotulo, teste]) => {
    const n = validasSpo2.filter(teste).length;
    return { rotulo, minutos: (n * periodo) / 60, pct: validasSpo2.length ? (n / validasSpo2.length) * 100 : 0 };
  });
  titulo('Tempo em cada faixa de oxigênio', 'Considera só o tempo com leitura válida do sensor.');
  tabela({
    head: [['Faixa de SpO2', 'Tempo', '% do registro', '']],
    body: faixasSpo2.map((f) => [f.rotulo, duracao(f.minutos), `${fmtFixo(f.pct)}%`, '']),
    columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 28, halign: 'right' }, 2: { cellWidth: 28, halign: 'right' } },
    didDrawCell: (dado) => {
      if (dado.section !== 'body' || dado.column.index !== 3) return;
      const f = faixasSpo2[dado.row.index];
      const largMax = dado.cell.width - 6;
      doc.setFillColor(COR.linha);
      doc.roundedRect(dado.cell.x + 3, dado.cell.y + dado.cell.height / 2 - 1.2, Math.max(0.4, (f.pct / 100) * largMax), 2.4, 0.4, 0.4, 'F');
    },
  });

  // ---------- página 3: hora a hora, observações e métodos ----------

  novaPagina();
  titulo('Eventos a cada hora', 'Ajuda a ver se as pausas se concentram em uma parte da noite.');
  const inicioHora = new Date(tIni * 1000);
  inicioHora.setMinutes(0, 0, 0);
  const linhasHora = [];
  for (let h = inicioHora.getTime() / 1000; h < tFim; h += 3600) {
    const de = Math.max(h, tIni);
    const ate = Math.min(h + 3600, tFim);
    const dentro = (ev) => noite.inicioEpochS + ev.inicio >= de && noite.inicioEpochS + ev.inicio < ate;
    const eventos = e.eventos.filter(dentro);
    const idx = [];
    for (let i = 0; i < s.x.length; i++) if (s.x[i] >= de && s.x[i] < ate) idx.push(i);
    const spo2 = idx.map((i) => s.spo2[i]).filter((v) => v !== null);
    const fc = idx.map((i) => s.fc[i]).filter((v) => v !== null);
    const linha = [`${hora(de)} às ${hora(ate)}`];
    if (r.fonte) {
      linha.push(
        fmt(eventos.filter((ev) => ev.tipo === 'apneia').length, 0),
        fmt(eventos.filter((ev) => ev.tipo === 'hipopneia').length, 0),
      );
    }
    linha.push(fmt(eventos.length, 0));
    if (noite.referencia) linha.push(fmt(noite.referencia.eventos.filter(dentro).length, 0));
    linha.push(
      spo2.length ? `${fmt(Math.min(...spo2))}%` : '—',
      fc.length ? fmt(fc.reduce((a, b) => a + b, 0) / fc.length, 0) : '—',
    );
    linhasHora.push(linha);
  }
  const cabecalhoHora = ['Horário'];
  if (r.fonte) cabecalhoHora.push('Apneias', 'Hipopneias');
  cabecalhoHora.push('Total do monitor');
  if (noite.referencia) cabecalhoHora.push('Total do exame');
  cabecalhoHora.push('SpO2 mínima', 'Batimentos (média)');
  const alinhamentoHora = Object.fromEntries(cabecalhoHora.slice(1).map((_, i) => [i + 1, { halign: 'right' }]));
  tabela({ head: [cabecalhoHora], body: linhasHora, columnStyles: alinhamentoHora });

  garantir(52);
  escrever('Observações do médico', MARGEM, y, { tamanho: 12, negrito: true });
  y += 7;
  doc.setDrawColor(COR.eixo);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGEM, y, LARGURA, 40, 2, 2, 'S');
  doc.setDrawColor(COR.grade);
  for (let k = 1; k <= 3; k++) doc.line(MARGEM + 5, y + k * 8.5, MARGEM + LARGURA - 5, y + k * 8.5);
  escrever('Assinatura e CRM', MARGEM + 5, y + 31, { tamanho: 7.5, cor: COR.mudo });
  doc.setDrawColor(COR.eixo);
  doc.line(MARGEM + 30, y + 34, MARGEM + LARGURA - 5, y + 34);
  y += 48;

  titulo('Como os números foram calculados');
  for (const paragrafo of [
    'Os eventos seguem os critérios de pontuação da AASM (2012) e a gravidade segue os cortes da AASM (1999): menos de 5 eventos por hora é normal, de 5 a 15 é leve, de 15 a 30 é moderada e 30 ou mais é grave.',
    'Apneia é uma pausa de 10 s ou mais entre duas respirações detectadas pelo sensor. Hipopneia provável é uma queda de 3 pontos ou mais na SpO2, em relação à linha de base dos 2 minutos anteriores, que não está ligada a uma pausa.',
    'O índice do monitor (IER) divide os eventos pelas horas de registro com leitura válida, como nos testes domiciliares. O IAH da polissonografia divide pelas horas de sono medidas pelo EEG; por isso o índice do monitor tende a ser um pouco menor.',
    'Este relatório é uma triagem feita por um protótipo de pesquisa. Ele não substitui a polissonografia nem a avaliação de um médico do sono.',
    ...(d.citacao ? [d.citacao] : []),
  ]) {
    const altura = alturaTexto(paragrafo, 8.5, LARGURA);
    garantir(altura + 2);
    y += escrever(paragrafo, MARGEM, y, { tamanho: 8.5, cor: COR.texto2, largura: LARGURA }) + 2.5;
  }

  // ---------- anexo: todos os eventos ----------

  if (e.eventos.length) {
    novaPagina();
    titulo(`Anexo: lista de eventos do monitor (${e.eventos.length})`);
    const cores = { apneia: COR.apneia, hipopneia: COR.hipopneia, dessaturacao: COR.hipopneia };
    tabela({
      head: [['Início', 'Tipo', 'Duração (s)', 'Queda da SpO2 (pontos)', 'Aumento da FC (bpm)']],
      body: e.eventos.map((ev) => [
        horaSeg(noite.inicioEpochS + ev.inicio),
        d.nomesTipo[ev.tipo] ?? ev.tipo,
        fmt(ev.duracaoS, 0),
        fmtFixo(ev.quedaSpo2),
        ev.aumentoFc === null ? '—' : fmt(ev.aumentoFc, 0),
      ]),
      styles: { fontSize: 8, cellPadding: { top: 1.2, bottom: 1.2, left: 2, right: 2 }, lineWidth: { bottom: 0.15 } },
      columnStyles: {
        1: { cellPadding: { top: 1.2, bottom: 1.2, left: 6, right: 2 } },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
      didDrawCell: (dado) => {
        if (dado.section !== 'body' || dado.column.index !== 1) return;
        const ev = e.eventos[dado.row.index];
        doc.setFillColor(cores[ev.tipo] ?? COR.mudo);
        doc.rect(dado.cell.x + 2, dado.cell.y + dado.cell.height / 2 - 1, 2, 2, 'F');
      },
    });
  }

  // ---------- cabeçalho e rodapé de todas as páginas ----------

  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    if (p > 1) {
      escrever('Relatório de triagem de apneia do sono', MARGEM, MARGEM - 6, { tamanho: 7.5, cor: COR.mudo });
      escrever(`${d.fonte} · ${periodoTxt}`, MARGEM + LARGURA, MARGEM - 6, { tamanho: 7.5, cor: COR.mudo, alinhar: 'right' });
    }
    doc.setDrawColor(COR.grade);
    doc.setLineWidth(0.2);
    doc.line(MARGEM, A4.altura - 14, MARGEM + LARGURA, A4.altura - 14);
    escrever('Protótipo de pesquisa (TCC). Triagem: não substitui a polissonografia nem a avaliação médica.', MARGEM, A4.altura - 12, {
      tamanho: 7,
      cor: COR.mudo,
    });
    escrever(`Página ${p} de ${total}`, MARGEM + LARGURA, A4.altura - 12, { tamanho: 7, cor: COR.mudo, alinhar: 'right' });
  }

  return doc;
}
