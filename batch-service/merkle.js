// Uses Node.js built-in crypto — no external deps (Ponytail rule: stdlib first)
const crypto = require('crypto');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function buildMerkleTree(leaves) {
  // leaves: array of hex strings (credential hashes)
  // Returns: { root, tree, proofs }
  if (!leaves || leaves.length === 0) return { root: null, tree: [], proofs: {} };
  
  // Ensure even number of leaves by duplicating the last one if odd
  const paddedLeaves = [...leaves];
  if (paddedLeaves.length % 2 !== 0) {
    paddedLeaves.push(paddedLeaves[paddedLeaves.length - 1]);
  }
  
  const tree = [paddedLeaves];
  let currentLevel = paddedLeaves;
  
  while (currentLevel.length > 1) {
    const nextLevel = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const combined = currentLevel[i] + currentLevel[i + 1];
      nextLevel.push(sha256(combined));
    }
    tree.push(nextLevel);
    currentLevel = nextLevel;
  }
  
  const root = currentLevel[0];
  
  // Build proofs for each original leaf
  const proofs = {};
  for (let i = 0; i < leaves.length; i++) {
    proofs[leaves[i]] = getMerkleProof(tree, i);
  }
  
  return { root, tree, proofs };
}

function getMerkleProof(tree, leafIndex) {
  const proof = [];
  let index = leafIndex;
  
  for (let level = 0; level < tree.length - 1; level++) {
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    
    if (siblingIndex < tree[level].length) {
      proof.push({
        hash: tree[level][siblingIndex],
        position: isRight ? 'left' : 'right'
      });
    }
    
    index = Math.floor(index / 2);
  }
  
  return proof;
}

function verifyMerkleProof(leaf, proof, root) {
  let hash = leaf;
  
  for (const step of proof) {
    if (step.position === 'left') {
      hash = sha256(step.hash + hash);
    } else {
      hash = sha256(hash + step.hash);
    }
  }
  
  return hash === root;
}

module.exports = { sha256, buildMerkleTree, verifyMerkleProof };
