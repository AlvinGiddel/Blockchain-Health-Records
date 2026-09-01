# Zetech University - Blockchain Health Records

> **Research Project:** Decentralized Cryptographic Electronic Health Records Ledger for Low-Resource Environments  
> **Institution:** Zetech University — Faculty of Computing and Information Technology  
> **Researcher:** Alvin Giddel Muting'a  
> **Academic Year:** 2026  
> **Status:** Code Frozen & Production Ready

---

## 🌟 Executive Summary

This system provides a secure, decentralized, patient-centered Electronic Health Records (EHR) management platform tailored for low-resource clinical settings and community health workflows. It bridges modern web engineering (**React SPA / Vite**) with a cryptographically enforced backend (**Node.js / Express / PostgreSQL / Proof-of-Work Blockchain**) to eliminate single points of failure, prevent unauthorized tampering, ensure patient consent sovereignty, and guarantee non-repudiation of clinical records.

---

## 🚀 Key Architectural Pillars

### 1. 🔐 Cryptography & Non-Repudiation
- **RSA-2048 Asymmetric Key Pairs**: Automatically generated on user registration for Doctors and Patients.
- **Client-Side Digital Signatures**: Every diagnosis, prescription, and consultation record is digitally signed using the doctor's private key (`SHA-256withRSA`). Signatures are verified cryptographically before admission to the ledger.
- **AES-256-CBC Field-Level Encryption**: Sensitive patient diagnoses and treatments are encrypted at rest with unique Initialization Vectors (`IV`), rendering the raw database unreadable to unauthorized database operators.

### 2. ⛓️ Proof-of-Work Blockchain Ledger
- **SHA-256 Hashed Blocks**: Cryptographic block linking (`previousHash -> hash`) guarantees an immutable ledger timeline.
- **Autonomous Auto-Miner**:
  - **Threshold Mining (`MEMPOOL_THRESHOLD = 10`)**: Automatically seals and mines a block when the mempool reaches capacity.
  - **Timer Fallback (`MINE_INTERVAL_MS = 60000`)**: Periodically packages and mines straggler transactions to prevent delays during low-traffic periods.
  - **Concurrency Mutex Lock (`isMining`)**: Prevents race conditions and chain forking across simultaneous timer ticks, threshold hits, and manual admin triggers.
- **Manual Proof-of-Work Override**: Retained in the Admin Console for instant auditing and live demonstrations.

### 3. 🛡️ Clinical Access Control & Emergency Break-Glass
- **Patient-Centric Consent Control**: Patients can grant or revoke access to registered medical practitioners in real time.
- **Emergency Break-Glass Protocol**: In life-threatening emergencies where patient consent cannot be obtained, doctors can initiate a time-limited (1-hour) cryptographic override. Every break-glass activation is logged immutably to the audit ledger.
- **Specialist Consultation Notes**: Multi-practitioner collaboration allowing consultant specialists to attach clinical notes to existing records.

### 4. 🧪 Interactive Security Attack Lab & Self-Healing
- **Tamper Simulation**: Allows examiners to intentionally alter records directly in the SQL database.
- **Instant Tamper Detection**: The chain validation algorithm immediately identifies hash mismatches, flagging the network as **COMPROMISED (RED)**.
- **Ledger Self-Healing Recovery**: Administrators can trigger one-click recovery, restoring corrupted PostgreSQL rows using valid cryptographic block snapshots.

---

## 🏗️ System Architecture

```
                                  +---------------------------------------+
                                  |            Responsive UI              |
                                  |         (Vite + React 18 SPA)         |
                                  +-------------------+-------------------+
                                                      |
                                           HTTPS / REST API Requests
                                                      |
                                                      v
                                  +-------------------+-------------------+
                                  |         Express.js API Layer          |
                                  |     (Auth, Validation, Mutex)         |
                                  +---------+-------------------+---------+
                                            |                   |
                                            v                   v
                     +----------------------+----+      +-------+-------------------+
                     |    PostgreSQL (Supabase)  |      |   In-Memory Ledger Core   |
                     |  - AES-256 Encrypted Rows |      |  - Proof-of-Work Engine   |
                     |  - Audit Trail & Logs     |      |  - Mempool Auto-Miner     |
                     +---------------------------+      +---------------------------+
```

