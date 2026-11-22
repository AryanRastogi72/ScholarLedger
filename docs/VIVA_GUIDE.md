# ScholarLedger Viva Guide

Everything you need to explain, demo and defend the project. For unfamiliar terms see [GLOSSARY.md](GLOSSARY.md); for what each code file does see [CODE_GUIDE.md](CODE_GUIDE.md).

**Course:** CSD436 Blockchain Technology
**Team:** Aryan Rastogi (2310110439), Raghav Garg (2310110697)
**Project:** ScholarLedger: forgery-resistant blockchain credentialing with concurrent batch issuance

---

## 1. The project in 30 seconds

ScholarLedger lets universities issue academic credentials (degrees) whose existence and issuer anyone can check on a blockchain. It fixes three problems:

1. **Forgery:** existing "hash on a blockchain" systems prove a document wasn't changed, but not *who* put it there. ScholarLedger's smart contract only accepts credentials from wallets an admin has registered as institutions, so a forger's wallet is rejected by the chain itself.
2. **Privacy:** nothing that identifies a student goes on the public chain. The chain holds only a salted hash (a *commitment*); the student keeps a credential file with their details and shows it to whoever needs to verify.
3. **Scale:** on graduation day a university issues thousands of credentials. A batch service groups them by conflicts, sends each conflict-free group together, confirms each group in one block, and anchors one Merkle root per batch. On the local test chain this measured about 7-8x faster than issuing one at a time.

---

## 2. Problem statement and objective

**Problem.** Paper degrees and centralised university databases are easy to fake or alter, slow to verify, and depend on the university's systems staying up. Earlier blockchain systems such as Block.co store a document hash on chain, but Zonneveld et al. (2026) showed that any wallet can anchor the hash of a forged degree, and the verifier then says "valid". These systems give **integrity but not authentication**.

**Objective.** Build a working web application that:
- binds every credential to a registered institution's key (identity-bound issuance);
- keeps student data off the public chain (salted commitments, holder-kept file);
- lets anyone verify for free, without a wallet;
- supports revocation by the original issuer only;
- issues large batches efficiently using optimistic concurrency, with a Merkle root per batch;
- shows all of this visibly (a forgery demo, a batch timeline, a public ledger).

**Security requirements addressed:** integrity, authentication, authorization, non-repudiation, provenance, privacy/confidentiality.

---

## 3. Background and motivation

**Why this topic.** Degree fraud is common and costly. Verification today means emailing a registrar and waiting. A blockchain can give employers an instant, independent check. The Block.co attack paper showed that the obvious design is broken, which gave a clear security problem to fix, and the course's concurrency material (Anjana et al., Block-STM) gave a performance angle for mass graduation.

**The centralised version and its problems** (from the midsem report):

| Challenge in a centralised system | Blockchain property that helps | Why it matters here |
|---|---|---|
| Records can be altered or deleted by an admin or attacker | Replicated, append-only history (immutability) | A verifier can check a record the university alone does not control |
| Portal outages, university systems closing down | Shared state anyone can read (decentralisation, availability) | Verification works years later without the university's server |
| Unclear who issued a credential | Signed transactions + contract access rules (authentication) | Only registered addresses can issue |
| Student data concentrated in one database | Minimal disclosure via commitments (privacy) | Public state reveals nothing about the student |

**What blockchain cannot do** (say this if asked): it can't prove a student really earned the degree, or that a registered university is honest. Onboarding of institutions (the admin's job), key protection and a way to correct mistakes are still needed.

---

## 4. Research papers

Five papers shaped the project. The first four are the project's baseline references; the fifth is the course paper used for the midsem concurrency experiments.

### 4.1 Zonneveld, Rafaiani, Baldi (2026). "A Forgery Attack on the Block.co Blockchain-Based Digital Credential Certification System." arXiv:2606.31462
- **Problem:** Block.co anchors credential hashes on a blockchain but does not tie them to a verified issuer.
- **Finding:** an attacker can anchor the hash of a forged certificate from any wallet, and verification accepts it.
- **Key insight:** *document integrity and issuer identity are separate properties.* A hash on chain proves the first, not the second.
- **Influence:** the two-contract design. `InstitutionRegistry` whitelists institution addresses; `CredentialManager.issueCredential` does `require(registry.isRegistered(msg.sender), "Issuer not registered")`. The `/demo` page re-enacts the attack side by side.

