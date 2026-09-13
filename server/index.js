"use strict";

const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { validarTelefoneBR, validarNome } = require("./validators");
const { addLead, exportCsv } = require("./leadsStore");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const ADMIN_EXPORT_KEY = process.env.ADMIN_EXPORT_KEY || null;

const app = express();

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
app.use(express.static(PUBLIC_DIR, { maxAge: "1h" }));

// Rate limit dedicado ao endpoint de lead: evita spam/flood do formulário público.
const leadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, erro: "Muitas tentativas. Tente novamente em alguns minutos." },
});

app.post("/api/leads", leadLimiter, (req, res) => {
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
    const lead = addLead({
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
app.get("/api/leads/export.csv", (req, res) => {
  if (!ADMIN_EXPORT_KEY || req.query.key !== ADMIN_EXPORT_KEY) {
    return res.status(403).json({ ok: false, erro: "Acesso negado." });
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=leads.csv");
  res.send(exportCsv());
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`FrameSearch site rodando em http://localhost:${PORT}`);
});
