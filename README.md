# Frame Search — Site institucional (rebranding 2026)

Construído por code-master (acionado pelo Dev Master). Este código **não foi publicado**.
Só o Dev Master decide quando/como colocar isso no ar, substituindo a página "em
construção" temporária de framesearch.onrender.com.

## Rodar localmente

```
npm install
npm run compress-portfolio   # só precisa rodar de novo se o acervo de vídeo mudar
npm start
```

Abre em `http://localhost:3000`. Variáveis de ambiente em `.env.example`.

Se `npm install` falhar com erro `EBADF`/`tar ENTRY_ERROR` dentro desta pasta: é uma
armadilha conhecida do Google Drive sincronizado no Windows (o sync trava escrita de
muitos arquivos pequenos direto no drive virtual). Solução usada nesta sessão: instalar
em uma pasta local fora do Drive (`%LOCALAPPDATA%\Temp\<algo>`) e copiar `node_modules`
para dentro desta pasta via `robocopy` (não via `Copy-Item`/bash `cp`, que também
engasgam no mesmo drive).

## Estrutura

```
public/            front-end estático servido pelo Express
  index.html
  css/styles.css
  js/main.js
  img/              logos (copiados de Rebranding 2026/Logo/Exportado, sem recolorir)
  video/portfolio/  vídeos comprimidos para web (gerados pelo script, não editar à mão)
  video/posters/    thumbnails para lazy-load
  video/background/ vídeo de fundo (NÃO gradeado)
  video/portfolio.json  manifesto consumido pelo carrossel
server/
  index.js         Express app (rotas, segurança, static)
  validators.js     validação de nome e telefone BR
  leadsStore.js     persistência de leads (ver decisão abaixo)
  firebase-service-account.json  credencial Admin SDK (gitignored, só dev local)
  data/leads.jsonl  fallback local se não houver credencial do Firebase (gitignored)
scripts/
  compress-portfolio.mjs   comprime o acervo real de H:\...\Portfólio - Propósta
  portfolio-manifest.json  lista fonte -> slug/categoria (edite aqui se o acervo mudar)
```

## Decisão de persistência de lead (nome + telefone) — leia antes de mexer

O destino de produção é Render, plano free. Nesse plano **o disco é efêmero**: some a
cada redeploy. Isso vale igual para SQLite, arquivo JSON, ou qualquer outro arquivo
gravado localmente — não é um problema específico de SQLite. Por isso a persistência
principal passou a ser **Firestore** (Firebase), que não depende do disco do Render.

Decisão tomada no nível de código (infraestrutura final continua sendo decisão do Dev
Master/operador na hora do deploy):

1. **Armazenamento principal em Firestore**, coleção `leads`, via Admin SDK
   (`firebase-admin` + `@google-cloud/firestore`). Schema (ver comentário no topo de
   `server/leadsStore.js`): `id`, `nome`, `telefone` (normalizado com DDI),
   `telefone_formatado` (como a pessoa digitou), `origem`, `user_agent`, `ip_hash` (nunca
   IP cru — LGPD), `criado_em`, `status` (`novo` como primeiro estágio de um pipeline
   `novo -> contatado -> reunião -> cliente -> perdido`).
2. Credencial (Admin SDK), nessa ordem: variável de ambiente
   `FIREBASE_SERVICE_ACCOUNT` (produção, no Render) → arquivo local
   `server/firebase-service-account.json` (dev, gitignored) → se nenhuma existir, cai
   para **armazenamento local em JSON Lines** (`server/data/leads.jsonl`), só para não
   travar quem rodar o projeto sem a credencial em mãos. Esse modo local avisa alto no
   console porque tem o mesmo problema de disco efêmero que motivou a troca.
3. Endpoint `GET /api/leads/export.csv?key=...` (protegido por `ADMIN_EXPORT_KEY`) para o
   operador puxar os leads manualmente, agora lendo do Firestore.

