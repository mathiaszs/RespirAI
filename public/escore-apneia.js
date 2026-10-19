// Escore de triagem de apneia do sono a partir de SpO2, frequência cardíaca e respiração.
// Os critérios clínicos e as referências estão no README.md desta pasta.

export const PADROES = {
  quedaDessaturacaoPct: 3, // IDO 3% (critério recomendado pela AASM); use 4 para o critério de 4%
  recuperacaoPct: 1, // a dessaturação termina quando a SpO2 volta a (linha de base - 1)
  janelaBaseS: 120, // janela da linha de base da SpO2
  percentilBase: 90, // linha de base = percentil 90 da janela (resiste a picos e a eventos repetidos)
  duracaoMinDessaturacaoS: 10,
  duracaoMaxDessaturacaoS: 120, // sem recuperar em 2 min é mudança de linha de base (vai para o T90), não evento
  pausaMinimaS: 10, // apneia: pausa respiratória de pelo menos 10 s
  pausaMaximaS: 120, // pausas maiores são tratadas como perda de sinal, não como apneia
  associacaoS: 30, // dessaturação que começa até 30 s após o fim de uma pausa é consequência dela
  janelaRespostaFcS: 20,
  aumentoFcBpm: 6,
  tempoMinimoH: 4,
  limites: { spo2: [50, 100], fc: [25, 220], fr: [0, 60] },
};

// Cortes de gravidade da AASM para o índice de eventos por hora.
export function classificarGravidade(indice) {
  if (indice === null) return null;
  if (indice < 5) return 'normal';
  if (indice < 15) return 'leve';
  if (indice < 30) return 'moderada';
  return 'grave';
}

