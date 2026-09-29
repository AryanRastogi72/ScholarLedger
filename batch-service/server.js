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

// Gracefully load ABIs
const abisPath = path.join(__dirname, '../frontend/src/abis');
let registryAbi = null;
let managerAbi = null;

function loadAbis() {
  try {
    const registryPath = path.join(abisPath, 'Registry.json');
    const managerPath = path.join(abisPath, 'Manager.json');
    
    if (fs.existsSync(registryPath)) {
      const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      registryAbi = parsed.abi || parsed;
    }
    if (fs.existsSync(managerPath)) {
      const parsed = JSON.parse(fs.readFileSync(managerPath, 'utf8'));
      managerAbi = parsed.abi || parsed;
    }
  } catch (e) {
    console.warn("Could not load ABIs. They may not be deployed yet.", e.message);
  }
}

// Load once at startup
loadAbis();

function computeHash(tx) {
  // SHA-256(studentId + programName + metadata + timestamp)
  const data = `${tx.studentId || ''}${tx.programName || ''}${tx.metadata || ''}${tx.timestamp || ''}`;
  return sha256(data);
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/batch/analyze', (req, res, next) => {
  try {
    const { transactions } = req.body;
    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: 'transactions must be an array' });
    }

    const txsWithHash = transactions.map(tx => ({
      ...tx,
      credentialHash: computeHash(tx)
    }));

    const analysis = analyzeBatch(txsWithHash);
    res.json({ success: true, analysis });
  } catch (error) {
    next(error);
  }
});

app.post('/api/batch/issue', async (req, res, next) => {
  try {
    const { transactions, issuerPrivateKey, registryAddress, managerAddress } = req.body;
    
    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({ error: 'transactions must be an array' });
    }
    if (!issuerPrivateKey || !registryAddress) {
      return res.status(400).json({ error: 'issuerPrivateKey and registryAddress are required' });
    }

    // Try to load ABIs again just in case they were deployed after server started
    if (!registryAbi) {
      loadAbis();
    }
    
    if (!registryAbi) {
      return res.status(500).json({ error: 'Contract ABIs not found in ../frontend/src/abis/. Please deploy smart contracts first.' });
    }

    // 1. Compute credentialHash for each transaction
    const txsWithHash = transactions.map(tx => ({
      ...tx,
      credentialHash: computeHash(tx)
    }));

    // 2. Run OCC analysis to group non-conflicting transactions
    const analysis = analyzeBatch(txsWithHash);
    
    // 3. Executor function
    const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
    const wallet = new ethers.Wallet(issuerPrivateKey, provider);
    const registryContract = new ethers.Contract(registryAddress, registryAbi, wallet);

    const executorFn = async (tx) => {
      // Execute transaction logic. Assumes `issueCredential` exists in the ABI.
      // If the actual method name differs, this will throw, which is caught by executeBatch.
      if (typeof registryContract.issueCredential !== 'function') {
        throw new Error('issueCredential method not found on contract');
      }
      
      // We assume issueCredential takes the credential hash
      const contractTx = await registryContract.issueCredential("0x" + tx.credentialHash);
      const receipt = await contractTx.wait();
      return receipt.hash;
    };

    // Execute grouped batches concurrently
    const execResults = await executeBatch(analysis.groups, executorFn);

    // 4. Compute Merkle root of all credential hashes
    const hashes = txsWithHash.map(tx => tx.credentialHash);
    const tree = buildMerkleTree(hashes);
    const root = tree.root;

    // 5. Store Merkle root on-chain via storeMerkleRoot()
    if (root) {
      if (typeof registryContract.storeMerkleRoot === 'function') {
        const rootStr = "0x" + root;
        const rootTx = await registryContract.storeMerkleRoot(rootStr);
        await rootTx.wait();
      } else {
        console.warn("storeMerkleRoot method not found on contract");
      }
    }

    // 6. Return response
    return res.json({
      success: true,
      results: execResults.results,
      merkleRoot: root,
      metrics: {
        totalTxs: analysis.metrics.total_txs,
        parallelBatches: analysis.metrics.parallel_batches,
        conflictsDetected: analysis.metrics.conflicts_detected,
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
