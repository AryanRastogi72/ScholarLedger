# 🎓 ScholarLedger

**Forgery-Resistant Blockchain Credentialing with Concurrent Batch Transaction Execution**
*CSD436 Blockchain Technology — Course Project*

---

## 📖 Overview

Existing blockchain-based credential systems anchor a document hash on-chain but fail to bind the **issuer's identity** to their cryptographic key. This creates an *identity-spoofing vulnerability* (Zonneveld et al., 2026): anyone with an Ethereum address can upload a fake degree hash, and a verifier has no way to distinguish it from a legitimate one.

**ScholarLedger** closes this gap with two core innovations:

1. **Identity-Bound Issuance** — An on-chain `InstitutionRegistry` whitelists verified university addresses. The `CredentialManager` contract enforces that **only registered institutions** can issue credentials.
2. **Optimistic Concurrency Control (OCC) Batch Engine** — An off-chain Node.js service inspired by optimistic concurrency control (Block-STM, R. Gelashvili et al., PPoPP 2023): group, validate, then commit or abort. It detects conflicts among credential rows and submits non-conflicting ones back to back without waiting for each other. It does not parallelise the EVM.

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🔐 **Identity-Bound Issuance** | Only institution addresses approved by 2 of 3 admins can issue credentials on-chain |
| ⛓️ **Salted Commitments** | Only a salted SHA-256 commitment is anchored; student details stay in a credential file held by the student |
| ⚡ **OCC Batch Processing** | Conflict-graph analysis + back-to-back submission of non-conflicting transactions |
| 🌳 **Merkle Tree Anchoring** | Each batch computes a SHA-256 Merkle root stored on-chain for integrity auditing |
| 🛡️ **Forgery Demo** | Interactive side-by-side comparison of a vulnerable system vs. ScholarLedger |
| 🔍 **Instant Verification** | Gas-free `view` call, no wallet needed. Upload the credential file (or paste the commitment) on `/verify` |
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
   ethers.js v6              ethers.js v6            Solidity 0.8.20   
   MetaMask wallet           OCC Engine              InstitutionRegistry
   SHA-256 (WebCrypto)       Merkle Tree (crypto)    CredentialManager
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity `0.8.20` |
| Local Blockchain | Hardhat (Ethereum dev node) |
| Batch Engine | Node.js, Express, native `crypto` module |
| Frontend | React 18 + Vite (Plain CSS, no frameworks) |
| Web3 Integration | ethers.js v6, MetaMask |
| Hashing | SHA-256 (browser `WebCrypto` API + Node.js `crypto`) |

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** v20.12+
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
On the local chain (31337) the deploy script sets the admins to Hardhat accounts #0, #3 and #4 with a threshold of 2, then registers Hardhat Account #1 as **Demo University** (#0 proposes, #3 approves), so issuing works right away. On any other chain set `ADMIN_ADDRESSES` (comma-separated) and `ADMIN_THRESHOLD`; the script stops if they are missing.

