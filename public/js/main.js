"use strict";

/* =========================================================
   FrameSearch — front-end
   - Header liquid glass reativo a scroll/cursor
   - Gate de lead (nome + telefone BR) antes do portfólio
   - Carrossel coverflow com lazy-load de vídeo
   - Parallax/scrub do vídeo de fundo
   ========================================================= */

const UNLOCK_KEY = "fs_portfolio_unlocked";

// Precisa existir antes da IIFE do gate: para quem já tem o flag de desbloqueio salvo
// (localStorage), unlock() -> initCarousel() roda de forma SÍNCRONA durante o parse
// inicial do script, ou seja, antes de qualquer `let` declarado mais abaixo no arquivo
// executar. Declarar aqui em cima evita cair na temporal dead zone (bug real encontrado
// em teste: "Cannot access 'carouselInitialized' before initialization").
let carouselInitialized = false;

// ---------- Header: scroll state + specular reagindo ao cursor ----------
(function headerGlass() {
  const header = document.getElementById("site-header");
  if (!header) return;

  const onScroll = () => {
    header.classList.toggle("scrolled", window.scrollY > 12);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  document.querySelectorAll(".glass").forEach((panel) => {
    panel.addEventListener("pointermove", (e) => {
      const rect = panel.getBoundingClientRect();
      const relX = ((e.clientX - rect.left) / rect.width) * 100;
      panel.style.setProperty("--specular-pos", `${relX}%`);
    });
  });
})();

// ---------- Menu mobile: hambúrguer abre/fecha a nav em telas estreitas ----------
(function navToggle() {
  const toggle = document.getElementById("nav-toggle");
  const nav = document.getElementById("site-nav");
  if (!toggle || !nav) return;

  function closeNav() {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Abrir menu");
  }

  function openNav() {
    nav.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Fechar menu");
  }

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.contains("is-open");
    if (isOpen) closeNav();
    else openNav();
  });

  // Fecha ao clicar num link (navegação por âncora) ou fora do menu/botão.
  nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeNav));
  document.addEventListener("click", (e) => {
    if (!nav.classList.contains("is-open")) return;
    if (nav.contains(e.target) || toggle.contains(e.target)) return;
    closeNav();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeNav();
  });

  // Se a tela crescer para o layout desktop (nav sempre visível em linha),
  // garante que o menu não fique "preso aberto" com estado de mobile.
  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) closeNav();
  });
})();

// ---------- Vídeo de fundo: parallax + scrub no scroll ----------
(function bgVideoParallax() {
  const video = document.getElementById("bg-video");
  if (!video) return;

  let ticking = false;
  let duration = 0;

  // iOS Safari só garante autoplay de forma confiável quando muted+playsinline+autoplay
  // já estão como atributos HTML (feito no index.html) E o estado JS do elemento também
  // está mudo antes de qualquer tentativa de play() — setar aqui de novo é defensivo
  // contra navegador que ignore/perca o atributo em alguma condição de carregamento.
  video.muted = true;
  video.defaultMuted = true;

  // play() pode falhar silenciosamente (política de autoplay, "Modo de Baixo Consumo"
  // do iOS, ou o vídeo ainda não ter dado buffer suficiente). Em vez de tentar uma vez
  // só no loadedmetadata e desistir para sempre se falhar, tenta de novo em outros
  // eventos do próprio ciclo de vida do vídeo — sem isso, uma falha isolada de rede no
  // primeiro segundo deixa o fundo travado (preto/poster) pelo resto da visita.
  function tentarTocar() {
    const p = video.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }

  tentarTocar();
  video.addEventListener("loadedmetadata", () => {
    duration = video.duration || 0;
    tentarTocar();
  });
  video.addEventListener("canplay", tentarTocar);
  video.addEventListener("canplaythrough", tentarTocar);

  // iOS pausa vídeo de fundo ao trocar de app/aba ou ao voltar de navegação via
  // bfcache (gesto de swipe-back do Safari); sem isso o vídeo fica congelado no
  // primeiro frame quando o usuário volta para a aba.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && video.paused) tentarTocar();
  });
  window.addEventListener("pageshow", () => {
    if (video.paused) tentarTocar();
  });

  function update() {
    ticking = false;
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const progress = docHeight > 0 ? Math.min(1, Math.max(0, scrollTop / docHeight)) : 0;

    // Parallax sutil: desloca o vídeo verticalmente numa fração do scroll.
    video.style.transform = `translateY(${progress * -40}px) scale(1.08)`;

    // Scrub leve: acompanha o progresso da página no próprio vídeo (sem travar o loop natural
    // quando o vídeo está tocando — só corrige deriva quando a página muda rápido).
    if (duration > 0 && video.paused) {
      video.currentTime = progress * duration;
    }
  }

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    },
    { passive: true }
  );
})();

