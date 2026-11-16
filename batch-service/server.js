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
const PORT = 3001;

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
    const analysis = analyzeBatch(withCommitment(req.body.transactions), conflictKey);
    res.json({ success: true, ...analysis });
  } catch (error) {
    next(error);
  }
});

app.post('/api/batch/issue', async (req, res, next) => {
  try {
    const { transactions, managerAddress } = req.body;
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

    // Service assigns nonces itself so parallel sends never collide
    let nextNonce = await provider.getTransactionCount(wallet.address, 'pending');

    // Dev nodes with automine reject out-of-order nonces, so submissions go out in nonce
    // order (queue below) while confirmations are awaited in parallel.
    let sendQueue = Promise.resolve();
    const committedKeys = new Set(); // OCC validation: keys already committed in this request
    const executorFn = async (tx, mark) => {
      if (committedKeys.has(conflictKey(tx))) throw new Error('Duplicate of an earlier row in this batch');
      const nonce = nextNonce++; // taken synchronously, before any await
      const sending = sendQueue.then(() => manager.issueCredential(tx.commitment, { nonce, gasLimit: 500_000 }));
      sendQueue = sending.catch(() => {});
      try {
        const sent = await sending;
        mark();
        const receipt = await sent.wait(); // throws on revert
        committedKeys.add(conflictKey(tx));
        return receipt.hash;
      } catch (e) {
        const m = /reason string '([^']+)'/.exec(e.message);
        throw new Error(m ? m[1] : e.reason ?? e.shortMessage ?? e.message);
      }
    };

    const execResults = await executeBatch(analysis.groups, executorFn);

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
      const { chainId } = await provider.getNetwork();
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
    const results = execResults.results.map(g => g.map(({ tx, ...rest }) => ({ ...rest, tx: { idx: tx.idx, studentId: tx.studentId, programName: tx.programName, commitment: tx.commitment } })));

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
        totalTimeMs: execResults.metrics.totalTimeMs,
        throughputTxPerSec: execResults.metrics.throughputTxPerSec
      }
    });
  } catch (error) {
    next(error);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`OCC Batch Engine Server running on port ${PORT}`);
});
