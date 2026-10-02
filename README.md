# 🎓 ScholarLedger

**Forgery-Resistant Blockchain Credentialing with Concurrent Batch Transaction Execution**
*CSD436 Blockchain Technology — Course Project*

---

## 📖 Overview

Existing blockchain-based credential systems anchor a document hash on-chain but fail to bind the **issuer's identity** to their cryptographic key. This creates an *identity-spoofing vulnerability* (Zonneveld et al., 2026): anyone with an Ethereum address can upload a fake degree hash, and a verifier has no way to distinguish it from a legitimate one.

**ScholarLedger** closes this gap with two core innovations:

1. **Identity-Bound Issuance** — An on-chain `InstitutionRegistry` whitelists verified university addresses. The `CredentialManager` contract enforces that **only registered institutions** can issue credentials.
2. **Optimistic Concurrency Control (OCC) Batch Engine** — An off-chain Node.js service inspired by Block-STM (Gelashvili et al., PPoPP 2023) that detects read/write conflicts among credential transactions and parallelizes non-conflicting ones, dramatically improving throughput during peak issuance periods (e.g., graduation season).

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🔐 **Identity-Bound Issuance** | Only admin-whitelisted institution EOAs can issue credentials on-chain |
| ⛓️ **SHA-256 Credential Hashing** | Student metadata is hashed before anchoring — no PII on the public chain |
| ⚡ **OCC Batch Processing** | Conflict-graph analysis + parallel submission of non-conflicting transactions |
| 🌳 **Merkle Tree Anchoring** | Each batch computes a SHA-256 Merkle root stored on-chain for integrity auditing |
| 🛡️ **Forgery Demo** | Interactive side-by-side comparison of a vulnerable system vs. ScholarLedger |
| 🔍 **Instant Verification** | Gas-free `view` call — anyone with the hash can verify a credential |
| ❌ **On-Chain Revocation** | Only the original issuer can revoke, with immutable audit trail |

---

## 🏗️ Architecture

```
┌──────────────────┐     ┌───────────────────┐     ┌──────────────────┐
│   React Frontend │◄───►│  OCC Batch Service │◄───►│  Hardhat / EVM   │
│   (Vite, port    │     │  (Express, port    │     │  (Local node,    │
│    3000)          │     │   3001)            │     │   port 8545)     │
└──────────────────┘     └───────────────────┘     └──────────────────┘
        │                         │                         │
   ethers.js v6              ethers.js v6            Solidity ^0.8.20
   MetaMask wallet           OCC Engine              InstitutionRegistry
   SHA-256 (WebCrypto)       Merkle Tree (crypto)    CredentialManager
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity `^0.8.20` |
| Local Blockchain | Hardhat (Ethereum dev node) |
| Batch Engine | Node.js, Express, native `crypto` module |
| Frontend | React 18 + Vite (Plain CSS, no frameworks) |
| Web3 Integration | ethers.js v6, MetaMask |
| Hashing | SHA-256 (browser `WebCrypto` API + Node.js `crypto`) |

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v18+
- **MetaMask** browser extension

### Terminal 1 — Start Local Blockchain
```bash
cd ScholarLedger
npm install
npx hardhat node
```

### Terminal 2 — Deploy Contracts
```bash
cd ScholarLedger
npx hardhat run scripts/deploy.js --network localhost
```

### Terminal 3 — Start Batch Service
```bash
cd ScholarLedger/batch-service
npm install
node server.js
```

### Terminal 4 — Start Frontend
```bash
cd ScholarLedger/frontend
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

### MetaMask Setup
1. Add a custom network:
   - **RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `31337`
   - **Currency:** `ETH`
2. Import Hardhat Account #0 (the admin/deployer):
   - Private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

---

## 📂 Project Structure

```
ScholarLedger/
├── contracts/
│   ├── InstitutionRegistry.sol   # Identity registry (admin-only registration)
│   └── CredentialManager.sol     # Credential issuance, verification, revocation
├── scripts/
│   └── deploy.js                 # Deploys contracts + exports ABIs to frontend
├── test/
│   └── TrustAnchor.test.js       # 13 unit tests (forgery prevention, access control)
├── batch-service/
│   ├── server.js                 # Express API (POST /api/batch/issue, /analyze)
│   ├── occEngine.js              # OCC conflict detection + parallel grouping
│   └── merkle.js                 # SHA-256 Merkle tree (Node.js crypto)
├── frontend/
│   ├── src/
│   │   ├── pages/                # Dashboard, Register, Issue, BatchIssue, Verify,
│   │   │                         # Revoke, Explorer, ForgeryDemo
│   │   ├── components/           # Navbar, MetaMaskConnect, StatusBadge
│   │   └── utils/                # Contract helpers, SHA-256 hashing
│   └── index.html
├── hardhat.config.js
└── README.md
```

---

## 🔬 How the OCC Engine Works

1. **Input:** An array of credential transactions (studentId, programName, metadata).
2. **Hash:** Each transaction's credential hash is computed with SHA-256.
3. **Conflict Detection:** The engine builds read/write sets. Two transactions *conflict* if they share the same credential hash (duplicate issuance) or target the same credential for revocation.
4. **Graph Coloring:** Non-conflicting transactions are grouped together using a conflict graph. Each color group can execute in parallel.
5. **Parallel Submission:** Each group is submitted concurrently via `Promise.all` through ethers.js.
6. **Merkle Root:** After all groups complete, a Merkle tree is built from all credential hashes and the root is stored on-chain via `storeMerkleRoot()`.

---

## 📚 References

1. G. Zonneveld, G. Rafaiani, M. Baldi, *"A Forgery Attack on the Block.co Blockchain-Based Digital Credential Certification System,"* arXiv:2606.31462, 2026.
2. R. Q. Saramago, H. Meling, L. N. Jehl, *"A Privacy-Preserving and Transparent Certification System for Digital Credentials,"* OPODIS 2022.
3. A. Gelashvili et al., *"Block-STM: Scaling Blockchain Execution by Turning Ordering Curse to a Performance Blessing,"* PPoPP 2023.

---

*Developed by **Aryan Rastogi** (2310110439) & **Raghav Garg** (2310110697) for CSD436 Blockchain Technology.*
