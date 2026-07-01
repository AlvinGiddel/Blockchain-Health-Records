# Zetech University - Blockchain Health Records

A research implementation for the Faculty of Computing and Information Technology at Zetech University, submitted in partial fulfillment of the requirements for the award of the Diploma in Information Technology.

**Researcher:** Alvin Giddel Muting'a  
**Year:** 2026

---

## Project Overview

This system is a secure, decentralized, and patient-centered health records application designed for low-resource environments. It combines a **React frontend** and an **Express/MongoDB backend** to manage sensitive medical documents securely using cryptographic keys, digital signatures, and a distributed ledger design.

### Key Features

1. **Role-Based Portals**:
   - **Patients**: Access decrypted diagnostic reports, view allergy histories, verify cryptographic digital signatures, and review block indexes.
   - **Doctors**: Register clinical profiles, browse the patient registry, create diagnoses/prescriptions, and digitally sign medical records client-side.
2. **State-of-the-Art Security & Regulations**:
   - **AES-256 Field Encryption**: Patient diagnoses and treatments are encrypted at rest in MongoDB. Even with direct database access, a hacker cannot read the records without the decryption key.
   - **RSA-2048 Digital Signatures**: Every medical entry must be signed by the doctor's private key. The record is rejected by the ledger if the signature doesn't match the public key.
3. **Decentralized Ledger Engine**:
   - **Proof of Work (PoW)**: Doctor-signed records sit in the Mempool until mined into a cryptographic block using a proof-of-work algorithm (mining).
   - **Cryptographic Hashing**: Blocks are linked using SHA-256 hashes, creating an immutable sequence of medical events.
4. **InterPlanetary File System (IPFS) Simulator**:
   - Large attachment scans are indexed using mock IPFS CIDs (`Qm...`) to represent off-chain decentralized file storage, optimizing block weight.
5. **Interactive Security Attack Laboratory**:
   - Allows students or examiners to directly edit/tamper with diagnoses in MongoDB (bypassing ledger signatures) and witness the ledger explorer immediately flagging the compromised block and breaking the cryptographic hash chain (turning it Red).

---

## System Architecture

```
                       +-----------------------------------+
                       |           User Interface          |
                       |       (Vite React Frontend)       |
                       +-----------------+-----------------+
                                         |
                                         v
                       +-----------------+-----------------+
                       |         Application Layer         |
                       |      (Express.js API Server)      |
                       +--------+-----------------+--------+
                                |                 |
                                v                 v
               +----------------+---+   +---------+--------+
               |  Database Storage  |   |  Ledger Engine   |
               | (MongoDB w/ AES)   |   | (Crypto Blocks)  |
               +--------------------+   +------------------+
```

---

## Portability & Setup

This application has been engineered to run **portably** on standard Windows machines. You do **not** need to install Node.js, npm, or MongoDB globally on your computer.

### Step 1: Initialize the Environment (First-time run)
Open **PowerShell** in the project directory and execute:
```powershell
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```
This script will:
- Download and extract portable Node.js (v20) to `.tools\node`.
- Download and extract portable MongoDB Community Server to `.tools\mongodb`.
- Automatically initialize the local MongoDB database directories.

### Step 2: Start the System
In the same folder, run:
```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1
```
This orchestrator will:
- Launch MongoDB in a minimized background console.
- Launch the Node/Express backend in a separate terminal window (so you can view API logs).
- Run the React Web App and automatically open it in your browser (`http://localhost:3000`).

---

## Academic Verification Scenarios

### Scenario A: Adding and Mining Records
1. Register a Doctor account (fill in license and hospital details).
2. Register a Patient account (fill in vitals and allergies).
3. Log in as the Doctor, select the Patient from the registry, write a diagnosis/treatment, and click **Sign & Broadcast**.
4. Navigate to the **Ledger Explorer** and click **Mine Block** to watch the Proof-of-Work algorithm solve the nonce and write the record to the immutable blockchain.
5. Log in as the Patient, navigate to **My Health Folder**, and verify that the record is decrypted, signed, and locked inside Block #1.

### Scenario B: Demonstrating Chain Integrity (Tamper Check)
1. In the **Ledger Explorer** (logged in as Doctor), scroll down to the **Security Attack Lab**.
2. Select a mined medical record from the dropdown, write a corrupted diagnosis (e.g. "Completely Healthy"), and click **Force Database Edit**.
3. Watch the ledger color code change: the chain validator immediately highlights the tampered block in **Red**, indicating that the database hash no longer links back to the previous block, highlighting the security strength of blockchain technology in EHRs!
