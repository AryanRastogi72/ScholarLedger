const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
const sha256Hex = async (str) => hex(await crypto.subtle.digest('SHA-256', enc.encode(str)));
const strip0x = (h) => String(h).replace(/^0x/, '');
const trim = (v) => String(v ?? '').trim();

export function newSalt() {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

// commitment = 0x + SHA-256 of "salt|studentId|programName|metadata" (fields trimmed)
export async function computeCommitment({ salt, studentId, programName, metadata }) {
  return '0x' + await sha256Hex(`${salt}|${trim(studentId)}|${trim(programName)}|${trim(metadata)}`);
}

export function buildCredentialFile({ commitment, salt, studentId, programName, metadata, issuer, chainId, contract, issuedTx, batch = null }) {
  return {
    format: 'scholarledger-credential/1',
    commitment, salt,
    studentId: trim(studentId), programName: trim(programName), metadata: trim(metadata),
    issuer, chainId, contract, issuedTx, batch
  };
}

// Throws a readable Error unless the file is well formed and its commitment matches its fields.
export async function parseCredentialFile(text) {
  let f;
  try { f = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (!f || f.format !== 'scholarledger-credential/1') throw new Error('This is not a ScholarLedger credential file.');
  for (const k of ['commitment', 'salt', 'studentId', 'programName']) {
    if (typeof f[k] !== 'string' || !f[k]) throw new Error(`Credential file is missing "${k}".`);
  }
  if (['studentId', 'programName', 'metadata'].some((k) => String(f[k] ?? '').includes('|'))) {
    throw new Error('This file contains a character that is not allowed.');
  }
  if (!/^[0-9a-f]{64}$/.test(f.salt)) throw new Error('Credential file has an invalid salt.');
  if (!/^0x[0-9a-f]{64}$/.test(f.commitment)) throw new Error('Credential file has an invalid commitment.');
  if (await computeCommitment(f) !== f.commitment) {
    throw new Error('This file has been altered: its details do not match its commitment.');
  }
  return f;
}

// Same convention as batch-service/merkle.js: SHA-256 over two lowercase hex strings (no 0x)
export async function verifyMerkleProof(leafHex, proof, rootHex) {
  let h = strip0x(leafHex);
  for (const step of proof) {
    h = await sha256Hex(step.position === 'left' ? step.hash + h : h + step.hash);
  }
  return h === strip0x(rootHex);
}

export function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const downloadJson = (filename, obj) => download(filename, JSON.stringify(obj, null, 2), 'application/json');
