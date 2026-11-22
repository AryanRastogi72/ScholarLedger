#!/usr/bin/env node
// Browser checks for every page: good and bad paths in headless Chromium/Edge with an EIP-1193 stand-in wallet.
//   Needs: node, deploy, batch service, and the frontend served on http://localhost:3000 (npm run build && npx vite preview --port 3000).
//   node scripts/ui-check.js                 main run (creates its own fixtures on the chain; run it on a fresh deploy)
//   node scripts/ui-check.js --offline       only the cases for a stopped node (stop the node first)
//   node scripts/ui-check.js --service-down  only the Batch case for a stopped batch service
//   node scripts/ui-check.js --no-token      only the Batch case for a frontend built without VITE_BATCH_API_TOKEN
// Env: CHROME (browser path), BASE (site URL), RPC_URL. Prints a line per case and writes docs/ui-results.json.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const root = path.join(__dirname, '..');
const WebSocket = require(path.join(root, 'node_modules', 'ws'));
const { ethers } = require(path.join(root, 'node_modules', 'ethers'));

const args = process.argv.slice(2);
const mode = ['--offline', '--service-down', '--no-token'].find((f) => args.includes(f)) ?? 'main';
const BASE = process.env.BASE ?? 'http://localhost:3000';
const RPC = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const BROWSER = process.env.CHROME ?? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const abis = path.join(root, 'frontend', 'src', 'abis');
const addr = JSON.parse(fs.readFileSync(path.join(abis, 'deployedAddresses.json'), 'utf8'));
const managerAbi = JSON.parse(fs.readFileSync(path.join(abis, 'CredentialManager.json'), 'utf8')).abi;
const registryAbi = JSON.parse(fs.readFileSync(path.join(abis, 'InstitutionRegistry.json'), 'utf8')).abi;
const token = (() => { try { return /BATCH_API_TOKEN=(\S+)/.exec(fs.readFileSync(path.join(root, 'batch-service', '.env'), 'utf8'))[1]; } catch { return ''; } })();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

// ---------------------------------------------------------------- browser plumbing
function getJson(port, p) {
  return new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: p }, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d))); }).on('error', rej));
}

// Injected before any page script: the wallet stand-in, a download recorder, an error recorder and small DOM helpers.
// Hardhat's public dev accounts #0 to #7, so the wallet works even when the node is down.
const ACCOUNTS = ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', '0x90F79bf6EB2c4f870365E785982E1f101E93b906', '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc', '0x976EA74026E726554dB657fA54763abd0C3a0aa9', '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'];
const injected = (cfg) => `(() => {
  const cfg = ${JSON.stringify(cfg)};
  window.__errors = [];
  window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__errors.push('unhandled: ' + String(e.reason && e.reason.message || e.reason)));
  const blobs = new Map();
  const create = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { const u = create(b); blobs.set(u, b); return u; };
  window.__downloads = [];
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download && blobs.has(this.href)) blobs.get(this.href).text().then((t) => window.__downloads.push({ name: this.download, text: t })); return click.apply(this, arguments); };
  if (cfg.account !== null) {
    const rpc = async (method, params = []) => {
      const r = await fetch(cfg.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const j = await r.json(); if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; } return j.result;
    };
    window.ethereum = { isMetaMask: true, on() {}, removeListener() {},
      async request({ method, params }) {
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [cfg.accounts[cfg.account]];
        if (method === 'eth_chainId') return cfg.chainId ? '0x' + cfg.chainId.toString(16) : rpc(method, params);
        if (cfg.reject && (method === 'eth_sendTransaction' || method === 'eth_estimateGas')) { const e = new Error('User rejected the request.'); e.code = 4001; throw e; }
        return rpc(method, params);
      } };
  }
  const setNative = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  window.__h = {
    set: (id, v) => setNative(document.getElementById(id), v),
    btn: (text, scope) => { const b = [...(scope || document).querySelectorAll('button, a')].find((x) => x.textContent.trim() === text); if (b) b.click(); return !!b; },
    upload: (text, name) => { const i = document.querySelector('input[type=file]'); const dt = new DataTransfer(); dt.items.add(new File([text], name || 'f.json')); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); },
    key: (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })),
    main: () => (document.querySelector('main') || document.body).innerText.replace(/\\s+/g, ' ')
  };
})();`;

class Page {
  constructor(ws, id) { this.ws = ws; this.n = 0; this.pending = {}; this.id = id; ws.on('message', (m) => { const d = JSON.parse(m); if (d.id && this.pending[d.id]) { this.pending[d.id](d); delete this.pending[d.id]; } }); }
  send(method, params = {}) { return new Promise((res) => { const i = ++this.n; this.pending[i] = res; this.ws.send(JSON.stringify({ id: i, method, params })); }); }
  async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed'); return r.result.result.value; }
  async waitFor(expr, ms = 10000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await this.eval(expr)) return true; } catch { /* page still loading */ } await sleep(120); } return false; }
  text() { return this.eval('__h.main()'); }
  async waitText(re, ms = 10000) { return this.waitFor(`/${re.source}/${re.flags}.test(__h.main())`, ms); }
  async nav(url) { await this.send('Page.navigate', { url }); await sleep(300); await this.waitFor("document.readyState === 'complete' && !!document.querySelector('main')", 8000); }
}

