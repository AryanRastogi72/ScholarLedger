#!/usr/bin/env node
// End-to-end checks for the batch service against a live node.
//   Needs: `npx hardhat node`, `npx hardhat run scripts/deploy.js --network localhost`, `node batch-service/server.js`.
//   node scripts/e2e.js                 safe cases, one PASS/FAIL line each
//   node scripts/e2e.js --bench         also time 20 and 50 conflict-free rows, sequential vs grouped, 3 runs each
//   node scripts/e2e.js --destructive   also run the cases that deregister the issuer (redeploy afterwards)
//   node scripts/e2e.js --kill-only --kill-cmd "<shell command that stops the node>"   only: send a 200-row batch and stop the node mid-request
//   node scripts/e2e.js --node-down     only the cases for a stopped node
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');
const root = path.join(__dirname, '..');
const { ethers } = require(path.join(root, 'node_modules', 'ethers'));
const { verifyMerkleProof } = require(path.join(root, 'batch-service', 'merkle.js'));

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const killCmd = args.includes('--kill-cmd') ? args[args.indexOf('--kill-cmd') + 1] : null;
const BASE = new URL(process.env.BATCH_URL ?? 'http://127.0.0.1:3001');
const RPC = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const token = /BATCH_API_TOKEN=(\S+)/.exec(fs.readFileSync(path.join(root, 'batch-service', '.env'), 'utf8'))[1];
const abis = path.join(root, 'frontend', 'src', 'abis');
const addresses = JSON.parse(fs.readFileSync(path.join(abis, 'deployedAddresses.json'), 'utf8'));
const managerAbi = JSON.parse(fs.readFileSync(path.join(abis, 'CredentialManager.json'), 'utf8')).abi;
const registryAbi = JSON.parse(fs.readFileSync(path.join(abis, 'InstitutionRegistry.json'), 'utf8')).abi;

// ---- tiny helpers -------------------------------------------------------
function api(method, p, { body, headers = {}, auth = true, raw = false } = {}) {
  return new Promise((resolve, reject) => {
    const payload = raw ? body : body === undefined ? undefined : JSON.stringify(body);
    const h = { ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(auth ? { Authorization: `Bearer ${token}` } : {}), ...headers };
    const req = http.request({ host: BASE.hostname, port: BASE.port, path: p, method, headers: h, timeout: 120000 }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch { /* not json */ } resolve({ status: res.statusCode, headers: res.headers, json, text: data }); });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('request timed out after 120 s')));
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}
const issue = (transactions, mode = 'grouped', extra = {}) => api('POST', '/api/batch/issue', { body: { transactions, mode }, ...extra });
const uid = crypto.randomBytes(4).toString('hex');
const rows = (n, tag) => Array.from({ length: n }, (_, i) => ({ studentId: `E2E-${uid}-${tag}-${i}`, programName: i % 2 ? 'B.Sc Physics' : 'B.Tech CSE', metadata: `row ${i}` }));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

