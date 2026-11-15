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