### Terminal 3 — Start Batch Service
```bash
cd ScholarLedger/batch-service
npm install
npm test      # engine and Merkle tests
node server.js
```
The service signs with `ISSUER_PRIVATE_KEY` (the Hardhat Account #1 fallback is used only on the local Hardhat chain, 31337) and reads the chain at `RPC_URL` (default `http://127.0.0.1:8545`). The key never travels over HTTP. The service listens on `127.0.0.1` only (`HOST` to change it), accepts browser requests only from `ALLOWED_ORIGINS` (default `http://localhost:3000`), and requires `Authorization: Bearer <token>` on every `/api/batch/*` request (`/api/health` stays open). The deploy script creates a fresh random token on every deploy and writes it to `batch-service/.env` (`BATCH_API_TOKEN`) and `frontend/.env.local` (`VITE_BATCH_API_TOKEN`); both files are git-ignored. The service refuses to start without a token ("BATCH_API_TOKEN missing: run the deploy script first") and rejects requests whose `Host` header is not `localhost:<port>` or `127.0.0.1:<port>`. If the node is down, `/api/batch/issue` answers 503. Start order: node, deploy, batch service, frontend. Restart the batch service and the frontend after a redeploy so they pick up the new token. A request takes at most 1000 rows; credential files are also saved to `batch-service/out/` before the Merkle root is anchored.

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
2. Import Hardhat Account #0 (the first admin, used on `/register`):
   - Private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`
   Also import Hardhat Account #3 (the second admin, to approve proposals):
   - Private key: `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6`
3. Import Hardhat Account #1 (the Demo University issuer, used on `/issue` and `/revoke`):
   - Private key: `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d`

These are the public Hardhat development keys. Never use them on a real network.

**Demo: registering a second university.** On `/register` as #0, propose registering another address (for example Hardhat #2) with a name and domain. The proposal shows 1 / 2. Switch MetaMask to #3 and press Approve: the second approval executes it and the address becomes a registered institution.

`/verify`, `/explorer` and `/` read from the node directly and need no wallet.

### Privacy note
The chain stores only a salted commitment, the issuer, a timestamp and a revoked flag. The student's details live in a JSON credential file given to the student. The contract cannot detect re-issuance of the same student and program without seeing student data, so issuers dedupe off-chain (the batch service does this within one batch).

---

## 📂 Project Structure

```
ScholarLedger/
├── contracts/
│   ├── InstitutionRegistry.sol   # Identity registry (2-of-3 admin approval)
│   └── CredentialManager.sol     # Credential issuance, verification, revocation
├── scripts/
│   └── deploy.js                 # Deploys contracts + exports ABIs to frontend
├── test/
│   └── ScholarLedger.test.js       # 31 unit tests (forgery prevention, access control, deregistration, commitments, batches)
├── batch-service/
│   ├── server.js                 # Express API (POST /api/batch/issue, /analyze)
│   ├── occEngine.js              # OCC conflict detection + parallel grouping
│   ├── credential.js             # Salted commitment helpers
│   ├── merkle.js                 # SHA-256 Merkle tree (Node.js crypto)
│   └── test/engine.test.js       # node:test suite (npm test)
├── frontend/
│   ├── src/
│   │   ├── pages/                # Home, Register, Issue, BatchIssue, Verify,
│   │   │                         # Revoke, Explorer, ForgeryDemo
│   │   ├── components/           # Navbar, HashText, TxStatus, StatusPanel, FileDrop, PageHeader,
│   │   │                         # BatchTimeline, CertificateCard, Diagrams
│   │   ├── styles/tokens.css     # Design tokens
│   │   └── utils/                # Contract helpers, credential/commitment helpers, errors
│   └── index.html
├── hardhat.config.js
└── README.md
```

---

## 🔬 How the OCC Engine Works

1. **Input:** An array of credential rows (studentId, programName, metadata).
2. **Commit:** Each row gets its own random salt and a SHA-256 commitment of `salt|studentId|programName|metadata`.
3. **Conflict Detection:** Because salts make every commitment unique, rows conflict when they share the same `studentId|programName` key.
4. **Graph Coloring:** Non-conflicting rows are grouped greedily. Rows in a group do not conflict, so they are submitted together.
5. **Validate and send:** Groups run in order. Rows in a group do not wait for each other: they are submitted back to back with service-assigned nonces and confirmed together (on the local Hardhat chain the service mines one block per group, so a whole group lands in one block). A row whose key was already committed in this request aborts without being sent ("Duplicate of an earlier row in this batch").
6. **Merkle Root:** A Merkle tree over the successful commitments is built and stored on-chain via `storeMerkleRoot()` (root, issuer, count, time). Each returned credential file carries its Merkle proof.

### Measured on this machine

`POST /api/batch/issue` takes `mode: "grouped"` (default) or `"sequential"`. On the local Hardhat node (chain 31337) a grouped run turns automine off, submits every row of a group, mines one block for the group, then turns automine back on before anchoring the Merkle root. Sequential sends one row at a time and waits for each receipt (the classic baseline). The `/batch` page has a "Compare with sequential" switch that runs both and draws the two timelines on one time axis.

One run of 50 conflict-free rows, sequential first, then grouped (different program text so no row is a duplicate), Hardhat 2.x local node, Windows laptop:

| Mode | Total time | Throughput | Blocks used |
|------|-----------:|-----------:|------------:|
| Sequential | 2505 ms | 20.0 tx/s | 50 |
| Grouped | 310 ms | 161.3 tx/s | 1 |

That is about 8.1 times faster. The numbers come from the `metrics` object the service returned for that run; they vary from run to run and by machine. The EVM still runs a block's transactions one after another; the speedup comes from submitting a group's rows without waiting for each other and confirming them in one block. On the local node a block per group makes this visible. On a real chain the network decides block packing itself, so expect the shape (rows of a group submitted together) but not these figures.

If the batch service is killed in the middle of a group, the node may be left with automine off. Restart `npx hardhat node`, or send `evm_setAutomine true` to it. Each row waits at most 30 seconds for its confirmation and then fails with "Timed out waiting for confirmation"; a timed-out run may leave pending transactions, so restart the node.

### Deregistration

Adding or removing an institution is a proposal that needs approval from 2 of the 3 admins (`proposeRegister` / `proposeDeregister`, then `approve`; the proposer counts as the first approval, and the change runs on the second). The admins and the threshold are fixed at deployment. A deregistration carries a "valid until" time. Credentials issued before that time stay valid, later ones stop verifying, and a deregistered key can no longer revoke. A deregistered address can never be registered again; an institution that lost its key registers a new address.

---

## Known limitations

- The batch service is local-only and holds the issuer key. Letting institutions sign their own batches is future work.
- The admin set is fixed at deployment (2 of 3 on the local chain); there is no admin rotation.
- The chain is an in-memory Hardhat node; nothing here is deployed to a public network.
- Duplicates across batches are not detected: the contract only sees salted commitments, so issuers dedupe off-chain.
- The Merkle tree duplicates the last node on odd levels and has no domain separation between leaves and inner nodes.
- A deregistered university's credentials can no longer be revoked by anyone.
- Proposals do not expire and cannot be cancelled.
- Two addresses may register the same name and domain.
- The batch service can leave a nonce gap if a send fails before reaching the node.
- The Ledger, Home and Register pages read every event from block 0.

---

## 📚 References

1. G. Zonneveld, G. Rafaiani, M. Baldi, *"A Forgery Attack on the Block.co Blockchain-Based Digital Credential Certification System,"* arXiv:2606.31462, 2026.
2. R. Q. Saramago, H. Meling, L. N. Jehl, *"A Privacy-Preserving and Transparent Certification System for Digital Credentials,"* OPODIS 2022 (proceedings published 2023).
3. R. Gelashvili et al., *"Block-STM: Scaling Blockchain Execution by Turning Ordering Curse to a Performance Blessing,"* PPoPP 2023.
4. G. Fernández-Blanco et al., *"A Blockchain Based System for Preventing Academic Forgery: Design and Practical Evaluation for CPU-Based and Low-Power Computers,"* IEEE BCCA 2024.
5. P. S. Anjana, S. Kumari, S. Peri, S. Rathor, A. Somani, *"An Efficient Framework for Optimistic Concurrent Execution of Smart Contracts,"* PDP 2019.

---

*Developed by **Aryan Rastogi** (2310110439) & **Raghav Garg** (2310110697) for CSD436 Blockchain Technology.*
