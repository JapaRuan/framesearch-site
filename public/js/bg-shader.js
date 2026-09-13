"use strict";

/* =========================================================
   Fundo do site: shader GLSL em tempo real (p5.js, modo WEBGL),
   substituindo o antigo vídeo de arquivo (bg-loop.mp4).

   Por quê: vídeo de arquivo tem qualidade inconsistente entre
   aparelhos (compressão, banda, decodificação). Shader é cálculo
   puro executado na GPU do próprio visitante — mesma qualidade
   sempre, sem arquivo para baixar/decodificar.

   Abordagem didática seguida: setup de shader em p5.js (WEBGL),
   fragment shader customizado com uniforms/varying, conforme
   "Introduction to shaders: Learn the basics!" (p5.js, YouTube,
   id 3mfvZ-mdtZQ) — ver README para a referência completa.

   Comportamento do movimento (regra do operador, não é decorativo):
   - Ruído tipo "heat-haze": distorção orgânica sutil, não uma
     animação constante/previsível.
   - O AVANÇO DO TEMPO do ruído (variável `phase`) só acontece
     vinculado à velocidade do scroll. Não existe increment de
     tempo via requestAnimationFrame contínuo e incondicional:
     o rAF do p5 (`draw()`) só continua rodando enquanto ainda
     há "energia" de scroll para consumir (`amplitude > EPS`);
     quando decai abaixo do limiar, chama `noLoop()` e o canvas
     para de desenhar de verdade (não só "parece parado" — o
     navegador não gasta GPU/CPU nenhum com o shader parado).
   - Parado o scroll, a `amplitude` decai exponencialmente a cada
     frame e o campo de ruído assenta num padrão quase estático
     (o campo de ruído em si é função de UV + phase; com phase
     congelado, a imagem para de "respirar" e vira uma textura
     fixa).

   COR: propositalmente neutra/placeholder (tons de cinza em torno
   de --bg-dark). Decisão de paleta final (intensidade, saturação,
   temperatura) é do Colorista Master — ver README, seção
   "Pendências para o colorista-master". Não decidir isso aqui.

   Performance: canvas renderizado em resolução reduzida
   (RENDER_SCALE) e escalado via CSS (upscale), técnica padrão para
   shader de fundo — evita computar o fragment shader em cada pixel
   físico de uma tela retina/4K sem necessidade nenhuma, já que é um
   fundo desfocado atrás de conteúdo. RENDER_SCALE e OCTAVES são os
   dois botões de ajuste caso um teste de CPU-throttle (celular de
   entrada) mostrar engasgo — reduzir aqui antes de qualquer outra
   otimização.
   ========================================================= */

