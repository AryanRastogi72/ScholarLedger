const test = require('node:test');
const assert = require('node:assert');
const { analyzeBatch } = require('../occEngine');
const { buildMerkleTree, verifyMerkleProof } = require('../merkle');

test('duplicate hashes conflict and land in different groups', () => {
  const txs = ['a', 'b', 'a', 'c', 'd'].map(h => ({ credentialHash: h }));
  const r = analyzeBatch(txs, t => t.credentialHash);
  assert.strictEqual(r.conflicts.length, 1);
  assert.strictEqual(r.groups.length, 2);
  const g = (i) => r.groups.findIndex(grp => grp.includes(txs[i]));
  assert.notStrictEqual(g(0), g(2));
});

test('empty input gives zero groups', () => {
  assert.strictEqual(analyzeBatch([], t => t.k).groups.length, 0);
});

test('merkle proofs verify for every leaf', () => {
  for (const n of [1, 2, 3, 5, 6, 7]) {
    const leaves = Array.from({ length: n }, (_, i) => String(i).padStart(64, '0'));
    const { root, proofs } = buildMerkleTree(leaves);
    assert.match(root, /^[0-9a-f]{64}$/);
    leaves.forEach((l, i) => assert.ok(verifyMerkleProof(l, proofs[i], root), `n=${n} leaf=${i}`));
  }
});

test('changing a leaf changes the root', () => {
  const a = ['0'.repeat(64), '1'.repeat(64), '2'.repeat(64)];
  const b = [...a]; b[1] = '3'.repeat(64);
  assert.notStrictEqual(buildMerkleTree(a).root, buildMerkleTree(b).root);
});

test('commitment test vector and conflict key', () => {
  const { computeCommitment } = require('../credential');
  assert.strictEqual(
    computeCommitment({ salt: '0'.repeat(64), studentId: 'S1', programName: 'BTech', metadata: '' }),
    '0x2225df7e8e27bd1a06ead6224e43eecc4f02d8507b5a5f71aa31b7e695e22372'
  );
  const txs = [{ k: 'S1|B' }, { k: 'S1|B' }, { k: 'S2|B' }];
  const r = analyzeBatch(txs, t => t.k);
  assert.strictEqual(r.conflicts.length, 1);
  assert.strictEqual(r.conflicts[0].reason, 'Same student and program');
});

test('every result row has numeric submittedAt <= confirmedAt', async () => {
  const { executeBatch } = require('../occEngine');
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const groups = [[{ k: 1 }, { k: 2 }], [{ k: 3 }]];
  const out = await executeBatch(groups, async (tx, mark) => {
    if (tx.k === 3) throw new Error('aborted before send'); // no mark()
    await wait(5); mark(); await wait(5);
    return 'ok';
  });
  const rows = out.results.flat();
  assert.strictEqual(rows.length, 3);
  for (const r of rows) {
    assert.strictEqual(typeof r.submittedAt, 'number');
    assert.strictEqual(typeof r.confirmedAt, 'number');
    assert.ok(r.submittedAt <= r.confirmedAt);
  }
  assert.ok(rows[0].submittedAt > 0 && rows[0].submittedAt < rows[0].confirmedAt);
  assert.strictEqual(rows[2].submittedAt, rows[2].confirmedAt);
});

