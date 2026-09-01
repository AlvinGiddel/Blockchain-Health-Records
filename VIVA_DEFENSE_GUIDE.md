# Zetech University - Blockchain Health Records
## 🎓 Final Project Defense & Viva Presentation Guide

**Researcher:** Alvin Giddel Muting'a  
**Faculty:** Computing and Information Technology, Zetech University  
**Project:** Decentralized Cryptographic Electronic Health Records Ledger for Low-Resource Environments  

---

## 🎯 1. 5-Minute Live Presentation Script

### Phase 1: Problem Statement & Motivation (1 Minute)
> *"In rural and low-resource healthcare clinics, medical records are either paper-based or stored on vulnerable centralized databases. Centralized systems suffer from three major vulnerabilities: single points of failure, vulnerability to unauthorized tampering, and lack of patient sovereignty over who views their medical data.  
> Our research delivers a decentralized, cryptographically enforced health records platform that guarantees non-repudiation, immutable auditability, and emergency access without compromising patient privacy."*

### Phase 2: Core Architecture & Cryptographic Flow (1.5 Minutes)
> *"The system uses a three-layer security model:  
> 1. **Identity & Non-Repudiation**: On registration, every doctor and patient receives an RSA-2048 cryptographic key pair. Every medical diagnosis, prescription, or consultation is digitally signed using SHA-256withRSA. If a record is altered by even one character, the cryptographic signature check fails.  
> 2. **Confidentiality**: Diagnoses and treatments are encrypted at rest using AES-256-CBC with unique random IVs. Even with root database access, attackers cannot read patient medical data without the key.  
> 3. **Autonomous Blockchain Ledger**: Signed records enter a memory pool (mempool). Our newly implemented Auto-Miner batches records using a threshold trigger (10 records) and a fallback timer (60s), secured by a concurrency mutex lock to prevent double-mining. Each block links to its predecessor via SHA-256 hashes."*

### Phase 3: Live System Demonstration (2 Minutes)
1. **Patient Consent & Doctor Consultation**:
   - Show Patient granting consent to Doctor.
   - Doctor fills out consultation dossier, signs it cryptographically, and broadcasts it to the ledger pool.
2. **Blockchain Explorer & Block Sealing**:
   - Show the block mined by Proof-of-Work.
   - Inspect Block #1: Show Nonce, Kenyan EAT timestamp, block hash, and RSA doctor signature.
3. **Security Attack Lab (Tamper Detection)**:
   - Navigate to the Security Attack Lab.
   - Pick a record and simulate a direct database alteration (e.g. changing diagnosis to `Healthy`).
   - The chain validator immediately detects the hash mismatch and changes the network banner to **COMPROMISED (RED)**.
4. **Ledger Self-Healing Recovery**:
   - Click **"Recover from Ledger"**.
   - Show the system recalculating valid cryptographic hashes from the immutable block ledger and restoring PostgreSQL to **SECURE (GREEN)**.

### Phase 4: Emergency Break-Glass & Specialist Notes (0.5 Minutes)
> *"For life-or-death emergencies where patients are unconscious, we implemented a 1-hour time-limited Emergency Break-Glass protocol that unlocks patient records while permanently recording an immutable audit trail."*

---

## 💡 2. Anticipated Viva Defense Questions & Winning Answers

### Q1: Why not just use a traditional PostgreSQL database with role permissions?
**Answer:**  
> *"Traditional databases are vulnerable to internal administrators or compromised DB credentials who can modify historical rows without detection (silent tampering). In our blockchain architecture, historical records are sealed in cryptographic blocks linked by SHA-256 hashes. If any past database row is altered, the entire subsequent hash chain breaks immediately, alerting the system and enabling self-healing from the ledger."*

### Q2: How does your Auto-Miner work and why did you add a concurrency lock?
**Answer:**  
> *"The Auto-Miner uses a hybrid dual-trigger design:  
> - A **Threshold Trigger** mines a block when the mempool reaches 10 records for high-traffic batching.  
> - A **Fallback Timer (60s)** mines straggler records during slow clinical hours so patient records don't wait indefinitely.  
> We implemented an `isMining` mutex lock to ensure that if a threshold is hit at the exact same millisecond a timer ticks or an admin clicks manual mine, only one mining execution runs. This prevents race conditions and chain index duplication."*

### Q3: Why is 'Recover from Ledger' left as a manual admin action instead of automatic?
**Answer:**  
> *"In cybersecurity and forensic auditing, silent automatic repair of a database breach is dangerous because administrators would never know an unauthorized intrusion or credential leak occurred. Keeping recovery as an explicit admin action allows the security team to investigate the breach alert, audit the attack vector, and consciously execute the self-healing protocol."*

### Q4: How is patient privacy maintained if blockchain data is decentralized?
**Answer:**  
> *"We utilize a hybrid on-chain / off-chain design:  
> 1. Raw sensitive diagnosis text is never stored in plain text; it is encrypted with AES-256-CBC.  
> 2. The blockchain stores cryptographic hashes, digital signatures, block metadata, and encrypted payloads.  
> 3. Large medical image scans are referenced via IPFS Content Identifiers (CIDs) rather than bloated on-chain storage."*

### Q5: What makes this solution suitable for low-resource clinics in Kenya / Africa?
**Answer:**  
> *"1. It runs portably on standard Windows computers without heavy cloud infrastructure.  
> 2. The Proof-of-Work difficulty is tuned for instant sub-second verification on low-power hardware.  
> 3. Timestamps are formatted in East Africa Time (EAT, UTC+3) for regulatory alignment with Kenyan healthcare standards.  
> 4. The frontend is lightweight and responsive for basic clinic desktop and mobile tablets."*

---

## 📋 3. Code Freeze Checklist

- [x] Backend syntax verified (`node --check server.js`)
- [x] Mempool auto-mine & mutex tested
- [x] RSA-2048 keypairs & SHA-256withRSA signature verification active
- [x] AES-256-CBC field encryption active
- [x] Emergency Break-Glass protocol active
- [x] Security Attack Lab & Self-Healing tested
- [x] Documentation & README updated
- [x] Changes committed & pushed to GitHub main
