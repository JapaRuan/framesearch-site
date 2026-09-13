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
 * Por isso a persistência real passou a ser o Firestore (Firebase), que não some
 * a cada redeploy.
 *
 * Armazenamento principal: Firestore, coleção "leads", via Admin SDK
 * (firebase-admin). O schema de cada documento é o mesmo já usado antes em
 * JSON Lines:
 * {
 *   id: string (uuid, também usado como ID do documento no Firestore),
 *   nome: string,
 *   telefone: string (normalizado, só dígitos, com DDI 55),
 *   telefone_formatado: string (como o usuário digitou),
 *   origem: "gate-portfolio",
 *   user_agent: string | null,
 *   ip_hash: string (hash do IP, nunca IP cru — LGPD),
 *   criado_em: string (ISO 8601),
 *   status: "novo" (campo pensado para virar pipeline de CRM depois: novo -> contatado -> reuniao -> cliente -> perdido)
 * }
 *
 * Credencial (Admin SDK), nessa ordem de prioridade:
 *   1. Variável de ambiente FIREBASE_SERVICE_ACCOUNT — conteúdo do JSON da
 *      service account inteiro, como string em uma linha só. É assim que a
 *      credencial chega em produção (Render), sem gravar arquivo em disco.
 *   2. Arquivo local server/firebase-service-account.json — usado em
 *      desenvolvimento. Nunca commitar esse arquivo (está no .gitignore).
 *   3. Se nenhuma das duas existir, cai em modo local (JSON Lines em
 *      server/data/leads.jsonl), só para não travar quem estiver rodando o
 *      projeto localmente sem a credencial em mãos. Esse modo é avisado alto
 *      no console porque NÃO tem persistência real em produção (mesmo
 *      problema do disco efêmero do Render que motivou a troca para Firestore).
 *
 * Toda a superfície pública é `addLead`, `listLeads`, `exportCsv` — o
 * server/index.js não precisa saber qual dos dois modos está ativo.
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const COLLECTION_NAME = "leads";

// Armazenamento local (fallback de desenvolvimento) — mesma implementação de antes.
const DATA_DIR = process.env.LEADS_DB_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "leads.jsonl");

function ensureLocalStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "", "utf-8");
  }
}

function addLeadLocal(lead) {
  ensureLocalStore();
  fs.appendFileSync(DATA_FILE, JSON.stringify(lead) + "\n", "utf-8");
  return lead;
}

function listLeadsLocal() {
  ensureLocalStore();
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

// --- Inicialização do Firestore (ou fallback local) ---

let db = null;

function carregarCredencial() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (err) {
      console.error(
        "FIREBASE_SERVICE_ACCOUNT existe mas não é um JSON válido. Verifique se o conteúdo foi colado como uma linha só, sem quebras extras. Erro:",
        err.message
      );
      return null;
    }
  }

  const localCredPath = path.join(__dirname, "firebase-service-account.json");
  if (fs.existsSync(localCredPath)) {
    try {
      return JSON.parse(fs.readFileSync(localCredPath, "utf-8"));
    } catch (err) {
      console.error("server/firebase-service-account.json existe mas não é um JSON válido:", err.message);
      return null;
    }
  }

  return null;
}

function inicializarFirestore() {
  const credencial = carregarCredencial();
  if (!credencial) {
    console.warn(
      "[leadsStore] AVISO: nenhuma credencial do Firebase encontrada " +
        "(nem FIREBASE_SERVICE_ACCOUNT, nem server/firebase-service-account.json). " +
        "Caindo para armazenamento LOCAL em JSON Lines (server/data/leads.jsonl). " +
        "Isso NÃO é seguro em produção no Render free: o disco é efêmero e os leads " +
        "somem a cada redeploy. Configure a credencial antes de ir para produção."
    );
    return null;
  }

  try {
    const { initializeApp, cert } = require("firebase-admin/app");
    const { getFirestore } = require("firebase-admin/firestore");
    const app = initializeApp({ credential: cert(credencial) });
    // O banco Firestore deste projeto foi criado com ID "banco-de-dados-frame"
    // (não o "(default)" que getFirestore(app) tentaria por padrão) — sem o
    // segundo argumento aqui, toda operação falha com "5 NOT_FOUND", verificado
    // ao vivo nesta sessão. Configurável via env caso o banco seja recriado com
    // outro nome no futuro.
    const databaseId = process.env.FIRESTORE_DATABASE_ID || "banco-de-dados-frame";
    return getFirestore(app, databaseId);
  } catch (err) {
    console.error(
      "[leadsStore] Falha ao inicializar o Firestore com a credencial encontrada. " +
        "Caindo para armazenamento LOCAL em JSON Lines. Erro:",
      err.message
    );
    return null;
  }
}

db = inicializarFirestore();

function montarLead({ nome, telefoneNormalizado, telefoneFormatado, userAgent, ip }) {
  return {
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
}

async function addLead(dados) {
  const lead = montarLead(dados);

  if (db) {
    await db.collection(COLLECTION_NAME).doc(lead.id).set(lead);
    return lead;
  }

  return addLeadLocal(lead);
}

async function listLeads() {
  if (db) {
    const snapshot = await db.collection(COLLECTION_NAME).orderBy("criado_em", "asc").get();
    return snapshot.docs.map((doc) => doc.data());
  }

  return listLeadsLocal();
}

async function exportCsv() {
  const leads = await listLeads();
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