**Pendência real de infraestrutura, confirmada em DUAS sessões diferentes via chamada
direta à API do Firestore (não é suposição, e não é sobre deploy pendente no Render)**: o
projeto Firebase `leads-framesearch` ainda **não tem nenhum banco Firestore criado** — a
chamada `GET /v1/projects/leads-framesearch/databases` retornou lista vazia nas duas
vezes, e a service account não tem permissão para criar o banco sozinha (403 ao tentar).
Ou seja, falta o operador entrar no Console do Firebase e criar o banco Firestore de fato
(modo Nativo, região `southamerica-east1`) antes de qualquer escrita funcionar, tanto em
produção quanto em dev local. Sem esse passo, o código cai/erra ao tentar gravar (não cai
silenciosamente para o modo local, porque a credencial existe e é válida — só o banco em
si que não existe). Testado de novo agora: `POST /api/leads` local com a credencial real
retorna 500 com `5 NOT_FOUND` do Firestore, exatamente por causa disso.

**Nota sobre um link enviado por engano**: se alguém mandar a documentação de "Firebase
Data Connect" (SQL/Postgres via GraphQL, focado em SDK client-side) achando que é sobre
isso, não é — é um produto Firebase diferente, mais pesado, sem exemplo de uso a partir de
um backend Node/Express, e não serve bem para um formulário simples de lead. A decisão
aqui continua sendo **Firestore** (mais simples, já implementado, resolve o problema real
de disco efêmero). O que falta não é trocar de tecnologia — é o passo de criação do banco
no Console, descrito acima.

**O que fica pendente para o Dev Master/operador decidir** (fora do escopo do
code-master):

- Criar o banco Firestore no Console do Firebase (passo acima, bloqueante).
- Configurar `FIREBASE_SERVICE_ACCOUNT` no Render com o conteúdo do JSON da service
  account como uma linha só.
- Node no Render: `@google-cloud/firestore` declara `engines.node >= 22`. Funcionou em
  teste local nesta sessão em Node 18.16.1 (só avisa, não impede), mas o ideal é o Render
  rodar Node 22+ para ficar dentro do que o pacote suporta oficialmente.

A superfície pública do módulo (`addLead`, `listLeads`, `exportCsv`) foi desenhada para
tornar essa troca barata — não precisa mexer em `server/index.js`.

## Pendências para o colorista-master (antes de ir ao ar)

Nada de cor final foi decidido aqui — só preparei a estrutura:

1. **Fundo do site** (`public/js/bg-shader.js`): deixou de ser vídeo de arquivo (o
   `bg-loop.mp4`/Pexels descrito abaixo, agora **não referenciado em lugar nenhum do
   HTML/CSS/JS** — arquivo mantido em disco, não apagado, caso o Dev Master prefira
   reverter) e passou a ser um **shader GLSL renderizado em tempo real via p5.js
   (modo WEBGL)**. Motivo: vídeo de arquivo tinha qualidade inconsistente entre
   aparelhos (compressão/banda/decodificação); shader é cálculo puro na GPU do próprio
   visitante, mesma qualidade sempre. Comportamento: ruído orgânico tipo "heat-haze"
   cuja intensidade/avanço de tempo está ligado à velocidade do scroll (não a um
   `requestAnimationFrame` contínuo e incondicional) — parado o scroll, o desenho para
   de verdade (`p.noLoop()`), não só "parece parado". Testado nesta sessão com
   Puppeteer + CPU throttling 4x em viewport de celular (390×844): scroll completo da
   página inteira sem erro de console e sem travamento perceptível. **Cor é
   propositalmente neutra/placeholder** (tons de cinza escuro em torno de
   `--bg-dark`) — decisão de intensidade/saturação/temperatura final é do Colorista
   Master. Documentação completa do motivo de cada escolha técnica está em comentário
   no topo do próprio `public/js/bg-shader.js`.

   - **Arquivo antigo (`public/video/background/bg-loop.mp4` + poster), histórico
     preservado abaixo só para referência de proveniência — não é mais usado:**
     fonte https://www.pexels.com/video/colorful-lights-855548/, título "Colorful
     Lights", autor/crédito Pixabay (via Pexels), licença Pexels License (equivalente a
     CC0), confirmada em 2026-09-13.
