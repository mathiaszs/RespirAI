// Modo demonstração: noites reais da St. Vincent's / UCD Sleep Apnea Database (PhysioNet),
// já no formato que o dispositivo envia (1 Hz + instantes das respirações).

export async function carregarIndiceDemo() {
  const resposta = await fetch('demo/indice.json');
  if (!resposta.ok) throw new Error('Não encontrei os dados de demonstração.');
  return resposta.json();
}

export async function carregarNoiteDemo(id) {
  const resposta = await fetch(`demo/${encodeURIComponent(id)}.json`);
  if (!resposta.ok) throw new Error(`Não encontrei a noite ${id}.`);
  const n = await resposta.json();
  // A base anonimiza as datas; só o horário de início é real.
  const inicio = new Date(2000, 0, 1, n.inicio.hora, n.inicio.minuto, n.inicio.segundo);
  return {
    rotulo: `Noite de exemplo (registro ${id.replace('ucddb', '')} da base UCD)`,
    inicioEpochS: inicio.getTime() / 1000,
    amostras: n.spo2.map((spo2, t) => ({ t, spo2, fc: n.fc[t] })),
    respiracoes: n.respiracoes,
    referencia: {
      iah: n.referencia.iah,
      eventos: n.referencia.eventos.map(([inicioEvento, fim, tipo]) => ({ inicio: inicioEvento, fim, tipo })),
    },
  };
}
