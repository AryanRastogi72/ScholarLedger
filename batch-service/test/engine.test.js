const test = require('node:test');
const assert = require('node:assert');
const { analyzeBatch } = require('../occEngine');
const { buildMerkleTree, verifyMerkleProof } = require('../merkle');

test('duplicate hashes conflict and land in different groups', () => {
  const txs = ['a', 'b', 'a', 'c', 'd'].map(h => ({ credentialHash: h }));
  const r = analyzeBatch(txs);
  assert.strictEqual(r.conflicts.length, 1);
  assert.strictEqual(r.groups.length, 2);
  const g = (i) => r.groups.findIndex(grp => grp.includes(txs[i]));
  assert.notStrictEqual(g(0), g(2));
});

test('empty input gives zero groups', () => {
  assert.strictEqual(analyzeBatch([]).groups.length, 0);
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

test('issue endpoint rejects an unknown mode with 400', async () => {
  const { spawn } = require('node:child_process');
  const path = require('node:path');
  const port = 3999;
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
  try {
    await new Promise((res, rej) => { child.stdout.on('data', (d) => /running/.test(String(d)) && res()); child.on('error', rej); setTimeout(() => rej(new Error('server did not start')), 5000); });
    const r = await fetch(`http://127.0.0.1:${port}/api/batch/issue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'parallel', transactions: [{ studentId: 'A', programName: 'B' }] }) });
    assert.strictEqual(r.status, 400);
    assert.match((await r.json()).error, /mode/);
  } finally {
    child.kill();
  }
});