// ---------- Scroll-reveal: fade/slide um bloco de cada vez ao rolar ----------
(function scrollReveal() {
  const reveals = Array.from(document.querySelectorAll("[data-reveal]"));
  if (!reveals.length) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Itens dentro do mesmo grupo (ex.: os cards de .servicos-grid) recebem um
  // atraso incremental via custom property, para aparecer em sequência (stagger)
  // em vez de todos ao mesmo tempo assim que o grupo entra na viewport.
  const grupos = new Map();
  reveals.forEach((el) => {
    const grupo = el.closest("[data-reveal-group]") || el;
    if (!grupos.has(grupo)) grupos.set(grupo, []);
    grupos.get(grupo).push(el);
  });
  grupos.forEach((itens) => {
    itens.forEach((el, i) => {
      el.style.setProperty("--reveal-delay", prefersReducedMotion ? "0ms" : `${i * 90}ms`);
    });
  });

  if (prefersReducedMotion) {
    // Sem animação de verdade: mostra tudo de imediato, sem esperar scroll.
    reveals.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
  );
  reveals.forEach((el) => observer.observe(el));
})();

// ---------- Validação de formulário (espelha server/validators.js) ----------
function validarNomeClient(nome) {
  const n = (nome || "").trim().replace(/\s+/g, " ");
  if (n.length < 2 || n.length > 120) return false;
  return /^[\p{L}][\p{L}'\-\s]*$/u.test(n);
}

function validarTelefoneClient(tel) {
  const digits = (tel || "").replace(/\D/g, "");
  let semDDI = digits;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    semDDI = digits.slice(2);
  }
  if (semDDI.length !== 10 && semDDI.length !== 11) return false;
  const ddd = Number(semDDI.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (semDDI.length === 11 && semDDI[2] !== "9") return false;
  return true;
}

// ---------- Gate de lead ----------
(function gate() {
  const form = document.getElementById("gate-form");
  const gateBox = document.getElementById("gate");
  const carouselWrap = document.getElementById("carousel-wrap");
  const statusEl = document.getElementById("gate-status");
  const submitBtn = document.getElementById("gate-submit");
  if (!form) return;

  function unlock() {
    gateBox.hidden = true;
    carouselWrap.hidden = false;
    initCarousel();
  }

  if (localStorage.getItem(UNLOCK_KEY) === "1") {
    unlock();
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nomeInput = document.getElementById("gate-nome");
    const telInput = document.getElementById("gate-telefone");
    const erroNome = document.getElementById("erro-nome");
    const erroTelefone = document.getElementById("erro-telefone");

    erroNome.textContent = "";
    erroTelefone.textContent = "";
    nomeInput.removeAttribute("aria-invalid");
    telInput.removeAttribute("aria-invalid");
    statusEl.textContent = "";
    statusEl.className = "gate-status";

    let valido = true;
    if (!validarNomeClient(nomeInput.value)) {
      erroNome.textContent = "Digite seu nome completo.";
      nomeInput.setAttribute("aria-invalid", "true");
      valido = false;
    }
    if (!validarTelefoneClient(telInput.value)) {
      erroTelefone.textContent = "Telefone inválido. Ex: (47) 99999-9999.";
      telInput.setAttribute("aria-invalid", "true");
      valido = false;
    }
    if (!valido) return;

    submitBtn.disabled = true; // evita duplo envio
    statusEl.textContent = "Enviando...";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nomeInput.value, telefone: telInput.value }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.erro || "Não foi possível enviar agora.");
      }

      localStorage.setItem(UNLOCK_KEY, "1");
      statusEl.textContent = "Liberado!";
      statusEl.classList.add("ok");
      setTimeout(unlock, 400);
    } catch (err) {
      statusEl.textContent =
        err.name === "AbortError"
          ? "Conexão demorou demais. Tente novamente."
          : err.message || "Erro ao enviar. Tente novamente.";
      statusEl.classList.add("erro");
      submitBtn.disabled = false;
    }
  });
})();

