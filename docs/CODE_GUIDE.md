# ScholarLedger Code Guide

What every file in `ScholarLedger/` does and how the pieces fit together. This is a map, not a line-by-line walkthrough. Terms are explained in [GLOSSARY.md](GLOSSARY.md); the story of the project is in [VIVA_GUIDE.md](VIVA_GUIDE.md).

The code has three parts that run as separate programs:

| Part | Folder | Runs as | Talks to |
|---|---|---|---|
| Smart contracts | `contracts/`, `scripts/`, `test/` | Deployed onto the Hardhat node (port 8545) | Nothing; others call it |
| Batch service | `batch-service/` | `node server.js` (port 3001) | The node, through ethers.js |
| Web app | `frontend/` | `npm run dev` (port 3000) | The node (reads and MetaMask writes) and the batch service |

---

## 1. Project root

| File | What it does |
|---|---|
| `package.json` | Dependencies for the contract side: Hardhat and its toolbox (compiler, ethers, Mocha/Chai). Its `test` script runs `hardhat test`, so `npm test` runs the contract tests. |
| `hardhat.config.js` | Tells Hardhat to compile with Solidity 0.8.20. No custom networks; `--network localhost` uses Hardhat's built-in default of `http://127.0.0.1:8545`. |
| `README.md` | Overview, quick start (four terminals), MetaMask setup, privacy note, measured batch results, project structure, references. |
| `.gitignore` | Keeps `node_modules`, Hardhat `artifacts/` and `cache/`, and `frontend/dist/` out of git. |
| `docs/screenshots/` | PNG screenshots of every page (desktop light and mobile dark), the batch timeline and comparison, the forgery sequence and the offline states. Useful for slides. |

---

## 2. Smart contracts (`contracts/`)

### `InstitutionRegistry.sol`: who is allowed to issue
The identity layer, and the fix for the Block.co forgery attack. It keeps a list of approved university wallets.
- The deployer becomes `admin`. The `onlyAdmin` modifier guards the write functions.
- `registerInstitution(address, name, domain)` adds a university (rejects duplicates and empty names) and emits `InstitutionRegistered`.
- `revokeInstitution(address)` deactivates a university and emits `InstitutionRevoked`.
- `isRegistered(address)` is the check the credential contract calls.
- `institutions(address)` (public getter) returns name, domain, registration time and active flag; the frontend uses it to turn an address into "Demo University".
- `getInstitutionCount()` / `getInstitutionAt(i)` let you list registered addresses.

### `CredentialManager.sol`: the credentials themselves
Stores one small record per credential, keyed by its salted commitment. **No student data is stored or emitted.**
- `issueCredential(commitment)`: only a registered institution; rejects zero and duplicate commitments; stores issuer, time and a revoked flag; emits `CredentialIssued`.
- `verifyCredential(commitment)`: free `view`; returns whether it's valid (exists, not revoked, issuer still registered), plus issuer, issue time and revoked flag.
- `revokeCredential(commitment)`: only the original issuer, only once; emits `CredentialRevoked`.
- `storeMerkleRoot(root, count)`: records a batch (root, issuer, count, time), returns its ID and emits `BatchProcessed`. Rejects a zero root, a zero count, a count above 2^32-1 and unregistered senders.
- `getCredentialCount()` (a plain counter, `credentialCount`, bumped on each issue: one storage write less than the old array, so about 22k gas cheaper per credential), `getBatchCount()`, and the public `batches(id)` getter feed the Home stats and the Ledger.

## 3. Deploy script and contract tests

### `scripts/deploy.js`
Deploys `InstitutionRegistry`, then `CredentialManager` (pointing at the registry). It then:
- writes both addresses to `frontend/src/abis/deployedAddresses.json`;
- copies the compiled ABIs into `frontend/src/abis/`, so the frontend and batch service always match the deployed contracts;
- on the local chain (31337) only, registers Hardhat account #1 as "Demo University" so issuing works straight away.

