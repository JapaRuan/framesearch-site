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

// ---------- Vídeo de fundo: parallax + scrub no scroll ----------
(function bgVideoParallax() {
  const video = document.getElementById("bg-video");
  if (!video) return;

  let ticking = false;
  let duration = 0;

  video.addEventListener("loadedmetadata", () => {
    duration = video.duration || 0;
    // Autoplay mudo; se o navegador bloquear, o poster/overlay cobre a ausência de movimento.
    video.play().catch(() => {});
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

    const title = document.createElement("span");
    title.className = "card-title";
    title.textContent = item.title;

    card.appendChild(img);
    card.appendChild(video);
    card.appendChild(playBtn);
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

  function playCard(card) {
    const video = card.querySelector("video");
    const poster = card.querySelector("img.poster");
    const btn = card.querySelector(".play-btn");
    if (!video.src) video.src = video.dataset.src;
    video
      .play()
      .then(() => {
        poster.style.opacity = "0";
        btn.hidden = true;
      })
      .catch(() => {
        // Autoplay bloqueado (ex.: economia de dados): mantém poster + botão de play visível.
        btn.hidden = false;
      });
  }

  function pauseCard(card) {
    const video = card.querySelector("video");
    const poster = card.querySelector("img.poster");
    video.pause();
    poster.style.opacity = "1";
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
          playCard(card);
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

  // Clique no botão de play (fallback de autoplay bloqueado).
  track.addEventListener("click", (e) => {
    const btn = e.target.closest(".play-btn");
    if (!btn) return;
    const card = btn.closest(".carousel-card");
    playCard(card);
  });

  // Centraliza o primeiro card e ativa.
  requestAnimationFrame(() => {
    cards[0]?.scrollIntoView({ inline: "center", block: "nearest" });
    updateActive();
  });
}
