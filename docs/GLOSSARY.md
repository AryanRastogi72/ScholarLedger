# ScholarLedger Glossary

Plain-English explanations of every technical term used in the project, grouped by topic. Where a term has a specific meaning *in this project*, the "In ScholarLedger" line says how it is used.

---

## 1. Blockchain basics

**Blockchain**
A shared database that many computers keep a copy of. Data is grouped into *blocks*, and each block contains the hash (fingerprint) of the block before it, so the blocks form a chain. Changing an old block would change its hash and break every link after it, which everyone would notice.
*In ScholarLedger:* the place where institutions, credential commitments, revocations and batch roots are recorded so that nobody (not even the university) can quietly edit them later.

**Block**
One "page" of the blockchain. It holds a list of transactions plus a header (block number, timestamp, hash of the previous block, and so on).

**Block number / block height**
The position of a block in the chain (block 0, block 1, …). The Batch page labels each group with the block it was mined in.

**Genesis block**
The very first block of a chain (block 0). It has no previous block.

**Block hash / previous hash**
The fingerprint of a block's header. Each block stores the previous block's hash, which is what links the chain together.

**Ledger**
Another word for the record of all transactions. The app's `/explorer` page is called "The ledger" because it lists every credential and batch on the chain.

**Decentralization**
No single owner or server controls the data. Many independent nodes hold copies and agree on updates.

**Node**
A computer running blockchain software that keeps a copy of the chain and processes transactions.
*In ScholarLedger:* `npx hardhat node` starts one local node on your laptop at `http://127.0.0.1:8545`.

**Immutability**
Once data is in a confirmed block it practically cannot be changed or deleted. Mistakes are fixed by adding new records (for example a revocation), not by editing old ones.

**Transparency / auditability / traceability**
Anyone can read the chain and see who did what and when. This lets an outside verifier audit records without trusting the university's own database.

**Consensus**
The rule the nodes use to agree on which block comes next, so that all copies stay identical.

**Proof of Work (PoW)**
A consensus method where a miner must find a number (a *nonce*) that makes the block's hash meet a target (for example "starts with 39"). Finding it takes many tries; checking it takes one. Used in the midsem assignment (hash had to start with the last two digits of the roll number).

**Proof of Stake (PoS)**
The consensus method Ethereum uses today: validators lock up ETH as a deposit and are chosen to propose blocks; cheating costs them that deposit.

**Mining**
Creating a new block. In PoW it means solving the hash puzzle. On a Hardhat local node, mining is instant and needs no puzzle.

**Miner / validator**
The participant that builds a block (miner) and the participants that re-check it (validators). The concurrency papers talk about speeding up both.

**Public vs private (permissioned) blockchain**
Public: anyone can read and send transactions (Ethereum). Private/permissioned: only approved parties participate. ScholarLedger is designed for a public chain, which is why it hides student data.

**Mainnet / testnet / local network**
Mainnet is the real network with real money. Testnets (such as Sepolia) use free test ETH. A local network (Hardhat) runs only on your machine and is reset when you restart it.

**Chain ID**
A number that identifies a network so a transaction for one chain can't be replayed on another. Ethereum mainnet is 1, Sepolia is 11155111, Hardhat local is **31337**. The navbar shows a warning chip if your wallet is not on 31337.

---

## 2. Ethereum and smart contracts

**Ethereum**
A public blockchain that can run programs (smart contracts), not just record payments.

**Ether (ETH) / wei**
Ethereum's currency. 1 ETH = 10^18 wei. Gas fees are paid in ETH. On Hardhat each test account starts with 10,000 fake ETH.

**EVM (Ethereum Virtual Machine)**
The "computer" inside every Ethereum node that runs smart-contract code. Every node runs the same code and must get the same result. The EVM executes the transactions in a block **one after another**, not in parallel.