// Starts server.js on its own port (no chain needed: these tests stop at validation and middleware).
async function withServer(port, env, fn) {
  const { spawn } = require('node:child_process');
  const path = require('node:path');
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(port), BATCH_API_TOKEN: 'tkn', ...env }, stdio: 'pipe' });
  try {
    await new Promise((res, rej) => { child.stdout.on('data', (d) => /running/.test(String(d)) && res()); child.on('error', rej); setTimeout(() => rej(new Error('server did not start')), 5000); });
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    child.kill();
  }
}
const post = (base, body, headers = {}) => fetch(`${base}/api/batch/issue`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tkn', ...headers }, body: JSON.stringify(body) });
const row = { studentId: 'A', programName: 'B' };

test('issue endpoint rejects an unknown mode with 400', () => withServer(3999, {}, async (base) => {
  const r = await post(base, { mode: 'parallel', transactions: [row] });
  assert.strictEqual(r.status, 400);
  assert.match((await r.json()).error, /mode/);
}));

test('a | in any field gives 400', () => withServer(3998, {}, async (base) => {
  for (const f of ['studentId', 'programName', 'metadata']) {
    const r = await post(base, { transactions: [{ ...row, [f]: 'x|y' }] });
    assert.strictEqual(r.status, 400, f);
    assert.match((await r.json()).error, /\| character/);
  }
}));

test('more than 1000 rows gives 400', () => withServer(3997, {}, async (base) => {
  const r = await post(base, { transactions: Array.from({ length: 1001 }, (_, i) => ({ studentId: String(i), programName: 'B' })) });
  assert.strictEqual(r.status, 400);
  assert.match((await r.json()).error, /At most 1000/);
}));

test('a foreign Origin preflight gets no CORS header; the app origin does', () => withServer(3996, {}, async (base) => {
  const pre = (origin) => fetch(`${base}/api/batch/issue`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } });
  assert.strictEqual((await pre('https://evil.example')).headers.get('access-control-allow-origin'), null);
  assert.strictEqual((await pre('http://localhost:3000')).headers.get('access-control-allow-origin'), 'http://localhost:3000');
}));

test('a missing or wrong token gives 401', () => withServer(3995, { BATCH_API_TOKEN: 's3cret' }, async (base) => {
  assert.strictEqual((await post(base, { transactions: [row] }, { Authorization: '' })).status, 401);
  assert.strictEqual((await post(base, { transactions: [row] }, { Authorization: 'Bearer nope' })).status, 401);
  // right token passes auth (and then fails validation, not authorization)
  assert.strictEqual((await post(base, { transactions: [{ studentId: '', programName: '' }] }, { Authorization: 'Bearer s3cret' })).status, 400);
}));

test('the request handler never reads managerAddress', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(!/managerAddress\s*[=}]\s*req\.body|req\.body[^;]*managerAddress/.test(src));
  assert.ok(!/const \{[^}]*managerAddress[^}]*\} = req\.body/.test(src));
});

test('malformed JSON gives 400 and an oversized body gives 413', () => withServer(3994, {}, async (base) => {
  const bad = await fetch(`${base}/api/batch/issue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{nope' });
  assert.strictEqual(bad.status, 400);
  const big = await fetch(`${base}/api/batch/issue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(3 * 1024 * 1024) }) });
  assert.strictEqual(big.status, 413);
}));

test('a foreign Host header gets 403, localhost does not', () => withServer(3993, {}, async (base) => {
  const http = require('node:http');
  const get = (host) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port: 3993, path: '/api/health', headers: { Host: host } }, (r) => res(r.statusCode)).on('error', rej));
  assert.strictEqual(await get('evil.example'), 403);
  assert.strictEqual(await get('evil.example:3993'), 403);
  assert.strictEqual(await get('localhost:3993'), 200);
}));

test('the server refuses to start without BATCH_API_TOKEN', async () => {
  const { spawnSync } = require('node:child_process');
  const out = spawnSync(process.execPath, [require('node:path').join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: '3992', BATCH_API_TOKEN: '' }, encoding: 'utf8', timeout: 5000 });
  assert.strictEqual(out.status, 1);
  assert.match(out.stderr, /BATCH_API_TOKEN missing: run the deploy script first/);
});

test('shortError keeps our own messages and shortens ethers errors', () => {
  const { shortError } = require('../shortError');
  assert.strictEqual(shortError(new Error('Duplicate of an earlier row in this batch')), 'Duplicate of an earlier row in this batch');
  const quiet = console.error; console.error = () => {};
  try {
    const eth = Object.assign(new Error('could not coalesce error (error={ ...huge... })'), { code: 'UNKNOWN_ERROR', shortMessage: 'could not coalesce error' });
    assert.strictEqual(shortError(eth), 'could not coalesce error');
    assert.strictEqual(shortError(Object.assign(new Error('x'), { code: 'TIMEOUT' })), 'Timed out waiting for confirmation');
    assert.strictEqual(shortError(Object.assign(new Error("could not coalesce error (... reverted with reason string 'Not a registered institution' ...)"), { code: 'UNKNOWN_ERROR', shortMessage: 'could not coalesce error' })), 'Not a registered institution');
    assert.strictEqual(shortError(Object.assign(new Error('x'), { code: 'SOMETHING' })), 'Transaction failed');
  } finally { console.error = quiet; }
});
