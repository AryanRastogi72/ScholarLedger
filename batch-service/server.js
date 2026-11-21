// server.js
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { buildMerkleTree } = require('./merkle');
const { newSalt, computeCommitment } = require('./credential');
const { analyzeBatch, executeBatch } = require('./occEngine');

const app = express();
const PORT = process.env.PORT ?? 3001;

// Middleware
app.use(cors());
app.use(express.json());

const abisPath = path.join(__dirname, '../frontend/src/abis');
const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
// Hardhat account #1 (local dev only)
const HARDHAT_ACCOUNT_1_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

// Re-read on each request so a deploy after server start is picked up
function loadDeployment() {
  const read = (f) => {
    const p = path.join(abisPath, f);
    if (!fs.existsSync(p)) throw new Error('Contracts not found: deploy contracts first (npx hardhat run scripts/deploy.js --network localhost)');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  };
  return {
    managerAbi: read('CredentialManager.json').abi,
    addresses: read('deployedAddresses.json')
  };
}

const trim = (v) => String(v ?? '').trim();
// Conflict key: same student + program is one logical credential (salts make commitments unique)
const conflictKey = (tx) => `${trim(tx.studentId)}|${trim(tx.programName)}`;

function validateRows(transactions) {
  if (!transactions || !Array.isArray(transactions)) return 'transactions must be an array';
  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    if (!t || !String(t.studentId ?? '').trim() || !String(t.programName ?? '').trim()) {
      return `Row ${i + 1}: studentId and programName are required`;
    }
  }
  return null;
}

// Each row gets its own salt and commitment
const withCommitment = (transactions) => transactions.map(tx => {
  const salt = newSalt();
  const fields = { studentId: trim(tx.studentId), programName: trim(tx.programName), metadata: trim(tx.metadata) };
  return { ...fields, salt, commitment: computeCommitment({ salt, ...fields }) };
});

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/batch/analyze', (req, res, next) => {
  try {
    const err = validateRows(req.body.transactions);
    if (err) return res.status(400).json({ error: err });
    const analysis = analyzeBatch(req.body.transactions, conflictKey);
    res.json({ success: true, ...analysis });
  } catch (error) {
    next(error);
  }
});

