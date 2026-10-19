// Simula o gateway: grava leituras falsas em /leituras/<id> no formato do dashboard,
// para testar o Firebase e o dashboard sem o hardware.
//
//   FIREBASE_USUARIO=gateway@exemplo.com FIREBASE_SENHA_USUARIO=... \
//   node tools/simular-dispositivo.mjs --id respirai-01 [--historico 360] [--ao-vivo]
//
//   --historico N  grava N minutos de passado (termina agora); padrão 0
//   --noite AAAA-MM-DD  grava uma noite completa (das 23h do dia até as 7h do dia seguinte, hora local);
//                  é a que a aba "Noite" do dashboard mostra. A data precisa ser anterior a hoje.
//   --horas N      duração da noite com --noite; padrão 8
//   --ao-vivo      depois continua gravando 1 leitura por segundo (Ctrl+C para parar)
//
// Credenciais só por variáveis de ambiente (nunca no código). Precisa de Node 18+.
const API_KEY = 'AIzaSyAfLw5O3huHBIx73PlwBFEXLxL04P-givs'; // pública, a mesma de public/fonte-firebase.js
const DB = 'https://tcc-mecatronica-b7885-default-rtdb.firebaseio.com';

const args = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : padrao;
};
const id = opcao('id', 'respirai-01');
const historicoMin = Number(opcao('historico', 0));
const aoVivo = args.includes('--ao-vivo');
const noite = opcao('noite', null);
const horas = Number(opcao('horas', 8));
if (noite && !/^\d{4}-\d{2}-\d{2}$/.test(noite)) throw new Error('Use --noite AAAA-MM-DD, por exemplo --noite 2026-10-19.');
if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('ID inválido: use letras, números, "-" e "_".');
const { FIREBASE_USUARIO: email, FIREBASE_SENHA_USUARIO: password } = process.env;
if (!email || !password) throw new Error('Defina FIREBASE_USUARIO e FIREBASE_SENHA_USUARIO.');

async function entrar() {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Login falhou: ${j.error?.message ?? r.status}`);
  return j.idToken;
}

// A cada ~5 min uma pausa de 20 s: FC cai, SpO2 cai 5 pontos, depois a FC dispara.
function leitura(tMs) {
  const c = Math.floor(tMs / 1000) % 300;
  const evento = c >= 200 && c < 220;
  const apos = c >= 220 && c < 230;
  const ruido = (x) => Math.round((Math.random() - 0.5) * x);
  return {
    timestamp: tMs,
    spo2: Math.max(50, Math.min(100, (evento ? 92 : 97) + ruido(1))),
    bpm: (evento ? 54 : apos ? 76 : 62) + ruido(3),
    resp: evento ? 0 : c % 4 === 0 ? 1 : 0, // ~15 respirações/min, nenhuma durante a pausa
  };
}

let token = await entrar();
const gravar = async (lote) => {
  const corpo = Object.fromEntries(lote.map((l) => [String(l.timestamp), l]));
  let r = await fetch(`${DB}/leituras/${id}.json?auth=${token}`, { method: 'PATCH', body: JSON.stringify(corpo) });
  if (r.status === 401) {
    token = await entrar();
    r = await fetch(`${DB}/leituras/${id}.json?auth=${token}`, { method: 'PATCH', body: JSON.stringify(corpo) });
  }
  if (!r.ok) throw new Error(`Gravação falhou (${r.status}): ${await r.text()}`);
};

// Grava `total` segundos de leituras a partir de `inicioMs`, em lotes de 500.
async function gravarPeriodo(inicioMs, total) {
  for (let i = 0; i < total; i += 500) {
    const lote = [];
    for (let j = i; j < Math.min(i + 500, total); j++) lote.push(leitura(inicioMs + j * 1000));
    await gravar(lote);
    process.stdout.write(`\rgravado: ${Math.min(i + 500, total)}/${total}`);
  }
  console.log('');
}

const agora = Math.floor(Date.now() / 1000) * 1000;
if (historicoMin > 0) {
  const total = historicoMin * 60;
  await gravarPeriodo(agora - total * 1000, total);
  console.log('Histórico gravado.');
}
if (noite) {
  const [ano, mes, dia] = noite.split('-').map(Number);
  const inicio = new Date(ano, mes - 1, dia, 23).getTime();
  const total = Math.round(horas * 3600);
  if (inicio + total * 1000 > agora) throw new Error('Essa noite ainda não terminou. Use uma data anterior (ex.: ontem).');
  await gravarPeriodo(inicio, total);
  console.log(`Noite de ${noite} gravada (${horas} h). No dashboard, escolha a data ${noite} na aba Noite.`);
}
if (aoVivo) {
  console.log(`Gravando ao vivo em /leituras/${id} (Ctrl+C para parar)`);
  for (;;) {
    await gravar([leitura(Math.floor(Date.now() / 1000) * 1000)]);
    await new Promise((r) => setTimeout(r, 1000));
  }
}