(function () {
  const container = document.getElementById("bg-shader-canvas");
  if (!container || typeof p5 === "undefined") return;

  // Menor: mais leve, mais "borrado" no upscale. 0.5 = metade da resolução
  // física em cada eixo (1/4 dos pixels calculados). Ajustável para baixo em
  // aparelhos fracos (ver README).
  const RENDER_SCALE = 0.55;

  // Nº de camadas de ruído somadas (fBm). Mais octaves = mais detalhe, mais
  // custo por pixel. Reduzir para 2 é o primeiro corte de performance.
  const OCTAVES = 3;

  const VERT_SHADER = `
    precision mediump float;
    attribute vec3 aPosition;
    varying vec2 vTexCoord;

    void main() {
      // p5 WEBGL entrega aPosition já em clip space (-1..1) para uma tela
      // cheia quando desenhada via p.rect() ocupando o canvas inteiro.
      vTexCoord = aPosition.xy * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 1.0);
    }
  `;

  const FRAG_SHADER = `
    precision highp float;
    varying vec2 vTexCoord;

    uniform vec2 u_resolution;
    uniform float u_phase;
    uniform float u_amplitude; // 0..1, energia de scroll ainda "viva"

    // Value noise 2D + fBm — implementação clássica de domínio público
    // (padrão da comunidade GLSL, mesma ideia usada em tutoriais de ruído
    // orgânico tipo heat-haze). Não depende de textura externa.
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    float fbm(vec2 p) {
      float total = 0.0;
      float amp = 0.5;
      for (int i = 0; i < ${OCTAVES}; i++) {
        total += noise(p) * amp;
        p *= 2.0;
        amp *= 0.5;
      }
      return total;
    }

    void main() {
      vec2 uv = vTexCoord;
      // Corrige aspecto para o ruído não esticar em telas largas/estreitas.
      float aspect = u_resolution.x / u_resolution.y;
      vec2 st = vec2(uv.x * aspect, uv.y);

      // Campo de distorção "heat-haze": desloca a própria coordenada de
      // amostragem por um ruído de baixa frequência antes de amostrar o
      // ruído final. A intensidade do deslocamento escala com u_amplitude —
      // parado o scroll (amplitude -> 0), a distorção quase desaparece e
      // sobra só o campo de ruído estático de base.
      vec2 warp = vec2(
        fbm(st * 1.6 + u_phase),
        fbm(st * 1.6 - u_phase + 4.2)
      );
      vec2 distorted = st + (warp - 0.5) * (0.12 + u_amplitude * 0.35);

      float pattern = fbm(distorted * 2.2 + u_phase * 0.3);

      // Paleta neutra/placeholder em torno do fundo escuro da marca —
      // decisão de cor final é do Colorista Master.
      vec3 corBase = vec3(0.03, 0.035, 0.045);
      vec3 corAlta = vec3(0.16, 0.165, 0.175);
      vec3 cor = mix(corBase, corAlta, pattern);

      gl_FragColor = vec4(cor, 1.0);
    }
  `;

  let myShader;
  let amplitude = 0;
  let phase = 0;
  let lastScrollY = window.scrollY || 0;
  let isLooping = true;

  const AMPLITUDE_DECAY = 0.92; // por frame — quanto menor, mais rápido assenta
  const AMPLITUDE_EPS = 0.002; // abaixo disso, considera "parado" e chama noLoop()
  const SCROLL_TO_AMPLITUDE = 0.012; // sensibilidade do delta de scroll

  const sketch = (p) => {
    p.setup = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const cnv = p.createCanvas(
        Math.max(1, Math.round(w * RENDER_SCALE)),
        Math.max(1, Math.round(h * RENDER_SCALE)),
        p.WEBGL
      );
      cnv.parent(container);
      // Densidade 1 sempre: em tela retina/4K, multiplicar por devicePixelRatio
      // dobraria (ou triplicaria) o custo do fragment shader por pixel físico
      // sem ganho perceptível num fundo desfocado atrás de conteúdo.
      p.pixelDensity(1);
      p.noStroke();
      myShader = p.createShader(VERT_SHADER, FRAG_SHADER);
    };

    p.draw = () => {
      // Decai a energia de scroll a cada frame — é isso que faz o shader
      // "assentar" sozinho pouco depois do usuário parar de rolar.
      amplitude *= AMPLITUDE_DECAY;
      // O tempo do ruído só avança proporcional à energia restante: scroll
      // parado por completo (amplitude ~0) => phase congela => padrão fixo.
      phase += amplitude * 0.015;

      p.shader(myShader);
      myShader.setUniform("u_resolution", [p.width, p.height]);
      myShader.setUniform("u_phase", phase);
      myShader.setUniform("u_amplitude", Math.min(1, amplitude));
      p.rect(-p.width / 2, -p.height / 2, p.width, p.height);

      if (amplitude < AMPLITUDE_EPS && isLooping) {
        isLooping = false;
        p.noLoop();
      }
    };

    p.windowResized = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      p.resizeCanvas(
        Math.max(1, Math.round(w * RENDER_SCALE)),
        Math.max(1, Math.round(h * RENDER_SCALE))
      );
      // Uma mudança de tamanho de janela merece redesenhar mesmo sem scroll.
      if (!isLooping) {
        isLooping = true;
        p.loop();
      }
    };
  };

  const p5Instance = new p5(sketch);

  function onScrollEnergy() {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const delta = Math.abs(y - lastScrollY);
    lastScrollY = y;
    if (delta <= 0) return;

    amplitude = Math.min(1, amplitude + delta * SCROLL_TO_AMPLITUDE);
    if (!isLooping) {
      isLooping = true;
      p5Instance.loop();
    }
  }

  window.addEventListener("scroll", onScrollEnergy, { passive: true });

  // prefers-reduced-motion: mantém o shader como imagem estática (um único
  // frame, sem loop de desenho) — respeita a preferência de acessibilidade
  // sem remover o fundo visual por completo.
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduced.matches) {
    window.removeEventListener("scroll", onScrollEnergy);
    p5Instance.noLoop();
  }
})();
