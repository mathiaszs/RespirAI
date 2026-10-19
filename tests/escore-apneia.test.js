import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calcularEscore, classificarGravidade, PADROES } from '../public/escore-apneia.js';

// Gera `n` amostras a 1 Hz; `f(t)` devolve os campos de cada uma.
const serie = (n, f) => Array.from({ length: n }, (_, t) => ({ t, ...f(t) }));

const HORAS = (h) => h * 3600;

// SpO2 97 com uma queda de `queda` pontos por `duracao` s a cada `periodo` s (a partir de `inicio` s do ciclo).
const comDessaturacoes = ({ horas = 5, periodo = 300, inicio = 200, duracao = 30, queda = 5, base = 97 } = {}) =>
  serie(HORAS(horas), (t) => ({
    spo2: t % periodo >= inicio && t % periodo < inicio + duracao ? base - queda : base,
    fc: 60,
  }));

describe('classificarGravidade (cortes da AASM)', () => {
  const casos = [
    [0, 'normal'],
    [4.9, 'normal'],
    [5, 'leve'],
    [14.9, 'leve'],
    [15, 'moderada'],
    [29.9, 'moderada'],
    [30, 'grave'],
    [120, 'grave'],
  ];
  for (const [indice, esperado] of casos) {
    test(`${indice} eventos/h -> ${esperado}`, () => {
      assert.equal(classificarGravidade(indice), esperado);
    });
  }

  test('null (sem oximetria válida) -> null', () => {
    assert.equal(classificarGravidade(null), null);
  });

  // BUG (ver descrição do PR): NaN e undefined caem no último `return` e viram "grave".
  test('NaN/undefined não deveriam virar "grave"', { todo: 'bug: comparações com NaN são falsas' }, () => {
    assert.notEqual(classificarGravidade(NaN), 'grave');
    assert.notEqual(classificarGravidade(undefined), 'grave');
  });
});

describe('calcularEscore: validação de entrada', () => {
  test('sem argumentos', () => {
    assert.throws(() => calcularEscore(), /pelo menos duas amostras/);
  });

  test('amostras ausentes, vazias ou com um único ponto', () => {
    assert.throws(() => calcularEscore({}), /pelo menos duas amostras/);
    assert.throws(() => calcularEscore({ amostras: [] }), /pelo menos duas amostras/);
    assert.throws(() => calcularEscore({ amostras: [{ t: 0, spo2: 95 }] }), /pelo menos duas amostras/);
  });

  test('tempos repetidos (período zero)', () => {
    const amostras = [{ t: 0, spo2: 95 }, { t: 0, spo2: 95 }, { t: 0, spo2: 95 }];
    assert.throws(() => calcularEscore({ amostras }), /crescentes/);
  });

  test('não altera o array de entrada e aceita amostras fora de ordem', () => {
    const amostras = comDessaturacoes({ horas: 5 });
    const invertido = [...amostras].reverse();
    const copia = JSON.stringify(invertido);
    const r = calcularEscore({ amostras: invertido });
    assert.equal(JSON.stringify(invertido), copia);
    assert.equal(r.indiceEventos, calcularEscore({ amostras }).indiceEventos);
  });
});

