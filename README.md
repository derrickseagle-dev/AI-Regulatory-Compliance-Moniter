# Regula AI

Continuous AI-powered monitoring of documents, communications, and model outputs for regulatory compliance — with explainable alerts and immutable audit trails.

Built for compliance teams at banks, insurers, and pharmaceutical companies under SEC, FINRA, FDA, GDPR, HIPAA, or equivalent oversight.

## Tech Stack

- **Frontend:** React 19 + TanStack Start + Tailwind CSS
- **Backend:** TanStack Start server functions + API routes (Node.js)
- **Database:** PostgreSQL (Neon) with Drizzle ORM
- **Queue:** BullMQ + Redis (Upstash)
- **Auth:** Email/password with bcrypt + session cookies
- **Text Extraction:** pdf-parse, mammoth

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) runtime
- PostgreSQL database (set `DATABASE_URL`)
- Redis (set `REDIS_URL`, optional for Phase 1)

### Setup

```bash
# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and REDIS_URL

# Run database migrations
bun run db:migrate

# Start development server
bun run dev
```

The app runs on **port 3000**:
- Landing page: `http://localhost:3000/`
- Sign up: `http://localhost:3000/signup`
- Login: `http://localhost:3000/login`
- Dashboard: `http://localhost:3000/app`
- Documents: `http://localhost:3000/app/documents`

### Publishing

```bash
bun run publish   # Rebuild and restart the live server on port 3000
```

## Project Structure

```
├── src/
│   ├── routes/           # TanStack Start routes (file-based)
│   │   ├── index.tsx     # Landing page
│   │   ├── login.tsx     # Login page
│   │   ├── signup.tsx    # Registration page
│   │   ├── app/          # Authenticated dashboard
│   │   │   ├── __root.tsx    # App shell (sidebar + auth check)
│   │   │   ├── index.tsx     # Dashboard home
│   │   │   └── documents.tsx # Document library
│   │   └── api/          # API routes
│   │       ├── auth/     # Authentication endpoints
│   │       └── v1/       # Platform API (ingest, documents, etc.)
│   ├── lib/
│   │   ├── db/           # Drizzle schema + migrations
│   │   ├── auth/         # Auth helpers (bcrypt, sessions, middleware)
│   │   ├── ingestion/    # Text extraction + pipeline
│   │   ├── queue/        # BullMQ queue definitions + workers
│   │   └── audit/        # Audit trail helpers
│   ├── components/       # Shared UI components
│   └── styles/           # Tailwind CSS
├── ARCHITECTURE.md       # Full product architecture
├── drizzle.config.ts     # Drizzle ORM configuration
└── package.json
```

## API Endpoints

### Auth
- `POST /api/auth/signup` — Create account + tenant
- `POST /api/auth/login` — Sign in
- `POST /api/auth/logout` — Sign out
- `GET /api/auth/me` — Current user

### Documents (Phase 1)
- `POST /api/v1/ingest` — Upload documents (multipart/form-data)
- `GET /api/v1/documents` — List documents (paginated)

## Phase 1 Deliverables

- [x] Database schema with all core entities (tenants, users, documents, rules, alerts, audit_log)
- [x] Email/password authentication with session management
- [x] File upload endpoint with PDF/DOCX/TXT text extraction
- [x] Document management dashboard
- [x] Immutable audit log with cryptographic hash chaining
- [x] BullMQ queue scaffolding for async processing

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (Neon) |
| `REDIS_URL` | Phase 2 | Redis connection string (Upstash) for BullMQ |
| `OPENAI_API_KEY` | Phase 2 | OpenAI API key for semantic rule evaluation |
| `UPLOAD_DIR` | No | File upload directory (default: `./data/uploads`) |
