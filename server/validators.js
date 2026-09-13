"use strict";

// DDDs válidos no Brasil: 11-99, exceto os que nunca foram atribuídos (20,23,25,26,29,30,36,39,40,50,52,54,56,58,59,60,61 é válido-DF... mantém simples: 11-99 cobre o essencial sem bloquear usuário real por lacuna administrativa da Anatel)
const DDD_MIN = 11;
const DDD_MAX = 99;

/**
 * Aceita variações comuns de digitação de celular BR:
 *  - "47996060890"
 *  - "(47) 99606-0890"
 *  - "47 99606-0890"
 *  - "+55 47 99606-0890"
 *  - "5547996060890"
 * Retorna { valido, normalizado } onde normalizado é "55DDDNNNNNNNNN" (13 dígitos, só números).
 */
function validarTelefoneBR(input) {
  if (typeof input !== "string") return { valido: false };
  const digits = input.replace(/\D/g, "");
  if (!digits) return { valido: false };

  let semDDI = digits;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    semDDI = digits.slice(2);
  }

  // DDD (2) + número (8 fixo/antigo ou 9 celular)
  if (semDDI.length !== 10 && semDDI.length !== 11) {
    return { valido: false };
  }

  const ddd = Number(semDDI.slice(0, 2));
  if (ddd < DDD_MIN || ddd > DDD_MAX) {
    return { valido: false };
  }

  const numero = semDDI.slice(2);
  // Celular (11 dígitos totais) tem que começar com 9 depois do DDD.
  if (semDDI.length === 11 && numero[0] !== "9") {
    return { valido: false };
  }

  return { valido: true, normalizado: `55${semDDI}` };
}

function validarNome(input) {
  if (typeof input !== "string") return { valido: false };
  const nome = input.trim().replace(/\s+/g, " ");
  if (nome.length < 2 || nome.length > 120) return { valido: false };
  // Letras (com acentos), espaço, apóstrofo, hífen — cobre nomes compostos reais sem aceitar lixo/script.
  if (!/^[\p{L}][\p{L}'\-\s]*$/u.test(nome)) return { valido: false };
  return { valido: true, normalizado: nome };
}

module.exports = { validarTelefoneBR, validarNome };
