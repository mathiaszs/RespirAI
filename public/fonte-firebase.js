// Modo Firebase: lê as leituras do dispositivo no Realtime Database.
// Formato esperado (uma leitura por segundo):
//   /leituras/<dispositivoId>/<id> = { timestamp: <ms desde 1970>, spo2: 96, bpm: 64, resp: 0 | 1 | 2, fr?: 15 }
// `resp` é o número de respirações detectadas naquele segundo; sem ele, o escore usa `fr` (0 = sem respiração).

const VERSAO_SDK = '10.12.2';
const configuracao = {
  apiKey: 'AIzaSyAfLw5O3huHBIx73PlwBFEXLxL04P-givs',
  authDomain: 'tcc-mecatronica-b7885.firebaseapp.com',
  databaseURL: 'https://tcc-mecatronica-b7885-default-rtdb.firebaseio.com',
  projectId: 'tcc-mecatronica-b7885',
  storageBucket: 'tcc-mecatronica-b7885.firebasestorage.app',
  messagingSenderId: '832352781537',
  appId: '1:832352781537:web:84c9e777da5f33b8a923a0',
};

let sdk = null;

async function carregarSdk() {
  if (sdk) return sdk;
  const base = `https://www.gstatic.com/firebasejs/${VERSAO_SDK}`;
  const [app, auth, banco] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-database.js`),
  ]);
  const instancia = app.initializeApp(configuracao);
  sdk = { ...auth, ...banco, auth: auth.getAuth(instancia), db: banco.getDatabase(instancia) };
  return sdk;
}

export async function observarLogin(callback) {
  const s = await carregarSdk();
  return s.onAuthStateChanged(s.auth, callback);
}

export async function entrar(email, senha) {
  const s = await carregarSdk();
  try {
    await s.signInWithEmailAndPassword(s.auth, email, senha);
  } catch (erro) {
    throw new Error(mensagemDeErro(erro));
  }
}

export async function sair() {
  const s = await carregarSdk();
  await s.signOut(s.auth);
}

export function validarDispositivo(id) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('Use só letras, números, "-" e "_" no ID do dispositivo.');
  return id;
}

// Uma noite = das 18h do dia escolhido às 12h do dia seguinte.
export function janelaDaNoite(dataIso) {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  return { de: new Date(ano, mes - 1, dia, 18).getTime(), ate: new Date(ano, mes - 1, dia + 1, 12).getTime() };
}

// Só confere se existe alguma leitura na noite, sem baixar a noite inteira.
export async function temLeitura(dispositivo, dataIso) {
  const s = await carregarSdk();
  const { de, ate } = janelaDaNoite(dataIso);
  const consulta = s.query(
    s.ref(s.db, `leituras/${validarDispositivo(dispositivo)}`),
    s.orderByChild('timestamp'),
    s.startAt(de),
    s.endAt(ate),
    s.limitToFirst(1),
  );
  try {
    return (await s.get(consulta)).exists();
  } catch (erro) {
    throw new Error(mensagemDeErro(erro));
  }
}

export async function carregarNoite(dispositivo, dataIso) {
  const s = await carregarSdk();
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  const { de, ate } = janelaDaNoite(dataIso);
  const consulta = s.query(
    s.ref(s.db, `leituras/${validarDispositivo(dispositivo)}`),
    s.orderByChild('timestamp'),
    s.startAt(de),
    s.endAt(ate),
  );
  try {
    const foto = await s.get(consulta);
    const leituras = [];
    foto.forEach((filho) => {
      leituras.push(filho.val());
    });
    if (!leituras.length) throw new Error('Nenhuma leitura nessa noite para esse dispositivo.');
    return converter(leituras, `Noite de ${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano}`);
  } catch (erro) {
    throw new Error(mensagemDeErro(erro));
  }
}

// Acompanha as últimas 30 min de leituras; devolve a função que encerra a escuta.
export async function ouvirAoVivo(dispositivo, callback, aoFalhar) {
  const s = await carregarSdk();
  const consulta = s.query(
    s.ref(s.db, `leituras/${validarDispositivo(dispositivo)}`),
    s.orderByChild('timestamp'),
    s.limitToLast(1800),
  );
  return s.onValue(
    consulta,
    (foto) => {
      const leituras = [];
      foto.forEach((filho) => {
        leituras.push(filho.val());
      });
      callback(leituras.length ? converter(leituras, 'Ao vivo') : null);
    },
    (erro) => aoFalhar(new Error(mensagemDeErro(erro))),
  );
}

function converter(leituras, rotulo) {
  const validas = leituras.filter((l) => l && Number.isFinite(l.timestamp)).sort((a, b) => a.timestamp - b.timestamp);
  const t0 = validas[0].timestamp;
  const temResp = validas.some((l) => Number.isFinite(l.resp));
  const respiracoes = [];
  const amostras = validas.map((l) => {
    const t = Math.round((l.timestamp - t0) / 1000);
    for (let i = 0; i < (l.resp ?? 0); i++) respiracoes.push(t);
    return { t, spo2: l.spo2, fc: l.bpm, fr: l.fr };
  });
  return {
    rotulo,
    inicioEpochS: t0 / 1000,
    ultimaLeituraMs: validas.at(-1).timestamp,
    amostras,
    respiracoes: temResp ? respiracoes : undefined,
  };
}

function mensagemDeErro(erro) {
  const codigo = erro?.code ?? '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(codigo)) return 'E-mail ou senha incorretos.';
  if (/operation-not-allowed|configuration-not-found/.test(codigo)) {
    return 'O login por e-mail e senha ainda não está ativado. No Firebase Console: Authentication → Método de login → E-mail/senha.';
  }
  if (/permission[_-]denied/i.test(codigo) || /permission/i.test(erro?.message ?? '')) {
    return 'Sem permissão para ler esse dispositivo. Confira as regras do banco e o vínculo em /donos.';
  }
  if (/index-not-defined|indexOn/i.test(erro?.message ?? '')) {
    return 'Falta o índice ".indexOn": ["timestamp"] nas regras do banco.';
  }
  if (/network/i.test(codigo)) return 'Sem conexão com o Firebase.';
  return erro?.message ?? 'Erro desconhecido.';
}