2. **Todos os vídeos do carrossel** (`public/video/portfolio/*.mp4`) são apenas
   comprimidos para web (H.264, sem grade), a partir do acervo bruto de
   `H:\Meu Drive\Frame Search\- Portfólio\Portfólio - Propósta`. Nenhuma decisão de cor
   foi tomada neles.
3. **Paleta de cor do site** (`--accent` em `public/css/styles.css`) está com valor
   neutro de placeholder — a paleta final é do identidade-visual-padrao/colorista, não
   decidi isso.
4. **Logo** (`public/img/logo-horizontal.png` e demais): usei os arquivos exportados como
   estão, sem recolorir. Um ponto técnico a sinalizar para quem cuida do export de
   logo (não é decisão de cor, é problema de arquivo): o PNG exportado não tem canal
   alpha (`pix_fmt=rgb24`, confirmado com `ffprobe`) — ele tem fundo branco sólido em vez
   de transparente, o que cria um retângulo branco visível atrás do logo no header escuro
   (visível nos screenshots de teste). Precisa reexportar com transparência.

## Contagem real do acervo de portfólio

O briefing estimava "~23-24 vídeos únicos". A contagem real, confirmada com `Glob` nesta
sessão em 2026-09-13, é **25 vídeos únicos** (13 Criativos comuns + 7 AfterMovie + 4
Animações After Effects, já descontando o par .mov/.mp4 duplicado da peça "Alexandria" +
1 Cinematografia). Lista completa em `scripts/portfolio-manifest.json`.

## Testes feitos nesta sessão (não só "deveria funcionar")

- Servidor rodando de verdade (`node server/index.js`) em `localhost:3011` durante os
  testes.
- `POST /api/leads`: testado telefone inválido, nome vazio, nome com tentativa de
  XSS (`<script>`), body vazio/malformado, telefone válido em 3 formatos
  (`47996060890`, `(47) 99606-0890`, `+55 47 99606-0890`) — todos com o resultado
  esperado.
- Rate limit do endpoint de lead testado com 11 requisições seguidas (bloqueia depois do
  limite, HTTP 429).
- `GET /api/leads/export.csv`: testado sem chave, com chave errada (403 nos dois casos) e
  com chave certa (CSV correto).
- Lead persistido conferido lendo `server/data/leads.jsonl` direto do disco (não só a
  resposta da API).
- Responsividade mobile real: renderizado com Puppeteer + Microsoft Edge instalado na
  máquina, viewport 390×844, screenshot tirado e revisado visualmente. Um bug real de
  overflow no header (nav "Portfólio"/"Contato" cortado por causa do comportamento padrão
  de `min-width: auto` em item flexbox) foi encontrado e corrigido nesta sessão, depois
  reconfirmado corrigido com nova screenshot e medição de `getBoundingClientRect()`.
- Fluxo completo gate → desbloqueio → carrossel testado de ponta a ponta com automação
  real (Puppeteer preenchendo o formulário e clicando em "Desbloquear"): confirma que os
  25 cards renderizam, o card ativo é marcado, e a flag de desbloqueio é salva.
- Todos os arquivos `.js` passaram por `node --check` (sem erro de sintaxe).

## Sessão de 2026-09-13 (parte 2) — bugs reais de feedback do operador, corrigidos e reconfirmados

- **Carrossel com card central preto (bug crítico reportado com screenshot)**: causa raiz
  encontrada com Puppeteer capturando console real (não só checando classe CSS como o
  teste anterior fazia) — `video` e `img.poster` dentro de `.carousel-card` não tinham
  `position: absolute`, então ficavam empilhados no fluxo normal em vez de sobrepostos; o
  vídeo real ficava abaixo do poster e cortado pelo `overflow: hidden` do card. Corrigido
  em `public/css/styles.css` (`.carousel-card video`/`img.poster` agora com
  `position: absolute; inset: 0` e `z-index` explícito para poster/play-btn/título ficarem
  por cima). Reconfirmado rodando o site local de verdade: vídeo real tocando
  (`readyState: 4`, frames diferentes entre screenshots) no card ativo, do primeiro ao
  último dos 25 cards, arrastando programaticamente até `scrollLeft` chegar no fim do
  `scrollWidth`.
