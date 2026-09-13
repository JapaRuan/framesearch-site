"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { validarTelefoneBR, validarNome } = require("./validators");
const { addLead, exportCsv } = require("./leadsStore");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const ADMIN_EXPORT_KEY = process.env.ADMIN_EXPORT_KEY || null;

const app = express();

/**
 * Cache busting de CSS/JS: sem isso, o navegador do operador (e de qualquer
 * visitante) retém styles.css/main.js antigos por até o maxAge configurado no
 * express.static, mesmo com o código novo já publicado — cada deploy parece
 * "não ter atualizado" até o cache expirar sozinho. A correção: o nome da URL
 * do asset muda a cada deploy (query string com hash do conteúdo do arquivo),
 * então o navegador nunca reaproveita bytes velhos para um conteúdo novo — e
 * podemos manter o maxAge dos estáticos bem alto sem medo de servir algo stale.
 *
 * Hash calculado uma vez, na subida do processo (cada deploy reinicia o
 * processo), a partir do conteúdo real dos arquivos em disco — não é um
 * número de versão manual que alguém pode esquecer de atualizar.
 */
function hashArquivo(caminhoAbsoluto) {
  const conteudo = fs.readFileSync(caminhoAbsoluto);
  return crypto.createHash("md5").update(conteudo).digest("hex").slice(0, 10);
}

const cssVersion = hashArquivo(path.join(PUBLIC_DIR, "css", "styles.css"));
const jsVersion = hashArquivo(path.join(PUBLIC_DIR, "js", "main.js"));

const indexHtmlComVersao = fs
  .readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf-8")
  .replace('href="/css/styles.css"', `href="/css/styles.css?v=${cssVersion}"`)
  .replace('src="/js/main.js"', `src="/js/main.js?v=${jsVersion}"`);

// CSP permissiva o suficiente para backdrop-filter/vídeo local; sem inline scripts de terceiro.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        mediaSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
  })
);
app.use(express.json({ limit: "10kb" }));

// index.html é servido dinamicamente (com as URLs de asset já versionadas) e
// nunca deve ficar em cache no navegador — é um arquivo pequeno, o custo de
// sempre revalidar é irrelevante, e é o único jeito do visitante sempre pegar
// a referência certa de CSS/JS.
app.get(["/", "/index.html"], (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.type("html").send(indexHtmlComVersao);
});

// Estáticos versionados (CSS/JS/imagens/vídeos): maxAge alto é seguro aqui
// porque qualquer mudança de conteúdo de CSS/JS já muda a URL (?v=hash) que
// os aponta a partir do index.html — nunca fica um HTML novo apontando para
// bytes antigos.
app.use(express.static(PUBLIC_DIR, { maxAge: "1y", index: false }));

// Rate limit dedicado ao endpoint de lead: evita spam/flood do formulário público.
const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, erro: "Muitas tentativas. Tente novamente em alguns minutos." },
});

app.post("/api/leads", leadLimiter, async (req, res) => {
  const { nome, telefone } = req.body || {};

  const nomeCheck = validarNome(nome);
  if (!nomeCheck.valido) {
    return res.status(400).json({ ok: false, erro: "Nome inválido." });
  }

  const telefoneCheck = validarTelefoneBR(telefone);
  if (!telefoneCheck.valido) {
    return res.status(400).json({ ok: false, erro: "Telefone inválido. Use um número de celular brasileiro, com DDD." });
  }

  try {
    const lead = await addLead({
      nome: nomeCheck.normalizado,
      telefoneNormalizado: telefoneCheck.normalizado,
      telefoneFormatado: String(telefone).trim(),
      userAgent: req.get("user-agent"),
      ip: req.ip,
    });
    return res.status(201).json({ ok: true, id: lead.id });
  } catch (err) {
    console.error("Falha ao salvar lead:", err);
    return res.status(500).json({ ok: false, erro: "Não foi possível salvar seus dados agora. Tente novamente." });
  }
});

// Exportação simples para o operador puxar os leads (uso manual/CRM), protegida por chave de ambiente.
app.get("/api/leads/export.csv", async (req, res) => {
  if (!ADMIN_EXPORT_KEY || req.query.key !== ADMIN_EXPORT_KEY) {
    return res.status(403).json({ ok: false, erro: "Acesso negado." });
  }
  try {
    const csv = await exportCsv();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=leads.csv");
    res.send(csv);
  } catch (err) {
    console.error("Falha ao exportar leads:", err);
    res.status(500).json({ ok: false, erro: "Não foi possível exportar os leads agora." });
  }
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`FrameSearch site rodando em http://localhost:${PORT}`);
});