describe('calcularEscore: oximetria (IDO)', () => {
  test('noite estável de 5 h: índice 0, normal, sem alerta de tempo', () => {
    const r = calcularEscore({ amostras: serie(HORAS(5), () => ({ spo2: 97, fc: 60 })) });
    assert.equal(r.indiceEventos, 0);
    assert.equal(r.gravidade, 'normal');
    assert.equal(r.qualidade.horasValidas, 5);
    assert.equal(r.qualidade.suficiente, true);
    assert.equal(r.oximetria.dessaturacoes, 0);
    assert.equal(r.oximetria.t90Pct, 0);
    assert.deepEqual(r.eventos, []);
  });

  test('12 dessaturações de 5% por hora -> índice 12 (leve)', () => {
    const r = calcularEscore({ amostras: comDessaturacoes() });
    assert.equal(r.oximetria.dessaturacoes, 60);
    assert.equal(r.oximetria.ido, 12);
    assert.equal(r.indiceEventos, 12);
    assert.equal(r.gravidade, 'leve');
    assert.equal(r.oximetria.spo2Minima, 92);
    assert.equal(r.eventos[0].tipo, 'dessaturacao');
    assert.equal(r.eventos[0].quedaSpo2, 5);
  });

  test('gravidade acompanha a frequência dos eventos', () => {
    const moderada = calcularEscore({ amostras: comDessaturacoes({ periodo: 150, inicio: 100 }) }); // 24/h
    assert.equal(moderada.indiceEventos, 24);
    assert.equal(moderada.gravidade, 'moderada');
    const grave = calcularEscore({ amostras: comDessaturacoes({ periodo: 100, inicio: 60 }) }); // 36/h
    assert.equal(grave.indiceEventos, 36);
    assert.equal(grave.gravidade, 'grave');
  });

  test('queda menor que o critério (2 pontos) não conta', () => {
    const r = calcularEscore({ amostras: comDessaturacoes({ queda: 2 }) });
    assert.equal(r.indiceEventos, 0);
  });

  test('critério de 3% por padrão e de 4% por opção', () => {
    const amostras = comDessaturacoes({ queda: 3 });
    assert.equal(PADROES.quedaDessaturacaoPct, 3);
    assert.equal(calcularEscore({ amostras }).indiceEventos, 12);
    const r4 = calcularEscore({ amostras }, { quedaDessaturacaoPct: 4 });
    assert.equal(r4.indiceEventos, 0);
    assert.equal(r4.oximetria.criterioPct, 4);
  });

  test('queda mais curta que 10 s é ignorada', () => {
    const r = calcularEscore({ amostras: comDessaturacoes({ duracao: 6 }) });
    assert.equal(r.indiceEventos, 0);
  });

  test('queda sem recuperação em 2 min é mudança de linha de base, não evento', () => {
    const amostras = serie(HORAS(5), (t) => ({ spo2: t < HORAS(1) ? 97 : 85, fc: 60 }));
    const r = calcularEscore({ amostras });
    assert.equal(r.oximetria.dessaturacoes, 0);
    assert.ok(r.oximetria.t90Pct > 70, 'o tempo abaixo de 90% aparece no T90');
  });

  test('T90 e SpO2 média/mínima', () => {
    const r = calcularEscore({ amostras: serie(100, (t) => ({ spo2: t < 50 ? 85 : 95 })) });
    assert.equal(r.oximetria.t90Pct, 50);
    assert.equal(r.oximetria.spo2Media, 90);
    assert.equal(r.oximetria.spo2Minima, 85);
  });

  test('SpO2 < 80% gera alerta', () => {
    const r = calcularEscore({ amostras: serie(100, (t) => ({ spo2: t === 10 ? 75 : 95 })) });
    assert.ok(r.alertas.some((a) => /abaixo de 80%/.test(a)));
  });
});

