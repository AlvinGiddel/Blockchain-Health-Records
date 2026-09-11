# Block Health Chain (BHC) — Multi-Tenant Cryptographic Health Records Ledger

> **Research Project:** Multi-Tenant Cryptographically Isolated Electronic Health Records Ledger for Low-Resource Healthcare Environments  
> **Institution:** Zetech University — Faculty of Computing and Information Technology  
> **Researcher:** Alvin Giddel Muting'a  
> **Academic Year:** 2026  
> **Platform Status:** Fully Hardened, Audited & Production Ready

---

## 🌟 Executive Summary

**Block Health Chain (BHC)** is an enterprise-grade, multi-tenant Electronic Health Records (EHR) management and verification platform engineered specifically for healthcare institutions in Kenya and emerging healthcare networks.

It combines modern web engineering (**React 18 / Vite SPA**) with an auditable cryptographic backend (**Node.js / Express / PostgreSQL with Row-Level Security / Isolated Proof-of-Work Ledgers**). The platform provides cryptographically isolated block ledgers for each clinic/hospital, statutory license verification with Kenyan medical regulatory boards (**KMPDC / NCK**), patient consent sovereignty, time-limited emergency break-glass procedures, autonomous multi-tenant block mining, fail-closed facility subscription licensing with Paystack billing, and automated default-deny route security scanning.

---

## 🚀 Key Architectural Pillars