let browser; let browserWs; let bPort;
async function startBrowser() {
  bPort = 9400 + Math.floor(Math.random() * 400);
  const prof = path.join(os.tmpdir(), `ui-check-${bPort}`);
  browser = spawn(BROWSER, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${bPort}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { browserWs = (await getJson(bPort, '/json/version')).webSocketDebuggerUrl; break; } catch { await sleep(250); } }
  if (!browserWs) throw new Error('browser did not start');
}
async function openPage(cfg, view = {}) {
  const ws0 = new WebSocket(browserWs); await new Promise((r) => ws0.on('open', r));
  const created = await new Promise((res) => { ws0.on('message', (m) => { const d = JSON.parse(m); if (d.id === 1) res(d.result.targetId); }); ws0.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url: 'about:blank' } })); });
  ws0.close();
  const list = await getJson(bPort, '/json/list');
  const t = list.find((x) => x.id === created);
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.on('open', r));
  const p = new Page(ws, created);
  await p.send('Page.enable');
  const mobile = view.width && view.width < 600;
  await p.send('Emulation.setDeviceMetricsOverride', { width: view.width ?? 1440, height: view.height ?? 900, deviceScaleFactor: 1, mobile: !!mobile });
  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: view.scheme ?? 'light' }] });
  await p.send('Page.addScriptToEvaluateOnNewDocument', { source: injected({ rpc: cfg.rpc ?? RPC, accounts: ACCOUNTS, account: cfg.account ?? null, chainId: cfg.chainId ?? null, reject: !!cfg.reject }) });
  p.close = async () => { ws.close(); await new Promise((r) => { const w = new WebSocket(browserWs); w.on('open', () => { w.send(JSON.stringify({ id: 1, method: 'Target.closeTarget', params: { targetId: created } })); setTimeout(() => { w.close(); r(); }, 150); }); }); };
  return p;
}

