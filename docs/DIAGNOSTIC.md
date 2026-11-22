# Diagnostic report

Final full diagnostic of ScholarLedger, run on 2026-11-22 against a fresh `npx hardhat node`, a fresh deploy, the batch service and the production frontend build. Everything here can be re-run: `npx hardhat test`, `npx hardhat coverage`, `node scripts/e2e.js --bench`, `node scripts/ui-check.js`.

## Summary

| Layer | Cases | Passed | Failed |
|---|---:|---:|---:|
| Contract tests (Hardhat) | 45 | 45 | 0 |
| Batch service end to end (`scripts/e2e.js`) | 28 | 28 | 0 |
| Frontend in a real browser (`scripts/ui-check.js`) | 75 | 75 | 0 |
| Batch service unit tests (`node --test`) | 16 | 16 | 0 |

- **Coverage** (`npx hardhat coverage`): 100% statements, 100% branches, 100% functions, 100% lines on both contracts.
- **Bugs found and fixed in this pass:** (1) when the Merkle root step failed, `rootError` read "could not coalesce error"; it now shows the contract's own reason ("Not a registered institution"). (2) On a 375 px phone the Ledger's Status column was cut off; the Issuer column is now hidden there too.
- **Bugs fixed just before this pass (Task 13):** the aborted-duplicate message regression, the network guard, file-versus-chain checks in Verify, the cutoff `<=` and the cutoff-before-registration check.
- **Measured speedups** (conflict-free rows, 3 runs each, medians, Windows laptop, local Hardhat node): **20 rows 3.8x** (sequential 680 ms, grouped 178 ms); **50 rows 5.6x** (sequential 1577 ms, grouped 281 ms).
- **Open items** are listed at the end. None is a regression.

## 1. Static checks

| Check | Expected | Observed | Result |
|---|---|---|---|
| `npm audit` batch-service | 0 | 0 vulnerabilities | PASS |
| `npm audit` frontend | 0 | 4 (1 high, 3 moderate): `vite`, `esbuild`, `react-router`, `react-router-dom`; the fixes are major upgrades (`vite@8`, `react-router-dom@7`) | OPEN |
| `npm audit` repo root | 0 | 46 (21 low, 16 moderate, 8 high, 1 critical), all in the Hardhat toolbox dev tooling (`@ethersproject/*`, `@fastify/busboy`, ...); nothing here ships to users | OPEN |
| Frontend `npm run lint` | exit 0 | exit 0, `--max-warnings 0` | PASS |
| Solidity compile warnings | none | "Compiled 2 Solidity files successfully", no warnings | PASS |

## 2. Contracts

Run with `npx hardhat test` (45 passing). `test/Diagnostic.test.js` is the systematic matrix (every external function, every revert string); `test/ScholarLedger.test.js` holds the scenario tests.

| Case | Expected | Observed | Result |
|---|---|---|---|
| Registry constructor: threshold 0, threshold above admins, zero admin, duplicate admin | revert 'Bad threshold' / 'Zero admin' / 'Duplicate admin' | all four revert with those strings | PASS |
| proposeRegister: non-admin, zero address, empty name, empty domain, already registered | 'Not an admin' / 'Zero address' / 'Name required' / 'Domain required' / 'Address was registered before' | as expected | PASS |
| proposeDeregister: non-admin, not registered, future cutoff, zero cutoff | 'Not an admin' / 'Not registered' / 'validUntil in the future' / 'Cutoff before registration' | as expected | PASS |
| approve: non-admin, unknown id, twice by one admin, after execution | 'Not an admin' / 'No such proposal' / 'Already approved' / 'Already executed'; events carry the right arguments | as expected | PASS |
| Execution re-checks conditions | second deregister proposal reverts 'Not registered' when approved after the first executed | as expected | PASS |
| issuedWhileAuthorized before, at and after the cutoff; unknown issuer | true, true, false; false for never-registered | as expected | PASS |
| Registry getters | admins, proposal and institution counts, getInstitutionAt, 'Index out of bounds', institutions(), isRegistered | as expected | PASS |
| InstitutionRevoked event | carries the cutoff | as expected | PASS |
| issueCredential: unregistered, zero hash, duplicate; good path | 'Issuer not registered' / 'Invalid hash' / 'Credential already exists'; counters bump | as expected | PASS |
| verifyCredential: unknown, valid, revoked, deregistered before and after the cutoff | (false,0,0,false); valid; revoked flag; early true, late false | as expected | PASS |
| revokeCredential: unregistered, unknown, wrong issuer, twice; good path | 'Issuer not registered' / 'Credential does not exist' / 'Only issuer can revoke' / 'Already revoked' | as expected | PASS |
| storeMerkleRoot: unregistered, zero root, zero count, count above uint32; largest allowed count | 'Not a registered institution' / 'Invalid root' / 'Empty batch' / 'Batch too large'; stored batch | as expected | PASS |
| Scenario tests (ScholarLedger.test.js, 32 tests) | multi-admin flows, commitments, cutoffs, batches | 32 passing | PASS |