### `test/ScholarLedger.test.js`
19 Mocha/Chai tests run with `npx hardhat test`. They cover:
- **Registry:** admin set on deploy, register, reject a duplicate, reject a non-admin, `isRegistered`, revoke an institution.
- **Credentials:** issue from a registered institution, reject an unregistered sender (the forgery), verify, detect revoked, only the original issuer can revoke, reject a duplicate commitment.
- **Batches:** store a root; root, issuer and count stored with an incrementing ID; reject a zero root, a zero count, an unregistered sender and a count above uint32.
- **Privacy:** `CredentialIssued` has 3 inputs and none is a string; `credentials()` returns only issuer, time and revoked flag; the commitment test vector matches.

---

## 4. Batch service (`batch-service/`)

A small Node.js + Express server that issues many credentials at once using the OCC (optimistic concurrency) approach. It signs with the demo university's key on the server, so the browser never handles a private key.

### `server.js`: the API and the issuing logic
- **`GET /api/health`**: returns `{status: "ok"}`.
- **`POST /api/batch/analyze`**: validates the rows (student ID and program required) and returns the conflict groups, grouped by `studentId|programName`, without touching the chain (no salts or commitments are made here).
- **`POST /api/batch/issue`**: the main flow.
  0. Requests queue behind each other (one batch at a time, because every batch takes nonces from the same issuer key).
  1. Validates the rows and the `mode` (`grouped` by default, or `sequential`); loads the ABI and address files written by deploy.
  2. Gives each row a salt and commitment; groups rows by the conflict key `studentId|programName`.
  3. Sets up the wallet (`ISSUER_PRIVATE_KEY`, default Hardhat #1), fetches gas fees once, and starts its own nonce counter.
  4. **Grouped mode on the local chain:** turns Hardhat automine off, submits every row of a group at once, mines one block for the group, waits for the receipts, and turns automine back on (always, even on errors).
  5. **Sequential mode:** one row at a time, each waiting for its receipt (the baseline).
  6. **OCC validation:** before sending, a row whose key was already issued earlier in this request is aborted as a duplicate.
  7. Each row waits at most 30 seconds for confirmation. Revert reasons are turned into readable messages.
  8. Builds a Merkle tree of the successful commitments, calls `storeMerkleRoot`, and reads the batch ID from the event.
  9. Responds with per-row results (success or error, submit and confirm times, block number), metrics (counts, time, tx/s, blocks used), the Merkle root, the batch ID and one credential file per issued row (with its Merkle proof). Salts appear only inside the credential files.
- Env vars: `PORT` (3001), `RPC_URL` (`http://127.0.0.1:8545`), `ISSUER_PRIVATE_KEY`.

### `occEngine.js`: conflict detection and grouped execution
- `analyzeBatch(rows, keyFn)` (the key function is required; the server passes `studentId|programName`) builds the conflict graph (rows sharing a key conflict, found with a hash map) and does greedy graph colouring: each row goes into the first group with no conflicting row. Returns `groups`, `conflicts` and counts.
- `executeBatch(groups, executor)` runs groups one after another and the rows inside a group together with `Promise.all`. It records per-row submit and confirm times (ms from batch start) and the overall time and throughput. It doesn't know about Ethereum: `server.js` passes in the function that actually sends a transaction.

### `merkle.js`: the Merkle tree
`buildMerkleTree(leaves)` builds the tree from hex strings with SHA-256, duplicating the last node on any odd level, and returns the root, all levels and one proof per leaf (by index). `verifyMerkleProof` checks a proof; the file exports only these two functions (proof building is internal). The frontend has a matching verifier in `credential.js`.

### `credential.js`
`newSalt()` (32 random bytes as hex) and `computeCommitment(fields)` = `0x` + SHA-256 of `salt|studentId|programName|metadata` (fields trimmed). Must give exactly the same result as the browser version.

### `test/engine.test.js`
7 tests with Node's built-in runner (`npm test`):
- conflicting rows land in different groups;
- empty input gives no groups;
- Merkle proofs verify for every leaf of trees with 1, 2, 3, 5, 6 and 7 leaves;
- changing a leaf changes the root;
- the commitment test vector and the conflict key are right;
- timing fields satisfy `submittedAt <= confirmedAt`;
- an unknown `mode` is rejected with HTTP 400.

### `package.json`
Dependencies `express`, `cors`, `ethers`; `npm test` runs `node --test`.

---

## 5. Web app (`frontend/`)

React 18 single-page app built with Vite. Plain CSS with design tokens, no CSS framework.

### Setup files

| File | What it does |
|---|---|
| `index.html` | The single HTML page; loads `src/main.jsx` and the favicon. |
| `vite.config.js` | Vite with the React plugin; dev server on port 3000. |
| `package.json` | React, React Router, ethers, Phosphor icons and Fontsource fonts; `dev`, `build`, `lint`, `preview` scripts. |
| `.eslintrc.cjs` | Lint rules (React + hooks) so `npm run lint` works; it ignores the built `dist/` folder. |
| `public/favicon.svg` | The seal mark shown in the browser tab. |
| `DESIGN.md` | Short design notes for the UI (palette, fonts, rules followed). Documentation only. |

### App shell

| File | What it does |
|---|---|
| `src/main.jsx` | Entry point: mounts `<App/>` and the global CSS. |
| `src/App.jsx` | Loads the fonts, tracks the MetaMask account and network (listens for account and chain changes), provides `connect()`, shares it all through `WalletContext`, and maps URLs to pages with React Router. Adds a "skip to content" link. |
| `src/index.css` | All component and page styles: layout, navbar and dropdowns, forms, tables, status panel, certificate, timeline, forgery demo, responsive rules for phones, dark mode and reduced-motion rules. |
| `src/styles/tokens.css` | Design tokens: colours (paper, ink, green accent, oxblood danger), fonts, spacing, radii; a dark-theme set via `prefers-color-scheme`. Everything else uses these variables. |

### Pages (`src/pages/`), one per route

| Page | Route | What it does |
|---|---|---|
| `Home.jsx` | `/` | Landing page: headline and problem statement, a sample certificate, **live chain stats** (institutions, credentials, batches, revoked; "node offline" state if the node is down), the 3-step "how it works", sections with diagrams for identity-bound issuance and the batch engine, the on-chain vs held-by-student privacy split, and the references. |
| `Verify.jsx` | `/verify` | The employer's page; no wallet needed. Upload a credential file or paste a commitment (also `?c=0x…` from the Ledger). A file is checked against its own commitment first (mismatch → ALTERED FILE, no chain call), then `verifyCredential` gives VALID / REVOKED / ISSUER DEREGISTERED / NOT FOUND, and the batch Merkle proof is checked against the stored root and issuer. Shows a status panel and a certificate, and scrolls the result into view on phones. |
| `Issue.jsx` | `/issue` | University form (student ID, program, optional details) with validation. Generates a salt, computes the commitment in the browser, sends `issueCredential` through MetaMask, shows transaction progress, then a certificate and a **Download credential file** button. |
| `BatchIssue.jsx` | `/batch` | CSV upload (with a sample CSV) or an editable table. **Analyze** shows the conflict groups; **Execute** calls the batch service and shows results, a timeline, a per-row table and credential-file downloads. **Compare with sequential** runs the rows twice (sequential, then grouped) and shows the speedup and both timelines on one time axis. |
| `Revoke.jsx` | `/revoke` | Upload the credential file or paste a commitment, then `revokeCredential` through MetaMask. Shows plain-English errors such as "Only the institution that issued this credential can revoke it". |
| `Register.jsx` | `/register` | Admin form (wallet address, name, domain) with address validation; calls `registerInstitution` through MetaMask. |
| `Explorer.jsx` | `/explorer` | "The ledger": every credential (commitment, issuer name, date, valid or revoked) built from contract events, plus a Batches tab (ID, root, issuer, count, date), a filter box, empty and offline states. Clicking a row opens Verify for that commitment. |
| `ForgeryDemo.jsx` | `/demo` | Side-by-side re-enactment of the Block.co attack with one random forged hash. Left: a simulated hash-only system that accepts it. Right: a **real** `issueCredential` from the connected wallet, which the contract rejects when the wallet isn't registered. Each side plays a 3-step sequence ending in a VALID or REJECTED certificate stamp. Warns if the connected wallet *is* registered. |

### Components (`src/components/`), shared UI pieces

| Component | What it does |
|---|---|
| `Navbar.jsx` | Top bar: logo, the main **Verify** button, three keyboard-accessible dropdowns (Institution, Admin, Explore), and wallet status (shortened address, network name, warning if not chain 31337) or a Connect button. Collapses into a full menu on phones. |
| `CertificateCard.jsx` | Draws a credential like a printed certificate: institution name, student fields (if known), date, commitment as a serial number, an SVG seal whose ring text is the issuer address, and a VALID / REVOKED / ALTERED / REJECTED / DEREGISTERED stamp. Used on Home (marked "Specimen"), Verify, Issue and the forgery demo. |
| `StatusPanel.jsx` | Large result box with icon, colour and text for each verification outcome (never colour alone). |
| `BatchTimeline.jsx` | SVG chart of a batch run: one lane per group (labelled with its block numbers), one bar per row from submit to confirm, struck marks for aborted duplicates, lines joining conflicting rows, plus total time, tx/s and Merkle root. Can share a time axis with a second timeline for the comparison. |
| `Diagrams.jsx` | The two explanatory SVG diagrams on Home: `IdentityDiagram` (wallet → registry check → contract, or revert) and `OccDiagram` (rows → groups → chain → root). |
| `HashText.jsx` | Shows a hash or address in monospace, shortened in the middle (`0x1a2b…9f0e`), with a copy button and the full value on hover. Also exports `shorten()`. |
| `TxStatus.jsx` | The progress line for a transaction: waiting for wallet → submitted (tx hash) → confirmed in block N with gas used, or a readable error. |
| `FileDrop.jsx` | Drag-and-drop file area that's also a real button (keyboard accessible). Used for credential files and CSVs. |
| `PageHeader.jsx` | The page title and intro paragraph used at the top of every page. |

### Utilities (`src/utils/`)

| File | What it does |
|---|---|
| `contracts.js` | Creates ethers objects: `getProvider()` (through MetaMask), `getReadProvider()` (direct to the node, for wallet-free reading; `VITE_RPC_URL` overrides the URL), `getSigner()`, and contract objects (plain, non-async functions) for the registry and credential manager using the ABIs and addresses from `abis/`. |
| `credential.js` | Browser-side credential logic: `newSalt()`, `computeCommitment()` (WebCrypto SHA-256, same formula as the server), `buildCredentialFile()`, `parseCredentialFile()` (checks format and fields and recomputes the commitment, which is how altered files are caught), `verifyMerkleProof()`, and the download helpers `download(filename, text, type)` and `downloadJson(filename, obj)` (also used for the sample CSV on the Batch page). |
| `errors.js` | `friendlyError()` turns contract revert reasons and wallet errors into plain-English messages. |
| `useTx.js` | React hook that runs a transaction and tracks its phase (wallet → submitted → confirmed or error) for `TxStatus`. |
| `useReveal.js` | React hook that focuses a result and scrolls it into view when it appears, so phone users see it. Respects reduced motion. |
| `wallet.js` | Defines `WalletContext` (account, chain ID, connect, error). |

### Generated files (`src/abis/`)
`InstitutionRegistry.json`, `CredentialManager.json` (compiled ABIs) and `deployedAddresses.json` (contract addresses). **Written by `scripts/deploy.js`; don't edit by hand.** The batch service reads the same files.

---

## 6. How a request flows through the files

**Verify a credential file:** `Verify.jsx` → `credential.parseCredentialFile` (recompute commitment) → `contracts.getReadProvider` → `CredentialManager.verifyCredential` + `InstitutionRegistry.institutions` → `credential.verifyMerkleProof` + `CredentialManager.batches` → `StatusPanel` + `CertificateCard`.

**Issue one credential:** `Issue.jsx` → `credential.newSalt/computeCommitment` → `useTx` → `contracts.getSigner` (MetaMask) → `CredentialManager.issueCredential` → `TxStatus`, `CertificateCard`, `credential.buildCredentialFile/downloadJson`.

**Issue a batch:** `BatchIssue.jsx` → `POST /api/batch/issue` → `server.js` (`credential.js` salts and commitments, `occEngine.analyzeBatch` groups, `occEngine.executeBatch` runs groups, Hardhat automine and mine calls, `merkle.buildMerkleTree`, `storeMerkleRoot`) → response → `BatchTimeline` and downloads.

**Forgery attempt:** `ForgeryDemo.jsx` → `useTx` → MetaMask → `CredentialManager.issueCredential` → `require(registry.isRegistered(msg.sender))` fails → revert reason → `errors.friendlyError` → REJECTED stamp.