**Smart contract**
A program stored on the blockchain. Its functions are called by transactions, its data (state) lives on the chain, and nobody can change its code after deployment.
*In ScholarLedger:* `InstitutionRegistry` and `CredentialManager`.

**Solidity**
The programming language the contracts are written in (version `^0.8.20`). It looks a little like JavaScript/C++.

**State / storage**
The data a contract keeps permanently on the chain (its variables). Writing to storage costs gas; reading it is free from outside.

**Account / address**
An identity on Ethereum, written as `0x` followed by 40 hex characters (20 bytes). There are two kinds:
- **EOA (externally owned account):** controlled by a private key; this is what a person or university wallet is.
- **Contract account:** the address where a smart contract lives.

**Private key / public key**
A private key is a secret 32-byte number that controls an account. The public key and the address are derived from it. Whoever has the private key can sign transactions for that account. Hardhat prints 20 test private keys when it starts; they are public knowledge and must never be used on a real network.

**ECDSA (Elliptic Curve Digital Signature Algorithm)**
The signature scheme Ethereum uses. Signing a transaction with the private key proves it came from that account, without revealing the key.

**Digital signature**
A value produced with a private key that anyone can check with the public key. It gives *authentication* (who sent it) and *non-repudiation* (they can't deny it later).

**Transaction (tx)**
A signed message that asks the chain to do something: send ETH, deploy a contract or call a contract function that changes state. It gets a *transaction hash* as its ID.

**Transaction hash**
The unique ID of a transaction, shown in the app's progress line ("Submitted. Transaction 0x…").

**Receipt**
What you get after a transaction is mined: block number, gas used, success or failure, and emitted events.

**Confirmation**
A transaction is "confirmed" when it has been included in a block.

**Nonce (account nonce)**
A counter on each account: the first transaction uses nonce 0, the next nonce 1, and so on. The node processes an account's transactions strictly in nonce order. If nonce 5 is missing, nonces 6, 7… wait forever (a *nonce gap*).
*In ScholarLedger:* the batch service assigns nonces itself so many transactions can be sent at once without clashing. **Do not confuse with the PoW nonce** below.

**Nonce (PoW nonce)**
The number a miner changes until the block hash meets the difficulty target. Different meaning, same word.

**Gas**
The unit for measuring how much computation a transaction uses. Every operation costs some gas.

**Gas limit**
The maximum gas a transaction is allowed to use. If it runs out, the transaction fails. The batch service sets 200,000 per issue (an issue uses about 61,000).

**Gas price / fees (EIP-1559)**
What you pay per unit of gas. Since EIP-1559, fees have a *base fee* (burned) and a *priority fee* (tip to the block producer): `maxFeePerGas` and `maxPriorityFeePerGas`. The batch service fetches these once per batch.

**Block gas limit**
The maximum total gas of all transactions in one block. It caps how many transactions fit in a block.

**`view` function**
A contract function that only reads data. Calling it is free and needs no wallet or transaction.
*In ScholarLedger:* `verifyCredential` is a view function, which is why employers can verify without MetaMask.

**`require` / revert**
`require(condition, "message")` stops the function and undoes all its changes if the condition is false. This is called a *revert*. The message (the *revert reason*) is shown to the user.
*In ScholarLedger:* `require(registry.isRegistered(msg.sender), "Issuer not registered")` is the line that blocks forgeries.

**`msg.sender`**
Inside a contract, the address that called the function. It can't be faked because it comes from the transaction's signature. ScholarLedger's whole identity check relies on it.

**Modifier**
A reusable check attached to functions, such as `onlyAdmin` in `InstitutionRegistry`.

**Mapping**
A key-value table in Solidity, such as `mapping(bytes32 => Credential) credentials`.

**Struct**
A record type with named fields, such as `Credential { issuer, issuedAt, isRevoked }`.

**Event / log**
A message a contract emits (`emit CredentialIssued(...)`) that is stored in the transaction receipt. Apps can search events cheaply. The Ledger and Home pages are built from events.

**Indexed event parameter**
An event field marked `indexed` can be filtered on (for example, all credentials of one issuer).

**ABI (Application Binary Interface)**
A JSON description of a contract's functions and events. JavaScript needs it to know how to call the contract. Generated by the compiler and copied to `frontend/src/abis/` by the deploy script.

**Bytecode**
The compiled contract that is actually stored on the chain.

**Deploy**
Sending a transaction that creates a contract. The contract gets its own address. `scripts/deploy.js` deploys both contracts.

**Admin**
In this project, the account that deployed `InstitutionRegistry` (Hardhat account #0). Only it can register or deregister institutions.

**`bytes32`**
A fixed 32-byte value. Commitments and Merkle roots are stored as `bytes32` (shown as `0x` + 64 hex characters).

**`uint64`, `uint32`, `uint256`**
Unsigned integers of 64, 32 or 256 bits. Smaller types let several fields share one storage slot, which saves gas.

---

## 3. Tools and libraries

**Hardhat**
A development toolkit for Ethereum: compiles Solidity, runs tests and runs a local blockchain node.

**Hardhat Network / Hardhat node**
The local blockchain Hardhat provides. It has chain ID 31337 and 20 funded test accounts.

**Automine**
A Hardhat setting where every transaction is mined into its own block immediately. ScholarLedger turns it off briefly during a grouped batch so that a whole group lands in one block, then turns it back on.

**`evm_mine`, `evm_setAutomine`**
Special Hardhat commands (not standard Ethereum) that mine a block now, or switch automine on and off.

**JSON-RPC**
The protocol apps use to talk to an Ethereum node over HTTP: requests like `eth_chainId`, `eth_sendRawTransaction` and `eth_call`.

**RPC URL**
The address of a node's JSON-RPC endpoint, here `http://127.0.0.1:8545`.

**ethers.js (v6)**
The JavaScript library used by both the frontend and the batch service to talk to the chain, sign transactions and call contracts.

**Provider**
An ethers object that *reads* from the chain. `JsonRpcProvider` talks to a node directly; `BrowserProvider` goes through MetaMask.

**Signer**
An ethers object that can *sign and send* transactions (a wallet).

**Wallet**
Software that holds private keys and signs transactions.

**MetaMask**
A browser-extension wallet. The frontend asks it to sign Register, Issue, Revoke and the forgery attempt.

**EIP-1193**
The standard interface (`window.ethereum`) that browser wallets like MetaMask expose to websites.

**Node.js**
JavaScript runtime outside the browser. Runs Hardhat and the batch service.

**npm**
Node's package manager (`npm install`, `npm test`, `npm run dev`).

**Express**
A small Node.js web-server framework. The batch service is an Express app on port 3001.

**REST API / endpoint**
A URL the frontend sends requests to, such as `POST /api/batch/issue`.

**CORS**
A browser security rule about which websites may call an API. The batch service enables it so the frontend on port 3000 can call port 3001.

**React**
The JavaScript UI library the frontend is built with. A page is made of *components* (functions returning UI).

**Hook (React)**
A function such as `useState` or `useEffect` that gives a component state or side effects. The project adds its own: `useTx`, `useReveal`.

**Context (React)**
A way to share data with many components. `WalletContext` shares the connected account and network.

**React Router**
Maps URLs (`/verify`, `/batch`…) to pages.

**Vite**
The frontend dev server and build tool (`npm run dev` on port 3000, `vite build` for production).

**ESLint**
A tool that checks JavaScript for mistakes and style problems.

**Mocha / Chai**
The test runner and assertion library Hardhat uses for the contract tests.

**`node:test`**
Node's built-in test runner, used for the batch-service tests (no extra dependency).

**WebCrypto (`crypto.subtle`)**
The browser's built-in cryptography API. The frontend uses it for SHA-256 and random salts.

**Node `crypto` module**
Node's built-in cryptography, used by the batch service for SHA-256 and random salts.

**JSON / CSV**
Text data formats. Credential files are JSON; batch input can be a CSV (comma-separated rows).

**Phosphor icons, Fontsource**
The icon set and the self-hosted fonts (Fraunces, Public Sans, IBM Plex Mono) used by the redesigned UI.

---

## 4. Cryptography

**Hash function**
A function that turns any input into a fixed-size fingerprint. Even a tiny change to the input gives a completely different output, and you cannot work backwards from the output to the input.

**SHA-256**
The hash function used throughout ScholarLedger. Its output is 256 bits (32 bytes, 64 hex characters). Used for commitments and Merkle trees.

**Keccak-256**
Ethereum's own hash function (used for addresses and internally). ScholarLedger computes its hashes off-chain with SHA-256 instead.

**Hex / `0x` prefix**
Hexadecimal notation (0-9, a-f). `0x` marks a hex value. 64 hex characters = 32 bytes.

**Preimage**
The original input of a hash. "Finding a preimage" means working out the input from the hash, which should be infeasible.

**Salt**
A random value mixed into a hash so the same data never gives the same hash twice and nobody can guess the input by trying likely values. ScholarLedger uses a fresh 32-byte random salt per credential.

**Commitment (hash commitment)**
A hash of some data plus a salt, published now. It *hides* the data (you can't read it from the hash) and *binds* the publisher to it (they can't later claim different data). To "open" it you reveal the data and the salt, and anyone can recompute the hash.
*In ScholarLedger:* `commitment = SHA-256(salt | studentId | programName | metadata)`. Only the commitment goes on the chain.

**Credential file**
The JSON file the student keeps. It contains the salt, the student details, the commitment, the issuer and (for batches) a Merkle proof. Uploading it on `/verify` opens the commitment.

**Test vector**
A fixed input with a known correct output, used to check two implementations agree. Salt of 64 zeros + `S1` + `BTech` + empty metadata must give `0x2225df7e…22372` in both the browser and Node.

**Merkle tree**
A tree of hashes: the leaves are data hashes, each parent is the hash of its two children, and the single top hash is the *root*. Changing any leaf changes the root.

**Merkle root**
The top hash of a Merkle tree. One 32-byte value that stands for the whole batch. ScholarLedger stores one root per batch on chain.

**Merkle proof**
The list of sibling hashes needed to walk from one leaf up to the root. With it, anyone can check that a leaf belongs to a batch without seeing the other leaves. Each batch credential file contains its proof.

**Leaf / sibling / padding**
A leaf is a bottom-level hash; a sibling is the other child at the same level; *padding* duplicates the last node when a level has an odd count so pairs always work.

**Zero-knowledge proof (ZKP)**
A proof that a statement is true without revealing why (for example "my degree is valid" without revealing the grade). Mentioned in the Saramago paper; **not** implemented here.

**Selective disclosure**
Showing only some fields of a credential. Partly achieved here: nothing is on chain, and the student chooses whom to give the file to (but the file reveals all its fields).

---

## 5. Security and privacy terms

**Integrity**
The data has not been changed. Hashes and the blockchain provide this.

**Authentication**
Proving *who* did something. ScholarLedger gets this from transaction signatures plus the registry check on `msg.sender`.

**Authorization / access control**
Deciding *who is allowed* to do something: only the admin registers institutions; only registered institutions issue; only the original issuer revokes.

**Non-repudiation**
The signer cannot later deny having signed. A university cannot deny issuing a credential its key signed.

**Confidentiality / privacy**
Keeping data from people who shouldn't see it. On a public chain everything is visible, so ScholarLedger keeps student data off chain entirely.

**PII (personally identifiable information)**
Data that identifies a person, such as a student ID or name. The old contract stored PII on chain; the current one doesn't.

**Provenance**
Where a record came from. Here: which registered institution issued a credential.

**Identity spoofing**
Pretending to be someone else. The attack in Zonneveld et al. lets any wallet pose as a university.

**Forgery attack (Block.co attack)**
The attack described by Zonneveld, Rafaiani and Baldi (2026): a hash-only system proves a document wasn't changed but not who anchored it, so anyone can anchor a forged degree's hash and it later "verifies". The `/demo` page re-enacts it.

**Issuer / holder / verifier**
The three roles in credential systems: the university issues, the student holds, the employer verifies.

**Revocation**
Marking a credential as no longer valid (for example, after misconduct). Recorded as a new state on chain, never by deleting.

**Deregistered issuer**
An institution the admin has removed from the registry. Its old credentials then verify as "issuer deregistered", not "valid".

**Replay / duplicate issuance**
Submitting the same thing twice. The contract rejects a commitment that already exists.

**Front-running**
Someone sees your pending transaction and gets theirs mined first. Discussed in the midsem report as a partly-addressed risk.

**Denial of service (DoS)**
Making a system unusable by overloading it. Gas costs limit this on chain.

**Key management / key rotation / multisig**
How private keys are protected and replaced, and requiring several keys to approve an action. Not implemented; listed as future work.

---

## 6. Concurrency terms

**Sequential execution**
Doing transactions one after another, each waiting for the previous one. The baseline in the comparison.

**Concurrent vs parallel**
*Concurrent:* several tasks are in progress at the same time (they overlap). *Parallel:* several tasks run at the same instant on different CPU cores. The batch service is concurrent (many transactions in flight at once); the EVM itself still runs them one by one.

**Throughput**
Work done per unit time, here **transactions per second (tx/s)**.

**Latency**
How long one operation takes from start to finish.

**Speedup**
Sequential time divided by concurrent time. 7x means seven times faster.

**Conflict**
Two transactions conflict if they touch the same data and at least one of them writes it, so their order matters.
*In ScholarLedger:* two rows conflict if they have the same student ID and program.

**Read set / write set**
The data a transaction reads and the data it writes. Conflicts are found by comparing these.

**Conflict graph**
A graph where each transaction is a node and an edge joins two conflicting transactions.

**Graph coloring**
Giving each node a color so no two connected nodes share a color. Each color is a group of non-conflicting transactions that can run together. ScholarLedger uses a simple *greedy* coloring (put each row in the first group where it has no conflict).

**Optimistic concurrency control (OCC)**
Run transactions in parallel assuming they won't conflict, then *validate* afterwards and redo or abort the ones that did. The opposite, *pessimistic* control, locks data first.
*In ScholarLedger:* groups run together; before a later-group row is sent it is re-checked, and it aborts if an earlier row already issued the same student and program.

**Validation / abort / re-execution**
The OCC steps: check whether what a transaction relied on is still true; if not, abort it (and in Block-STM, re-execute it).

**STM (Software Transactional Memory)**
A programming technique where blocks of code run as transactions on shared memory, with automatic conflict detection and retry.

**Block-STM**
The parallel execution engine from Gelashvili et al. (used by the Aptos blockchain). It runs a block's transactions speculatively in parallel, keeps multiple versions of each data item and re-executes transactions that read stale data, while keeping the final result identical to running them in order.

**BTO / MVTO**
*Basic Timestamp Ordering* and *Multi-Version Timestamp Ordering*: STM protocols used by Anjana et al. to let miners run smart contracts concurrently.

**Block graph**
In Anjana et al., the miner records which transactions depend on which in a graph inside the block, so validators can re-run the block in parallel safely.

**Thread / worker**
A unit of execution that can run on a CPU core. The midsem C++ benchmark varied thread counts (1-16).

**`Promise.all`**
A JavaScript function that starts many asynchronous operations and waits until all finish. Used to run all rows of a group at once.

**Pipelining**
Starting the next operation before the previous one finishes. The grouped mode pipelines submissions instead of waiting for each confirmation.

**Batch**
A set of credentials issued together in one request, anchored by one Merkle root and given a batch ID on chain.
