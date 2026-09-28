// occEngine.js
// Core Optimistic Concurrency Control (OCC) Engine inspired by Block-STM.
// Groups transactions to execute non-conflicting ones in parallel.

/**
 * Analyzes a batch of transactions to compute conflicts and group non-conflicting ones.
 * 
 * Two transactions conflict if they share the same credentialHash, which signifies a duplicate
 * issuance attempt or parallel operations on the same credential.
 * 
 * @param {Array} transactions Array of transaction objects containing 'credentialHash'
 * @returns {Object} { groups, conflicts, metrics }
 */
function analyzeBatch(transactions) {
  if (!transactions || !Array.isArray(transactions)) {
    throw new Error('Invalid transactions array');
  }

  const numTxs = transactions.length;
  if (numTxs === 0) {
    return {
      groups: [],
      conflicts: [],
      metrics: { total_txs: 0, parallel_batches: 0, conflicts_detected: 0, throughput: 0, time_ms: 0 }
    };
  }

  // 1. & 2. Compute Read-Sets and Write-Sets
  // Here, both read-set and write-set are just { credentialHash }
  const txNodes = transactions.map((tx, index) => ({
    tx,
    index,
    hash: tx.credentialHash,
    conflictsWith: new Set()
  }));

  // 3. Build Conflict Graph
  let conflictsDetected = 0;
  const conflicts = [];

  // O(N^2) comparison - suitable for small to medium batches
  // In a real high-throughput engine, a hash map would be used to build the graph faster.
  const hashToTxIndices = new Map();
  for (let i = 0; i < numTxs; i++) {
    const node = txNodes[i];
    if (!node.hash) {
      throw new Error(`Transaction at index ${i} is missing credentialHash`);
    }

    if (hashToTxIndices.has(node.hash)) {
      const existingIndices = hashToTxIndices.get(node.hash);
      for (const existingIndex of existingIndices) {
        txNodes[i].conflictsWith.add(existingIndex);
        txNodes[existingIndex].conflictsWith.add(i);
        conflicts.push({ txA: existingIndex, txB: i, reason: 'Duplicate credentialHash', credentialHash: node.hash });
        conflictsDetected++;
      }
      existingIndices.push(i);
    } else {
      hashToTxIndices.set(node.hash, [i]);
    }
  }

  // 4. Group non-conflicting transactions (Graph Coloring approximation)
  // Greedy approach: assign each tx to the first group where it has no conflicts.
  const groups = []; // Array of arrays of txs
  const groupIndices = []; // Array of sets of tx indices for quick conflict checking

  for (let i = 0; i < numTxs; i++) {
    const node = txNodes[i];
    let placed = false;

    for (let g = 0; g < groups.length; g++) {
      let hasConflictInGroup = false;
      for (const txIndexInGroup of groupIndices[g]) {
        if (node.conflictsWith.has(txIndexInGroup)) {
          hasConflictInGroup = true;
          break;
        }
      }

      if (!hasConflictInGroup) {
        groups[g].push(node.tx);
        groupIndices[g].add(i);
        placed = true;
        break;
      }
    }

    if (!placed) {
      groups.push([node.tx]);
      groupIndices.push(new Set([i]));
    }
  }

  return {
    groups,
    conflicts,
    metrics: {
      total_txs: numTxs,
      parallel_batches: groups.length,
      conflicts_detected: conflictsDetected
    }
  };
}

/**
 * Executes batches of grouped transactions.
 * 
 * @param {Array} groups Array of arrays of non-conflicting transactions
 * @param {Function} executorFn Async function to execute a single transaction
 * @returns {Promise<Object>} Execution results and timing metrics
 */
async function executeBatch(groups, executorFn) {
  if (!groups || !Array.isArray(groups)) {
    throw new Error('Invalid groups array');
  }
  if (typeof executorFn !== 'function') {
    throw new Error('executorFn must be a function');
  }

  const startTime = Date.now();
  const results = [];
  let totalTxsExecuted = 0;

  // 5. Execute each parallel batch concurrently
  // Groups are executed sequentially, but txs within a group execute in parallel
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    const groupResults = await Promise.all(
      group.map(async (tx) => {
        try {
          const res = await executorFn(tx);
          return { success: true, tx, result: res };
        } catch (error) {
          return { success: false, tx, error: error.message };
        }
      })
    );
    results.push(groupResults);
    totalTxsExecuted += group.length;
  }

  const endTime = Date.now();
  const totalTimeMs = endTime - startTime;
  
  // Throughput (tx/sec)
  const throughput = totalTimeMs > 0 ? (totalTxsExecuted / (totalTimeMs / 1000)) : totalTxsExecuted * 1000;

  // 6. Return combined results and metrics
  return {
    results,
    metrics: {
      totalTimeMs,
      throughputTxPerSec: throughput
    }
  };
}

module.exports = { analyzeBatch, executeBatch };