---

## 📂 Project Structure

```
block-health-chain-project/
├── api/                       # Vercel Serverless Function entry point
│   └── index.js
├── backend/                   # Node.js / Express API Server
│   ├── .env                   # Local backend environment variables
│   ├── .env.example           # Environment template
│   ├── blockchain.js          # Core Blockchain, Block, and RSA Cryptography classes
│   ├── db.js                  # PostgreSQL (Supabase) connection pool
│   ├── mailer.js              # Email notification and reset dispatch
│   ├── server.js              # Express API server, routes, and auto-miner engine
│   └── supabase_schema.sql    # DDL schema definition with indexes
├── frontend/                  # Vite + React Frontend Application
│   ├── src/
│   │   ├── components/        # Portals (Patient, Doctor, Admin, Explorer, Lab)
│   │   ├── utils/             # API helpers and cryptographic formatters
│   │   ├── App.jsx            # Main SPA orchestrator and route state
│   │   └── main.jsx           # React DOM root
│   └── package.json
├── run.ps1                    # Portable one-click startup orchestrator (Windows)
├── setup.ps1                  # Portable environment initialization script
├── stop.ps1                   # Graceful process terminator script
├── system_documentation.md    # Detailed technical and schema specification
└── README.md                  # Project overview and instructions
```

---

## ⚙️ Environment Configuration

Create a `.env` file in the `backend/` directory (or configure variables in Vercel / Render):

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Server listening port | `5000` |
| `DATABASE_URL` | PostgreSQL connection URI (Supabase pooler) | *Required* |
| `JWT_SECRET` | Secret key for signing session tokens | *Required* |
| `ENCRYPTION_KEY` | 32-byte (64 hex character) key for AES-256-CBC | *Required* |
| `MEMPOOL_THRESHOLD`| Pending records count required to trigger auto-mining | `10` |
| `MINE_INTERVAL_MS` | Fallback interval (in ms) to mine pending records | `60000` |
| `ENABLE_KEEP_ALIVE`| Render self-ping keep-alive toggle (`true`/`false`) | `false` |

---

## 🚦 Quick Start & Execution

### Option A: Portable One-Click Run (Windows)
No global Node.js installation required.

1. **Initialize Dependencies (First time only):**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\setup.ps1
   ```
2. **Start Backend & Frontend:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\run.ps1
   ```
3. **Access Application:**
   - Frontend UI: `http://localhost:3000`
   - Backend API: `http://localhost:5000`

4. **Stop System:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\stop.ps1
   ```

### Option B: Manual Startup

```bash
# Start Backend
cd backend
npm install
node server.js

# Start Frontend (in a separate terminal)
cd frontend
npm install
npm run dev
```

---

## 🧪 Academic Verification & Demo Flow

1. **Patient & Doctor Onboarding**: Register a Doctor and a Patient. Inspect generated RSA public/private keys.
2. **Clinical Consultation**: Doctor creates a consultation note and writes a prescription. The record is digitally signed with RSA and broadcast to the mempool.
3. **Autonomous Block Mining**: Watch the Auto-Miner batch the record into a block (or click "Mine Pending Block" in the Admin Panel).
4. **Blockchain Explorer**: Review Block #1 on the ledger, inspecting nonce, timestamp (Kenyan EAT), SHA-256 hash, and digital signature.
5. **Security Attack Lab (Tamper Detection)**: Simulate a SQL injection / database modification on a diagnosis. Witness the validation engine flag the chain as **COMPROMISED (RED)**.
6. **Ledger Self-Healing**: Click **"Recover from Ledger"** to restore database integrity and return network status to **SECURE (GREEN)**.

---

## 📜 Academic Certification

This software has undergone structural verification, cryptographic integrity testing, and a formal code freeze in fulfillment of academic requirements at **Zetech University**.