// ---------- Ícone de som do card ativo do carrossel ----------
function renderMuteIcon(isMuted) {
  return isMuted
    ? '<svg viewBox="0 0 24 24" fill="white"><path d="M16.5 12A4.5 4.5 0 0 0 14 8v2.18l2.45 2.45c.03-.2.05-.42.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-3.11-7.85-7-8.6v2.06c2.89.86 5 3.54 5 6.54zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.9 8.9 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="white"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.47 4.47 0 0 0 2.5-4zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4-.91 7-4.49 7-8.77s-3-7.86-7-8.77z"/></svg>';
}

// ---------- Carrossel coverflow com lazy-load ----------
async function initCarousel() {
  if (carouselInitialized) return;
  carouselInitialized = true;

  const track = document.getElementById("carousel");
  if (!track) return;

  let items = [];
  try {
    const res = await fetch("/video/portfolio.json");
    if (!res.ok) throw new Error("manifesto indisponível");
    items = await res.json();
  } catch (err) {
    track.innerHTML = `<p style="padding:24px;color:#ff8a8a;">Não foi possível carregar o portfólio agora. Atualize a página.</p>`;
    return;
  }

  if (!items.length) {
    track.innerHTML = `<p style="padding:24px;">Portfólio em atualização.</p>`;
    return;
  }

  track.innerHTML = "";
  items.forEach((item, i) => {
    const card = document.createElement("div");
    card.className = `carousel-card ${item.orientation === "horizontal" ? "horizontal" : ""}`;
    card.dataset.index = String(i);

    const img = document.createElement("img");
    img.className = "poster";
    img.loading = "lazy";
    img.alt = item.title;
    img.src = item.poster;

    const video = document.createElement("video");
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "none";
    video.dataset.src = item.video;
    video.poster = item.poster;

    const playBtn = document.createElement("button");
    playBtn.className = "play-btn";
    playBtn.setAttribute("aria-label", `Reproduzir ${item.title}`);
    playBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';

    // Só o card ativo/central toca com som (os outros ficam mudos para não virar
    // um coro de vídeos ao mesmo tempo). Botão visível apenas no card ativo,
    // permitindo ligar/desligar o som manualmente caso o navegador bloqueie o
    // autoplay com áudio.
    const muteBtn = document.createElement("button");
    muteBtn.className = "mute-btn";
    muteBtn.hidden = true;
    muteBtn.setAttribute("aria-label", `Ativar som de ${item.title}`);
    muteBtn.innerHTML = renderMuteIcon(true);

    const title = document.createElement("span");
    title.className = "card-title";
    title.textContent = item.title;

    card.appendChild(img);
    card.appendChild(video);
    card.appendChild(playBtn);
    card.appendChild(muteBtn);
    card.appendChild(title);
    track.appendChild(card);
  });

  const cards = Array.from(track.querySelectorAll(".carousel-card"));

  // Lazy-load: só injeta o src real do vídeo quando o card chega perto da viewport.
  const lazyObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const video = entry.target.querySelector("video");
          if (video && !video.src) {
            video.src = video.dataset.src;
          }
        }
      });
    },
    { root: track, rootMargin: "200px" }
  );
  cards.forEach((c) => lazyObserver.observe(c));

  function updateMuteIcon(muteBtn, video) {
    muteBtn.innerHTML = renderMuteIcon(video.muted);
    muteBtn.setAttribute(
      "aria-label",
      video.muted ? "Ativar som deste vídeo" : "Silenciar este vídeo"
    );
  }

  // card = card recém-ativado (central). Só ele deve tentar tocar com som — os demais
  // continuam mudos o tempo todo (ver pauseCard/updateActive).
  function playCard(card, { withSound } = { withSound: false }) {
    const video = card.querySelector("video");
    const poster = card.querySelector("img.poster");
    const btn = card.querySelector(".play-btn");
    const muteBtn = card.querySelector(".mute-btn");
    if (!video.src) video.src = video.dataset.src;

    // Já houve interação real do usuário para navegar até este card (clique no
    // gate, arraste/scroll do carrossel) — autoplay com som é uma extensão válida
    // dessa ativação de usuário na maioria dos navegadores. Se ainda assim for
    // bloqueado (política mais restrita), cai para mudo automaticamente e deixa
    // o botão de som visível para o usuário ativar com um clique direto, que
    // sempre é permitido.
    video.muted = !withSound;

    video
      .play()
      .then(() => {
        poster.style.opacity = "0";
        btn.hidden = true;
        if (muteBtn) {
          muteBtn.hidden = false;
          updateMuteIcon(muteBtn, video);
        }
      })
      .catch(() => {
        if (withSound && !video.muted) {
          // Autoplay com som recusado: tenta de novo mudo (isso quase sempre é permitido).
          video.muted = true;
          video.play().then(() => {
            poster.style.opacity = "0";
            btn.hidden = true;
            if (muteBtn) {
              muteBtn.hidden = false;
              updateMuteIcon(muteBtn, video);
            }
          }).catch(() => {
            btn.hidden = false;
          });
          return;
        }
        // Autoplay bloqueado (ex.: economia de dados): mantém poster + botão de play visível.
        btn.hidden = false;
      });
  }

  function pauseCard(card) {
    const video = card.querySelector("video");
    const poster = card.querySelector("img.poster");
    const muteBtn = card.querySelector(".mute-btn");
    video.pause();
    video.muted = true; // card deixou de ser o ativo: volta a ficar mudo por padrão.
    poster.style.opacity = "1";
    if (muteBtn) muteBtn.hidden = true;
  }

  function updateActive() {
    const trackRect = track.getBoundingClientRect();
    const center = trackRect.left + trackRect.width / 2;
    let closest = null;
    let closestDist = Infinity;

    cards.forEach((card) => {
      const r = card.getBoundingClientRect();
      const cardCenter = r.left + r.width / 2;
      const dist = Math.abs(cardCenter - center);
      if (dist < closestDist) {
        closestDist = dist;
        closest = card;
      }
    });

    cards.forEach((card) => {
      if (card === closest) {
        if (!card.classList.contains("is-active")) {
          card.classList.add("is-active");
          playCard(card, { withSound: true });
        }
      } else if (card.classList.contains("is-active")) {
        card.classList.remove("is-active");
        pauseCard(card);
      }
    });
  }

  let rafPending = false;
  track.addEventListener(
    "scroll",
    () => {
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          updateActive();
          rafPending = false;
        });
      }
    },
    { passive: true }
  );

  // Drag horizontal com mouse (touch já funciona nativamente via overflow-x).
  let isDown = false;
  let startX = 0;
  let scrollStart = 0;
  track.addEventListener("pointerdown", (e) => {
    isDown = true;
    startX = e.clientX;
    scrollStart = track.scrollLeft;
    track.setPointerCapture(e.pointerId);
  });
  track.addEventListener("pointermove", (e) => {
    if (!isDown) return;
    track.scrollLeft = scrollStart - (e.clientX - startX);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach((evt) =>
    track.addEventListener(evt, () => {
      isDown = false;
    })
  );

  // Clique no botão de play (fallback de autoplay bloqueado) — o usuário está
  // clicando diretamente no card, então já vale tentar com som.
  track.addEventListener("click", (e) => {
    const playBtnClicked = e.target.closest(".play-btn");
    if (playBtnClicked) {
      const card = playBtnClicked.closest(".carousel-card");
      playCard(card, { withSound: true });
      return;
    }

    // Clique no botão de som: alterna mudo/com som do card ativo. Isso acontece
    // dentro de um handler de clique real, então o navegador sempre permite.
    const muteBtnClicked = e.target.closest(".mute-btn");
    if (muteBtnClicked) {
      const card = muteBtnClicked.closest(".carousel-card");
      const video = card.querySelector("video");
      video.muted = !video.muted;
      updateMuteIcon(muteBtnClicked, video);
    }
  });

  // Centraliza o primeiro card e ativa.
  requestAnimationFrame(() => {
    cards[0]?.scrollIntoView({ inline: "center", block: "nearest" });
    updateActive();
  });
}
