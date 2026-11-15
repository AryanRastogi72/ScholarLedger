const crypto = require('crypto');

const newSalt = () => crypto.randomBytes(32).toString('hex');

// commitment = 0x + SHA-256 of "salt|studentId|programName|metadata" (fields trimmed)
function computeCommitment({ salt, studentId, programName, metadata }) {
  const t = (v) => String(v ?? '').trim();
  const data = `${salt}|${t(studentId)}|${t(programName)}|${t(metadata)}`;
  return '0x' + crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

module.exports = { newSalt, computeCommitment };
