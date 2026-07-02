# System Architecture, Requirements, and Database Specification
**Institution:** Zetech University — Faculty of Computing and Information Technology  
**Research Title:** Decentralized Cryptographic Electronic Health Records Ledger for Low-Resource Environments  
**System Specification Document: Responsive Web Application**  

---

## 1. System Architecture

The system is structured as a responsive, multi-portal **React Web Application** running on a lightweight **Vite** frontend platform, communicating via HTTPS with a **Node.js/Express** backend API layer. Data storage is split between a secure **PostgreSQL** database (hosted on Supabase) for transaction records and an in-memory **Blockchain Ledger Engine** that implements consensus rules, cryptographic linkage, and proof-of-work mining.

### Architecture Topology Diagram
```mermaid
graph TD
    subgraph Client Layer (Responsive Web UI)
        ReactWeb["Vite React Web App (Desktop/Mobile Browsers)"]
        RSAKeyPair["Client-Side Key Generator (RSA-2048)"]
        CryptoSign["Client-Side Signature Solver (SHA-256)"]
    end
    
    subgraph Application Layer (Node.js API Server)
        ExpressAPI["Express.js Server (Port 5000)"]
        BlockchainEngine["In-Memory Ledger Engine"]
    end
    
    subgraph Data & Storage Layer
        PostgreSql[("PostgreSQL Database<br/>(AES-256 Encrypted-at-Rest)")]
        IPFSSim["Mock IPFS Gateway<br/>(Off-Chain Scan Attachments)"]
    end

    ReactWeb -->|HTTPS API Requests| ExpressAPI
    ExpressAPI -->|Read/Write Encrypted Records| PostgreSql
    ExpressAPI -->|Sync Block Data| BlockchainEngine
    ReactWeb -.->|References CIDs| IPFSSim
```

### Components Interaction Flow
1. **Frontend Web UI**: Built as a responsive interface using pure HTML, JavaScript, and React. It dynamically adapts to mobile screens, tablets, and desktops using flexible media queries.
2. **Client-Side Cryptographic Handlers**: Performs browser-based RSA key generation. Digital signatures of medical records are simulated and verified using doctor public keys.
3. **Application Server**: Coordinates Express.js routing, handles authentication token issuance, routes queries to the database, and exposes blockchain consensus modules.
4. **Database (AES-256)**: Performs encryption of sensitive diagnoses and treatment plans before storing them in the PostgreSQL database.
5. **Ledger Engine (Mempool & Proof of Work)**: Aggregates signed medical transactions in a mempool, mines blocks using SHA-256 hashes with custom difficulty constraints, and validates chain hashes recursively.

---

## 2. System Requirements

### 2.1 Functional Requirements
* **FR1: Multi-Portal Authentication**: Users must be able to log in or register under three distinct roles: Patients, Healthcare Providers (Doctors), and Network Administrators.
* **FR2: Cryptographic Identity Generation**: Registration of any clinical operator or patient must automatically trigger RSA-2048 public/private key pair generation.
* **FR3: Patient-Controlled Access Control (Consent Registry)**:
  * Patients must be able to view registered doctors and grant or revoke access permissions.
  * Doctors must only be allowed to view dossiers or write clinical logs for patients who have granted them active consent.
* **FR4: Field-Level Data Encryption**: Sensitive clinical data (diagnoses and treatment plans) must be encrypted at rest in the database.
* **FR5: Digital Record Signing**: Doctor profiles must cryptographically sign records using their private keys upon submission.
* **FR6: Proof-of-Work Blockchain Mining**: Mempool records must be mined into a block using proof-of-work validations.
* **FR7: Integrity Auditing & Self-Healing**:
  * Administrators must have access to a Security Lab to view validation logs and simulate raw database tampering.
  * The system must offer a self-healing mechanism that automatically recovers PostgreSQL database records using valid blockchain ledger logs.

### 2.2 Non-Functional Requirements
* **NFR1: Responsiveness**: The web application must render adaptively on mobile phones, tablets, and desktops without layout breaks.
* **NFR2: Low-Resource Compatibility**: The frontend must load efficiently over poor connections and run inside basic web browsers.
* **NFR3: Portability**: The system must run portably on Windows development systems using local binaries without requiring global software installations.
* **NFR4: Performance**: Block mining under simple difficulty settings must resolve in milliseconds to support instant laboratory audits.

---

## 3. Database Design

The database schema is structured for PostgreSQL. It consists of five main tables: `users`, `appointments`, `records`, `blocks`, and `audit_logs`.

### Entity Relationship Model (ERD)
```mermaid
erDiagram
    users {
        UUID id PK
        string name
        string email
        string password
        string role "patient | doctor | admin"
        string public_key
        string private_key
        jsonb patient_profile
        jsonb doctor_profile
        timestamp created_at
    }
    records {
        UUID id PK
        UUID patient_id FK
        UUID doctor_id FK
        string doctor_name
        string diagnosis "AES-256 Encrypted"
        string treatment "AES-256 Encrypted"
        jsonb prescriptions
        string ipfs_hash
        string signature
        string doctor_public_key
        boolean is_mined
        int block_index
        string timestamp
    }
    blocks {
        UUID id PK
        int index
        string timestamp
        jsonb records
        string previous_hash
        bigint nonce
        string hash
    }
    
    users ||--o{ records : "owns / writes"
    blocks ||--o{ records : "packages"
```

