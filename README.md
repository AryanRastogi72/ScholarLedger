# 🎓 ScholarLedger

**A Forgery-Resistant Blockchain Credentialing System**  
*CSD436 Blockchain Technology — Midsem Prototype*

---

## 📖 Overview
Existing blockchain credential systems often suffer from an **identity-spoofing vulnerability**—they anchor a document hash to the blockchain but fail to securely bind the *issuer's true identity* to their cryptographic key. 

**ScholarLedger** solves this by introducing a decentralized identity registry. It enforces strict authorization at the smart contract level, ensuring that only verified universities can issue credentials.

## ✨ Key Features
- **🔐 Identity-Bound Issuance:** The `InstitutionRegistry` smart contract ensures only admin-whitelisted accounts can issue degrees.
- **⛓️ Cryptographic Anchoring:** Student metadata is securely hashed using SHA-256 before being committed to the Ethereum blockchain, preserving privacy.
- **⚡ Instant Verification:** Employers can verify the authenticity, issuer, and timestamp of a credential in seconds.
- **🛡️ Forgery Prevention:** Built-in safeguards actively reject unauthorized issuance attempts (demonstrating the mitigation of the Block.co spoofing vulnerability).

## 🛠️ Tech Stack
- **Smart Contracts:** Solidity `^0.8.20`
- **Blockchain Network:** Local Ethereum Dev Environment (Hardhat)
- **Frontend UI:** React + Vite (Plain CSS)
- **Web3 Library:** ethers.js v6

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18+ recommended)
- [MetaMask](https://metamask.io/) browser extension

### 1. Start the Blockchain
Open a terminal in the project root and start your local Ethereum node:
```bash
npm install
npx hardhat node
```
*Keep this terminal running. It hosts the local blockchain at `http://127.0.0.1:8545`.*

### 2. Deploy the Contracts
Open a **second terminal** and deploy the smart contracts to your local network:
```bash
npx hardhat run scripts/deploy.js --network localhost
```

### 3. Start the Frontend Application
In the same second terminal, navigate to the frontend folder and start the UI:
```bash
cd frontend
npm install
npm run dev
```
*The web application will open at `http://localhost:3000`.*

### 4. MetaMask Configuration
To interact with the local blockchain:
1. Open MetaMask and go to Settings > Networks > Add Network manually:
   - **Network Name:** Hardhat Localhost
   - **RPC URL:** `http://127.0.0.1:8545`
   - **Chain ID:** `31337`
   - **Currency Symbol:** `ETH`
2. Import the first Hardhat test account (Account #0) using its private key provided in the terminal. This account acts as the system **Admin** and has permission to register institutions.

---
*Developed by Aryan Rastogi (2310110439) & Raghav Garg (2310110697) for CSD436.*