describe('calcularEscore: qualidade dos dados', () => {
  test('menos de 4 h válidas: alerta e suficiente = false', () => {
    const r = calcularEscore({ amostras: serie(HORAS(2), () => ({ spo2: 97, fc: 60 })) });
    assert.equal(r.qualidade.suficiente, false);
    assert.ok(r.alertas.some((a) => /mínimo recomendado é 4 h/.test(a)));
  });

  test('exatamente 4 h é suficiente', () => {
    const r = calcularEscore({ amostras: serie(HORAS(4), () => ({ spo2: 97 })) });
    assert.equal(r.qualidade.suficiente, true);
  });

  test('sem respiração: alerta de que o índice usa só o IDO', () => {
    const r = calcularEscore({ amostras: serie(HORAS(5), () => ({ spo2: 97 })) });
    assert.equal(r.respiracao.fonte, null);
    assert.equal(r.respiracao.hipopneias, null);
    assert.ok(r.alertas.some((a) => /Sem dados de respiração/.test(a)));
  });

  test('SpO2 inválida (0 = sem leitura do firmware) não conta como hora válida', () => {
    const amostras = serie(HORAS(5), (t) => ({ spo2: t < HORAS(1) ? 97 : 0, fc: 0 }));
    const r = calcularEscore({ amostras });
    assert.equal(r.qualidade.horasValidas, 1);
    assert.equal(r.qualidade.horasTotais, 5);
    assert.equal(r.qualidade.suficiente, false);
    assert.equal(r.oximetria.spo2Minima, 97);
    assert.equal(r.cardiaco.fcMedia, null);
  });

  test('tudo inválido: índice e gravidade nulos, sem exceção', () => {
    const r = calcularEscore({ amostras: serie(100, () => ({ spo2: 0, fc: 0 })) });
    assert.equal(r.indiceEventos, null);
    assert.equal(r.gravidade, null);
    assert.equal(r.oximetria.spo2Media, null);
    assert.equal(r.oximetria.ido, null);
  });

  test('valores fora dos limites fisiológicos são descartados', () => {
    const r = calcularEscore({ amostras: serie(100, (t) => ({ spo2: t === 5 ? 30 : 95, fc: t === 5 ? 400 : 70 })) });
    assert.equal(r.oximetria.spo2Minima, 95);
    assert.equal(r.cardiaco.fcMaxima, 70);
  });

  test('estatísticas de FC', () => {
    const r = calcularEscore({ amostras: serie(100, (t) => ({ spo2: 95, fc: 60 + (t % 3) * 10 })) });
    assert.equal(r.cardiaco.fcMinima, 60);
    assert.equal(r.cardiaco.fcMaxima, 80);
  });
});

