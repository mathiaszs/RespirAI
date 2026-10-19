// Histórico de várias noites: o resumo de cada noite, a busca das noites do dispositivo (com cache no
// navegador) e os gráficos de barras da tendência. Os gráficos são SVG e usam as variáveis de cor do CSS,
// então acompanham o tema claro/escuro sem precisar ser redesenhados.

// Aumente quando o escore mudar, para os resumos guardados no navegador serem recalculados.
const VERSAO_CACHE = 1;
const NS = 'http://www.w3.org/2000/svg';

export function resumirNoite(noite, escore) {
  const o = escore.oximetria;
  return {
    ier: escore.indiceEventos,
    gravidade: escore.gravidade,
    ido: o.ido,
    t90Min: o.t90Pct === null ? null : (o.t90Pct / 100) * escore.qualidade.horasValidas * 60,
    spo2Media: o.spo2Media,
    spo2Minima: o.spo2Minima,
    fcMedia: escore.cardiaco.fcMedia,
    eventos: escore.eventos.length,
    horasValidas: escore.qualidade.horasValidas,
    suficiente: escore.qualidade.suficiente,
    inicioEpochS: noite.inicioEpochS + noite.amostras[0].t,
    fimEpochS: noite.inicioEpochS + noite.amostras.at(-1).t,
  };
}

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// As `n` noites mais recentes, da mais antiga para a mais nova. A noite leva a data do dia em que começou;
// a mais recente é a de ontem, que de manhã acabou de terminar.
export function datasDoPeriodo(n, agora = new Date()) {
  const datas = [];
  for (let i = n; i >= 1; i--) datas.push(iso(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - i)));
  return datas;
}

function lerCache(chave) {
  try {
    const texto = localStorage.getItem(chave);
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

function gravarCache(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    /* sem armazenamento: só recalcula na próxima vez */
  }
}

// fonte: { temLeitura(dispositivo, data), carregarNoite(dispositivo, data), janelaDaNoite(data) }
// calcular(noite) devolve o resumo. Noites já terminadas ficam guardadas no navegador.
export async function buscarHistoricoDispositivo({ dispositivo, datas, fonte, calcular, aoProgredir, cancelado }) {
  const resultado = datas.map((data) => ({ data, resumo: null }));
  let feitas = 0;
  let proxima = 0;

  async function analisar(i) {
    const { data } = resultado[i];
    const chave = `historico:v${VERSAO_CACHE}:${dispositivo}:${data}`;
    let resumo = lerCache(chave);
    if (!resumo && (await fonte.temLeitura(dispositivo, data))) {
      try {
        resumo = calcular(await fonte.carregarNoite(dispositivo, data));
      } catch {
        resumo = null; // poucas leituras para calcular: a noite aparece como sem dados
      }
      if (resumo && fonte.janelaDaNoite(data).ate <= Date.now()) gravarCache(chave, resumo);
    }
    resultado[i].resumo = resumo;
    aoProgredir?.(++feitas, datas.length);
  }

  // Três noites por vez, para não baixar o período inteiro de uma só vez.
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (proxima < datas.length && !cancelado?.()) await analisar(proxima++);
    }),
  );
  return resultado;
}

// ---------- gráfico de barras ----------

function el(tag, atributos = {}, pai) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(atributos)) e.setAttribute(k, String(v));
  pai?.append(e);
  return e;
}

function tetoBonito(v) {
  const potencia = 10 ** Math.floor(Math.log10(v));
  return [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * potencia).find((c) => c >= v) ?? 10 * potencia;
}

function marcas(max) {
  const passo = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((p) => max / p <= 4) ?? 1000;
  const lista = [];
  for (let v = 0; v <= max + 1e-9; v += passo) lista.push(v);
  return lista;
}