### 1. 🏥 Isolated Multi-Tenant Cryptographic Ledgers
- **Per-Tenant Blockchain Isolation**: Every hospital and clinic (`organization_id`) operates an independent, cryptographically isolated ledger starting from its own Genesis Block (Index #0).
- **Cross-Tenant Ledger Protection**: Blockchain rebuilds, Proof-of-Work block mining, and self-healing ledger recoveries are strictly scoped per organization. An action in Hospital A can never wipe, re-index, or corrupt blocks belonging to Hospital B.
- **Hierarchical Governance**:
  - **Super Administrator Command Center**: Platform-level health facility onboarding, statutory verification review, global node telemetry, and subscription enforcement.
  - **Hospital Administrator Portal**: Clinic-level clinician approvals, appointment schedules, and facility-specific ledger management.
  - **Doctor / Practitioner Portal**: Patient dossier access, consultation recording, digital signing, and specialist notes.
  - **Patient Health Folder**: Universal Health Passport with tamper-evident QR code, clinical records viewing, and practitioner consent control.

### 2. 🔐 Cryptography & Non-Repudiation
- **RSA-2048 Asymmetric Key Pairs**: Automatically generated on user registration for Doctors and Patients.
- **Cryptographic Signatures**: Every diagnosis, prescription, and consultation record is digitally signed using the doctor's private key (`SHA-256withRSA`).
- **AES-256-CBC Field-Level Encryption**: Sensitive diagnoses and treatments are encrypted at rest with unique Initialization Vectors (`IV`), rendering raw PostgreSQL rows unreadable to unauthorized database operators.
- **Universal Health Passport QR Proof**: Generates public, tamper-evident verification proofs for physical certificates and emergency responders. Proof verification validates both block index and organization ID.

### 3. ⚙️ Autonomous Background Jobs & Workers
- **Auto-Miner Worker (`jobs/autoMinerJob.js`)**:
  - **Multi-Tenant Threshold Trigger (`MEMPOOL_THRESHOLD = 10`)**: Automatically seals and mines a block for a specific clinic when its mempool reaches capacity.
  - **Timer Fallback (`MINE_INTERVAL_MS = 60000`)**: Periodically packages and mines straggler transactions across active tenant queues during low-traffic periods.
  - **Concurrency Mutex Lock (`isMining`)**: Prevents race conditions, duplicate block creation, and chain forking across simultaneous timer ticks, threshold hits, and manual admin triggers.
- **Licensing & Grace Mode Worker (`jobs/licenseCheckJob.js`)**:
  - **Fail-Closed Architecture**: Automatically checks remote license verification authority.
  - **Read-Only Grace Mode**: When a clinic's 30-day trial expires, the facility enters read-only grace mode (existing patient charts and ledger remain readable, but writing new records and booking is paused until renewed via Paystack).

### 4. 🛡️ Three Pillars of API Security & Automated Route Scanner
- **Pillar 1: Declarative Middleware**: Centralized authentication (`requireAuth`) and role-based access control (`requireRole`, `requireDoctor`, `requireAdmin`, `requireSuperAdmin`) at the route mount level.
- **Pillar 2: Strict Identity Binding**: Actor identity is derived strictly from verified JWT claims (`req.user.id`). Controllers never trust client request bodies or query strings for actor IDs.
- **Pillar 3: Automated Route Security Scanner (`npm test`)**: Enumerates all 81 registered Express endpoints against an explicit public allowlist, enforcing an architectural default-deny policy (0 security violations).

### 5. 🇰🇪 Regulatory Compliance & Commercial Billing
- **Statutory Registry Verification**: Real-time statutory integration verifying Kenyan doctors with the Kenya Medical Practitioners and Dentists Council (**KMPDC**) and nurses with the Nursing Council of Kenya (**NCK**).
- **Paystack Subscription Gateway**: Multi-currency subscription renewals (KES 20,000/mo, KES 54,000/quarter, KES 192,000/year) supporting Card and M-Pesa automated webhooks.

---

## 🏗️ System Architecture

```
                                  +---------------------------------------+
                                  |         Responsive Web Client         |
                                  |        (Vite + React 18 SPA)          |
                                  |   - Universal Health Passport (QR)    |
                                  |   - Glassmorphic High-Contrast UI     |
                                  +-------------------+-------------------+
                                                      |
                                           HTTPS / REST API Requests
                                                      |
                                                      v
                                  +-------------------+-------------------+
                                  |         Express.js API Layer          |
                                  |      (Thin Entry Point: server.js)    |
                                  |  - Declarative Auth/Role Guards       |
                                  |  - Row-Level Security Middleware      |
                                  +---------+-------------------+---------+
                                            |                   |
                                            v                   v
                     +----------------------+----+      +-------+-------------------+
                     |   7 Modular Domain Routes |      |    Background Workers     |
                     |  - /api/auth              |      |  - autoMinerJob.js        |
                     |  - /api/records           |      |  - licenseCheckJob.js     |
                     |  - /api/appointments      |      +---------------------------+
                     |  - /api/practitioners     |                  |
                     |  - /api/organizations     |                  v
                     |  - /api/payments          |      +---------------------------+
                     |  - /api/admin             |      |   Isolated Tenant Ledgers |
                     +--------------+------------+      |  - Hospital A Ledger      |
                                    |                   |  - Hospital B Ledger      |
                                    v                   |  - Penda Health Ledger    |
                     +---------------------------+      +---------------------------+
                     |    PostgreSQL Database    |
                     |  - AES-256 Encrypted Rows |
                     |  - Multi-Tenant RLS Scope |
                     |  - Immutable Audit Logs   |
                     +---------------------------+
```

---

## 📂 Project Structure

```
block-health-chain-project/
├── backend/
│   ├── controllers/               # Domain controllers (Identity-bound logic)
│   │   ├── adminController.js
│   │   ├── appointmentsController.js
│   │   ├── authController.js
│   │   ├── organizationController.js
│   │   ├── paymentsController.js
│   │   ├── practitionersController.js
│   │   └── recordsController.js
│   ├── jobs/                      # Autonomous background workers
│   │   ├── autoMinerJob.js        # Multi-tenant auto-miner (threshold + timer fallback)
│   │   └── licenseCheckJob.js     # License check worker (fail-closed, grace mode)
│   ├── middleware/                # Security guards & RLS propagation
│   │   ├── auth.js                # requireAuth, requireRole, requireDoctor, requireAdmin
│   │   └── licensingGuard.js      # Tenant active/grace check middleware
│   ├── routes/                    # Modular Express domain routers
│   │   ├── admin.js
│   │   ├── appointments.js
│   │   ├── auth.js
│   │   ├── organizations.js
│   │   ├── payments.js
│   │   ├── practitioners.js
│   │   └── records.js
│   ├── scripts/                   # Test suites, forensics, and migration tools
│   │   ├── check_historical_damage.js # Forensic ledger integrity check
│   │   ├── provision_penda_admin.js   # Clinic provisioning script
│   │   ├── test_audit_findings_9.js   # Regression tests for 9 Security Audit Findings
│   │   ├── test_route_security_guard.js # Automated Route Security Scanner
│   │   ├── test_jobs_domain.js        # Background workers smoke tests
│   │   └── test_security_patch_12.js  # 12-endpoint security patch test
│   ├── services/                  # Regulatory, licensing, and billing integrations
│   │   ├── kmpdcService.js        # KMPDC & NCK statutory registry simulator
│   │   ├── licenseService.js      # Remote licensing & token issuance
│   │   └── paystackService.js     # Paystack payment & webhook processing
│   ├── utils/                     # Helpers, crypto, and audit log handlers
│   │   └── helpers.js             # AES-256, RSA sign/verify, audit log alignment
│   ├── blockchain.js              # Blockchain & Block classes (SHA-256, PoW)
│   ├── db.js                      # PostgreSQL pool with EAT timezone & RLS
│   ├── mailer.js                  # Automated clinical emails & password resets
│   └── server.js                  # Thin application entry point
├── frontend/
│   ├── src/
│   │   ├── components/            # Portals (Patient, Doctor, Admin, Explorer, Landing)
│   │   │   ├── LandingPage.jsx    # Public overview & clinic onboarding
│   │   │   ├── Login.jsx          # Multi-role authentication & clinic registration
│   │   │   ├── RegularAdminPanel.jsx # Clinic administrator command center
│   │   │   ├── SuperAdminPanel.jsx   # Platform super admin governance
│   │   │   ├── MedicalRecords.jsx    # Clinical chart & specialist notes
│   │   │   ├── BlockchainExplorer.jsx# Multi-tenant block explorer & tamper lab
│   │   │   └── PaystackRenewalModal.jsx # Subscription renewal modal
│   │   ├── App.jsx                # Main SPA orchestrator & navigation state
│   │   └── main.jsx               # React DOM root
│   └── package.json
├── run.ps1                        # Portable one-click startup orchestrator (Windows)
├── setup.ps1                      # Portable environment initialization script
├── stop.ps1                       # Graceful process terminator script
├── system_documentation.md        # Complete system architecture specification
├── VIVA_DEFENSE_GUIDE.md          # Viva defense script, Q&A, and demonstration guide
└── README.md                      # Project overview and setup instructions
```

---

## ⚙️ Environment Configuration

Create a `.env` file in the `backend/` directory:

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `PORT` | Backend listening port | `5000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:...@host:5432/postgres` |
| `JWT_SECRET` | Secret key for signing session tokens | *Required strong secret* |
| `ENCRYPTION_KEY` | 32-byte (64 hex character) key for AES-256-CBC | *Required 64-char hex string* |
| `PAYSTACK_SECRET_KEY` | Paystack secret key for payments | `sk_test_...` |
| `PAYSTACK_PUBLIC_KEY` | Paystack public key for frontend | `pk_test_...` |
| `TZ` | Node runtime timezone | `Africa/Nairobi` |
| `PGTZ` | PostgreSQL connection session timezone | `Africa/Nairobi` |
| `MEMPOOL_THRESHOLD` | Pending records count to trigger auto-mine | `10` |
| `MINE_INTERVAL_MS` | Auto-miner fallback timer interval (ms) | `60000` |

---

## 🚦 Quick Start & Execution

### Option A: Portable One-Click Run (Windows)

1. **Initialize Dependencies (First time only):**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\setup.ps1
   ```
2. **Start Backend & Frontend:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\run.ps1
   ```
3. **Access Application:**
   - Public Landing Page & Portals: `http://localhost:3000`
   - Backend API Health: `http://localhost:5000/api/health`
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

### Option C: Local Development with Docker Compose

Run the entire platform (PostgreSQL database, Node.js backend, and Vite frontend) with hot-reloading:

1. **Prepare Environment File:**
   ```bash
   cp .env.docker.example .env.docker
   ```
2. **Start All Services:**
   ```bash
   docker compose up --build
   ```
   - **PostgreSQL**: Starts `postgres:16-alpine` and automatically executes all migration scripts in `backend/migrations/` (`00_init_base_schema.sql` through `10_ppb_premises_registry.sql`) in order.
   - **Backend API**: Accessible at `http://localhost:5000` (live hot-reload on file edits).
   - **Frontend Web App**: Accessible at `http://localhost:3000` (live hot-reload on file edits with polling enabled for Windows).
3. **Pre-Seeded Credentials for Local Docker Dev:**
   - **Super Admin Email**: `superadmin@bhc.local`
   - **Super Admin Password**: `SuperAdmin#Secure2026!`
   - **Test Facilities**: Pre-seeded with *Nairobi Hospital*, *Mama Lucy Hospital*, and *Kilimani Hospital*.
4. **Stop System:**
   ```bash
   docker compose down
   # Or to wipe local database volume:
   docker compose down -v
   ```

---

## 🐳 Production Deployment with Docker (DigitalOcean App Platform)

Both the backend and frontend include standalone, multi-stage production Dockerfiles ready for deployment on **DigitalOcean App Platform** or any Docker-compatible container cloud:

### 1. Backend Service (`backend/Dockerfile`)
- **Multi-Stage Build**: Installs production dependencies in stage 1, and runs a minimal `node:20-alpine` production image.
- **Port**: Listens on `PORT` environment variable (default: `5000`).
- **Health Check**: Probes `/api/health` automatically.
- **DigitalOcean App Platform Setup**:
  - Source Type: **Dockerfile**
  - Dockerfile Path: `backend/Dockerfile`
  - HTTP Port: `5000`
  - Environment Variables: Provide `DATABASE_URL` (Supabase or Managed Postgres), `JWT_SECRET`, `ENCRYPTION_KEY`, `FRONTEND_URL`, etc.

### 2. Frontend Static Service (`frontend/Dockerfile`)
- **Multi-Stage Build**: Compiles Vite SPA in stage 1 (`node:20-alpine`), and serves static files using `nginx:1.25-alpine`.
- **Build Arguments**: Passes `VITE_API_URL` and `VITE_APP_URL` at build time so they are baked into the compiled client bundles.
- **SPA Routing & Caching**: Includes custom `nginx.conf` with gzip compression, security headers, immutable caching for `/assets/`, and fallback routing (`try_files $uri $uri/ /index.html;`).
- **DigitalOcean App Platform Setup**:
  - Source Type: **Dockerfile**
  - Dockerfile Path: `frontend/Dockerfile`
  - Build Arguments: `VITE_API_URL=https://your-backend-api-domain.com`
  - HTTP Port: `80`

---

## 🧪 Automated Testing & Security Scanning

To verify system compliance, execute the test suites:

```bash
# 1. Run Automated Route Security Scanner (Pillar 3: Default-Deny verification)
npm --prefix backend test

# 2. Run Comprehensive 9 Security Audit Findings Regression Suite
node backend/scripts/test_audit_findings_9.js

# 3. Run Autonomous Background Jobs Domain Suite
node backend/scripts/test_jobs_domain.js

# 4. Run 12-Endpoint Security Patch Suite
node backend/scripts/test_security_patch_12.js

# 5. Build Frontend Production Bundle
npm --prefix frontend run build
```

---

## 🛡️ Security Audit Remediation Summary

The platform was subjected to a comprehensive multi-tenant security audit. All 9 critical findings were remediated and verified:

1. **Finding #1 & #2**: Scoped `GET /api/admin/records` strictly to the clinic's `organization_id` and updated `verifyBlockchainProof` to match blocks by index AND organization ID.
2. **Finding #3**: Re-engineered `recoverBlockchain` to group blocks by `organization_id` first, repairing each healthcare facility's ledger independently.
3. **Finding #4**: User deletion chain rebuilding is strictly scoped to the affected organization (`DELETE FROM blocks WHERE organization_id = $1`), eliminating cross-tenant ledger destruction.
4. **Finding #5**: Specialist consultation notes enforce tenant organization bounds and bind author identity strictly to the doctor's authenticated JWT session.
5. **Finding #6**: Emergency break-glass audit logs derive doctor and patient names from verified database records rather than unchecked request body inputs.
6. **Finding #7**: Added `organizationId` to pending mempool records in `completeConsultation` for tenant-scoped Proof-of-Work mining.
7. **Finding #8**: Realigned `logAuditEvent` arguments and nullified patient parameters for non-patient administrative actions.
8. **Finding #9**: Removed unawaited query listeners on the PostgreSQL connection pool and configured `process.env.PGTZ = 'Africa/Nairobi'`, eliminating all Node.js deprecation warnings.

---

## 📄 License & Academic Certification

**Author / Researcher:** Alvin Giddel Muting'a  
**Institution:** Zetech University — Faculty of Computing and Information Technology  
**Project:** Bachelor of Science in Information Technology (Final Year Capstone Research)  
**Academic Year:** 2026