### 4.2 Saramago, Meling, Jehl (OPODIS 2022). "A Privacy-Preserving and Transparent Certification System for Digital Credentials." LIPIcs 253
- **Problem:** credential checks should reveal only what is needed, but public chains expose everything.
- **Approach:** commitments in an incremental Merkle tree, zero-knowledge issuance proofs, credentials held off-chain by the holder.
- **Key insight:** put a *commitment* on chain, keep the data with the holder.
- **Influence:** ScholarLedger stores `SHA-256(salt | studentId | programName | metadata)` only, and the student keeps the credential file. (Zero-knowledge proofs were **not** implemented.)

### 4.3 Gelashvili et al. (PPoPP 2023). "Block-STM: Scaling Blockchain Execution by Turning Ordering Curse to a Performance Blessing."
- **Problem:** blocks are executed one transaction at a time on one core.
- **Approach:** execute a block's transactions speculatively in parallel with multi-version memory, validate their reads, re-execute any that read stale data, and keep the preset order so the result equals sequential execution.
- **Key insight:** a fixed order lets you detect and repair conflicts after optimistic parallel execution, without the proposer sending a dependency graph.
- **Influence:** the batch service's optimistic approach: group conflict-free rows, run each group concurrently, validate a later row before sending it (abort if an earlier row already issued the same student and program). The service is *inspired by* Block-STM; it is not an STM.

### 4.4 Fernández-Blanco, Froiz-Míguez, Fraga-Lamas, Fernández-Caramés (IEEE BCCA 2024). "A Blockchain Based System for Preventing Academic Forgery: Design and Practical Evaluation for CPU-Based and Low-Power Computers."
- **Problem:** credential systems are rarely measured on real hardware.
- **Approach:** a forgery-prevention system evaluated on standard and low-power devices (issuance/verification latency, resource use).
- **Key insight:** report concrete, reproducible performance numbers with the machine and parameters.
- **Influence:** the evaluation style: the Batch page's "Compare with sequential" and the README's measured table (machine, parameters, time, tx/s, blocks).

### 4.5 Anjana, Kumari, Peri, Rathor, Somani (PDP 2019). "An Efficient Framework for Optimistic Concurrent Execution of Smart Contracts."
- **Problem:** miners and validators execute smart contracts serially, leaving cores idle.
- **Approach:** miners run transactions concurrently with BTO/MVTO software transactional memory and record conflicts in a *block graph*; validators replay the block in parallel using that graph and reach the same state.
- **Results reported:** mean miner speedups of 3.6x/3.7x and validator speedups of 40.8x/47.1x.
- **Influence:** the midsem C++ benchmark (BTO-style miner + graph-following validator) and its experiments (vary transactions, threads, conflict %), which measured about 2.6x-4.3x speedups at 25% conflict. The ScholarLedger batch service applies the same conflict-graph idea to credential issuance.

---

## 5. How the system works

### 5.1 Architecture

```
 Browser (React + Vite, :3000)          Batch service (Node + Express, :3001)        Hardhat node (:8545, chain 31337)
 ───────────────────────────────        ─────────────────────────────────────        ──────────────────────────────────
 Home, Verify, Ledger   ── read ───────────────────────────────────────────────────▶  InstitutionRegistry.sol
 Register, Issue, Revoke ─ MetaMask-signed tx ─────────────────────────────────────▶  CredentialManager.sol
 Batch issue ── POST rows ──▶ hash + salt, conflict graph, groups,
                              send group, mine 1 block per group,
                              Merkle root ── signed txs ───────────────────────────▶
```

Three processes run locally: the blockchain node, the batch service and the frontend. The frontend reads the chain directly (no wallet needed for reading) and uses MetaMask to sign writes. The batch service holds the demo university's key on the server and signs batch transactions itself.

### 5.2 The two smart contracts

**InstitutionRegistry** (the identity layer)
- `registerInstitution(address, name, domain)`: admin only; rejects an already-active address and an empty name.
- `revokeInstitution(address)`: admin only; deregisters an institution.
- `isRegistered(address)`: view; used by the credential contract.

**CredentialManager** (the credential layer)
- `issueCredential(bytes32 commitment)`: requires a registered sender, a non-zero commitment and no existing record. Stores `{issuer, issuedAt, isRevoked}`.
- `verifyCredential(bytes32)`: view; returns `isValid` (exists, not revoked, issuer still registered), issuer, issue time, revoked flag.
- `revokeCredential(bytes32)`: only the original issuer; only once.
- `storeMerkleRoot(bytes32 root, uint256 count)`: registered sender, non-zero root, count between 1 and 2^32-1. Stores `{root, issuer, count, timestamp}` and returns a batch ID.

