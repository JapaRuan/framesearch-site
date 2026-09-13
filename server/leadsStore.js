"use strict";

/**
 * Persistência de leads (nome + telefone) do gate de portfólio.
 *
 * DECISÃO E LIMITAÇÃO DOCUMENTADA (leia antes de mexer):
 * -------------------------------------------------------
 * O destino final de produção é Render (framesearch.onrender.com), plano free.
 * No plano free, o disco do Render é EFÊMERO: some a cada redeploy (novo build,
 * nova versão do código, restart do serviço). Isso vale igual para SQLite, para
 * um arquivo JSON ou para qualquer outro arquivo gravado localmente no servidor.
 *
 * Ou seja: SQLite não resolve o problema de durabilidade em produção sozinho —
 * só resolveria se o operador contratar "Persistent Disk" no Render (plano pago)
 * apontando para um volume montado, por exemplo em /var/data, e a store abaixo
 * apontar para lá via variável de ambiente LEADS_DB_DIR.
 *
 * Decisão tomada aqui (nível código, não infraestrutura — infraestrutura final é
 * decisão do Dev Master/operador):
 *   1. Armazenamento local em arquivo JSON Lines (server/data/leads.jsonl), um
 *      lead por linha, schema fixo abaixo. Não usei SQLite/better-sqlite3 porque
 *      a compilação nativa desse pacote falhou de forma consistente dentro da
 *      pasta sincronizada do Google Drive nesta máquina de desenvolvimento
 *      (erro EBADF do npm ao gravar muitos arquivos pequenos direto no drive
 *      sincronizado) — JSON Lines não depende de binário nativo e evita esse
 *      problema tanto em dev quanto em produção.
 *   2. O schema já é uma tabela "achatada" pensando em virar CRM: id, nome,
 *      telefone (normalizado e cru), origem, user_agent, criado_em, status.
 *      Migrar para SQLite/Postgres depois é só reimportar este arquivo.
 *   3. Para não perder lead em cada redeploy do Render free, cada gravação
 *      TAMBÉM tenta duplicar a linha por e-mail (ver server/notify.js) para
 *      framesearchfilms@gmail.com — assim o operador tem uma cópia fora do
 *      disco efêmero mesmo antes de decidir a solução definitiva (disco
 *      persistente pago, ou sync para Google Sheets/Drive via Apps Script).
 *      Isso é best-effort: se o envio de e-mail falhar (sem SMTP configurado),
 *      o lead ainda fica salvo localmente e a falha só é logada.
 *
 * O QUE FICA PENDENTE PARA O DEV MASTER DECIDIR NA HORA DO DEPLOY REAL:
 *   - Contratar disco persistente no Render (recomendado, mais simples) OU
 *   - Trocar este arquivo por um client de Google Sheets (webhook/Apps Script)
 *     OU por um banco gerenciado externo (Turso, Postgres, etc).
 * Este arquivo foi escrito para tornar essa troca barata: toda a superfície
 * pública é `addLead`, `listLeads`, `exportCsv` — troque a implementação
 * interna sem mexer no server/index.js.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DATA_DIR = process.env.LEADS_DB_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "leads.jsonl");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "", "utf-8");
  }
}

/**
 * Schema de cada lead (uma linha JSON por lead em leads.jsonl):
 * {
 *   id: string (uuid),
 *   nome: string,
 *   telefone: string (normalizado, só dígitos, com DDI 55),
 *   telefone_formatado: string (como o usuário digitou),
 *   origem: "gate-portfolio",
 *   user_agent: string | null,
 *   ip_hash: string (hash do IP, nunca IP cru — LGPD),
 *   criado_em: string (ISO 8601),
 *   status: "novo" (campo pensado para virar pipeline de CRM depois: novo -> contatado -> reuniao -> cliente -> perdido)
 * }
 */
function addLead({ nome, telefoneNormalizado, telefoneFormatado, userAgent, ip }) {
  ensureStore();
  const lead = {
    id: crypto.randomUUID(),
    nome,
    telefone: telefoneNormalizado,
    telefone_formatado: telefoneFormatado,
    origem: "gate-portfolio",
    user_agent: userAgent || null,
    ip_hash: ip ? crypto.createHash("sha256").update(ip).digest("hex") : null,
    criado_em: new Date().toISOString(),
    status: "novo",
  };
  fs.appendFileSync(DATA_FILE, JSON.stringify(lead) + "\n", "utf-8");
  return lead;
}

function listLeads() {
  ensureStore();
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function exportCsv() {
  const leads = listLeads();
  const header = "id,nome,telefone,telefone_formatado,origem,criado_em,status";
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = leads.map((l) =>
    [l.id, l.nome, l.telefone, l.telefone_formatado, l.origem, l.criado_em, l.status]
      .map(escape)
      .join(",")
  );
  return [header, ...rows].join("\n");
}

module.exports = { addLead, listLeads, exportCsv, DATA_FILE };