// Barra com o topo arredondado e a base reta, apoiada na linha do zero.
function caminhoBarra(x, y, largura, base) {
  const r = Math.min(4, largura / 2, base - y);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + largura - r}Q${x + largura},${y} ${x + largura},${y + r}V${base}Z`;
}

// slots: [{ rotulo, titulo, resumo | null }]; valor(resumo) devolve o número da barra (ou null).
// faixas: [{ de, ate, rotulo, cor }] desenhadas ao fundo (opcional). media: linha tracejada (opcional).
export function desenharBarras(container, { slots, valor, faixas, media, rotuloMedia, altura, formatar, dica, aoEscolher }) {
  const dicaEl = document.createElement('div');
  dicaEl.className = 'dica-grafico';
  dicaEl.hidden = true;
  dicaEl.setAttribute('role', 'status');

  function desenhar() {
    const largura = container.clientWidth;
    if (!largura) return;
    container.replaceChildren();
    const m = { esq: 34, dir: faixas ? 70 : 12, topo: 20, base: 28 };
    const w = largura - m.esq - m.dir;
    const h = altura - m.topo - m.base;
    const valores = slots.map((s) => (s.resumo ? valor(s.resumo) : null));
    const maior = Math.max(0, ...valores.filter((v) => v !== null), media ?? 0);
    const yMax = tetoBonito(Math.max(faixas ? 40 : 1, maior * 1.15));
    const py = (v) => m.topo + h - (Math.min(v, yMax) / yMax) * h;
    const base = py(0);
    const n = slots.length;
    const passo = w / n;
    const larguraBarra = Math.max(3, Math.min(40, passo * 0.62));

    const svg = el('svg', { width: largura, height: altura, viewBox: `0 0 ${largura} ${altura}`, class: 'barras', role: 'img' });
    svg.setAttribute('aria-label', 'Gráfico de barras: um valor por noite. A tabela abaixo tem os mesmos números.');

    if (faixas) {
      for (const f of faixas) {
        const y0 = py(Math.min(f.ate, yMax));
        const y1 = py(f.de);
        if (y1 - y0 <= 0) continue;
        el('rect', { x: m.esq, y: y0, width: w, height: y1 - y0, class: 'faixa', style: `--cor: var(${f.cor})` }, svg);
        if (y1 - y0 >= 14) {
          const t = el('text', { x: m.esq + w + 8, y: (y0 + y1) / 2, class: 'rotulo-faixa', 'dominant-baseline': 'middle' }, svg);
          t.textContent = f.rotulo;
        }
      }
    }
    const linhasY = faixas ? [0, ...faixas.map((f) => f.de).filter((v) => v > 0 && v < yMax)] : marcas(yMax);
    for (const v of linhasY) {
      el('line', { x1: m.esq, x2: m.esq + w, y1: py(v), y2: py(v), class: v === 0 ? 'eixo' : 'grade' }, svg);
      const t = el('text', { x: m.esq - 6, y: py(v), class: 'rotulo-eixo', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, svg);
      t.textContent = formatar(v);
    }

    const destaque = el('rect', { x: 0, y: m.topo, width: passo, height: h, class: 'destaque', visibility: 'hidden' }, svg);
    const cadaQuantos = Math.ceil(n / Math.max(1, Math.floor(w / 46)));
    const comRotulos = n <= 14;

    slots.forEach((s, i) => {
      const cx = m.esq + passo * (i + 0.5);
      const v = valores[i];
      if (v === null) {
        el('circle', { cx, cy: base - 3, r: 2.5, class: 'sem-dados' }, svg);
      } else {
        const y = Math.min(py(v), base - 1);
        el('path', { d: caminhoBarra(cx - larguraBarra / 2, y, larguraBarra, base), class: s.resumo.suficiente ? 'barra' : 'barra fraca' }, svg);
        if (comRotulos) {
          const t = el('text', { x: cx, y: y - 5, class: 'rotulo-valor', 'text-anchor': 'middle' }, svg);
          t.textContent = formatar(v);
        }
      }
      if (i % cadaQuantos === 0 || i === n - 1) {
        const t = el('text', { x: cx, y: base + 17, class: 'rotulo-eixo', 'text-anchor': 'middle' }, svg);
        t.textContent = s.rotulo;
      }
    });

    if (media !== null && media !== undefined) {
      el('line', { x1: m.esq, x2: m.esq + w, y1: py(media), y2: py(media), class: 'media' }, svg);
      const t = el('text', { x: m.esq + 6, y: py(media) - 6, class: 'rotulo-media' }, svg);
      t.textContent = rotuloMedia ?? `média ${formatar(media)}`;
    }

    // Alvos de toque do tamanho da coluna inteira, maiores que a barra.
    slots.forEach((s, i) => {
      const alvo = el('rect', { x: m.esq + passo * i, y: m.topo, width: passo, height: h + m.base, class: 'alvo' }, svg);
      alvo.setAttribute('tabindex', '0');
      alvo.setAttribute('role', 'button');
      alvo.setAttribute('aria-label', `${s.titulo}: ${valores[i] === null ? 'sem leituras' : formatar(valores[i])}`);
      const mostrar = () => {
        destaque.setAttribute('x', m.esq + passo * i);
        destaque.setAttribute('visibility', 'visible');
        dicaEl.replaceChildren(dica(s));
        dicaEl.hidden = false;
        const larguraDica = dicaEl.offsetWidth;
        const centro = m.esq + passo * (i + 0.5);
        dicaEl.style.left = `${Math.max(0, Math.min(largura - larguraDica, centro - larguraDica / 2))}px`;
        dicaEl.style.bottom = `${altura - m.topo + 8}px`;
      };
      const esconder = () => {
        destaque.setAttribute('visibility', 'hidden');
        dicaEl.hidden = true;
      };
      alvo.addEventListener('pointerenter', mostrar);
      alvo.addEventListener('focus', mostrar);
      alvo.addEventListener('pointerleave', esconder);
      alvo.addEventListener('blur', esconder);
      if (s.resumo) {
        alvo.classList.add('clicavel');
        alvo.addEventListener('click', () => aoEscolher(s));
        alvo.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            aoEscolher(s);
          }
        });
      }
    });

    container.append(svg, dicaEl);
  }

  desenhar();
  let larguraAnterior = container.clientWidth;
  const observador = new ResizeObserver(() => {
    if (container.clientWidth !== larguraAnterior) {
      larguraAnterior = container.clientWidth;
      desenhar();
    }
  });
  observador.observe(container);
  return {
    destruir() {
      observador.disconnect();
      container.replaceChildren();
    },
  };
}
