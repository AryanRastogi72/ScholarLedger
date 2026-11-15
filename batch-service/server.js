// server.js
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const { sha256, buildMerkleTree } = require('./merkle');
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

// Canonical hash: 0x + SHA-256 of "studentId|programName|metadata"
function computeHash(tx) {
  return '0x' + sha256(`${tx.studentId ?? ''}|${tx.programName ?? ''}|${tx.metadata ?? ''}`);
}

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

const withHash = (transactions) => transactions.map(tx => ({ ...tx, credentialHash: computeHash(tx) }));

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/batch/analyze', (req, res, next) => {
  try {
    const err = validateRows(req.body.transactions);
    if (err) return res.status(400).json({ error: err });
    const analysis = analyzeBatch(withHash(req.body.transactions));
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

    const txsWithHash = withHash(transactions);
    const analysis = analyzeBatch(txsWithHash);

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(process.env.ISSUER_PRIVATE_KEY ?? HARDHAT_ACCOUNT_1_KEY, provider);
    const manager = new ethers.Contract(managerAddress || deployment.addresses.CredentialManager, deployment.managerAbi, wallet);

    // Service assigns nonces itself so parallel sends never collide
    let nextNonce = await provider.getTransactionCount(wallet.address, 'pending');

    // Dev nodes with automine reject out-of-order nonces, so submissions go out in nonce
    // order (queue below) while confirmations are awaited in parallel.
    let sendQueue = Promise.resolve();
    const executorFn = async (tx) => {
      const nonce = nextNonce++; // taken synchronously, before any await
      const sending = sendQueue.then(() => manager.issueCredential(tx.credentialHash, tx.studentId, tx.programName, { nonce, gasLimit: 500_000 }));
      sendQueue = sending.catch(() => {});
      try {
        const sent = await sending;
        const receipt = await sent.wait(); // throws on revert
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
    if (succeeded > 0) {
      const tree = buildMerkleTree(ok.map(r => r.tx.credentialHash.slice(2)));
      root = '0x' + tree.root;
      const rootTx = await manager.storeMerkleRoot(root, succeeded, { nonce: nextNonce++, gasLimit: 200_000 });
      await rootTx.wait();
    }

    return res.json({
      success: true,
      results: execResults.results,
      merkleRoot: root,
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