// amostras: [{ t, spo2, fc, fr? }], t em segundos, idealmente 1 Hz.
// respiracoes: instantes (em segundos) de cada respiração detectada; opcional.
export function calcularEscore({ amostras, respiracoes } = {}, opcoes = {}) {
  const cfg = { ...PADROES, ...opcoes, limites: { ...PADROES.limites, ...opcoes.limites } };
  if (!Array.isArray(amostras) || amostras.length < 2) {
    throw new Error('São necessárias pelo menos duas amostras.');
  }
  const dados = [...amostras].sort((a, b) => a.t - b.t);
  const periodo = mediana(dados.slice(1).map((a, i) => a.t - dados[i].t));
  if (!(periodo > 0)) throw new Error('Os tempos (t) das amostras precisam ser crescentes, em segundos.');

  const spo2 = dados.filter((a) => valido(a.spo2, cfg.limites.spo2)).map((a) => a.spo2);
  const fc = dados.filter((a) => valido(a.fc, cfg.limites.fc)).map((a) => a.fc);
  const horasValidas = (spo2.length * periodo) / 3600;
  const horasTotais = (dados.at(-1).t - dados[0].t + periodo) / 3600;

  const dessaturacoes = detectarDessaturacoes(dados, periodo, cfg);
  const resp = analisarRespiracao(dados, respiracoes, cfg);

  // Uma dessaturação ligada a uma pausa já está contada na apneia; as outras são hipopneias prováveis.
  const associadas = new Set();
  for (const a of resp.apneias) {
    for (const d of dessaturacoes) {
      if (d.inicio >= a.inicio && d.inicio <= a.fim + cfg.associacaoS) {
        associadas.add(d);
        a.queda = Math.max(a.queda ?? 0, d.queda);
      }
    }
  }
  const hipopneias = dessaturacoes.filter((d) => !associadas.has(d)).map((d) => ({ ...d, tipo: 'hipopneia' }));

  const eventos = resp.fonte ? [...resp.apneias, ...hipopneias] : [...dessaturacoes];
  eventos.sort((a, b) => a.inicio - b.inicio);
  for (const e of eventos) e.aumentoFc = aumentoFc(dados, e, cfg);
  const avaliaveis = eventos.filter((e) => e.aumentoFc !== null);
  const comResposta = avaliaveis.filter((e) => e.aumentoFc >= cfg.aumentoFcBpm);

  const porHora = (n) => (horasValidas > 0 ? r1(n / horasValidas) : null);
  const indice = porHora(eventos.length);
  const spo2Minima = spo2.length ? minimo(spo2) : null;

  const alertas = [];
  if (horasValidas < cfg.tempoMinimoH) {
    alertas.push(`Só ${r1(horasValidas)} h de oximetria válida; o mínimo recomendado é ${cfg.tempoMinimoH} h. Resultado não confiável.`);
  }
  if (!resp.fonte) {
    alertas.push('Sem dados de respiração: o índice usa só as dessaturações (IDO) e não detecta apneias sem queda de SpO₂.');
  }
  if (spo2Minima !== null && spo2Minima < 80) alertas.push('SpO₂ mínima abaixo de 80%.');

  return {
    indiceEventos: indice,
    gravidade: classificarGravidade(indice),
    qualidade: {
      horasTotais: r1(horasTotais),
      horasValidas: r1(horasValidas),
      suficiente: horasValidas >= cfg.tempoMinimoH,
    },
    oximetria: {
      spo2Media: spo2.length ? r1(media(spo2)) : null,
      spo2Minima,
      t90Pct: spo2.length ? r1((spo2.filter((x) => x < 90).length / spo2.length) * 100) : null,
      criterioPct: cfg.quedaDessaturacaoPct,
      ido: porHora(dessaturacoes.length),
      dessaturacoes: dessaturacoes.length,
    },
    respiracao: {
      fonte: resp.fonte,
      frMedia: r1(resp.frMedia),
      apneias: resp.apneias.length,
      hipopneias: resp.fonte ? hipopneias.length : null,
    },
    cardiaco: {
      fcMedia: fc.length ? r1(media(fc)) : null,
      fcMinima: fc.length ? minimo(fc) : null,
      fcMaxima: fc.length ? maximo(fc) : null,
      eventosComRespostaPct: avaliaveis.length ? r1((comResposta.length / avaliaveis.length) * 100) : null,
    },
    alertas,
    eventos: eventos.map((e) => ({
      tipo: e.tipo,
      inicio: e.inicio,
      fim: e.fim,
      duracaoS: r1(e.fim - e.inicio),
      quedaSpo2: e.queda === undefined ? null : r1(e.queda),
      aumentoFc: r1(e.aumentoFc),
    })),
  };
}

function detectarDessaturacoes(dados, periodo, cfg) {
  const eventos = [];
  const minimoNaJanela = cfg.janelaBaseS / periodo / 2;
  let inicioJanela = 0;
  let atual = null;
  for (let i = 0; i < dados.length; i++) {
    const { t, spo2 } = dados[i];
    if (!valido(spo2, cfg.limites.spo2)) continue;
    if (atual) {
      atual.nadir = Math.min(atual.nadir, spo2);
      if (spo2 >= atual.base - cfg.recuperacaoPct) {
        fecharDessaturacao(atual, t, eventos, cfg);
        atual = null;
      } else if (t - atual.inicio > cfg.duracaoMaxDessaturacaoS) {
        atual = null; // descarta e deixa a linha de base se refazer no novo patamar
      }
      continue;
    }
    while (dados[inicioJanela].t < t - cfg.janelaBaseS) inicioJanela++;
    const janela = [];
    for (let j = inicioJanela; j < i; j++) {
      if (valido(dados[j].spo2, cfg.limites.spo2)) janela.push(dados[j].spo2);
    }
    if (janela.length < minimoNaJanela) continue; // linha de base ainda não confiável
    const base = percentil(janela, cfg.percentilBase);
    if (spo2 <= base - cfg.quedaDessaturacaoPct) atual = { tipo: 'dessaturacao', inicio: t, base, nadir: spo2 };
  }
  if (atual) fecharDessaturacao(atual, dados.at(-1).t, eventos, cfg);
  return eventos;
}

