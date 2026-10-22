// Modo Feira: apresentação automática em tela cheia, em loop, só com as noites de exemplo.
// Qualquer toque passa para o controle manual; depois de 60 s parado, o roteiro volta sozinho.
// Atalhos: ← → trocam de cena, espaço pausa/continua, 1 2 3 escolhem a noite de exemplo, F tela cheia, Esc sai.

const RETOMAR_MS = 60_000;
// Endereço do painel publicado no Firebase Hosting (usado no QR code quando o painel roda no próprio computador).
const URL_PUBLICA = 'https://tcc-mecatronica-b7885.web.app/';

const $ = (id) => document.getElementById(id);

export function criarModoFeira(api) {
  let ativo = false;
  let cena = 0;
  let timer = null;
  let retomar = null;
  let pausado = false;
  let rodada = 0;

  const ordemNoites = () => {
    const indice = api.indiceDemo() ?? [];
    const por = (g) => indice.find((n) => n.gravidade === g)?.id;
    return [por('moderada'), por('grave'), por('leve')].filter(Boolean);
  };

  const CENAS = [
    {
      titulo: 'O que é o RespirAI',
      texto: 'Toque na tela para explorar. As setas ← → trocam de cena.',
      duracao: 12_000,
      entrar() {
        $('feira-abertura').hidden = false;
      },
      sair() {
        $('feira-abertura').hidden = true;
      },
    },
    {
      titulo: 'Agora: o monitor acompanhando a noite',
      texto: 'Oxigênio, batimentos e respiração a cada segundo. Quando a respiração para, o painel avisa. Reprodução em tempo real de uma noite real de exemplo.',
      duracao: 32_000,
      async entrar() {
        const grave = (api.indiceDemo() ?? []).find((n) => n.gravidade === 'grave')?.id;
        if (grave) await api.selecionarDemo(grave);
        api.trocarAba('vivo');
        api.irParaTrechoComEventos();
        api.escolherVelocidade(1);
        api.tocar(true);
        rolarPara(null);
      },
      sair() {
        api.tocar(false);
      },
    },
    {
      titulo: 'O resultado da noite',
      texto: 'Quantas vezes por hora a respiração parou ou ficou fraca, classificado como na medicina do sono.',
      duracao: 15_000,
      async entrar() {
        const noites = ordemNoites();
        api.trocarAba('noite');
        if (noites.length) await api.selecionarDemo(noites[rodada % noites.length]);
        rolarPara(null);
      },
    },
    {
      titulo: 'Comparado ao exame de laboratório',
      texto: 'As noites de exemplo também passaram pela polissonografia, o exame padrão. O RespirAI chegou à mesma classificação.',
      duracao: 15_000,
      entrar() {
        api.trocarAba('noite');
        rolarPara($('cartao-validacao'));
      },
    },
    {
      titulo: 'Como funciona',
      texto: 'Do sensor no dedo até esta tela, uma leitura por segundo.',
      duracao: 16_000,
      entrar() {
        api.trocarAba('como');
        rolarPara(null);
      },
      sair() {
        rodada++;
      },
    },
  ];

  function rolarPara(el) {
    const comportamento = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    if (!el || el.hidden) window.scrollTo({ top: 0, behavior: comportamento });
    else el.scrollIntoView({ behavior: comportamento, block: 'start' });
  }

  function desenharPontos() {
    $('feira-pontos').replaceChildren(
      ...CENAS.map((_, i) => {
        const p = document.createElement('i');
        if (i === cena) p.className = 'atual';
        return p;
      }),
    );
  }

  function atualizarEstado() {
    $('feira-estado').textContent = pausado
      ? 'Controle manual · o roteiro volta sozinho em 1 min'
      : `Automático · cena ${cena + 1} de ${CENAS.length} · espaço pausa`;
  }

  function animarProgresso(duracao) {
    const barra = $('feira-progresso');
    barra.style.transition = 'none';
    barra.style.width = '0%';
    if (pausado) return;
    barra.getBoundingClientRect(); // aplica o 0% antes de animar
    barra.style.transition = `width ${duracao}ms linear`;
    barra.style.width = '100%';
  }

  async function irPara(i) {
    clearTimeout(timer);
    CENAS[cena]?.sair?.();
    cena = (i + CENAS.length) % CENAS.length;
    const c = CENAS[cena];
    $('feira-cena').textContent = c.titulo;
    $('feira-texto').textContent = c.texto;
    desenharPontos();
    atualizarEstado();
    animarProgresso(c.duracao);
    try {
      await c.entrar();
    } catch {
      /* uma cena que falha não pode travar a apresentação */
    }
    if (!pausado && ativo) timer = setTimeout(() => irPara(cena + 1), c.duracao);
  }

  function pausar() {
    pausado = true;
    clearTimeout(timer);
    animarProgresso(0);
    atualizarEstado();
    clearTimeout(retomar);
    retomar = setTimeout(continuar, RETOMAR_MS);
  }

  function continuar() {
    clearTimeout(retomar);
    pausado = false;
    irPara(cena);
  }

  function aoTeclar(ev) {
    if (!ativo || ev.target.closest?.('input, select, textarea')) return;
    const noites = (api.indiceDemo() ?? []).map((n) => n.id);
    if (ev.key === 'ArrowRight') {
      pausado = false;
      irPara(cena + 1);
    } else if (ev.key === 'ArrowLeft') {
      pausado = false;
      irPara(cena - 1);
    } else if (ev.key === ' ') {
      ev.preventDefault();
      if (pausado) continuar();
      else pausar();
    } else if (/^[1-9]$/.test(ev.key) && noites[Number(ev.key) - 1]) {
      pausar();
      CENAS[cena]?.sair?.();
      $('feira-abertura').hidden = true;
      api.trocarAba('noite');
      api.selecionarDemo(noites[Number(ev.key) - 1]);
      rolarPara(null);
    } else if (ev.key === 'f' || ev.key === 'F') {
      alternarTelaCheia();
    } else if (ev.key === 'Escape' && !document.fullscreenElement) {
      sair();
    } else {
      return;
    }
    ev.stopPropagation();
  }

  // Toque, clique ou rolagem do visitante: controle manual por um tempo.
  function aoInteragir(ev) {
    if (!ativo || ev.target.closest?.('#feira-barra')) return;
    if (ev.type === 'pointerdown' && cena === 0 && !pausado) {
      // Na abertura, o primeiro toque leva direto ao painel ao vivo.
      pausado = false;
      irPara(1);
      return;
    }
    pausar();
  }

  function alternarTelaCheia() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  async function desenharQr() {
    const alvo = $('feira-qr');
    if (alvo.childElementCount) return;
    try {
      await carregarScript('vendor/qrcode.js');
      const local = /^(localhost|127\.|192\.168\.|10\.|\[::1\])/.test(location.hostname) || location.protocol === 'file:';
      const url = local ? URL_PUBLICA : `${location.origin}${location.pathname}`;
      const qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      const n = qr.getModuleCount();
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg');
      svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
      svg.setAttribute('shape-rendering', 'crispEdges');
      let d = '';
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', '#0b1026');
      svg.append(p);
      alvo.append(svg);
      alvo.title = url;
    } catch {
      alvo.parentElement.hidden = true;
    }
  }

  function entrar({ telaCheia = false } = {}) {
    if (ativo) return;
    ativo = true;
    pausado = false;
    rodada = 0;
    document.body.classList.add('feira');
    $('feira-barra').hidden = false;
    if (telaCheia) alternarTelaCheia();
    desenharQr();
    document.addEventListener('keydown', aoTeclar, true);
    document.addEventListener('pointerdown', aoInteragir, true);
    document.addEventListener('wheel', aoInteragir, { capture: true, passive: true });
    api.garantirDemo().then(() => irPara(0));
  }

  function sair() {
    if (!ativo) return;
    ativo = false;
    clearTimeout(timer);
    clearTimeout(retomar);
    CENAS[cena]?.sair?.();
    $('feira-abertura').hidden = true;
    $('feira-barra').hidden = true;
    document.body.classList.remove('feira');
    document.removeEventListener('keydown', aoTeclar, true);
    document.removeEventListener('pointerdown', aoInteragir, true);
    document.removeEventListener('wheel', aoInteragir, { capture: true });
    if (document.fullscreenElement) document.exitFullscreen?.();
    const url = new URL(location.href);
    if (url.searchParams.has('feira')) {
      url.searchParams.delete('feira');
      history.replaceState(null, '', url);
    }
  }

  $('feira-sair').addEventListener('click', sair);
  return { entrar, sair, ativo: () => ativo };
}

function carregarScript(src) {
  return new Promise((ok, falha) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => falha(new Error(`não consegui carregar ${src}`));
    document.head.append(s);
  });
}
