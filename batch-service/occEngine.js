// occEngine.js
// Core Optimistic Concurrency Control (OCC) Engine inspired by Block-STM.
// Groups transactions to execute non-conflicting ones in parallel.

/**
 * Analyzes a batch of transactions to compute conflicts and group non-conflicting ones.
 * Two transactions conflict if keyFn gives them the same key (a duplicate issuance attempt).
 *
 * @param {Array} transactions Array of transaction objects
 * @param {Function} keyFn Maps a tx to its conflict key
 * @returns {Object} { groups, conflicts, metrics }
 */
function analyzeBatch(transactions, keyFn) {
  if (!transactions || !Array.isArray(transactions)) {
    throw new Error('Invalid transactions array');
  }
  if (typeof keyFn !== 'function') {
    throw new Error('keyFn must be a function');
  }

  const numTxs = transactions.length;
  if (numTxs === 0) {
    return {
      groups: [],
      conflicts: [],
      metrics: { total_txs: 0, parallel_batches: 0, conflicts_detected: 0 }
    };
  }

  const txNodes = transactions.map((tx, index) => ({
    tx,
    index,
    hash: keyFn(tx),
    conflictsWith: new Set()
  }));

  // 3. Build Conflict Graph
  let conflictsDetected = 0;
  const conflicts = [];

  const hashToTxIndices = new Map();
  for (let i = 0; i < numTxs; i++) {
    const node = txNodes[i];
    if (!node.hash) {
      throw new Error(`Transaction at index ${i} is missing conflict key`);
    }

    if (hashToTxIndices.has(node.hash)) {
      const existingIndices = hashToTxIndices.get(node.hash);
      for (const existingIndex of existingIndices) {
        txNodes[i].conflictsWith.add(existingIndex);
        txNodes[existingIndex].conflictsWith.add(i);
        conflicts.push({ txA: existingIndex, txB: i, reason: 'Same student and program', key: node.hash });
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

  // 5. Execute each parallel batch concurrently
  // Groups are executed sequentially, but txs within a group execute in parallel
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    const groupResults = await Promise.all(
      group.map(async (tx) => {
        // Offsets in ms from batch start. The executor calls mark() once the tx is submitted;
        // without a mark (early abort) submittedAt equals confirmedAt.
        let submittedAt = null;
        const mark = () => { submittedAt = Date.now() - startTime; };
        try {
          const res = await executorFn(tx, mark, { group: g, size: group.length });
          const confirmedAt = Date.now() - startTime;
          return { success: true, tx, result: res, group: g, submittedAt: Math.min(submittedAt ?? confirmedAt, confirmedAt), confirmedAt };
        } catch (error) {
          const confirmedAt = Date.now() - startTime;
          return { success: false, tx, error: error.message, group: g, submittedAt: Math.min(submittedAt ?? confirmedAt, confirmedAt), confirmedAt };
        }
      })
    );
    results.push(groupResults);
  }

  // The caller computes throughput: only rows that were actually submitted count.
  return { results, metrics: { totalTimeMs: Date.now() - startTime } };
}

module.exports = { analyzeBatch, executeBatch };