- **Bug real de JavaScript encontrado no mesmo teste** (não fazia parte do que foi
  reportado, mas travava o carrossel por completo para quem já tinha o portfólio
  desbloqueado — ex.: qualquer visitante recorrente): `Cannot access 'carouselInitialized'
  before initialization`. Causa: a `IIFE` do gate roda `unlock() -> initCarousel()` de
  forma síncrona durante o parse inicial do script quando o `localStorage` já tem o flag
  de desbloqueio, e isso acontecia antes da linha `let carouselInitialized = false;` (mais
  abaixo no arquivo) executar — temporal dead zone. Corrigido movendo essa declaração para
  o topo de `public/js/main.js`. Esse é provavelmente o motivo real do "chega um momento
  que não tem mais como continuar vendo" relatado — reconfirmado sem esse erro no console
  depois da correção.
- **Header**: símbolo (`logo-simbolo.png`) aumentado de 34px para 52px de altura
  (40px no breakpoint mobile) e centralizado de verdade com `position: absolute` +
  `translate(-50%,-50%)` dentro do `.header-inner`, em vez de depender do fluxo flex.
  Reconfirmado medindo `getBoundingClientRect()`: centro do logo coincide com o centro do
  viewport (`logoCenterX === viewportCenterX`) tanto em 1440px quanto em 390px de largura,
  sem sobreposição com a nav em nenhum dos dois.
- **Favicon**: trocado de `logo-mono-preto.png` (fundo branco sólido, sem alpha) para
  `logo-simbolo.png` — confirmado com leitura do chunk `IHDR` do PNG que é RGBA real
  (`colorType: 6`), 1200×1200, quadrado.
- **Conteúdo**: adicionada seção `#servicos` (Fotografia, Filmagem, Edição, Design,
  Tráfego pago, Programação — lista real já usada em outras peças da marca, sem número ou
  estatística inventada) e expandido o texto de "Sobre" com mais profundidade sobre como o
  time multidisciplinar trabalha junto (sem inventar dado novo sobre a empresa). Link
  "Serviços" adicionado à nav do header.

## Sessão de 2026-09-13 (parte 3) — lista de correções do operador, seção por seção

Todas as 5 seções pedidas foram implementadas, testadas com Puppeteer real (não só
lido/inspecionado) em pelo menos uma largura mobile real (390×844) e uma desktop
(1440×900), e o código foi só commitado localmente — **sem push**, por instrução
explícita; o Dev Master revisa e decide subir.

1. **Fundo de vídeo → shader (GLSL via p5.js)**: ver seção "Pendências para o
   colorista-master" acima para os detalhes técnicos e o que falta (cor). Testes reais
   feitos nesta sessão: (a) o shader responde ao scroll e assenta sozinho quando o
   scroll para — confirmado comparando `canvas.toDataURL()` entre frames: muda a cada
   scroll novo, para de mudar ~1,5s depois do scroll parar; (b) zero erros de console em
   desktop e mobile; (c) CPU-throttle 4x (Chrome DevTools Protocol,
   `Emulation.setCPUThrottlingRate`) simulando celular de entrada, com scroll da página
   inteira (6766px de altura) em viewport 390×844 — sem erro, sem travamento.
2. **Carrossel do portfólio**:
   - **a) Título de arquivo → nome real**: `public/video/portfolio.json` teve o campo
     `title` de todos os 25 itens corrigido para o mapeamento confirmado pelo operador
     (clientes reais + descrição neutra nos genéricos, sem inventar nome tipo "412").
     Validado lendo o JSON de volta e conferindo os 25 pares slug→título.
   - **b) Abria no 5º item no desktop**: causa raiz encontrada — o
     `scrollIntoView({inline:'center'})` do primeiro card não conseguia de fato
     centralizá-lo porque não existe espaço para rolar antes do primeiro item
     (`scrollLeft` não pode ser negativo); em telas largas, com vários cards cabendo ao
     mesmo tempo, o centro geométrico da faixa caía num card do meio, não no primeiro.
     Corrigido junto com o item (c) abaixo. Reconfirmado com Puppeteer em 1440×900: card
     ativo inicial agora é sempre o primeiro item real (`realIndex 0`, "Reels
     Comercial"), e também em 390×844.
   - **c) Rolagem infinita**: implementada renderizando o mesmo conjunto de 25 itens 3
     vezes (buffer-anterior + conjunto real + buffer-seguinte) e "teleportando" o
     `scrollLeft` em exatamente uma largura de conjunto quando o usuário entra no
     buffer, de forma instantânea e imperceptível (os dois conjuntos são idênticos
     pixel a pixel). Isso resolveu o (b) de graça: com buffer antes do primeiro item,
     sempre existe espaço para centralizá-lo de verdade. Testado simulando 40 passos de
     scroll para a direita e 80 para a esquerda (bem além de um conjunto inteiro nos
     dois sentidos): carrossel nunca travou, nunca ficou em branco, sempre voltou a
     mostrar um item real e válido.