// ---------------------------------------------------------------- case runner
let pass = 0; let fail = 0;
// layer, name, expected (RegExp tested against the observation), wallet config, fn(page) -> observation string
async function testCase(layer, name, expected, cfg, fn, view) {
  let observed = '';
  let ok = false;
  const p = await openPage(cfg, view);
  try {
    const full = String(await fn(p));
    ok = expected.test(full);
    observed = full.length > 220 && !ok ? full.slice(0, 110) + ' ... ' + full.slice(-110) : full.slice(0, 220);
  } catch (e) {
    observed = `error: ${e.message}`.slice(0, 220);
  } finally {
    await p.close();
  }
  ok ? pass++ : fail++;
  results.push({ layer, case: name, expected: String(expected), observed, result: ok ? 'PASS' : 'FAIL' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${layer}] ${name}  ->  ${observed.slice(0, 120)}`);
}
const T = (p) => p.text();
const t = (p, re, ms) => p.waitText(re, ms);

// ---------------------------------------------------------------- fixtures (made through ethers, not the UI)
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const commitment = (f) => '0x' + crypto.createHash('sha256').update(`${f.salt}|${f.studentId}|${f.programName}|${f.metadata}`, 'utf8').digest('hex');
function fileFor(fields, issuer, issuedTx = '0x' + '00'.repeat(32), batch = null) {
  const f = { format: 'scholarledger-credential/1', salt: crypto.randomBytes(32).toString('hex'), metadata: '', ...fields };
  return { ...f, commitment: commitment(f), issuer, chainId: 31337, contract: addr.CredentialManager, issuedTx, batch };
}
async function batchApi(rows, modeName = 'grouped') {
  const r = await fetch('http://127.0.0.1:3001/api/batch/issue', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ transactions: rows, mode: modeName }) });
  return r.json();
}

async function main() {
  await startBrowser();
  const provider = new ethers.JsonRpcProvider(RPC);
  const uid = crypto.randomBytes(3).toString('hex');
  const view375 = { width: 375, height: 812, scheme: 'dark' };

  if (mode === '--offline') {
    await testCase('Home', 'offline state', /Node offline/, { account: null }, async (p) => { await p.nav(BASE + '/'); await t(p, /Node offline/); return T(p); });
    await testCase('Ledger', 'offline state', /Cannot reach the blockchain node|No data to show/, { account: null }, async (p) => { await p.nav(BASE + '/explorer'); await t(p, /Cannot reach/); return T(p); });
    await testCase('Verify', 'lookup with the node down', /Cannot reach the blockchain node/, { account: null }, async (p) => { await p.nav(BASE + '/verify'); await p.eval(`__h.set('paste', '0x${'ab'.repeat(32)}')`); await p.eval(`__h.btn('Check commitment')`); await t(p, /Cannot reach/); return T(p); });
    await testCase('Register', 'page with the node down', /Cannot reach the blockchain node/, { account: null }, async (p) => { await p.nav(BASE + '/register'); await t(p, /Cannot reach/); return T(p); });
    await testCase('Forgery demo', 'wallet and node down wording', /Cannot reach the node/, { account: 5 }, async (p) => { await p.nav(BASE + '/demo'); await p.waitFor("!!document.querySelector('.chip')", 5000); await p.eval(`__h.btn('Try the forgery')`); await t(p, /Cannot reach the node|Refused/, 12000); return T(p); });
    return;
  }
  if (mode === '--service-down') {
    await testCase('Batch', 'service down', /Cannot reach the batch service/, { account: null }, async (p) => { await p.nav(BASE + '/batch'); await p.eval(`document.querySelectorAll('tbody input')[0].focus()`); await p.eval(`(() => { const i = document.querySelectorAll('tbody input'); const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }; set(i[0], 'X1'); set(i[1], 'BTech'); })()`); await p.eval(`__h.btn('Execute batch')`); await t(p, /Cannot reach the batch service/); return T(p); });
    return;
  }
  if (mode === '--no-token') {
    await testCase('Batch', 'frontend built without the token gets 401', /Missing or wrong API token/, { account: null }, async (p) => { await p.nav(BASE + '/batch'); await p.eval(`(() => { const i = document.querySelectorAll('tbody input'); const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }; set(i[0], 'X1'); set(i[1], 'BTech'); })()`); await p.eval(`__h.btn('Execute batch')`); await t(p, /Missing or wrong API token/); return T(p); });
    return;
  }

  // ---- fixtures ----
  const signers = await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map((i) => provider.getSigner(i)));
  const reg = new ethers.Contract(addr.InstitutionRegistry, registryAbi, provider);
  const mgr = new ethers.Contract(addr.CredentialManager, managerAbi, provider);
  const A = await signers[1].getAddress(); // Demo University (registered by deploy)
  const B = await signers[2].getAddress(); // Second University: made here, deregistered later with a cutoff
  const adminPropose = async (fn, ...a) => { await (await reg.connect(signers[0])[fn](...a)).wait(); await (await reg.connect(signers[3]).approve((await reg.getProposalCount()) - 1n)).wait(); };
  await adminPropose('proposeRegister', B, 'Second University', 'second.edu');

  const chainNow = async () => (await provider.getBlock('latest')).timestamp;
  const issueAs = async (signer, f) => { await (await mgr.connect(signer).issueCredential(f.commitment)).wait(); };
  const early = fileFor({ studentId: `EARLY-${uid}`, programName: 'MSc', metadata: 'before cutoff' }, B);
  await issueAs(signers[2], early);
  await provider.send('evm_increaseTime', [10]); await provider.send('evm_mine', []);
  const cutoff = await chainNow();
  await provider.send('evm_increaseTime', [10]); await provider.send('evm_mine', []);
  const late = fileFor({ studentId: `LATE-${uid}`, programName: 'MSc', metadata: 'after cutoff' }, B);
  await issueAs(signers[2], late);

  const made = await batchApi([{ studentId: `V1-${uid}`, programName: 'BTech', metadata: 'a' }, { studentId: `V2-${uid}`, programName: 'BTech', metadata: 'b' }, { studentId: `V3-${uid}`, programName: 'BSc', metadata: 'c' }, { studentId: `V1-${uid}`, programName: 'BTech', metadata: 'dup' }]);
  const [fValid, fRevoke, fOther] = made.credentials;
  await (await mgr.connect(signers[1]).revokeCredential(fRevoke.commitment)).wait();

  const up = (p, file) => p.eval(`__h.upload(${JSON.stringify(JSON.stringify(file))})`);
  const hex = (n) => '0x' + n.repeat(32).slice(0, 64);

  // ================= HOME =================
  await testCase('Home', 'live stats show real numbers', /^2 Active institutions \d+ Credentials \d+ Batches 1 Revoked$/, { account: null }, async (p) => { await p.nav(BASE + '/'); await t(p, /Active institutions/); const s = await p.eval("document.querySelector('.stats').innerText.replace(/\\s+/g, ' ')"); return s; });
  await testCase('Home', 'no console errors', /^0$/, { account: null }, async (p) => { await p.nav(BASE + '/'); await sleep(800); return String((await p.eval('__errors')).length); });

  // ================= VERIFY =================
  await testCase('Verify', 'valid batch file: VALID, details and batch proof', /Valid.*Checks out against the stored Merkle root.*V1-/, { account: null }, async (p) => { await p.nav(BASE + '/verify'); await up(p, fValid); await t(p, /Checks out|Valid/); await sleep(400); return T(p); });
  await testCase('Verify', 'altered file: ALTERED, no chain call', /Altered file/, { account: null }, async (p) => { await p.nav(BASE + '/verify'); await up(p, { ...fValid, programName: 'PhD Forgery' }); await t(p, /Altered file/); return T(p); });
  await testCase('Verify', 'revoked credential by file: REVOKED', /Revoked/, { account: null }, async (p) => { await p.nav(BASE + '/verify'); await up(p, fRevoke); await t(p, /Revoked/); return T(p); });
  await testCase('Verify', 'not found: random commitment', /Not found/, { account: null }, async (p) => { await p.nav(BASE + `/verify?c=${hex('7e')}`); await t(p, /Not found/); return T(p); });
  await testCase('Verify', 'pasted valid hash: VALID without student details', /Valid(?!.*Awarded to V)/, { account: null }, async (p) => { await p.nav(BASE + '/verify'); await p.eval(`__h.set('paste', ${JSON.stringify(fValid.commitment)})`); await p.eval(`__h.btn('Check commitment')`); await t(p, /Valid/); return T(p); });
  await testCase('Verify', 'bad hash format: inline error, no lookup', /Enter 0x followed by 64 hex/, { account: null }, async (p) => { await p.nav(BASE + '/verify'); await p.eval(`__h.set('paste', '0x123')`); await p.eval(`__h.btn('Check commitment')`); await t(p, /Enter 0x/); return T(p); });
  await testCase('Verify', 'wrong-chain file: refused, no lookup', /issued on chain 1, contract/, { account: null }, async (p) => { await p.nav(BASE + '/verify'); await up(p, { ...fValid, chainId: 1 }); await t(p, /issued on chain/); return T(p); });
  await testCase('Verify', 'wrong-contract file: refused, no lookup', /issued on chain 31337, contract 0x0000000000000000000000000000000000000001/, { account: null }, async (p) => { await p.nav(BASE + '/verify'); await up(p, { ...fValid, contract: '0x0000000000000000000000000000000000000001' }); await t(p, /issued on chain/); return T(p); });
  await testCase('Verify', 'issuer-mismatch file: ledger result plus warning', /Valid.*different issuer/, { account: null }, async (p) => { await p.nav(BASE + '/verify'); await up(p, { ...fValid, issuer: '0x0000000000000000000000000000000000000002' }); await t(p, /different issuer/); return T(p); });
  await testCase('Verify', 'batch array file: picker, then verify the chosen entry', /Valid.*V3/, { account: null }, async (p) => {
    await p.nav(BASE + '/verify'); await up(p, made.credentials); await t(p, /pick one/);
    const label = await p.eval("document.querySelector('#pick').innerText.replace(/\\s+/g, ' ')");
    await p.eval("(() => { const s = document.getElementById('pick'); s.value = '2'; s.dispatchEvent(new Event('change', { bubbles: true })); })()");
    await t(p, /Valid/); return `${label} => ${await T(p)}`;
  });
  await testCase('Verify', 'not JSON', /not valid JSON/, { account: null }, async (p) => { await p.nav(BASE + '/verify'); await p.eval(`__h.upload('hello', 'x.json')`); await t(p, /not valid JSON/); return T(p); });
  await testCase('Verify', 'wrong format', /not a ScholarLedger credential file/, { account: null }, async (p) => { await p.nav(BASE + '/verify'); await up(p, { format: 'other' }); await t(p, /not a ScholarLedger/); return T(p); });
  await testCase('Verify', '| in a file field', /character that is not allowed/, { account: null }, async (p) => { await p.nav(BASE + '/verify'); await up(p, { ...fValid, studentId: 'a|b' }); await t(p, /not allowed/); return T(p); });
  await testCase('Verify', 'works with no wallet installed', /Valid/, { account: null }, async (p) => { await p.nav(BASE + `/verify?c=${fValid.commitment}`); await t(p, /Valid/); return `${await p.eval('typeof window.ethereum')} ${await T(p)}`; });

  // ================= ISSUE =================
  await testCase('Issue', 'success: confirmed, certificate, file download that verifies on chain', /Confirmed in block.*"ok":true/, { account: 1 }, async (p) => {
    await p.nav(BASE + '/issue');
    await p.eval(`__h.set('studentId', 'UI-${uid}'); __h.set('programName', 'BTech'); __h.set('metadata', 'from the page')`);
    await p.eval(`__h.btn('Issue credential')`); await t(p, /Credential issued/, 15000);
    await p.eval(`__h.btn('Download credential file')`); await p.waitFor('__downloads.length > 0', 4000);
    const dl = JSON.parse(await p.eval('__downloads[0].text'));
    const [valid] = await mgr.verifyCredential(dl.commitment);
    return `${(await T(p)).match(/Confirmed in block \d+/)?.[0]} "ok":${valid && dl.studentId === `UI-${uid}` && commitment(dl) === dl.commitment}`;
  });
  await testCase('Issue', 'empty fields: inline errors, nothing sent', /Student ID is required.*Program name is required/, { account: 1 }, async (p) => { await p.nav(BASE + '/issue'); await p.eval(`__h.btn('Issue credential')`); await sleep(500); return T(p); });
  await testCase('Issue', '| in a field: inline error', /The \| character is not allowed/, { account: 1 }, async (p) => { await p.nav(BASE + '/issue'); await p.eval(`__h.set('studentId', 'a|b'); __h.set('programName', 'P')`); await p.eval(`__h.btn('Issue credential')`); await sleep(500); return T(p); });
  await testCase('Issue', 'wrong chain: refused, no "Credential issued"', /^(?!.*Credential issued).*Your wallet is on chain 1/, { account: 1, chainId: 1 }, async (p) => { await p.nav(BASE + '/issue'); await p.eval(`__h.set('studentId', 'W-${uid}'); __h.set('programName', 'P')`); await p.eval(`__h.btn('Issue credential')`); await t(p, /Your wallet is on chain/); return T(p); });
  await testCase('Issue', 'wallet cancel: plain message', /rejected the signature request/, { account: 1, reject: true }, async (p) => { await p.nav(BASE + '/issue'); await p.eval(`__h.set('studentId', 'C-${uid}'); __h.set('programName', 'P')`); await p.eval(`__h.btn('Issue credential')`); await t(p, /rejected/, 12000); return T(p); });
  await testCase('Issue', 'non-issuer wallet (#5): refused in plain English', /not a registered institution/, { account: 5 }, async (p) => { await p.nav(BASE + '/issue'); await p.eval(`__h.set('studentId', 'N-${uid}'); __h.set('programName', 'P')`); await p.eval(`__h.btn('Issue credential')`); await t(p, /not a registered institution/, 12000); return T(p); });
  await testCase('Issue', 'no wallet installed', /No wallet found/, { account: null }, async (p) => { await p.nav(BASE + '/issue'); await p.eval(`__h.set('studentId', 'Z-${uid}'); __h.set('programName', 'P')`); await p.eval(`__h.btn('Issue credential')`); await t(p, /No wallet found/); return T(p); });

  // ================= BATCH =================
  const csv = ['studentId,programName,metadata', `BA-${uid},BTech,x`, `BB-${uid},BTech,y`, `BA-${uid},BTech,dup`, `BC-${uid},BSc,z`].join('\n');
  await testCase('Batch', 'CSV upload fills the table, Analyze shows groups and the conflict', /Rows 4 Conflicts 1 Groups 2/, { account: null }, async (p) => {
    await p.nav(BASE + '/batch'); await p.eval(`__h.upload(${JSON.stringify(csv)}, 'b.csv')`); await sleep(500);
    await p.eval(`__h.btn('Analyze conflicts')`); await t(p, /Groups 2/); return p.eval("document.querySelector('.stats').innerText.replace(/\\s+/g, ' ')");
  });
  await testCase('Batch', 'Execute: results, amber duplicate bar, Download all verifies on the Verify page', /Succeeded 3 Failed 1.*aborted=1.*dl=3.*Valid/, { account: null }, async (p) => {
    await p.nav(BASE + '/batch'); await p.eval(`__h.upload(${JSON.stringify(csv.replace(/BA-/g, 'BX-').replace(/BB-/g, 'BY-').replace(/BC-/g, 'BZ-'))}, 'b.csv')`); await sleep(500);
    await p.eval(`__h.btn('Execute batch')`); await t(p, /Succeeded 3/, 20000);
    const body = await T(p); const aborted = await p.eval("[...document.querySelectorAll('.timeline-svg title')].filter((x) => /Aborted/.test(x.textContent)).length");
    await p.eval(`__h.btn('Download all credential files')`); await p.waitFor('__downloads.length > 0', 4000);
    const arr = JSON.parse(await p.eval('__downloads[0].text'));
    const v = await openPage({ account: null }); await v.nav(BASE + '/verify'); await v.eval(`__h.upload(${JSON.stringify(JSON.stringify(arr))})`); await v.waitText(/pick one/);
    await v.eval("(() => { const s = document.getElementById('pick'); s.value = '0'; s.dispatchEvent(new Event('change', { bubbles: true })); })()"); await v.waitText(/Valid/); const vt = await v.text(); await v.close();
    return `${body.match(/Succeeded \d+ Failed \d+/)?.[0]} aborted=${aborted} dl=${arr.length} ${vt.match(/Valid/)?.[0]}`;
  });
  await testCase('Batch', 'Compare with sequential: speedup and two timelines', /\d+\.\d\S* svgs=2/, { account: null }, async (p) => {
    await p.nav(BASE + '/batch'); const rows = ['studentId,programName,metadata', ...Array.from({ length: 20 }, (_, i) => `CMP-${uid}-${i},BTech,x`)].join('\n');
    await p.eval(`__h.upload(${JSON.stringify(rows)}, 'b.csv')`); await sleep(500);
    await p.eval("document.querySelector('.check input').click()"); await sleep(200); await p.eval(`__h.btn('Execute batch')`); await p.waitFor("!!document.querySelector('.speedup-fig')", 30000);
    return `${await p.eval("document.querySelector('.speedup-fig').innerText")} svgs=${await p.eval("document.querySelectorAll('.timeline-svg').length")}`;
  });
  await testCase('Batch', 'empty table: asks for a row', /Add at least one row/, { account: null }, async (p) => { await p.nav(BASE + '/batch'); await p.eval(`__h.btn('Execute batch')`); await t(p, /Add at least one row/); return T(p); });
  await testCase('Batch', '| in a row: the service refuses (400)', /the \| character is not allowed/, { account: null }, async (p) => { await p.nav(BASE + '/batch'); await p.eval(`(() => { const i = document.querySelectorAll('tbody input'); const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); }; set(i[0], 'a|b'); set(i[1], 'P'); })()`); await p.eval(`__h.btn('Execute batch')`); await t(p, /character is not allowed/); return T(p); });

  // ================= REVOKE =================
  const toRevoke = fileFor({ studentId: `RV-${uid}`, programName: 'BTech' }, A); await issueAs(signers[1], toRevoke);
  const toRevoke2 = fileFor({ studentId: `RW-${uid}`, programName: 'BTech' }, A); await issueAs(signers[1], toRevoke2);
  await testCase('Revoke', 'by file: confirmed, then Verify shows REVOKED', /Confirmed in block.*Revoked/, { account: 1 }, async (p) => {
    await p.nav(BASE + '/revoke'); await up(p, toRevoke); await sleep(500); await p.eval(`__h.btn('Revoke credential')`); await t(p, /Confirmed in block/, 12000);
    const v = await openPage({ account: null }); await v.nav(BASE + `/verify?c=${toRevoke.commitment}`); await v.waitText(/Revoked|Valid/); const vt = await v.text(); await v.close();
    return `${(await T(p)).match(/Confirmed in block \d+/)?.[0]} ${vt.match(/Revoked|Valid/)?.[0]}`;
  });
  await testCase('Revoke', 'by pasted hash: confirmed', /Confirmed in block/, { account: 1 }, async (p) => { await p.nav(BASE + '/revoke'); await p.eval(`__h.set('commitment', ${JSON.stringify(toRevoke2.commitment)})`); await p.eval(`__h.btn('Revoke credential')`); await t(p, /Confirmed in block/, 12000); return T(p); });
  await testCase('Revoke', 'already revoked', /already revoked/, { account: 1 }, async (p) => { await p.nav(BASE + '/revoke'); await p.eval(`__h.set('commitment', ${JSON.stringify(toRevoke2.commitment)})`); await p.eval(`__h.btn('Revoke credential')`); await t(p, /already revoked/i, 12000); return T(p); });
  await testCase('Revoke', 'wrong issuer (#2 revoking a Demo University credential)', /Only the institution that issued/, { account: 2 }, async (p) => { await p.nav(BASE + '/revoke'); await p.eval(`__h.set('commitment', ${JSON.stringify(fOther.commitment)})`); await p.eval(`__h.btn('Revoke credential')`); await t(p, /Only the institution/, 12000); return T(p); });
  await testCase('Revoke', 'wrong chain', /Your wallet is on chain 1/, { account: 1, chainId: 1 }, async (p) => { await p.nav(BASE + '/revoke'); await p.eval(`__h.set('commitment', ${JSON.stringify(fOther.commitment)})`); await p.eval(`__h.btn('Revoke credential')`); await t(p, /Your wallet is on chain/); return T(p); });
  await testCase('Revoke', 'bad hash format: inline error', /Enter 0x followed by 64 hex/, { account: 1 }, async (p) => { await p.nav(BASE + '/revoke'); await p.eval(`__h.set('commitment', '0x12')`); await p.eval(`__h.btn('Revoke credential')`); await sleep(400); return T(p); });
  await testCase('Revoke', 'altered file refused', /altered/, { account: 1 }, async (p) => { await p.nav(BASE + '/revoke'); await up(p, { ...toRevoke, programName: 'x' }); await t(p, /altered/); return T(p); });

  // ================= REGISTER =================
  const target = await signers[6].getAddress();
  await testCase('Register', 'header says 2 of 3 and lists three admins', /2 of 3.*Admins/, { account: 0 }, async (p) => { await p.nav(BASE + '/register'); await t(p, /2 of 3/); return `${await T(p)} admins=${await p.eval("document.querySelectorAll('.admin-list li').length")}`; });
  await testCase('Register', 'propose: shows 1 / 2 Waiting and the target is NOT registered', /1 \/ 2 .*Waiting.*registered=false/, { account: 0 }, async (p) => {
    await p.nav(BASE + '/register'); await p.eval(`__h.set('f-address', ${JSON.stringify(target)}); __h.set('f-name', 'Third University'); __h.set('f-domain', 'third.edu')`);
    await p.eval(`__h.btn('Propose registration')`); await t(p, /Proposed registering/, 15000); await sleep(600);
    return `${await T(p)} registered=${await reg.isRegistered(target)}`;
  });
  await testCase('Register', 'double approve: the proposer cannot approve again (button disabled)', /disabled=true/, { account: 0 }, async (p) => { await p.nav(BASE + '/register'); await t(p, /Waiting/); return `disabled=${await p.eval("[...document.querySelectorAll('tbody button')].filter((b) => b.textContent.trim() === 'Approve').every((b) => b.disabled)")}`; });
  await testCase('Register', 'non-admin (#5): forms and Approve disabled, note shown', /disabledFieldsets=2 approve=true Connect an admin wallet/, { account: 5 }, async (p) => { await p.nav(BASE + '/register'); await t(p, /Waiting/); return `disabledFieldsets=${await p.eval("document.querySelectorAll('fieldset:disabled').length")} approve=${await p.eval("[...document.querySelectorAll('tbody button')].filter((b) => b.textContent.trim() === 'Approve').every((b) => b.disabled)")} ${(await T(p)).match(/Connect an admin wallet[^.]*\./)?.[0]}`; });
  await testCase('Register', 'second admin approves: executed and registered', /Approved and executed: Third University is now registered.*registered=true/, { account: 3 }, async (p) => { await p.nav(BASE + '/register'); await t(p, /Waiting/); await p.eval("[...document.querySelectorAll('tbody button')].find((b) => b.textContent.trim() === 'Approve').click()"); await t(p, /Approved and executed/, 15000); return `${(await T(p)).match(/Approved and executed[^.]*\./)?.[0]} registered=${await reg.isRegistered(target)}`; });
  await testCase('Register', 'wrong chain: refused before anything is sent', /Your wallet is on chain 1/, { account: 0, chainId: 1 }, async (p) => { await p.nav(BASE + '/register'); await p.eval(`__h.set('f-address', ${JSON.stringify(await signers[7].getAddress())}); __h.set('f-name', 'X'); __h.set('f-domain', 'x.edu')`); await p.eval(`__h.btn('Propose registration')`); await t(p, /Your wallet is on chain/); return T(p); });
  await testCase('Register', 'validation: bad address and empty name', /Enter a valid Ethereum address.*Institution name is required/, { account: 0 }, async (p) => { await p.nav(BASE + '/register'); await p.eval(`__h.set('f-address', '0x12')`); await p.eval(`__h.btn('Propose registration')`); await sleep(500); return T(p); });
  await testCase('Register', 'duplicate proposal for an active institution is refused', /was registered before/, { account: 0 }, async (p) => { await p.nav(BASE + '/register'); await p.eval(`__h.set('f-address', ${JSON.stringify(A)}); __h.set('f-name', 'Dup'); __h.set('f-domain', 'dup.edu')`); await p.eval(`__h.btn('Propose registration')`); await t(p, /was registered before/, 12000); return T(p); });

  // ================= FORGERY DEMO =================
  await testCase('Forgery demo', 'unregistered wallet (#5): refused, REJECTED stamp', /Refused by the contract.*Rejected/i, { account: 5 }, async (p) => { await p.nav(BASE + '/demo'); await p.waitFor("!!document.querySelector('.chip')", 5000); await p.eval(`__h.btn('Try the forgery')`); await t(p, /Refused by the contract/, 12000); return `${await T(p)} ${await p.eval("document.querySelector('.cert-stamp.revoked')?.innerText ?? 'no-stamp'")}`; });
  await testCase('Forgery demo', 'registered wallet (#1): note shown, button disabled', /would succeed.*disabled=true/, { account: 1 }, async (p) => { await p.nav(BASE + '/demo'); await t(p, /would succeed/); return `${(await T(p)).match(/would succeed/)?.[0]} disabled=${await p.eval("[...document.querySelectorAll('button')].find((b) => /Try the forgery/.test(b.textContent)).disabled")}`; });
  await testCase('Forgery demo', 'wallet cancel wording', /You cancelled in the wallet/, { account: 5, reject: true }, async (p) => { await p.nav(BASE + '/demo'); await p.waitFor("!!document.querySelector('.chip')", 5000); await p.eval(`__h.btn('Try the forgery')`); await t(p, /cancelled in the wallet|Refused/, 12000); return T(p); });
  await testCase('Forgery demo', 'wrong network wording', /Wrong network/, { account: 5, chainId: 1 }, async (p) => { await p.nav(BASE + '/demo'); await p.waitFor("!!document.querySelector('.chip')", 5000); await p.eval(`__h.btn('Try the forgery')`); await t(p, /Wrong network|Refused/, 12000); return T(p); });
  await testCase('Forgery demo', 'node down wording (wallet cannot reach its node)', /Cannot reach the node/, { account: 5, rpc: 'http://127.0.0.1:9' }, async (p) => { await p.nav(BASE + '/demo'); await p.waitFor("!!document.querySelector('.chip')", 5000); await p.eval(`__h.btn('Try the forgery')`); await t(p, /Cannot reach the node|Refused/, 12000); return T(p); });
  await testCase('Forgery demo', 'simulated side accepts the forged hash', /Accepted. Verifier says valid/, { account: null }, async (p) => { await p.nav(BASE + '/demo'); await p.eval(`__h.btn('Anchor the forged hash')`); await t(p, /Accepted. Verifier says valid/); return T(p); });

  // ================= DEREGISTRATION (changes chain state: keep last) =================
  await testCase('Register', 'propose + approve deregistration with a cutoff: executed', /Approved and executed: the institution is now deregistered/, { account: 3 }, async (p) => {
    await (await reg.connect(signers[0]).proposeDeregister(B, cutoff)).wait();
    await p.nav(BASE + '/register'); await t(p, /Waiting/); await p.eval("[...document.querySelectorAll('tbody button')].find((b) => b.textContent.trim() === 'Approve').click()"); await t(p, /Approved and executed/, 15000); return T(p);
  });
  await testCase('Verify', 'deregistered issuer, credential issued BEFORE the cutoff: still VALID', /Valid/, { account: null }, async (p) => { await p.nav(BASE + '/verify'); await up(p, early); await t(p, /Valid|Issuer deregistered/); return T(p); });
  await testCase('Verify', 'deregistered issuer, credential issued AFTER the cutoff: ISSUER DEREGISTERED', /Issuer deregistered/, { account: null }, async (p) => { await p.nav(BASE + '/verify'); await up(p, late); await t(p, /Valid|Issuer deregistered/); return T(p); });

  // ================= LEDGER =================
  await testCase('Ledger', 'three badges: Valid, Revoked, Issuer deregistered', /^(?=.*Valid)(?=.*Revoked)(?=.*Issuer deregistered)/, { account: null }, async (p) => { await p.nav(BASE + '/explorer'); await t(p, /End of entries|Valid/); await sleep(1200); return p.eval("[...new Set([...document.querySelectorAll('.badge')].map((b) => b.innerText))].join(' ')"); });
  await testCase('Ledger', 'filter by commitment narrows the list to one row', /^1$/, { account: null }, async (p) => { await p.nav(BASE + '/explorer'); await sleep(1500); await p.eval(`__h.set('filter', ${JSON.stringify(fValid.commitment.slice(0, 14))})`); await sleep(300); return p.eval("String(document.querySelectorAll('tbody tr').length)"); });
  await testCase('Ledger', 'row click opens Verify with that commitment', /\/verify\?c=0x.*Valid|\/verify\?c=0x.*Revoked|\/verify\?c=0x.*Issuer/, { account: null }, async (p) => { await p.nav(BASE + '/explorer'); await sleep(1500); await p.eval("document.querySelector('tbody tr.row-link td').click()"); await p.waitFor("location.pathname === '/verify'", 4000); await t(p, /Valid|Revoked|Issuer deregistered/); return `${await p.eval('location.pathname + location.search')} ${await T(p)}`; });
  await testCase('Ledger', 'no match: designed empty state', /No credentials yet/, { account: null }, async (p) => { await p.nav(BASE + '/explorer'); await sleep(1500); await p.eval(`__h.set('filter', 'zzzzzz')`); await sleep(300); return T(p); });
  await testCase('Ledger', 'Batches tab lists batches with roots', /Merkle root/, { account: null }, async (p) => { await p.nav(BASE + '/explorer'); await sleep(1500); await p.eval("[...document.querySelectorAll('[role=tab]')].find((b) => b.textContent.trim() === 'Batches').click()"); await sleep(300); return T(p); });

  // ================= NAVBAR =================
  await testCase('Navbar', 'wrong-network chip appears', /expected 31337/, { account: 0, chainId: 1 }, async (p) => { await p.nav(BASE + '/'); await p.waitFor("!!document.querySelector('.chip.warn')", 6000); return p.eval("document.querySelector('.chip.warn')?.innerText ?? 'none'"); });
  await testCase('Navbar', 'keyboard dropdowns: open, move, Esc returns focus, outside click closes', /^Institution:true Admin:true Explore:true outside:true$/, { account: null }, async (p) => {
    await p.nav(BASE + '/');
    return p.eval(`(async () => { const sl = (ms) => new Promise((r) => setTimeout(r, ms)); const out = [];
      for (const t of [...document.querySelectorAll('.dd-trigger')]) { t.focus(); __h.key(t, 'ArrowDown'); await sl(80); const links = [...t.closest('.dd').querySelectorAll('a')];
        let ok = t.getAttribute('aria-expanded') === 'true' && document.activeElement === links[0]; for (let i = 1; i < links.length; i++) { __h.key(document.activeElement, 'ArrowDown'); await sl(40); ok = ok && document.activeElement === links[i]; }
        __h.key(document.activeElement, 'Escape'); await sl(80); ok = ok && t.getAttribute('aria-expanded') === 'false' && document.activeElement === t; out.push(t.textContent.trim() + ':' + ok); }
      const t0 = document.querySelector('.dd-trigger'); t0.click(); await sl(80); document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await sl(80); out.push('outside:' + (t0.getAttribute('aria-expanded') === 'false')); return out.join(' '); })()`);
  });
  await testCase('Navbar', 'phone menu opens and lists every group', /Verify.*Institution.*Admin.*Explore/, { account: null }, async (p) => { await p.nav(BASE + '/'); await p.eval(`__h.btn('Menu')`); await sleep(300); return p.eval("document.querySelector('#site-nav').innerText.replace(/\\s+/g, ' ')"); }, view375);

  // ================= PHONE WIDTH: every route =================
  for (const route of ['/', '/verify', '/issue', '/batch', '/revoke', '/register', '/explorer', '/demo']) {
    await testCase('Phone 375px', `${route}: no horizontal scroll, no page errors`, /scroll=ok errors=0/, { account: 0 }, async (p) => { await p.nav(BASE + route); await sleep(1200); const w = await p.eval('document.documentElement.scrollWidth'); const errs = (await p.eval('__errors')).length; return `scroll=${w <= 375 ? 'ok' : 'OVERFLOW ' + w} errors=${errs}`; }, view375);
  }
}

main().then(async () => {
  fs.writeFileSync(path.join(root, 'docs', `ui-results${mode === 'main' ? '' : mode.replace('--', '-')}.json`), JSON.stringify(results, null, 2));
  console.log(`\n${pass} passed, ${fail} failed`);
  browser.kill();
  process.exit(fail ? 1 : 0);
}).catch((e) => { console.error('ui-check aborted:', e); browser?.kill(); process.exit(2); });