describe('calcularEscore: respiração', () => {
  // Respirações a cada 4 s, com pausa de `pausa` s no começo de cada ciclo de `ciclo` s.
  const respiracoesComPausas = ({ horas = 5, ciclo = 300, pausa = 25 } = {}) => {
    const t = [];
    for (let s = 0; s < HORAS(horas); s += 4) if (s % ciclo < 100 || s % ciclo >= 100 + pausa) t.push(s);
    return t;
  };

  test('pausas >= 10 s entre respirações viram apneias', () => {
    const amostras = serie(HORAS(5), () => ({ spo2: 97, fc: 60 }));
    const r = calcularEscore({ amostras, respiracoes: respiracoesComPausas() });
    assert.equal(r.respiracao.fonte, 'respiracoes');
    assert.equal(r.respiracao.apneias, 60);
    assert.equal(r.respiracao.hipopneias, 0);
    assert.equal(r.indiceEventos, 12);
    assert.equal(r.respiracao.frMedia, 15);
    assert.equal(r.eventos[0].tipo, 'apneia');
    assert.equal(r.eventos[0].duracaoS, 32);
  });

  test('intervalo de 9 s não é apneia; 10 s é', () => {
    const amostras = serie(HORAS(5), () => ({ spo2: 97 }));
    assert.equal(calcularEscore({ amostras, respiracoes: [0, 9, 13, 17] }).respiracao.apneias, 0);
    assert.equal(calcularEscore({ amostras, respiracoes: [0, 10, 14, 18] }).respiracao.apneias, 1);
  });

  test('pausa maior que 120 s é perda de sinal, não apneia', () => {
    const amostras = serie(HORAS(5), () => ({ spo2: 97 }));
    const r = calcularEscore({ amostras, respiracoes: [0, 4, 8, 200, 204, 208] });
    assert.equal(r.respiracao.apneias, 0);
  });

  test('dessaturação logo após a pausa é associada a ela (não vira hipopneia extra)', () => {
    const amostras = serie(HORAS(5), (t) => ({ spo2: t % 300 >= 110 && t % 300 < 140 ? 92 : 97, fc: 60 }));
    const r = calcularEscore({ amostras, respiracoes: respiracoesComPausas() });
    assert.equal(r.respiracao.apneias, 60);
    assert.equal(r.respiracao.hipopneias, 0);
    assert.equal(r.indiceEventos, 12);
    assert.equal(r.eventos[0].quedaSpo2, 5);
  });

  test('dessaturação sem pausa respiratória é contada como hipopneia', () => {
    const amostras = comDessaturacoes();
    const respiracoes = Array.from({ length: HORAS(5) / 4 }, (_, i) => i * 4); // respiração contínua
    const r = calcularEscore({ amostras, respiracoes });
    assert.equal(r.respiracao.apneias, 0);
    assert.equal(r.respiracao.hipopneias, 60);
    assert.equal(r.indiceEventos, 12);
  });

  test('apneia sem dessaturação conta no índice (o que o IDO sozinho perderia)', () => {
    const amostras = serie(HORAS(5), () => ({ spo2: 97, fc: 60 }));
    const r = calcularEscore({ amostras, respiracoes: respiracoesComPausas() });
    assert.equal(calcularEscore({ amostras }).indiceEventos, 0);
    assert.equal(r.indiceEventos, 12);
  });

  test('uma única respiração não basta: cai para a série de FR', () => {
    const r = calcularEscore({ amostras: serie(200, () => ({ spo2: 97, fr: 15 })), respiracoes: [5] });
    assert.equal(r.respiracao.fonte, 'fr');
  });

  test('modo FR: sequência de fr = 0 por >= 10 s é apneia', () => {
    const amostras = serie(HORAS(5), (t) => ({ spo2: 97, fc: 60, fr: t % 300 >= 100 && t % 300 < 115 ? 0 : 15 }));
    const r = calcularEscore({ amostras });
    assert.equal(r.respiracao.fonte, 'fr');
    assert.equal(r.respiracao.apneias, 60);
    assert.equal(r.respiracao.frMedia, 15);
    assert.equal(r.indiceEventos, 12);
  });

  test('modo FR: fr = 0 por menos de 10 s não é apneia', () => {
    const amostras = serie(HORAS(5), (t) => ({ spo2: 97, fr: t % 300 >= 100 && t % 300 < 108 ? 0 : 15 }));
    assert.equal(calcularEscore({ amostras }).respiracao.apneias, 0);
  });

  test('modo FR: FR inválida (fora de 0–60) interrompe a contagem da pausa', () => {
    const amostras = serie(60, (t) => ({ spo2: 97, fr: t >= 10 && t < 14 ? 0 : t >= 14 && t < 16 ? 99 : t >= 16 && t < 24 ? 0 : 15 }));
    assert.equal(calcularEscore({ amostras }).respiracao.apneias, 0);
  });
});

describe('calcularEscore: resposta da frequência cardíaca', () => {
  test('aumento de FC após o evento >= 6 bpm conta como resposta', () => {
    const amostras = serie(HORAS(5), (t) => {
      const c = t % 300;
      const desat = c >= 200 && c < 230;
      return { spo2: desat ? 92 : 97, fc: desat ? 55 : c >= 230 && c < 240 ? 75 : 60 };
    });
    const r = calcularEscore({ amostras });
    assert.equal(r.cardiaco.eventosComRespostaPct, 100);
    assert.ok(r.eventos.every((e) => e.aumentoFc >= PADROES.aumentoFcBpm));
  });

  test('FC constante: nenhum evento com resposta', () => {
    const r = calcularEscore({ amostras: comDessaturacoes() });
    assert.equal(r.cardiaco.eventosComRespostaPct, 0);
  });

  test('sem FC válida: resposta indeterminada (null)', () => {
    const amostras = comDessaturacoes().map(({ t, spo2 }) => ({ t, spo2 }));
    const r = calcularEscore({ amostras });
    assert.equal(r.cardiaco.eventosComRespostaPct, null);
    assert.equal(r.eventos[0].aumentoFc, null);
  });
});
