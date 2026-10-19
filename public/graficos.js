// Gráficos com uPlot: um gráfico por grandeza (nunca dois eixos Y), todos com o mesmo eixo de tempo,
// cursor e zoom sincronizados. A primeira faixa mostra os eventos como marcas numa linha do tempo.

const uPlot = window.uPlot;
const LARGURA_EIXO_Y = 56;
const FONTE = '12px system-ui, -apple-system, "Segoe UI", sans-serif';
let contadorGrupos = 0;

function cores() {
  const css = getComputedStyle(document.documentElement);
  const v = (nome) => css.getPropertyValue(nome).trim();
  return {
    linha: v('--serie-1'),
    apneia: v('--serie-2'),
    hipopneia: v('--serie-3'),
    texto: v('--texto-mudo'),
    grade: v('--grade'),
    eixo: v('--eixo'),
    superficie: v('--superficie'),
  };
}

export function corDoTipo(tipo) {
  const c = cores();
  return tipo === 'apneia' ? c.apneia : c.hipopneia;
}

const hora = (s) => new Date(s * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function eixoX(c, comRotulos) {
  return {
    stroke: c.texto,
    font: FONTE,
    grid: { stroke: c.grade, width: 1 },
    ticks: { stroke: c.eixo, width: 1, size: 4 },
    size: comRotulos ? 30 : 6,
    space: 70,
    values: (u, splits) => splits.map((s) => (comRotulos ? hora(s) : '')),
  };
}

function eixoY(c, extra = {}) {
  return {
    stroke: c.texto,
    font: FONTE,
    size: LARGURA_EIXO_Y,
    grid: { stroke: c.grade, width: 1 },
    ticks: { stroke: c.eixo, width: 1, size: 4 },
    space: 28,
    ...extra,
  };
}

// grupo: { faixas: [{ rotulo, base, eventos }], sinais: [{ titulo, valores, faixaY, altura }], x, zoom, aoMoverCursor }
// faixaX: função opcional que devolve [min, max] fixos para o eixo de tempo (janela do ao vivo).
export function criarGrupo(container, { x, faixas, sinais, zoom = true, aoMoverCursor, faixaX }) {
  container.replaceChildren();
  const c = cores();
  const escalaX = faixaX ? { time: true, range: () => faixaX() } : { time: true };
  const chaveSync = `grupo-${++contadorGrupos}`;
  const graficos = [];
  let dadosFaixas = faixas;
  let sincronizando = false;

  const ganchosComuns = {
    setScale: [
      (u, chave) => {
        if (chave !== 'x' || sincronizando) return;
        sincronizando = true;
        for (const g of graficos) if (g !== u) g.setScale('x', { min: u.scales.x.min, max: u.scales.x.max });
        sincronizando = false;
      },
    ],
    setCursor: [(u) => aoMoverCursor?.(u.cursor.idx ?? null)],
  };
  const cursorBase = { sync: { key: chaveSync }, y: false, drag: { x: zoom, y: false, setScale: zoom } };

  function bloco(titulo, legenda) {
    const el = document.createElement('div');
    el.className = 'grafico';
    const h = document.createElement('h3');
    h.textContent = titulo;
    if (legenda) h.append(legenda);
    const area = document.createElement('div');
    area.setAttribute('role', 'img');
    area.setAttribute('aria-label', titulo);
    el.append(h, area);
    container.append(el);
    return area;
  }

  // Faixa de eventos: uma linha por fonte (escore, polissonografia), marcas sólidas por tipo.
  if (faixas?.length) {
    const area = bloco('Pausas na respiração', legendaEventos(c));
    const n = faixas.length;
    const desenhar = (u) => {
      const ctx = u.ctx;
      const { left, top, width, height } = u.bbox;
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, width, height);
      ctx.clip();
      const xMin = u.scales.x.min;
      const xMax = u.scales.x.max;
      dadosFaixas.forEach((faixa, i) => {
        const y0 = u.valToPos(n - i - 0.18, 'y', true);
        const y1 = u.valToPos(n - i - 0.82, 'y', true);
        for (const e of faixa.eventos) {
          const a = faixa.base + e.inicio;
          const b = faixa.base + e.fim;
          if (b < xMin || a > xMax) continue;
          const px0 = u.valToPos(a, 'x', true);
          const px1 = u.valToPos(b, 'x', true);
          ctx.fillStyle = e.tipo === 'apneia' ? c.apneia : c.hipopneia;
          ctx.fillRect(px0, y0, Math.max(2 * devicePixelRatio, px1 - px0), y1 - y0);
        }
      });
      ctx.restore();
    };
    graficos.push(
      new uPlot(
        {
          width: container.clientWidth,
          height: 34 * n + 12,
          legend: { show: false },
          cursor: { ...cursorBase, points: { show: false } },
          scales: { x: escalaX, y: { auto: false, range: () => [0, n] } },
          series: [{}, { show: false }],
          axes: [
            eixoX(c, false),
            eixoY(c, {
              grid: { show: false },
              ticks: { show: false },
              splits: () => faixas.map((_, i) => n - i - 0.5),
              values: () => faixas.map((f) => f.rotulo),
            }),
          ],
          hooks: { ...ganchosComuns, draw: [desenhar] },
        },
        [x, x.map(() => null)],
        area,
      ),
    );
  }

  sinais.forEach((s, i) => {
    const area = bloco(s.titulo);
    const ultimo = i === sinais.length - 1;
    graficos.push(
      new uPlot(
        {
          width: container.clientWidth,
          height: (s.altura ?? 130) + (ultimo ? 30 : 6),
          legend: { show: false },
          cursor: { ...cursorBase, points: { size: 8, width: 2, stroke: c.superficie, fill: c.linha } },
          scales: {
            x: escalaX,
            y: { range: (u, min, max) => (min === null ? [0, 1] : (s.faixaY?.(min, max) ?? [min, max])) },
          },
          series: [{}, { label: s.titulo, stroke: c.linha, width: 2, spanGaps: false, points: { show: false } }],
          axes: [eixoX(c, ultimo), eixoY(c)],
          hooks: ganchosComuns,
        },
        [x, s.valores],
        area,
      ),
    );
  });

  const observador = new ResizeObserver(() => {
    const largura = container.clientWidth;
    if (largura > 0) for (const g of graficos) g.setSize({ width: largura, height: g.height });
  });
  observador.observe(container);

  return {
    atualizar(novoX, valores, novasFaixas) {
      if (novasFaixas) dadosFaixas = novasFaixas;
      let k = 0;
      for (const [i, g] of graficos.entries()) {
        if (i === 0 && faixas?.length) g.setData([novoX, novoX.map(() => null)]);
        else g.setData([novoX, valores[k++]]);
      }
    },
    destruir() {
      observador.disconnect();
      for (const g of graficos) g.destroy();
      container.replaceChildren();
    },
  };
}

function legendaEventos(c) {
  const el = document.createElement('span');
  el.className = 'legenda';
  for (const [rotulo, cor] of [['Apneia (parada)', c.apneia], ['Hipopneia (respiração fraca)', c.hipopneia]]) {
    const item = document.createElement('span');
    const chave = document.createElement('i');
    chave.style.background = cor;
    item.append(chave, rotulo);
    el.append(item);
  }
  return el;
}
