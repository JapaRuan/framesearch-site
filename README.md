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
  data/leads.jsonl  leads salvos localmente (gitignored)
scripts/
  compress-portfolio.mjs   comprime o acervo real de H:\...\Portfólio - Propósta
  portfolio-manifest.json  lista fonte -> slug/categoria (edite aqui se o acervo mudar)
```

## Decisão de persistência de lead (nome + telefone) — leia antes de mexer

O destino de produção é Render, plano free. Nesse plano **o disco é efêmero**: some a
cada redeploy. Isso vale igual para SQLite, arquivo JSON, ou qualquer outro arquivo
gravado localmente — não é um problema específico de SQLite.

Decisão tomada no nível de código (infraestrutura final continua sendo decisão do Dev
Master/operador na hora do deploy):

1. **Armazenamento em JSON Lines** (`server/data/leads.jsonl`), um lead por linha, schema
   fixo (ver comentário no topo de `server/leadsStore.js`). Não usei SQLite/
   `better-sqlite3` porque a compilação do binário nativo desse pacote falhou de forma
   consistente ao instalar direto na pasta sincronizada do Google Drive nesta máquina de
   desenvolvimento — o mesmo erro (`EBADF` do npm) aconteceu até com dependências 100% em
   JS, então não é um problema do SQLite em si, mas ele adiciona uma trava extra
   (compilação nativa) que dependências puras não têm. JSON Lines evita essa dependência
   nativa tanto em dev quanto em produção.
2. O schema já é "achatado" pensando em virar CRM depois: `id`, `nome`, `telefone`
   (normalizado com DDI), `telefone_formatado` (como a pessoa digitou), `origem`,
   `user_agent`, `ip_hash` (nunca IP cru — LGPD), `criado_em`, `status` (`novo` como
   primeiro estágio de um pipeline `novo -> contatado -> reunião -> cliente -> perdido`).
   Migrar para SQLite/Postgres depois é só reimportar este arquivo linha a linha.
3. Endpoint `GET /api/leads/export.csv?key=...` (protegido por `ADMIN_EXPORT_KEY`) para o
   operador puxar os leads manualmente enquanto não existir uma sincronização automática.

**O que fica pendente para o Dev Master decidir na hora do deploy real** (isso é escolha
de infraestrutura, fora do escopo do code-master):

- Contratar **disco persistente** no Render (mais simples, mantém este código como está,
  só aponta `LEADS_DB_DIR` para o volume montado); **ou**
- Trocar `server/leadsStore.js` por um client de **Google Sheets** (webhook/Apps Script)
  sincronizando para o Drive do operador; **ou**
- Trocar por um banco gerenciado externo (Turso, Postgres gerenciado, etc).

A superfície pública do módulo (`addLead`, `listLeads`, `exportCsv`) foi desenhada para
tornar essa troca barata — não precisa mexer em `server/index.js`.

## Pendências para o colorista-master (antes de ir ao ar)

Nada de cor final foi decidido aqui — só preparei a estrutura:

1. **Vídeo de fundo** (`public/video/background/bg-loop.mp4`): cortei um trecho de 10s de
   `Reels - Cinematografia/Video Siko Horizontal.mp4` (o único vídeo de cinematografia do
   acervo), sem nenhuma correção de cor/LUT — só corte, fade in/out para loop e
   compressão. Esse é o arquivo que precisa da grade de cor definitiva. Se o colorista
   preferir outra fonte do acervo para o fundo (esta era a única categoria
   "Cinematografia" disponível), sinalizar para eu trocar o corte.
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