## 3. Batch service end to end

`node scripts/e2e.js --bench` for the safe cases, `--destructive` for the root-failure case (it deregisters the issuer: redeploy afterwards), `--kill-only --kill-cmd "<stop the node>"` for the mid-request kill, `--node-down` with the node stopped.

| Case | Expected | Observed | Result |
|---|---|---|---|
| Health: ok and node up | 200, node: up | 200, node: up | PASS |
| Auth: no token | 401 | 401 | PASS |
| Auth: wrong token | 401 | 401 | PASS |
| Auth: /api/health stays open | 200 without a token | 200 | PASS |
| Host: foreign Host header | 403 | 403 | PASS |
| Origin: foreign preflight | no Access-Control-Allow-Origin | header absent | PASS |
| Origin: app origin preflight | Access-Control-Allow-Origin: http://localhost:3000 | as expected | PASS |
| Validation: transactions not an array | 400 | 400 | PASS |
| Validation: empty studentId | 400 | 400 | PASS |
| Validation: empty programName | 400 | 400 | PASS |
| Validation: \| in a field | 400 naming the \| character | 400 | PASS |
| Validation: 1001 rows | 400 'At most 1000 rows per request' | 400 | PASS |
| Validation: malformed JSON | 400 | 400 | PASS |
| Validation: 3 MB body | 413 | 413 | PASS |
| Validation: unknown mode | 400 | 400 | PASS |
| Analyze: groups, conflicts, no chain writes | 2 groups, 1 conflict, block number unchanged | as expected | PASS |
| Grouped: S1/S2/S1 | 2 issued, 1 failed, 2 groups, exact duplicate message | 2 / 1 / 2, 'Duplicate of an earlier row in this batch' | PASS |
| Grouped: batchId and merkleRoot set | both set, no rootError | as expected | PASS |
| Grouped: 50 rows in one block | blocksUsed 1, one distinct block number | 1 / 1 | PASS |
| Files: S1/S2 verify | commitment recomputes, verifyCredential true, Merkle proof matches batches(id) | 2 files | PASS |
| Files: all 50 verify | same | 50 files | PASS |
| Out-file written | 50 credentials with proofs | as expected | PASS |
| Sequential: one block per row | 10 rows, 10 blocks | 10 / 10 | PASS |
| Two concurrent requests | both succeed (the lock) | 10 + 10 issued | PASS |
| Root failure: issuer deregistered mid-batch (sequential, 40 rows) | 200, some files kept, rootError, null root | 200, 18 files kept, rootError 'Not a registered institution' | PASS |
| Node killed mid-request (200 rows, sequential) | no hang; 200, 500 or 503 | 200 after 3.0 s, 74 files, rootError 'Transaction failed' | PASS |
| Node down: health | node: down | node: down | PASS |
| Node down: issue | 503 'Cannot reach the blockchain node at ...' | 503 with the node URL | PASS |

Benchmark output (`--bench`): 20 rows sequential 680 ms (680, 675, 687), grouped 178 ms (178, 178, 183), 3.8x. 50 rows sequential 1577 ms (1671, 1577, 1573), grouped 281 ms (265, 281, 284), 5.6x.

## 4. Frontend, every route in a real browser