No student data appears in contract storage or in any event (there's a test for that).

### 5.3 The main flows

1. **Register a university (admin).** Admin wallet (Hardhat #0) → `/register` → `registerInstitution`. On the local chain, deploy already registers Hardhat #1 as "Demo University".
2. **Issue one credential (university).** `/issue` → the browser generates a 32-byte random salt and computes the commitment with WebCrypto → MetaMask signs `issueCredential(commitment)` → the page shows a certificate and offers the **credential file** (JSON with the salt and details) to give to the student.
3. **Issue a batch.** `/batch` → upload CSV or type rows → *Analyze* shows conflict groups → *Execute* sends rows to the batch service, which salts and hashes each row, builds the conflict graph, issues group by group, anchors a Merkle root, and returns per-row results, a timeline and all credential files (each with its Merkle proof).
4. **Verify (employer, no wallet).** `/verify` → upload the student's file. The browser recomputes the commitment from the file; if it doesn't match → **ALTERED FILE** (no chain call). Otherwise it calls `verifyCredential` → VALID / REVOKED / ISSUER DEREGISTERED / NOT FOUND, shows the issuer's registered name, the student details from the file, and checks the batch Merkle proof against the stored root. Pasting a bare commitment shows validity and issuer only.
5. **Revoke (issuing university).** `/revoke` → upload the file or paste the commitment → `revokeCredential`. Any other wallet gets "Only issuer can revoke".
6. **Forgery demo.** `/demo` → left: a simulated hash-only system accepts the forged hash ("Verifier says valid"); right: a real transaction from an unregistered wallet is reverted with "Issuer not registered" and a REJECTED stamp.

### 5.4 Privacy model

| On the chain (public) | Held by the student (private) |
|---|---|
| commitment (32-byte hash) | salt (32 random bytes) |
| issuer address | student ID, program, extra details |
| issue time, revoked flag | Merkle proof (for batch credentials) |
| batch root, issuer, count, time | |

Without the salt nobody can guess the details from the commitment, even by trying every student ID. **Accepted limitation:** because the contract never sees student data, it can't detect the same student and program being issued twice with different salts. The batch service prevents duplicates within one batch; across batches the issuer must dedupe.

### 5.5 Concurrency model (OCC batch engine)

1. **Conflict key** per row: `studentId|programName` (salts make every commitment unique, so the hash can't be the key).
2. **Conflict graph:** rows with the same key are joined by an edge.
3. **Greedy grouping (graph colouring):** each row goes into the first group with no conflicting row, so duplicates land in later groups.
4. **Execute groups in order; rows within a group concurrently.** The service assigns nonces itself, fetches gas fees once, turns Hardhat automine off, submits every row of the group without waiting, mines **one block** for the group, then waits for all receipts.
5. **Validate before commit (the OCC step):** before a later-group row is sent, the service checks whether its key was already issued in this request; if so it **aborts without sending** ("Duplicate of an earlier row in this batch").
6. **Anchor:** automine is turned back on, a Merkle tree is built over the successful commitments, and `storeMerkleRoot(root, count)` records the batch.

**Be precise in the viva:** the EVM still executes a block's transactions one after another. The speedup comes from *pipelining*: submitting a group's rows without waiting for each other's confirmation and confirming the whole group in one block, instead of one round trip and one block per row.

### 5.6 Measured results

| Run (50 conflict-free rows, local Hardhat node, laptop) | Total time | Throughput | Blocks |
|---|---:|---:|---:|
| Sequential (implementor run, README) | 2505 ms | 20.0 tx/s | 50 |
| Grouped (implementor run, README) | 310 ms | 161.3 tx/s | 1 |
| Sequential (independent re-run) | 2595 ms | 19.3 tx/s | 50 |
| Grouped (independent re-run) | 358 ms | 139.7 tx/s | 1 |

Speedup about **7-8x**. A 30-row batch with 3 duplicates put all 27 valid rows in one block and aborted the 3 duplicates. Numbers vary by run and machine; on a real chain the network decides block packing, so expect the shape, not these figures.

**Midsem C++ benchmark (for the report/slides):** BTO-style miner and graph-following validator; speedups of about 2.6x-4.3x at 25% conflict, best at 16 workers on a 6-core/12-thread i5-11400H; one worker was slower than serial (STM overhead).

---

## 6. Methodology and timeline

| When | Milestone |
|---|---|
| Sep 16-19, 2026 | Hardhat setup, both contracts, 13 unit tests, deploy script, React frontend (Dashboard, Register, Issue, Verify, Explorer, Revoke, Forgery demo) |
| Sep 2026 | OCC engine with conflict detection, Merkle tree, Express batch API and batch UI |
| Sep 25/28 | Midsem presentation (prototype) |
| Oct 9 | Midsem individual assignment: research analysis, function review, PoW block generation (hash prefix "39"), C++ concurrency experiments; identified the PII-on-chain gap and the broken batch route |
| Nov 15-16 | Repair and extension: batch issuance fixed end to end, wallet-free verification, salted commitments + credential files (privacy), contract keeps batch count/issuer, full UI redesign, review fixes, one-block-per-group concurrency with a sequential comparison, timeouts |

**Tools:** Solidity 0.8.20, Hardhat (node, compiler, Mocha/Chai tests), ethers.js v6, Node.js + Express, React 18 + Vite + React Router, MetaMask, WebCrypto and Node `crypto` (SHA-256), `node:test`, ESLint.

**Techniques:** identity-bound access control, salted hash commitments, Merkle trees and proofs, conflict graphs with greedy colouring, optimistic validate-then-commit, nonce management, block-per-group mining.

**Testing:** 19 contract tests (access control, duplicate rejection, revocation rules, no PII in events, batch storage limits, commitment test vector); 7 batch-service tests (conflict grouping, Merkle proofs for 1-7 leaves, root changes with a leaf, test vector, timing fields, mode validation); manual end-to-end runs in the browser.

---

## 7. How to run it

Prerequisites: Node.js 18+, MetaMask. Use four terminals, all starting in `ScholarLedger/`.

```bash
npm install
npx hardhat node
```

```bash
npx hardhat run scripts/deploy.js --network localhost
```

```bash
cd batch-service
npm install
node server.js
```

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000. In MetaMask add network `http://127.0.0.1:8545`, chain ID 31337, and import Hardhat accounts #0 (admin) and #1 (Demo University) from the keys printed by `npx hardhat node`. For the forgery demo also import #2 (unregistered).

Run the tests:

```bash
npx hardhat test
```

```bash
cd batch-service && npm test
```

**If something breaks during the demo:**
- "Cannot reach the blockchain node": start `npx hardhat node`, then re-run deploy.
- After restarting the node, MetaMask may complain about nonces: in MetaMask, Settings → Advanced → *Clear activity tab data*.
- A batch was killed midway and transactions hang: restart `npx hardhat node` and redeploy.
- Restarting the node wipes the chain, so redeploy every time.

### Operating the website: which account shows which outcome

Set up MetaMask once:
1. Add the network: RPC `http://127.0.0.1:8545`, chain ID `31337`, currency `ETH`.
2. Import three accounts with the keys printed by `npx hardhat node`:

| Account | Address | Role after deploy |
|---|---|---|
| #0 | `0xf39F…2266` | **Admin** (deployed the registry) |
| #1 | `0x7099…79C8` | **Demo University** (registered by the deploy script) |
| #2 | `0x3C44…93BC` | **Unregistered wallet** (plays the forger) |

Connect the wallet with the top-right button. The chip next to it shows the account and the network, in amber if the network isn't 31337. To switch roles, change the account in MetaMask; the page follows automatically. Every write opens a MetaMask pop-up: check it says Hardhat Local, then Confirm. Reading pages (Home, Verify, Ledger) need no wallet at all.

**Demo script.** Every outcome the app can show, in an order that works on a fresh deploy:

| # | Account | Where | Do this | You should see |
|---|---|---|---|---|
| 1 | none | `/` | Open the home page | Live stats (institutions 1, credentials 0…) and the specimen certificate |
| 2 | #2 | `/demo` | Press both buttons | Left: "Accepted. Verifier says valid." Right: **REJECTED** stamp, "This wallet is not a registered institution". The forgery is stopped by the contract. |
| 3 | #2 | `/register` | Try to register any address | "Only the admin wallet can do this" (access control) |
| 4 | #1 | `/issue` | Issue `S9 / BTech`, then **Download credential file** | "Confirmed in block N, gas used ~78k" and a VALID certificate |
| 5 | none | `/verify` | Upload that file | **VALID**, Demo University, S9 / BTech shown from the file |
| 6 | none | `/verify` | Open the file in Notepad, change `"BTech"` to `"MTech"`, save, upload | **ALTERED FILE**, struck-through certificate, no chain call |
| 7 | none | `/verify` | Paste the commitment only (from the file or the Ledger) | VALID with issuer and date but **no student details** (privacy) |
| 8 | none | `/verify` | Paste `0x` followed by 64 `1`s | **NOT FOUND** |
| 9 | none | `/batch` | Download the sample CSV, upload it, **Analyze**, then **Execute** | Conflict groups (the repeated S1001 row is in group 2); result 3 issued, 1 duplicate aborted; timeline; Merkle root; downloadable files |
| 10 | none | `/batch` | 20+ rows, tick **Compare with sequential**, Execute | The speedup figure (about 7x) and both timelines on one axis |
| 11 | none | `/verify` | Upload one credential file from that batch | VALID plus "Batch proof checks out against the stored Merkle root" |
| 12 | #2 | `/revoke` | Upload S9's file, press Revoke | "Only the institution that issued this credential can revoke it" |
| 13 | #1 | `/revoke` | Same file, Revoke | Confirmed; then `/verify` the file → **REVOKED** stamp |
| 14 | #0 | `/register` | Register #2 as "Second University" | Confirmed. #2 can now issue: as #2, `/demo` now says "The connected wallet is a registered institution" and disables the forgery button, and `/issue` works |
| 15 | any | `/explorer` | Open the ledger, try both tabs | Every credential with issuer name and Valid/Revoked; the batches with root and count; click a row → Verify |
| 16 | any | MetaMask | Switch the network to Ethereum Mainnet | Amber chip "Ethereum (expected 31337)". Switch back before sending anything. |

**ISSUER DEREGISTERED** has no button in the UI (deregistering is an admin action). To show it, run this in a fifth terminal from `ScholarLedger/`, after step 4:

```bash
npx hardhat console --network localhost
```

then, inside the console:

```js
const r = await ethers.getContractAt("InstitutionRegistry", "0x5FbDB2315678afecb367f032d93F642f64180aa3"); await r.revokeInstitution("0x70997970C51812dc3A010C7d01b50e0d17dc79C8")
```

Verify any Demo University credential that isn't revoked → **ISSUER DEREGISTERED**. (Do this last, since #1 can no longer issue afterwards. The address is the registry's on a fresh node; it's also in `frontend/src/abis/deployedAddresses.json`.)

**Tips for the live demo:**
- Restart the node and redeploy right before presenting, so the stats start clean.
- If MetaMask shows a "nonce too high" error after a restart, go to Settings → Advanced → Clear activity tab data.
- Keep a downloaded credential file and an edited copy ready on the desktop, so steps 5 and 6 take seconds.

### What it runs on

A local Hardhat Ethereum network (chain ID 31337) on one Windows laptop (i5-11400H, 6 cores / 12 threads, about 8 GB RAM). The design targets any EVM chain (Ethereum, Sepolia testnet); only the one-block-per-group trick is specific to the Hardhat dev node.

---

## 8. A 12-minute presentation plan (end-sem format)

| Section | Time | What to show |
|---|---|---|
| 1. Introduction | 2 min | Title, team, problem (degree fraud; hash-only systems are forgeable), objective (the 3 fixes) |
| 2. Background and motivation | 2 min | Centralised vs blockchain table (§3); why blockchain fits |
| 3. Research papers | 2 min | One line each: attack (Zonneveld), privacy (Saramago), concurrency (Block-STM, Anjana), evaluation (Fernández-Blanco); arrow to what each changed in the design |
| 4. Timeline and methodology | 5 min | Timeline table (§6), architecture diagram (§5.1), the issue/verify flow, the OCC steps; **live demo**: forgery demo, verify a file (valid, then altered), batch compare showing the speedup |
| 5. Conclusions | 1 min | Outcomes: forgery blocked on chain, no PII on chain, about 7x batch speedup; future work (§10) |
| 6. References | slide | The 5 papers |

Suggested 10-12 slides: title · problem · why blockchain · papers · architecture · contracts and identity binding · privacy (commitment + file) · OCC batch engine · results (compare chart + midsem graphs) · timeline · conclusion and future work · references. The screenshots in `ScholarLedger/docs/screenshots/` (home, demo-sequence, batch-compare, batch-timeline, verify-*) are ready to use. Split speaking time between both members.

---

## 9. Likely viva questions and answers

**Why do you need a blockchain at all? Why not a signed PDF?**
A signed PDF proves who signed it, but revocation and the list of legitimate issuers still need a trusted central server. The chain gives a public, tamper-evident registry of issuers, credentials and revocations that outlives any one university's systems, and anyone can check it for free.

**How exactly does ScholarLedger stop the Block.co forgery?**
`issueCredential` starts with `require(registry.isRegistered(msg.sender))`. `msg.sender` comes from the transaction's ECDSA signature, so it can't be faked. A forger's wallet isn't in the registry, so the EVM reverts the transaction and nothing is stored.

**Who decides which universities are registered? Isn't that centralised?**
Yes, the admin is a trust point (the deployer account). In production it would be a multisig or a consortium of accreditation bodies. Blockchain makes the admin's decisions public and auditable; it doesn't remove the need to vet institutions.

**What is stored on chain for each credential?**
The commitment, the issuer address, the issue time and a revoked flag. No name, ID or program.

**Why salt the hash? Isn't SHA-256 enough?**
Student IDs and program names are guessable. Without a salt, an attacker could hash every likely ID + program and match the public hashes. A 32-byte random salt makes that impossible.

**What if the student loses the credential file?**
The credential still verifies by commitment (valid, issuer, date), but the details can't be shown. The issuer should keep a backup or re-issue.

**Can the university change a credential later?**
No. It can only revoke it and issue a new one; both actions are permanent and public.

**What happens if a university is deregistered?**
Its existing credentials then verify as "Issuer deregistered", not "Valid".

**What is a Merkle tree for if each credential is already on chain?**
It gives each batch one auditable fingerprint: anyone can prove a credential was part of a specific graduation batch from that institution using a short proof, and the batch's count and issuer are recorded. The verify page checks this proof.

**Is your batch engine really parallel?**
It's concurrent. Within a group, transactions are submitted without waiting for each other and confirmed together in one block, which is where the 7-8x comes from. The EVM itself still executes the block's transactions one by one. Block-STM-style parallel execution inside the node is what the Block-STM and Anjana papers do; our midsem C++ benchmark simulated that part.

**What is a conflict in your system?**
Two rows for the same student and program. They go into different groups, and the later one is checked before sending and aborted as a duplicate.

**Why not just reject duplicates in the contract?**
Each row has a random salt, so duplicate rows have different commitments; the contract can't see student data to compare them. It does reject the exact same commitment twice.

**What is a nonce and why did you manage it yourself?**
Each account's transactions must use consecutive nonces. When many transactions are sent at once from one wallet, letting each one ask the node for "the next nonce" causes collisions, so the service hands out nonces itself.

**Why does your speedup differ from the papers' numbers?**
Different things are measured. The papers parallelise execution inside the node; we measure end-to-end issuance on a local dev node. We only compare the shape of the experiments, not the numbers.

**What are the gas costs?**
About 61,000 gas per `issueCredential` (78,000 for the very first one, which creates the counter). It used to be about 83,000: the contract kept an array of every commitment just to count them, and replacing it with a counter saved one storage write (about 22,000 gas) per credential. The service sets a 200,000 limit; the UI shows gas used after each transaction.

**How is verification free?**
`verifyCredential` is a `view` function: it reads state and changes nothing, so it needs no transaction, no gas and no wallet.

**What security issues remain?**
- Admin key is a single point of trust (no multisig or rotation).
- Front-running is possible but harmless here (the forger's issue still fails).
- Cross-batch duplicates aren't detected on chain.
- The credential file reveals all its fields to whoever receives it (no selective disclosure or ZKP).
- The demo batch service holds a private key in a server process.
- The batch speedup trick only works on the Hardhat dev node.

**How did you test it?**
19 Hardhat tests, 7 batch-service tests, plus manual end-to-end runs: issue, batch, verify a valid file, an altered file and a revoked credential, and the forgery revert.

**What did you personally learn?**
(Answer in your own words. Ideas: integrity ≠ authentication; on a public chain privacy has to be designed in; conflicts depend on which data transactions touch, not just batch size; nonce ordering is the hidden bottleneck for a single sender.)

---

## 10. Limitations and future work

- Deploy to a public testnet (Sepolia) and measure real gas and latency.
- Replace the single admin with a multisig or a consortium of accreditation bodies; add key rotation.
- Selective disclosure with zero-knowledge proofs (reveal "has a B.Tech" without the student ID), following Saramago et al.
- Detect cross-batch duplicates with an issuer-keyed tag (for example an HMAC of student ID + program).
- Let institutions sign batches with their own wallet (EIP-712 batch signatures) instead of a server-held key.
- True parallel execution inside the node (Block-STM style), compared with the midsem C++ simulation.
- Evaluate on low-power hardware as in Fernández-Blanco et al.