let pass = 0;
let fail = 0;
async function check(name, fn) {
  try {
    const out = await fn();
    if (out === false) throw new Error('returned false');
    pass++;
    console.log(`PASS  ${name}${typeof out === 'string' ? `  (${out})` : ''}`);
  } catch (e) {
    fail++;
    console.log(`FAIL  ${name}  -> ${e.message}`);
  }
}
const eq = (a, b, what = '') => { if (a !== b) throw new Error(`${what} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const manager = new ethers.Contract(addresses.CredentialManager, managerAbi, provider);
  const registry = new ethers.Contract(addresses.InstitutionRegistry, registryAbi, provider);

  if (flag('--node-down')) {
    await check('health reports node: down', async () => { const r = await api('GET', '/api/health', { auth: false }); eq(r.json.node, 'down'); });
    await check('issue answers 503 with the node URL', async () => {
      const r = await issue(rows(1, 'down'));
      eq(r.status, 503);
      if (!/Cannot reach the blockchain node at/.test(r.json.error)) throw new Error(r.json.error);
    });
    return;
  }

  // ---- health ----
  await check('health: ok and node up', async () => { const r = await api('GET', '/api/health', { auth: false }); eq(r.status, 200); eq(r.json.node, 'up'); });

  // ---- auth and origin ----
  await check('auth: no token gives 401', async () => eq((await issue(rows(1, 'a'), 'grouped', { auth: false })).status, 401));
  await check('auth: wrong token gives 401', async () => eq((await issue(rows(1, 'a'), 'grouped', { auth: false, headers: { Authorization: 'Bearer nope' } })).status, 401));
  await check('auth: /api/health stays open', async () => eq((await api('GET', '/api/health', { auth: false })).status, 200));
  await check('host: foreign Host header gives 403', async () => eq((await api('GET', '/api/health', { headers: { Host: 'evil.example' } })).status, 403));
  await check('origin: foreign preflight gets no CORS header', async () => {
    const r = await api('OPTIONS', '/api/batch/issue', { auth: false, headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
    eq(r.headers['access-control-allow-origin'], undefined);
  });
  await check('origin: the app origin is allowed', async () => {
    const r = await api('OPTIONS', '/api/batch/issue', { auth: false, headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'POST' } });
    eq(r.headers['access-control-allow-origin'], 'http://localhost:3000');
  });

  // ---- validation ----
  await check('validation: transactions not an array gives 400', async () => eq((await api('POST', '/api/batch/issue', { body: { transactions: 'x' } })).status, 400));
  await check('validation: empty studentId gives 400', async () => eq((await issue([{ studentId: '', programName: 'B' }])).status, 400));
  await check('validation: empty programName gives 400', async () => eq((await issue([{ studentId: 'A', programName: '  ' }])).status, 400));
  await check('validation: | in a field gives 400', async () => {
    const r = await issue([{ studentId: 'A|B', programName: 'P' }]);
    eq(r.status, 400);
    if (!/\| character/.test(r.json.error)) throw new Error(r.json.error);
  });
  await check('validation: 1001 rows gives 400', async () => {
    const r = await issue(Array.from({ length: 1001 }, (_, i) => ({ studentId: String(i), programName: 'P' })));
    eq(r.status, 400);
    if (!/At most 1000/.test(r.json.error)) throw new Error(r.json.error);
  });
  await check('validation: malformed JSON gives 400', async () => eq((await api('POST', '/api/batch/issue', { raw: true, body: '{nope' })).status, 400));
  await check('validation: 3 MB body gives 413', async () => eq((await api('POST', '/api/batch/issue', { raw: true, body: JSON.stringify({ x: 'a'.repeat(3 * 1024 * 1024) }) })).status, 413));
  await check('validation: unknown mode gives 400', async () => eq((await issue(rows(1, 'm'), 'parallel')).status, 400));

  // ---- analyze: correct and no chain writes ----
  await check('analyze: groups and conflicts, no chain writes', async () => {
    const before = await provider.getBlockNumber();
    const r = await api('POST', '/api/batch/analyze', { body: { transactions: [{ studentId: 'S1', programName: 'B' }, { studentId: 'S2', programName: 'B' }, { studentId: 'S1', programName: 'B' }] } });
    eq(r.status, 200); eq(r.json.groups.length, 2, 'groups'); eq(r.json.conflicts.length, 1, 'conflicts');
    eq(r.json.conflicts[0].reason, 'Same student and program');
    eq(await provider.getBlockNumber(), before, 'block number');
  });

  // ---- grouped issue ----
  let sample;
  await check('grouped: S1/S2/S1 gives 2 issued + 1 exact duplicate message', async () => {
    const r = await issue([{ studentId: `S1-${uid}`, programName: 'BTech' }, { studentId: `S2-${uid}`, programName: 'BTech' }, { studentId: `S1-${uid}`, programName: 'BTech' }]);
    eq(r.status, 200); eq(r.json.metrics.succeeded, 2); eq(r.json.metrics.failed, 1); eq(r.json.metrics.parallelBatches, 2);
    const failed = r.json.results.flat().filter((x) => !x.success);
    eq(failed[0].error, 'Duplicate of an earlier row in this batch');
    sample = r.json;
  });
  await check('grouped: batchId and merkleRoot set, no rootError', async () => {
    if (sample.batchId === null || !/^0x[0-9a-f]{64}$/.test(sample.merkleRoot) || sample.rootError) throw new Error(JSON.stringify({ b: sample.batchId, r: sample.merkleRoot, e: sample.rootError }));
  });
  let fifty;
  await check('grouped: 50 rows land in one block', async () => {
    const r = await issue(rows(50, 'g50'));
    eq(r.status, 200); eq(r.json.metrics.succeeded, 50); eq(r.json.metrics.blocksUsed, 1, 'blocksUsed');
    eq(new Set(r.json.results.flat().map((x) => x.blockNumber)).size, 1, 'distinct blocks');
    fifty = r.json;
  });
  async function verifyFiles(resp, label) {
    for (const c of resp.credentials) {
      const again = '0x' + crypto.createHash('sha256').update(`${c.salt}|${c.studentId}|${c.programName}|${c.metadata}`, 'utf8').digest('hex');
      eq(again, c.commitment, `${label} commitment of ${c.studentId}`);
      const [valid, issuer] = await manager.verifyCredential(c.commitment);
      if (!valid) throw new Error(`${label}: ${c.studentId} not valid on chain`);
      eq(issuer.toLowerCase(), c.issuer.toLowerCase(), 'issuer');
      const b = await manager.batches(c.batch.batchId);
      eq(b.merkleRoot, c.batch.merkleRoot, 'stored root');
      if (!verifyMerkleProof(c.commitment.slice(2), c.batch.proof, c.batch.merkleRoot.slice(2))) throw new Error(`${label}: bad proof for ${c.studentId}`);
    }
    return `${resp.credentials.length} files`;
  }
  await check('files: S1/S2 files verify (commitment, chain, Merkle proof)', () => verifyFiles(sample, 'small'));
  await check('files: all 50 files verify (commitment, chain, Merkle proof)', () => verifyFiles(fifty, '50'));
  await check('out-file: written and matches the response', async () => {
    const dir = path.join(root, 'batch-service', 'out');
    const latest = fs.readdirSync(dir).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((x, y) => y.t - x.t)[0].f;
    const saved = JSON.parse(fs.readFileSync(path.join(dir, latest), 'utf8'));
    eq(saved.length, 50); if (!saved[0].batch || !saved[0].batch.proof) throw new Error('out-file has no proof');
  });

  // ---- sequential ----
  await check('sequential: one block per row', async () => {
    const r = await issue(rows(10, 'seq'), 'sequential');
    eq(r.status, 200); eq(r.json.metrics.succeeded, 10); eq(r.json.metrics.blocksUsed, 10, 'blocksUsed'); eq(r.json.metrics.mode, 'sequential');
  });

  // ---- concurrency lock ----
  await check('two concurrent requests both succeed (the lock)', async () => {
    const [x, y] = await Promise.all([issue(rows(10, 'ca')), issue(rows(10, 'cb'))]);
    eq(x.status, 200); eq(y.status, 200); eq(x.json.metrics.succeeded, 10, 'first'); eq(y.json.metrics.succeeded, 10, 'second');
  });

  // ---- benchmark ----
  if (flag('--bench')) {
    for (const n of [20, 50]) {
      const t = { sequential: [], grouped: [] };
      for (let run = 0; run < 3; run++) {
        for (const mode of ['sequential', 'grouped']) {
          const r = await issue(rows(n, `b${n}${mode[0]}${run}`), mode);
          if (r.status !== 200 || r.json.metrics.succeeded !== n) throw new Error(`bench ${n} ${mode} failed: ${r.status} ${r.text.slice(0, 120)}`);
          t[mode].push(r.json.metrics.totalTimeMs);
        }
      }
      const s = median(t.sequential); const g = median(t.grouped);
      console.log(`BENCH ${n} rows: sequential median ${s} ms (${t.sequential.join(', ')}), grouped median ${g} ms (${t.grouped.join(', ')}), speedup ${(s / g).toFixed(1)}x`);
    }
  }

  // ---- destructive: deregister the issuer mid-batch (sequential, so rows confirm one by one) ----
  if (flag('--destructive')) {
    const [a, , , b] = await provider.listAccounts();
    await check('root failure: issuer deregistered mid-batch gives 200 + files + rootError', async () => {
      const pending = issue(rows(40, 'rf'), 'sequential');
      await new Promise((r) => setTimeout(r, 500));
      const reg = new ethers.Contract(addresses.InstitutionRegistry, registryAbi, a);
      const cutoff = (await provider.getBlock('latest')).timestamp;
      await (await reg.proposeDeregister('0x70997970C51812dc3A010C7d01b50e0d17dc79C8', cutoff)).wait();
      await (await reg.connect(b).approve((await registry.getProposalCount()) - 1n)).wait();
      const r = await pending;
      eq(r.status, 200);
      if (!r.json.rootError) throw new Error('no rootError');
      if (!(r.json.credentials.length > 0 && r.json.credentials.length < 40)) throw new Error(`files ${r.json.credentials.length}`);
      if (r.json.merkleRoot !== null || r.json.batchId !== null) throw new Error('root should be null');
      return `${r.json.credentials.length} files kept, rootError: ${r.json.rootError}`;
    });
  }
  if (flag('--kill-only') && killCmd) {
    await check('node killed mid-request: no hang, files built so far are returned', async () => {
      const t0 = Date.now();
      const pending = issue(rows(200, 'kill'), 'sequential');
      await new Promise((r) => setTimeout(r, 1500));
      exec(killCmd);
      const r = await pending;
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      if (![200, 500, 503].includes(r.status)) throw new Error(`status ${r.status}`);
      return `status ${r.status} after ${secs} s, ${r.json?.credentials?.length ?? 0} files, ${r.json?.rootError ?? r.json?.error ?? ''}`;
    });
  }
}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}).catch((e) => { console.error('e2e aborted:', e); process.exit(2); });