async function issueBatch(req, res, next) {
  try {
    const { transactions, managerAddress, mode = 'grouped' } = req.body;
    if (mode !== 'grouped' && mode !== 'sequential') return res.status(400).json({ error: 'mode must be "grouped" or "sequential"' });
    const err = validateRows(transactions);
    if (err) return res.status(400).json({ error: err });

    let deployment;
    try {
      deployment = loadDeployment();
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }

    const rows = withCommitment(transactions).map((r, idx) => ({ ...r, idx }));
    const analysis = analyzeBatch(rows, conflictKey);

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(process.env.ISSUER_PRIVATE_KEY ?? HARDHAT_ACCOUNT_1_KEY, provider);
    const manager = new ethers.Contract(managerAddress || deployment.addresses.CredentialManager, deployment.managerAbi, wallet);

    const { chainId } = await provider.getNetwork();
    // Local dev node only: mine one block per group so the group's parallelism is visible on chain.
    const blockPerGroup = mode === 'grouped' && chainId === 31337n;
    const GAS = 200_000; // issue costs about 61k; a low limit keeps a whole group inside one block

    // Fee data fetched once and passed explicitly, so each send is just sign + submit (no per-tx RPC lookups)
    const fees = await provider.getFeeData();
    const feeOpts = { type: 2, chainId, maxFeePerGas: (fees.maxFeePerGas ?? 2_000_000_000n) * 2n, maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 1_000_000_000n };

    // Service assigns nonces itself so sends never collide
    let nextNonce = await provider.getTransactionCount(wallet.address, 'pending');

    // Submissions go out in nonce order (queue below); confirmations are awaited in parallel.
    let sendQueue = Promise.resolve();
    const committedKeys = new Set(); // OCC validation: keys already committed in this request
    const blocks = {}; // row idx -> block number
    const groupState = {}; // blockPerGroup: per group { ready, remaining, expectedNonce }

    const prepareGroup = (g, size) => {
      if (!groupState[g]) {
        const st = { ready: provider.send('evm_setAutomine', [false]), remaining: size };
        st.mined = new Promise((resolve) => { st.resolveMined = resolve; });
        groupState[g] = st;
      }
      return groupState[g];
    };
    // One tx of the group has been submitted (or aborted). When all are in, mine the group's block(s).
    const settleSubmit = async (g) => {
      const st = groupState[g];
      if (--st.remaining > 0) return st.mined; // wait for the last submitter to mine the block
      await st.ready;
      try {
        for (let i = 0; i < 20; i++) {
          await provider.send('evm_mine', []);
          if (await provider.getTransactionCount(wallet.address, 'latest') >= nextNonce) break;
        }
      } finally {
        st.resolveMined();
      }
      return undefined;
    };
    // With automine off a revert only shows up in the receipt; replay the call one block earlier for the reason.
    const reasonOf = async (e, sent) => {
      if (e.code === 'TIMEOUT') return 'Timed out waiting for confirmation';
      const direct = /reason string '([^']+)'/.exec(e.message);
      if (direct) return direct[1];
      if (e.receipt) {
        try {
          await provider.call({ from: wallet.address, to: sent.to, data: sent.data, blockTag: e.receipt.blockNumber - 1 });
        } catch (r) {
          const m = /reason string '([^']+)'/.exec(r.message) ?? /reverted with reason string '([^']+)'/.exec(String(r.info?.error?.message));
          if (m) return m[1];
        }
      }
      return e.reason ?? e.shortMessage ?? e.message;
    };

    const executorFn = async (tx, mark, ctx) => {
      const g = ctx.group;
      if (blockPerGroup) prepareGroup(g, ctx.size);
      let sent;
      let submitted = false;
      try {
        if (committedKeys.has(conflictKey(tx))) throw new Error('Duplicate of an earlier row in this batch');
        const nonce = nextNonce++; // taken synchronously, before any await
        const send = async () => {
          if (blockPerGroup) await groupState[g].ready;
          return manager.issueCredential(tx.commitment, { nonce, gasLimit: GAS, ...feeOpts });
        };
        // Automine off: the node queues future nonces, so a group's sends can all be in flight at once.
        // Automine on: the node rejects out-of-order nonces, so sends go out in nonce order.
        const sending = blockPerGroup ? send() : sendQueue.then(send);
        if (!blockPerGroup) sendQueue = sending.catch(() => {});
        sent = await sending;
        mark();
        submitted = true;
        if (blockPerGroup) await settleSubmit(g);
        const receipt = await sent.wait(1, 30_000); // throws on revert; the timeout stops a nonce gap from hanging the request
        blocks[tx.idx] = receipt.blockNumber;
        committedKeys.add(conflictKey(tx));
        return receipt.hash;
      } catch (e) {
        if (blockPerGroup && !submitted) await settleSubmit(g);
        throw new Error(await reasonOf(e, sent ?? {}));
      }
    };

    // sequential: one row at a time, wait for each receipt, automine on (the classic baseline)
    const groups = mode === 'sequential' ? rows.map((r) => [r]) : analysis.groups;
    let execResults;
    try {
      execResults = await executeBatch(groups, executorFn);
    } finally {
      if (blockPerGroup && Object.keys(groupState).length) await provider.send('evm_setAutomine', [true]);
    }

    const flat = execResults.results.flat();
    const ok = flat.filter(r => r.success);
    const succeeded = ok.length;
    const failed = flat.length - succeeded;

    let root = null;
    let batchId = null;
    let credentials = [];
    if (succeeded > 0) {
      const tree = buildMerkleTree(ok.map(r => r.tx.commitment.slice(2)));
      root = '0x' + tree.root;
      const rootTx = await manager.storeMerkleRoot(root, succeeded, { nonce: nextNonce++, gasLimit: 200_000 });
      const rootReceipt = await rootTx.wait();
      for (const log of rootReceipt.logs) {
        const ev = manager.interface.parseLog(log);
        if (ev?.name === 'BatchProcessed') batchId = Number(ev.args.batchId);
      }
      const contract = await manager.getAddress();
      credentials = ok.map((r, i) => ({
        format: 'scholarledger-credential/1',
        commitment: r.tx.commitment,
        salt: r.tx.salt,
        studentId: r.tx.studentId,
        programName: r.tx.programName,
        metadata: r.tx.metadata,
        issuer: wallet.address,
        chainId: Number(chainId),
        contract,
        issuedTx: r.result,
        batch: { batchId, merkleRoot: root, leafIndex: i, proof: tree.proofs[i] }
      }));
    }

    // Do not return salts in the per-row results; they travel only inside `credentials`
    const results = execResults.results.map(g => g.map(({ tx, ...rest }) => ({ ...rest, blockNumber: blocks[tx.idx] ?? null, tx: { idx: tx.idx, studentId: tx.studentId, programName: tx.programName, commitment: tx.commitment } })));

    return res.json({
      success: true,
      results,
      merkleRoot: root,
      conflicts: analysis.conflicts.map(({ txA, txB, key }) => ({ txA, txB, key })),
      batchId,
      credentials,
      metrics: {
        totalTxs: analysis.metrics.total_txs,
        parallelBatches: analysis.metrics.parallel_batches,
        conflictsDetected: analysis.metrics.conflicts_detected,
        succeeded,
        failed,
        mode,
        blockPerGroup,
        blocksUsed: new Set(Object.values(blocks)).size,
        totalTimeMs: execResults.metrics.totalTimeMs,
        throughputTxPerSec: execResults.metrics.throughputTxPerSec
      }
    });
  } catch (error) {
    next(error);
  }
}

// shortcut: one batch at a time per service (nonces come from one issuer key); fine for one issuer
let lock = Promise.resolve();
app.post('/api/batch/issue', (req, res, next) => {
  lock = lock.then(() => issueBatch(req, res, next)); // issueBatch reports its own errors via next
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`OCC Batch Engine Server running on port ${PORT}`);
});