3. **Gate de desbloqueio**: a checagem de `localStorage` antes de mostrar o formulário
   **já existia no código** (`fs_portfolio_unlocked`, ver `public/js/main.js`) —
   confirmado nesta sessão com um teste dedicado: com o flag pré-setado, o formulário
   nunca é anexado a nenhum listener de submit e **zero requisições** são feitas para
   `/api/leads` (capturadas via interceptação de rede do Puppeteer, não só inspeção de
   código). Segunda camada no backend (checagem por sessão/dispositivo) não foi
   implementada — é opcional no pedido original e o mínimo obrigatório (localStorage)
   já está coberto e verificado.
4. **Tipografia de headline**: testadas as 3 candidatas lado a lado (Fraunces,
   Bricolage Grotesque, Instrument Serif), self-hospedadas em `public/fonts/*.woff2`
   (sem CDN de terceiro, para não abrir a CSP `style-src`/`font-src` que hoje é só
   `'self'`). Decisão do code-master: **Fraunces** como padrão — maior presença/contraste
   de traço contra um fundo Liquid Glass em movimento, e reforça o tom "olhar
   cinematográfico" mais do que as outras duas (Bricolage ficou com cara mais "produto de
   tech"; Instrument Serif perdeu força visual no hero em mobile por ser muito fina).
   Aplicada só em `h1`/`h2`/`h3` de título (`--font-headline`/`--font-headline-weight`
   em `:root`); corpo de texto continua na pilha neutra original. As outras 2 pilhas
   ficam comentadas ao lado no CSS para troca de 1 linha, caso o Dev Master/operador
   prefira outra — decisão final de marca não é deste agente.
5. **Nova seção "Empresas que já fizemos parte do processo"** (`#clientes`, entre
   Depoimentos e Portfólio, com link adicionado à nav): grade só de nomes em texto
   estilizado (conceito replicado de coolideas.com.br — sem copiar mais nada do site),
   já que nenhum desses clientes tem arquivo de logo pronto. Lista final confirmada pelo
   operador ao longo da sessão (com adições e uma remoção pedidas depois do briefing
   inicial): Recanto dos Vieiras, Dhoo Sushi, Alexandria Burger, Santa Bella, Fairies,
   Boca Mafra, Kart Night, Bruno Kotaka, Dr. Pepe, Siko, Cabelinho Na Régua, TVC
   Panorama, Dr. Rigatti — 13 no total. **Allanis foi removido desta grade** a pedido do
   operador, mas continua normalmente no carrossel de vídeo (item 2), com o vídeo
   `Storys Reels Desfile Allanis.mp4` intacto. Grade responsiva confirmada com
   Puppeteer: 4 colunas em 1440px, 2 colunas em 390px, nenhum nome cortado/espremido.

**Nota de ambiente (Windows + Google Drive) para quem for testar de novo**: o
`node_modules` desta pasta (sincronizada via Google Drive em `H:\`) está com pelo menos
um pacote corrompido (`puppeteer/package.json` com 0 bytes — é um artefato do Drive, não
do npm). Os testes com Puppeteer desta sessão foram rodados a partir de uma cópia do
projeto em `C:\Users\ruani\fs-site-test` (fora do Drive) com `npm install` limpo — mesma
armadilha de Drive+Windows já documentada na seção "Rodar localmente" acima, agora
também afetando pacotes usados só para teste (não é dependência de produção do
`package.json`).