### PostgreSQL Table Specifications

#### Table 1: `users`
* Stores user credentials, profiles, cryptographic identity keys, and access consent states.
* **Schema Definition**:
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('patient', 'doctor', 'admin')),
    public_key TEXT NOT NULL,
    private_key TEXT NOT NULL,
    patient_profile JSONB DEFAULT NULL,
    doctor_profile JSONB DEFAULT NULL,
    is_approved BOOLEAN DEFAULT true,
    is_rejected BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### Table 2: `records`
* Stores clinical records. Sensitive text (diagnosis, treatment) is encrypted at rest using AES-256-CBC.
* **Schema Definition**:
```sql
CREATE TABLE records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_name VARCHAR(255) NOT NULL,
    diagnosis TEXT NOT NULL,
    treatment TEXT NOT NULL,
    prescriptions JSONB DEFAULT '[]'::jsonb,
    ipfs_hash VARCHAR(255) DEFAULT '',
    signature TEXT NOT NULL,
    doctor_public_key TEXT NOT NULL,
    is_mined BOOLEAN DEFAULT false,
    block_index INTEGER DEFAULT -1,
    timestamp VARCHAR(100) NOT NULL
);
```

#### Table 3: `blocks`
* Stores mined ledger blocks, establishing immutable cryptographic links between blocks.
* **Schema Definition**:
```sql
CREATE TABLE blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    index INTEGER UNIQUE NOT NULL,
    timestamp VARCHAR(100) NOT NULL,
    records JSONB DEFAULT '[]'::jsonb,
    previous_hash VARCHAR(255) NOT NULL,
    nonce BIGINT NOT NULL,
    hash VARCHAR(255) UNIQUE NOT NULL
);
```

---

## 4. User Interface Architecture

The UI is built as a responsive single-page web dashboard that handles route transitions using React state hooks. Layout views adapt cleanly to varying viewport sizes.

### UI Portal Flowchart
```mermaid
graph TD
    Start((Login View)) --> Auth{Role Selection}
    
    Auth -->|Patient| PatDash[Patient Dashboard]
    Auth -->|Doctor| DocDash[Doctor Dashboard]
    Auth -->|Admin| AdminDash[Admin Control Center]
    
    PatDash --> Vitals[View Profile & Vitals]
    PatDash --> KeyInfo[Inspect RSA Credentials]
    PatDash --> ConsentMgmt[Healthcare Access Control <br/> Grant/Revoke Doctor Access]
    PatDash --> Folder[My Health Folder <br/> Read Signed Diagnoses]
    
    DocDash --> Registry[Patient Registry <br/> Check Consent Status]
    Registry -->|Access Granted| Dossier[Open Dossier <br/> Read History / Submit Diagnosis]
    Registry -->|Access Restricted| LockScreen[Dossier Locked]
    
    AdminDash --> SystemStats[Ledger Metrics & Auditing]
    AdminDash --> P2PLogs[Live Node P2P Console]
    AdminDash --> AttackLab[Database Attack Lab <br/> Simulate Tampering / Run Self-Healing]
```

### Responsive Design Patterns
* **Grid Layouts**: The dashboard views utilize `.grid-2` and `.grid-3` structures built in CSS. These automatically collapse to single-column structures on viewport widths below `1024px` to fit screens of mobile phones and smaller tablet profiles.
* **Glassmorphism Theme**: Custom translucent overlays (`var(--glass-bg)`, `backdrop-filter: blur(16px)`) provide a premium interface feel across both desktop and mobile web viewports.
* **Interactive Toggles**: Consent actions are represented as toggle buttons displaying real-time state changes without needing desktop refreshes.

---

## 5. Web Implementation & Verification Plan

### 5.1 Deployment Stack
* **Vite React Frontend**: Runs locally on `http://localhost:3000`. Exposes proxy settings to route API data to port 5000.
* **Express.js API Backend**: Runs locally on `http://localhost:5000`.
* **PostgreSQL Database**: Hosted on Supabase (accessed securely via SSL connections).

### 5.2 Verification Scenarios (Web Tests)
1. **Verification Scenario A: Enforcing Patient Consent Controls**
   * Register a Patient and Doctor.
   * Log in as the Doctor, view the dashboard registry, and verify the patient card exhibits an **Access Restricted** lock status. Try clicking "Open Records" and ensure it is disabled.
   * Log in as the Patient, go to **Healthcare Access & Consent Control**, and click **Grant Access** for the doctor.
   * Log back in as the Doctor, confirm the patient shows **Access Granted**, open the folder, and submit a medical record.
2. **Verification Scenario B: Ledger Verification Audit & Database Recovery**
   * Go to the **Admin Command Center** (or **Ledger Explorer**).
   * Confirm the Network Status banner displays **SECURE**.
   * Run the **Security Lab** simulator: pick a record, type modified diagnosis text, and select **Force Database Edit**.
   * Verify that the network status banner immediately alerts **COMPROMISED (TAMPER DETECTED)** and turns the tampered ledger block **Red**.
   * Click **Recover from Ledger** and check if the database values are automatically healed and ledger state returned to **SECURE**.