function fecharDessaturacao(evento, fim, eventos, cfg) {
  if (fim - evento.inicio >= cfg.duracaoMinDessaturacaoS) {
    eventos.push({ ...evento, fim, queda: evento.base - evento.nadir });
  }
}

function analisarRespiracao(dados, respiracoes, cfg) {
  if (Array.isArray(respiracoes) && respiracoes.length > 1) {
    const t = [...respiracoes].sort((a, b) => a - b);
    const intervalos = t.slice(1).map((x, i) => x - t[i]);
    const apneias = [];
    intervalos.forEach((d, i) => {
      if (d >= cfg.pausaMinimaS && d <= cfg.pausaMaximaS) apneias.push({ tipo: 'apneia', inicio: t[i], fim: t[i + 1] });
    });
    const normais = intervalos.filter((d) => d < cfg.pausaMinimaS);
    return { fonte: 'respiracoes', apneias, frMedia: normais.length ? 60 / mediana(normais) : null };
  }

  // Sem os instantes das respirações, usa a série de FR: fr = 0 significa "nenhuma respiração detectada".
  const comFr = dados.filter((a) => valido(a.fr, cfg.limites.fr));
  if (!comFr.length) return { fonte: null, apneias: [], frMedia: null };
  const apneias = [];
  let inicio = null;
  for (const a of dados) {
    if (!valido(a.fr, cfg.limites.fr)) {
      inicio = null;
      continue;
    }
    if (a.fr === 0) {
      inicio ??= a.t;
      continue;
    }
    if (inicio !== null) {
      const d = a.t - inicio;
      if (d >= cfg.pausaMinimaS && d <= cfg.pausaMaximaS) apneias.push({ tipo: 'apneia', inicio, fim: a.t });
      inicio = null;
    }
  }
  const positivos = comFr.filter((a) => a.fr > 0).map((a) => a.fr);
  return { fonte: 'fr', apneias, frMedia: positivos.length ? media(positivos) : null };
}

// Variação cíclica da FC: queda durante o evento e aceleração quando a respiração volta.
function aumentoFc(dados, evento, cfg) {
  const durante = fcEntre(dados, evento.inicio, evento.fim, cfg);
  const ateDepois = fcEntre(dados, evento.inicio, evento.fim + cfg.janelaRespostaFcS, cfg);
  if (!durante.length || !ateDepois.length) return null;
  return maximo(ateDepois) - mediana(durante);
}

function fcEntre(dados, de, ate, cfg) {
  const valores = [];
  for (let i = primeiroIndice(dados, de); i < dados.length && dados[i].t <= ate; i++) {
    if (valido(dados[i].fc, cfg.limites.fc)) valores.push(dados[i].fc);
  }
  return valores;
}

// Busca binária: primeira amostra com tempo >= t.
function primeiroIndice(dados, t) {
  let lo = 0;
  let hi = dados.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (dados[m].t < t) lo = m + 1;
    else hi = m;
  }
  return lo;
}

function valido(x, [min, max]) {
  return typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
}

function media(v) {
  return v.reduce((s, x) => s + x, 0) / v.length;
}

function mediana(v) {
  return percentil(v, 50);
}

function percentil(v, p) {
  const o = [...v].sort((a, b) => a - b);
  const pos = ((o.length - 1) * p) / 100;
  const i = Math.floor(pos);
  return i + 1 < o.length ? o[i] + (o[i + 1] - o[i]) * (pos - i) : o[i];
}

function minimo(v) {
  return v.reduce((m, x) => (x < m ? x : m), Infinity);
}

function maximo(v) {
  return v.reduce((m, x) => (x > m ? x : m), -Infinity);
}

function r1(x) {
  return x === null || x === undefined ? null : Math.round(x * 10) / 10;
}