Headless Edge (Chromium) with an in-page EIP-1193 stand-in wallet (accounts #0 to #5 as needed, optional wrong chain id, optional "user rejected" for sends). Each case opens a fresh tab. The script creates its own chain fixtures (a second institution, early and late credentials around a cutoff, a batch with a duplicate, a revoked credential). Observed text is trimmed to a snippet.

### Home

| Case | Expected | Observed | Result |
|---|---|---|---|
| live stats show real numbers | /^2 Active institutions \d+ Credentials \d+ Batches 1 Revoked$/ | 2 Active institutions 5 Credentials 1 Batches 1 Revoked | PASS |
| no console errors | /^0$/ | 0 | PASS |
| offline state | /Node offline/ | Academic credentials you can check, and no unregistered wallet can issue. Systems like Block.co anchor a document hash on a blockchain. That proves the document was not changed, but not who published it. Anyone with a wa | PASS |

### Verify

| Case | Expected | Observed | Result |
|---|---|---|---|
| valid batch file: VALID, details and batch proof | /Valid.*Checks out against the stored Merkle root.*V1-/ | Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or press to choose one Or paste a commitment A commitment shows validity, issuer a | PASS |
| altered file: ALTERED, no chain call | /Altered file/ | Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or press to choose one Or paste a commitment A commitment shows validity, issuer a | PASS |
| revoked credential by file: REVOKED | /Revoked/ | Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or press to choose one Or paste a commitment A commitment shows validity, issuer a | PASS |
| not found: random commitment | /Not found/ | Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or press to choose one Or paste a commitment A commitment shows validity, issuer a | PASS |
| pasted valid hash: VALID without student details | /Valid(?!.*Awarded to V)/ | Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or press to choose one Or paste a commitment A commitment shows validity, issuer a | PASS |
| bad hash format: inline error, no lookup | /Enter 0x followed by 64 hex/ | Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or press to choose one Or paste a commitment A commitment shows validity, issuer a | PASS |
| wrong-chain file: refused, no lookup | /issued on chain 1, contract/ | Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or press to choose one Or paste a commitment A commitment shows validity, issuer a | PASS |
| wrong-contract file: refused, no lookup | /issued on chain 31337, contract 0x0000000000000000000000000000000000000001/ | Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or press to choose one Or paste a commitment A commitment shows validity, issuer a | PASS |
| issuer-mismatch file: ledger result plus warning | /Valid.*different issuer/ | Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or press to choose one Or paste a commitment A commitment shows validity, issuer a | PASS |
| batch array file: picker, then verify the chosen entry | /Valid.*V3/ | Choose a credential V1-612970 · BTech V2-612970 · BTech V3-612970 · BSc => Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or pres | PASS |
| not JSON | /not valid JSON/ | Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or press to choose one Or paste a commitment A commitment shows validity, issuer a | PASS |
| wrong format | /not a ScholarLedger credential file/ | Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or press to choose one Or paste a commitment A commitment shows validity, issuer a | PASS |
| \| in a file field | /character that is not allowed/ | Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or press to choose one Or paste a commitment A commitment shows validity, issuer a | PASS |
| works with no wallet installed | /Valid/ | undefined Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or press to choose one Or paste a commitment A commitment shows validity | PASS |
| deregistered issuer, credential issued BEFORE the cutoff: still VALID | /Valid/ | Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or press to choose one Or paste a commitment A commitment shows validity, issuer a | PASS |
| deregistered issuer, credential issued AFTER the cutoff: ISSUER DEREGISTERED | /Issuer deregistered/ | Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or press to choose one Or paste a commitment A commitment shows validity, issuer a | PASS |
| lookup with the node down | /Cannot reach the blockchain node/ | Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or press to choose one Or paste a commitment A commitment shows validity, issuer a | PASS |

### Issue

| Case | Expected | Observed | Result |
|---|---|---|---|
| success: confirmed, certificate, file download that verifies on chain | /Confirmed in block.*"ok":true/ | Confirmed in block 15 "ok":true | PASS |
| empty fields: inline errors, nothing sent | /Student ID is required.*Program name is required/ | Issue a credential Your wallet signs a salted commitment. The student details never go on the chain. Student ID Student ID is required. Program Program name is required. Additional details (optional) For example graduati | PASS |
| \| in a field: inline error | /The \\| character is not allowed/ | Issue a credential Your wallet signs a salted commitment. The student details never go on the chain. Student ID The \| character is not allowed. Program Additional details (optional) For example graduation year or honours | PASS |
| wrong chain: refused, no "Credential issued" | /^(?!.*Credential issued).*Your wallet is on chain 1/ | Issue a credential Your wallet signs a salted commitment. The student details never go on the chain. Student ID Program Additional details (optional) For example graduation year or honours. Stored only in the credential  | PASS |
| wallet cancel: plain message | /rejected the signature request/ | Issue a credential Your wallet signs a salted commitment. The student details never go on the chain. Student ID Program Additional details (optional) For example graduation year or honours. Stored only in the credential  | PASS |
| non-issuer wallet (#5): refused in plain English | /not a registered institution/ | Issue a credential Your wallet signs a salted commitment. The student details never go on the chain. Student ID Program Additional details (optional) For example graduation year or honours. Stored only in the credential  | PASS |
| no wallet installed | /No wallet found/ | Issue a credential Your wallet signs a salted commitment. The student details never go on the chain. Student ID Program Additional details (optional) For example graduation year or honours. Stored only in the credential  | PASS |

### Batch

| Case | Expected | Observed | Result |
|---|---|---|---|
| CSV upload fills the table, Analyze shows groups and the conflict | /Rows 4 Conflicts 1 Groups 2/ | Rows 4 Conflicts 1 Groups 2 | PASS |
| Execute: results, amber duplicate bar, Download all verifies on the Verify page | /Succeeded 3 Failed 1.*aborted=1.*dl=3.*Valid/ | Succeeded 3 Failed 1 aborted=1 dl=3 Valid | PASS |
| Compare with sequential: speedup and two timelines | /\d+\.\d\S* svgs=2/ | 4.1× svgs=2 | PASS |
| empty table: asks for a row | /Add at least one row/ | Batch issue Issue many credentials at once. The service signs with the demo issuer key, so no wallet is needed here. Rows for the same student and program conflict, so they go into different groups. Rows in a group do no | PASS |
| \| in a row: the service refuses (400) | /the \\| character is not allowed/ | Batch issue Issue many credentials at once. The service signs with the demo issuer key, so no wallet is needed here. Rows for the same student and program conflict, so they go into different groups. Rows in a group do no | PASS |
| service down | /Cannot reach the batch service/ | Batch issue Issue many credentials at once. The service signs with the demo issuer key, so no wallet is needed here. Rows for the same student and program conflict, so they go into different groups. Rows in a group do no | PASS |
| frontend built without the token gets 401 | /Missing or wrong API token/ | Batch issue Issue many credentials at once. The service signs with the demo issuer key, so no wallet is needed here. Rows for the same student and program conflict, so they go into different groups. Rows in a group do no | PASS |

### Revoke

| Case | Expected | Observed | Result |
|---|---|---|---|
| by file: confirmed, then Verify shows REVOKED | /Confirmed in block.*Revoked/ | Confirmed in block 44 Revoked | PASS |
| by pasted hash: confirmed | /Confirmed in block/ | Revoke a credential Only the institution that issued a credential can revoke it. Revocation is permanent. Upload the credential file Fills in the commitment for you Or paste the commitment Revoke credential Confirmed in  | PASS |
| already revoked | /already revoked/ | Revoke a credential Only the institution that issued a credential can revoke it. Revocation is permanent. Upload the credential file Fills in the commitment for you Or paste the commitment Revoke credential This credenti | PASS |
| wrong issuer (#2 revoking a Demo University credential) | /Only the institution that issued/ | Revoke a credential Only the institution that issued a credential can revoke it. Revocation is permanent. Upload the credential file Fills in the commitment for you Or paste the commitment Revoke credential Waiting for y | PASS |
| wrong chain | /Your wallet is on chain 1/ | Revoke a credential Only the institution that issued a credential can revoke it. Revocation is permanent. Upload the credential file Fills in the commitment for you Or paste the commitment Revoke credential Your wallet i | PASS |
| bad hash format: inline error | /Enter 0x followed by 64 hex/ | Revoke a credential Only the institution that issued a credential can revoke it. Revocation is permanent. Upload the credential file Fills in the commitment for you Or paste the commitment Enter 0x followed by 64 hex cha | PASS |
| altered file refused | /altered/ | Revoke a credential Only the institution that issued a credential can revoke it. Revocation is permanent. Upload the credential file Fills in the commitment for you This file has been altered: its details do not match it | PASS |

### Register

| Case | Expected | Observed | Result |
|---|---|---|---|
| header says 2 of 3 and lists three admins | /2 of 3.*Admins/ | Register an institution Admin actions need 2 of 3 admins to approve. Admins 0xf39F…2266 Copy you 0x90F7…b906 Copy 0x15d3…6A65 Copy Propose registration Wallet address Institution name Domain Propose registration Propose  | PASS |
| propose: shows 1 / 2 Waiting and the target is NOT registered | /1 \/ 2 .*Waiting.*registered=false/ | Register an institution Admin actions need 2 of 3 admins to approve. Admins 0xf39F…2266 Copy you 0x90F7…b906 Copy 0x15d3…6A65 Copy Propose registration Wallet address Institution name Domain Propose registration Confirme | PASS |
| double approve: the proposer cannot approve again (button disabled) | /disabled=true/ | disabled=true | PASS |
| non-admin (#5): forms and Approve disabled, note shown | /disabledFieldsets=2 approve=true Connect an admin wallet/ | disabledFieldsets=2 approve=true Connect an admin wallet to propose or approve. | PASS |
| second admin approves: executed and registered | /Approved and executed: Third University is now registered.*registered=true/ | Approved and executed: Third University is now registered. registered=true | PASS |
| wrong chain: refused before anything is sent | /Your wallet is on chain 1/ | Register an institution Admin actions need 2 of 3 admins to approve. Admins 0xf39F…2266 Copy you 0x90F7…b906 Copy 0x15d3…6A65 Copy Propose registration Wallet address Institution name Domain Propose registration Your wal | PASS |
| validation: bad address and empty name | /Enter a valid Ethereum address.*Institution name is required/ | Register an institution Admin actions need 2 of 3 admins to approve. Admins 0xf39F…2266 Copy you 0x90F7…b906 Copy 0x15d3…6A65 Copy Propose registration Wallet address Enter a valid Ethereum address (0x followed by 40 hex | PASS |
| duplicate proposal for an active institution is refused | /was registered before/ | Register an institution Admin actions need 2 of 3 admins to approve. Admins 0xf39F…2266 Copy you 0x90F7…b906 Copy 0x15d3…6A65 Copy Propose registration Wallet address Institution name Domain Propose registration This add | PASS |
| propose + approve deregistration with a cutoff: executed | /Approved and executed: the institution is now deregistered/ | Register an institution Admin actions need 2 of 3 admins to approve. Admins 0xf39F…2266 Copy 0x90F7…b906 Copy you 0x15d3…6A65 Copy Propose registration Wallet address Institution name Domain Propose registration Propose  | PASS |
| page with the node down | /Cannot reach the blockchain node/ | Register an institution Admin actions need approval from several admins. Cannot reach the blockchain node. Start it with "npx hardhat node". (is the node running?) Connect an admin wallet to propose or approve. Propose r | PASS |

### Forgery demo

| Case | Expected | Observed | Result |
|---|---|---|---|
| unregistered wallet (#5): refused, REJECTED stamp | /Refused by the contract.*Rejected/i | Forgery demo The Block.co attack, side by side. The same forged hash goes to a hash-only system and to ScholarLedger. Forged hash: 0x82f4…8490 Copy Hash-only system Simulated Anchoring a hash needs no proof of who you ar | PASS |
| registered wallet (#1): note shown, button disabled | /would succeed.*disabled=true/ | would succeed disabled=true | PASS |
| wallet cancel wording | /You cancelled in the wallet/ | Forgery demo The Block.co attack, side by side. The same forged hash goes to a hash-only system and to ScholarLedger. Forged hash: 0x7c68…1a50 Copy Hash-only system Simulated Anchoring a hash needs no proof of who you ar | PASS |
| wrong network wording | /Wrong network/ | Forgery demo The Block.co attack, side by side. The same forged hash goes to a hash-only system and to ScholarLedger. Forged hash: 0x48c4…f3a6 Copy Hash-only system Simulated Anchoring a hash needs no proof of who you ar | PASS |
| node down wording (wallet cannot reach its node) | /Cannot reach the node/ | Forgery demo The Block.co attack, side by side. The same forged hash goes to a hash-only system and to ScholarLedger. Forged hash: 0x579d…e3e6 Copy Hash-only system Simulated Anchoring a hash needs no proof of who you ar | PASS |
| simulated side accepts the forged hash | /Accepted. Verifier says valid/ | Forgery demo The Block.co attack, side by side. The same forged hash goes to a hash-only system and to ScholarLedger. Forged hash: 0xafc8…10ca Copy Hash-only system Simulated Anchoring a hash needs no proof of who you ar | PASS |
| wallet and node down wording | /Cannot reach the node/ | Forgery demo The Block.co attack, side by side. The same forged hash goes to a hash-only system and to ScholarLedger. Forged hash: 0xa6ef…ad5e Copy Hash-only system Simulated Anchoring a hash needs no proof of who you ar | PASS |

### Ledger

| Case | Expected | Observed | Result |
|---|---|---|---|
| three badges: Valid, Revoked, Issuer deregistered | /^(?=.*Valid)(?=.*Revoked)(?=.*Issuer deregistered)/ | Revoked Valid Issuer deregistered | PASS |
| filter by commitment narrows the list to one row | /^1$/ | 1 | PASS |
| row click opens Verify with that commitment | /\/verify\?c=0x.*Valid\|\/verify\?c=0x.*Revoked\|\/verify\?c=0x.*Issuer/ | /verify?c=0x626bc481973732695912a4bf241473587fe1361401450f27ed0d8e60f51aaa5c Verify a credential Upload the credential file the graduate gave you. No wallet is needed. Upload credential file Drop a .json file here, or pr | PASS |
| no match: designed empty state | /No credentials yet/ | The ledger Every credential and batch on the chain. Only commitments appear here, never student details. Credentials Batches Filter No credentials yet. Register an institution, then issue a credential or run a batch. Ent | PASS |
| Batches tab lists batches with roots | /Merkle root/ | The ledger Every credential and batch on the chain. Only commitments appear here, never student details. Credentials Batches Filter Batch Merkle root Issuer Credentials Date 3 0xc0ee…2eac Copy Demo University 20 Nov 22,  | PASS |
| offline state | /Cannot reach the blockchain node\|No data to show/ | The ledger Every credential and batch on the chain. Only commitments appear here, never student details. Cannot reach the blockchain node. Start it with "npx hardhat node". Credentials Batches Filter No data to show. | PASS |

### Navbar

| Case | Expected | Observed | Result |
|---|---|---|---|
| wrong-network chip appears | /expected 31337/ | Ethereum (expected 31337) | PASS |
| keyboard dropdowns: open, move, Esc returns focus, outside click closes | /^Institution:true Admin:true Explore:true outside:true$/ | Institution:true Admin:true Explore:true outside:true | PASS |
| phone menu opens and lists every group | /Verify.*Institution.*Admin.*Explore/ | Verify Institution Issue Batch issue Revoke Admin Register institution Explore Ledger Forgery demo Connect wallet | PASS |

### Phone 375px

| Case | Expected | Observed | Result |
|---|---|---|---|
| /: no horizontal scroll, no page errors | /scroll=ok errors=0/ | scroll=ok errors=0 | PASS |
| /verify: no horizontal scroll, no page errors | /scroll=ok errors=0/ | scroll=ok errors=0 | PASS |
| /issue: no horizontal scroll, no page errors | /scroll=ok errors=0/ | scroll=ok errors=0 | PASS |
| /batch: no horizontal scroll, no page errors | /scroll=ok errors=0/ | scroll=ok errors=0 | PASS |
| /revoke: no horizontal scroll, no page errors | /scroll=ok errors=0/ | scroll=ok errors=0 | PASS |
| /register: no horizontal scroll, no page errors | /scroll=ok errors=0/ | scroll=ok errors=0 | PASS |
| /explorer: no horizontal scroll, no page errors | /scroll=ok errors=0/ | scroll=ok errors=0 | PASS |
| /demo: no horizontal scroll, no page errors | /scroll=ok errors=0/ | scroll=ok errors=0 | PASS |

## 5. Screenshots

All of `docs/screenshots/` was retaken from the final build: desktop light and mobile dark for every route, plus the batch timeline with the amber aborted duplicate (`batch-timeline.png`), the grouped-versus-sequential comparison (`batch-compare.png`), the Register page with a proposal at 1 / 2, the forgery sequence, altered and revoked files at 375 px, and the node-offline states.

## 6. Open items (not fixed, by design or out of scope)

- Frontend dependency advisories need major upgrades (`vite@8`, `react-router-dom@7`); the repo-root ones are in dev tooling.
- If the node dies in the middle of a batch the service returns what it has (the mid-kill run returned 74 files and `rootError: "Transaction failed"`); the node may also be left with automine off if the batch service itself is killed, then restart the node.
- The CSV reader splits on commas and does not handle quoted fields (a hint says so on the Batch page).
- The e2e root-failure case permanently deregisters Hardhat #1, so it is behind `--destructive`.
- The limitations in the README stay as written (single batch-service issuer key, admin set fixed at deployment, no proposal expiry or cancellation, events read from block 0, and so on).
