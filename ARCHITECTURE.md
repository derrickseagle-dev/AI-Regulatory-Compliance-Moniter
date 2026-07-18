# Regula AI — Product Architecture

> **Version:** 1.0  
> **Author:** Regula AI Engineering  
> **Date:** 2026-07-18  
> **Status:** Draft — ready for implementation

---

## Table of Contents

1. [Overview & Design Principles](#1-overview--design-principles)
2. [Tech Stack Recommendation](#2-tech-stack-recommendation)
3. [Data Model Overview](#3-data-model-overview)
4. [Data Ingestion Pipeline](#4-data-ingestion-pipeline)
5. [Compliance Rule Engine](#5-compliance-rule-engine)
6. [Alert System](#6-alert-system)
7. [Immutable Audit Trail](#7-immutable-audit-trail)
8. [API Design](#8-api-design)
9. [Deployment Architecture](#9-deployment-architecture)
10. [Multi-Tenancy & SaaS Tiering](#10-multi-tenancy--saas-tiering)
11. [MVP Scope & Build Plan](#11-mvp-scope--build-plan)
12. [Open Questions & Future Extensions](#12-open-questions--future-extensions)

---

## 1. Overview & Design Principles

Regula AI is a SaaS platform that continuously monitors documents, communications, and AI model outputs for regulatory compliance violations. It generates explainable alerts and maintains an immutable, cryptographically-verifiable audit trail.

### Core Design Principles

| Principle | What it means |
|---|---|
| **Explainability first** | Every alert cites the rule, the exact text, and the reasoning. No black-box decisions. |
| **Immutable by default** | Every action is append-only logged with cryptographic chaining. You cannot delete history. |
| **Configurable, not hardcoded** | Rules are data, not code. Compliance teams (not engineers) should configure them. |
| **Single-engineer buildable** | MVP must be realistic for one developer in ~8 weeks. Prefer proven OSS components. |
| **TypeScript-first** | Use TypeScript/Node.js for all application code. Python only for AI/ML pipelines that genuinely need it. |
| **Multi-tenant from day one** | Every table has a `tenant_id`. No retrofitting. |

### System Context Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        EXTERNAL INPUTS                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │Documents │  │  Email   │  │  Slack   │  │ AI Model     │ │
│  │(PDF,DOCX)│  │(IMAP/SMTP)│ │(Webhook) │  │Outputs (API) │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘ │
└───────┼──────────────┼──────────────┼───────────────┼────────┘
        │              │              │               │
        ▼              ▼              ▼               ▼
┌──────────────────────────────────────────────────────────────┐
│                    INGESTION PIPELINE                         │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ File Upload │  │ API / SDK    │  │ Streaming          │  │
│  │ (batch)     │  │ (webhook)    │  │ (SSE / poll)       │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬───────────┘  │
│         └────────────────┼───────────────────┘               │
│                           ▼                                   │
│              ┌────────────────────────┐                      │
│              │  Preprocessing Queue   │                      │
│              │  (BullMQ + Redis)      │                      │
│              └───────────┬────────────┘                      │
│                          ▼                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────┐   │
│  │Text      │  │Chunking  │  │Metadata                  │   │
│  │Extraction│  │& Embed   │  │Tagging                   │   │
│  └──────────┘  └──────────┘  └──────────────────────────┘   │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                     RULE ENGINE                               │
│  ┌──────────────────┐  ┌──────────────────┐                  │
│  │ Pattern Matcher  │  │ LLM Evaluator    │                  │
│  │ (regex/keyword)  │  │ (semantic check) │                  │
│  └────────┬─────────┘  └────────┬─────────┘                  │
│           └─────────────────────┘                             │
│                       ▼                                       │
│              ┌────────────────────┐                          │
│              │  Rule Composer     │                          │
│              │  (AND/OR chains)   │                          │
│              └────────┬───────────┘                          │
└───────────────────────┼──────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│                     ALERT SYSTEM                              │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐   │
│  │Alert       │  │Grouping /  │  │Notification          │   │
│  │Generation  │  │Summarize   │  │(email, webhook)      │   │
│  └────────────┘  └────────────┘  └──────────────────────┘   │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                  IMMUTABLE AUDIT TRAIL                        │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Append-only event log with cryptographic chaining    │    │
│  │  Every action → hashed → chained → verifiable         │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    DASHBOARD UI                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │Alerts    │  │Documents │  │Rules     │  │Audit     │    │
│  │Dashboard │  │Library   │  │Config    │  │Reports   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack Recommendation

### Application Layer (TypeScript/Node.js)

| Concern | Technology | Why |
|---|---|---|
| **Web framework** | TanStack Start (React + Vite) | Already in place for the marketing site. Server functions and API routes share the same process. |
| **API layer** | TanStack Start API routes + Server Functions | No separate API server needed for MVP. Same port 3000. |
| **ORM / DB** | Drizzle ORM + `postgres.js` | Lightweight, TypeScript-first, good migration support. Works with the existing `~/db` helper pattern. |
| **Job queue** | BullMQ + Redis | Handles async ingestion, rule evaluation, and notifications. Battle-tested, excellent dashboard. |
| **Auth** | Clerk or Lucia Auth | Multi-tenant auth with SSO for enterprise. Clerk is faster to integrate; Lucia is more flexible. |
| **File storage** | Local filesystem (MVP) → S3-compatible (prod) | MVP can store on disk; the abstraction is a simple interface. |
| **Frontend UI** | Tailwind CSS + shadcn/ui | Already using Tailwind. shadcn/ui gives accessible dashboard components for free. |

### AI / ML Layer

| Concern | Technology | Why |
|---|---|---|
| **LLM evaluation** | OpenAI API (GPT-4o) | Semantic rule evaluation. Prompt-based, no model training needed for MVP. |
| **Text extraction (PDF)** | `pdf-parse` (Node) or `unstructured` (Python microservice) | `pdf-parse` is pure JS and works for most PDFs. `unstructured` is better for complex layouts — add as a Python sidecar if needed. |
| **Text extraction (DOCX)** | `mammoth` (Node) | Pure JS, handles .docx well. |
| **Embeddings** | OpenAI `text-embedding-3-small` | For semantic similarity search in rules. Cheap, good enough. |
| **Python (if needed)** | FastAPI microservice | Only for ML tasks that JS can't handle. Communicate via HTTP. |

### Data Layer

| Concern | Technology | Why |
|---|---|---|
| **Primary database** | PostgreSQL (Neon serverless) | Same pattern as existing site. `DATABASE_URL` injection. Handles relational data, full-text search, and JSONB. |
| **Cache / queue** | Redis (Upstash or local) | BullMQ needs Redis. Also used for rate limiting and session cache. |
| **Full-text search** | PostgreSQL `tsvector` | Good enough for MVP. Migrate to Elasticsearch if search becomes a bottleneck. |

### Why this stack for a single engineer

- **No infrastructure divergence**: TanStack Start serves both the marketing site and the app dashboard from one process.
- **JavaScript everywhere**: One language for frontend, backend, queue workers. Only reach for Python when JS genuinely can't do the job.
- **Proven OSS**: BullMQ, Drizzle, PostgreSQL, Tailwind — all have large communities and few surprises.
- **Serverless-ready**: Neon and Upstash remove database/Redis ops. The app deploys as a single container or serverless function.

---

## 3. Data Model Overview

### Core Entities

```
┌──────────────────┐       ┌──────────────────┐
│    tenants       │       │     users        │
├──────────────────┤       ├──────────────────┤
│ id (UUID)        │──┐    │ id (UUID)        │
│ name             │  │    │ tenant_id (FK)   │──┐
│ slug             │  │    │ email            │  │
│ tier (enum)      │  │    │ role (enum)      │  │
│ created_at       │  │    │ created_at       │  │
└──────────────────┘  │    └──────────────────┘  │
                       │                          │
         ┌─────────────┼──────────────────────────┘
         │             │
         ▼             ▼
┌──────────────────┐  ┌──────────────────┐
│   documents      │  │   rule_sets      │
├──────────────────┤  ├──────────────────┤
│ id (UUID)        │  │ id (UUID)        │
│ tenant_id (FK)   │  │ tenant_id (FK)   │
│ filename         │  │ name             │
│ source_type      │  │ framework (enum) │
│ content_text     │  │ is_active        │
│ content_chunks   │  │ created_by (FK)  │
│ metadata (JSONB) │  │ created_at       │
│ status (enum)    │  └────────┬─────────┘
│ created_at       │           │
└────────┬─────────┘           │
         │                     ▼
         │           ┌──────────────────┐
         │           │     rules        │
         │           ├──────────────────┤
         │           │ id (UUID)        │
         │           │ rule_set_id (FK) │
         │           │ name             │
         │           │ type (enum)      │  ← pattern | semantic | composite
         │           │ config (JSONB)   │  ← regex, prompt, sub-rule IDs
         │           │ severity (enum)  │  ← low | medium | high | critical
         │           │ created_at       │
         │           └────────┬─────────┘
         │                    │
         ▼                    ▼
┌──────────────────────────────────────┐
│           evaluations                │
├──────────────────────────────────────┤
│ id (UUID)                           │
│ tenant_id (FK)                      │
│ document_id (FK)                    │
│ rule_id (FK)                        │
│ chunk_index                         │
│ triggered (boolean)                 │
│ confidence (float)                  │
│ evidence_text                       │
│ reasoning (text)                    │
│ evaluated_at                        │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│             alerts                   │
├──────────────────────────────────────┤
│ id (UUID)                           │
│ tenant_id (FK)                      │
│ evaluation_id (FK)                  │
│ alert_group_id (FK, nullable)       │
│ severity (enum)                     │
│ status (enum) ← open|ack|resolved|fp│
│ title                              │
│ summary                            │
│ recommended_action (text)           │
│ assigned_to (FK → users, nullable)  │
│ created_at                          │
│ resolved_at (nullable)              │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│          audit_log                   │
├──────────────────────────────────────┤
│ id (BIGSERIAL)                     │
│ tenant_id (FK)                      │
│ event_type (enum)                   │
│ actor_id (FK → users, nullable)     │
│ resource_type (enum)                │
│ resource_id (UUID)                  │
│ payload (JSONB)                     │
│ prev_hash (text)                    │
│ content_hash (text)                 │
│ created_at (TIMESTAMPTZ)            │
└──────────────────────────────────────┘
```

### Key Enums

```typescript
// Tenant tier
type TenantTier = 'starter' | 'professional' | 'enterprise';

// Document source types
type SourceType = 'upload' | 'email' | 'slack' | 'api' | 'model_output';

// Document status
type DocumentStatus = 'pending' | 'processing' | 'processed' | 'failed';

// Regulatory frameworks
type Framework = 'SEC' | 'FINRA' | 'FDA' | 'GDPR' | 'HIPAA' | 'CCPA' | 'custom';

// Rule types
type RuleType = 'pattern' | 'semantic' | 'composite';

// Alert severity
type Severity = 'low' | 'medium' | 'high' | 'critical';

// Alert status
type AlertStatus = 'open' | 'acknowledged' | 'resolved' | 'false_positive';

// Audit event types
type AuditEventType =
  | 'document.uploaded'
  | 'document.processed'
  | 'rule.created'
  | 'rule.updated'
  | 'evaluation.run'
  | 'alert.created'
  | 'alert.status_changed'
  | 'alert.assigned'
  | 'user.login'
  | 'tenant.config_changed';
```

### Index Strategy (MVP)

```sql
-- High-traffic lookup patterns
CREATE INDEX idx_documents_tenant_status ON documents(tenant_id, status);
CREATE INDEX idx_evaluations_document ON evaluations(document_id);
CREATE INDEX idx_evaluations_rule ON evaluations(rule_id);
CREATE INDEX idx_alerts_tenant_status ON alerts(tenant_id, status);
CREATE INDEX idx_alerts_group ON alerts(alert_group_id);
CREATE INDEX idx_audit_log_tenant ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
```

---

## 4. Data Ingestion Pipeline

### 4.1 Ingestion Methods

| Method | Use case | Implementation |
|---|---|---|
| **File Upload** | Batch document review (PDFs, DOCX, TXT) | Multipart form upload → store raw file → enqueue processing job |
| **API / SDK** | Programmatic submission from internal systems | `POST /api/v1/ingest` with JSON body or multipart. API key auth. |
| **Email Gateway** | Ingest forwarded emails | Receive via SendGrid/Mailgun inbound parse webhook → extract text → enqueue |
| **Slack Integration** | Monitor Slack channels | Slack Events API → webhook endpoint → extract message text → enqueue |
| **Streaming Poll** | Monitor AI model outputs in near-real-time | Client SDK polls or pushes to `/api/v1/ingest` at configurable intervals |

### 4.2 Preprocessing Pipeline (BullMQ Job)

```
Raw Input
    │
    ▼
┌─────────────────┐
│ 1. Text         │  PDF → pdf-parse
│    Extraction   │  DOCX → mammoth
│                 │  Email → mailparser
│                 │  Plain/JSON → passthrough
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. Normalization│  Unicode normalization (NFC)
│                 │  Whitespace collapse
│                 │  Control character removal
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. Metadata     │  Extract: author, date, source,
│    Tagging      │  document type, word count,
│                 │  language detection
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Chunking     │  Split into ~512-token chunks
│                 │  with 64-token overlap
│                 │  (LangChain RecursiveCharacterTextSplitter)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. Embedding    │  Generate embedding vector for
│  (optional)    │  semantic rules (OpenAI text-embedding-3-small)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 6. Store        │  Save full text + chunks to documents table
│                 │  Update status → 'processed'
│                 │  Trigger rule evaluation
└────────┬────────┘
         │
         ▼
    Enqueue "evaluate" job
```

### 4.3 Processing Concurrency

For MVP, BullMQ workers process one document at a time per tenant (fair scheduling). The queue configuration:

```typescript
// Queue: "ingestion"
// Concurrency: 3 (process 3 documents in parallel across tenants)
// Rate limit: 30 documents/minute (stay within LLM API rate limits)
// Retry: 3 attempts with exponential backoff
// Dead letter: Failed documents go to a "failed" status with error metadata
```

### 4.4 File Storage Strategy

```
/uploads
  /{tenant_id}/
    /raw/           ← original uploaded files (immutable once stored)
      {uuid}.pdf
    /processed/     ← extracted text (optional cache)
      {uuid}.txt
```

The raw file path is recorded in `documents.metadata` as `raw_file_path`. Never modify raw files after ingest — the audit trail depends on them being immutable.

---

## 5. Compliance Rule Engine

### 5.1 Rule Architecture

Rules are organized into **Rule Sets**, each tied to a regulatory framework. A tenant can activate multiple rule sets (e.g., "SEC Marketing Compliance" + "GDPR Data Handling").

```
Rule Set: "SEC Marketing Compliance"
├── Rule: "No guaranteed returns"          [pattern]    severity: high
├── Rule: "Risk disclosure present"        [pattern]    severity: critical
├── Rule: "No misleading projections"      [semantic]   severity: high
└── Rule: "Full compliance check"          [composite]  severity: critical
    ├── AND: "No guaranteed returns"
    ├── AND: "Risk disclosure present"
    └── OR:  "No misleading projections"
```

### 5.2 Rule Types

#### 5.2.1 Pattern Rules (Fast, Deterministic)

Regex and keyword matching. Runs first — cheap, fast, catches obvious violations.

```json
{
  "type": "pattern",
  "config": {
    "patterns": [
      {
        "id": "p1",
        "label": "Guaranteed return claim",
        "regex": "\\b(guaranteed|risk-free|can't lose|certain) (return|profit|gain|income)\\b",
        "flags": "gi",
        "case_sensitive": false
      },
      {
        "id": "p2",
        "label": "Unqualified performance claim",
        "keywords": ["best performing", "top rated", "#1"],
        "proximity": 50,
        "require_all": false
      }
    ],
    "match_logic": "any"  // any | all
  }
}
```

#### 5.2.2 Semantic Rules (LLM-Powered)

Uses GPT-4o to evaluate whether text violates a principle. Slower, more expensive, but catches nuanced violations that regex can't.

```json
{
  "type": "semantic",
  "config": {
    "prompt": "You are a compliance reviewer for {framework}. Review the following text for violations of: {rule_description}. Respond with JSON: { triggered: boolean, confidence: number 0-1, evidence: string, reasoning: string }",
    "framework": "SEC",
    "rule_description": "Marketing communications must not make misleading or unsubstantiated performance claims. Any performance data must include appropriate context and risk disclosures.",
    "model": "gpt-4o",
    "temperature": 0.1,
    "confidence_threshold": 0.7
  }
}
```

#### 5.2.3 Composite Rules (AND/OR Chains)

Combine pattern and semantic rules with boolean logic.

```json
{
  "type": "composite",
  "config": {
    "logic": "AND",
    "rules": [
      { "rule_id": "uuid-of-pattern-rule-1" },
      {
        "logic": "OR",
        "rules": [
          { "rule_id": "uuid-of-semantic-rule-1" },
          { "rule_id": "uuid-of-pattern-rule-2" }
        ]
      }
    ]
  }
}
```

### 5.3 Evaluation Flow

```
Document processed → Enqueue evaluation job
                         │
                         ▼
              ┌─────────────────────┐
              │ 1. Load active rules│
              │    for tenant       │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ 2. For each chunk:  │
              │   a. Run all pattern│
              │      rules (fast)   │
              │   b. If any pattern │
              │      triggers →     │
              │      run semantic   │
              │      rules on chunk │
              │   c. Evaluate       │
              │      composite rules│
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ 3. Aggregate results│
              │    per document     │
              │    per rule         │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ 4. Generate alerts  │
              │    for triggered    │
              │    rules            │
              └──────────┬──────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │ 5. Write audit log  │
              │    entries          │
              └─────────────────────┘
```

### 5.4 Cost Optimization (Important for MVP)

- **Two-pass evaluation**: Run all pattern rules first (they're essentially free). Only run semantic (LLM) rules if pattern rules flag something or if a rule is marked `semantic-only`.
- **Chunk-level caching**: If the same chunk content hash was already evaluated against the same rule version, skip re-evaluation.
- **Batch LLM calls**: Group up to 10 chunks into a single GPT-4o call where semantically grouped.
- **Confidence thresholds**: Skip alert generation for semantic rules with `confidence < threshold`.

### 5.5 False-Positive Tuning

Every alert has a "Mark as False Positive" action. When a user marks an alert as FP:

1. The alert status becomes `false_positive`.
2. The evaluation that triggered it records `human_override: true`.
3. For pattern rules: the specific pattern match is recorded. After N FPs on the same pattern, suggest reducing severity or disabling.
4. For semantic rules: the FP is recorded with the prompt context. Periodically review and refine prompts.

---

## 6. Alert System

### 6.1 Alert Anatomy

Every alert contains:

```typescript
interface Alert {
  id: string;                          // UUID
  title: string;                       // Human-readable, e.g. "Potential guaranteed return claim"
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'acknowledged' | 'resolved' | 'false_positive';
  
  // Evidence
  document_id: string;
  document_name: string;
  chunk_index: number;
  evidence_text: string;               // The exact text that triggered the rule
  evidence_context: string;            // Surrounding text for context (200 chars before/after)
  
  // Rule
  rule_id: string;
  rule_name: string;
  rule_set_name: string;
  framework: string;
  
  // Reasoning
  reasoning: string;                   // Why this was flagged (LLM-generated or pattern-matched)
  confidence: number;                  // 0-1
  
  // Action
  recommended_action: string;          // What the compliance team should do
  
  // Grouping
  alert_group_id: string | null;       // For grouping related alerts
  
  // Lifecycle
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  assigned_to: string | null;          // User ID
}
```

### 6.2 Alert Grouping & Summarization

To prevent alert fatigue, similar alerts are grouped:

- **Same rule + same document**: Multiple chunks triggering the same rule are grouped into one alert group.
- **Same rule + same document type + same time window**: Alerts across documents of the same type within an hour are summarized.
- **Daily digest**: Instead of individual emails, tenants receive a daily summary (configurable: instant, hourly, daily).

```typescript
interface AlertGroup {
  id: string;
  tenant_id: string;
  title: string;                       // e.g. "3 potential guaranteed return claims in Q3 Marketing Deck"
  rule_id: string;
  document_ids: string[];
  alert_count: number;
  highest_severity: Severity;
  summary: string;                     // LLM-generated summary of the grouped alerts
  created_at: string;
}
```

### 6.3 Notification Channels

| Channel | Implementation | Default |
|---|---|---|
| **In-app** | Dashboard alert feed (real-time via polling) | Always on |
| **Email** | Daily digest or instant alerts | Daily digest |
| **Webhook** | `POST` to tenant-configured URL | Off |
| **Slack** | Post to configured Slack channel | Off |

### 6.4 Alert Lifecycle

```
┌──────┐    acknowledge    ┌──────────────┐    resolve     ┌──────────┐
│ OPEN │ ────────────────► │ ACKNOWLEDGED │ ─────────────► │ RESOLVED │
└──────┘                   └──────────────┘                └──────────┘
    │                             │                              │
    └─────── false_positive ──────┴────── false_positive ───────┘
                         │
                         ▼
                  ┌───────────────┐
                  │ FALSE_POSITIVE │
                  └───────────────┘
```

All state transitions are recorded in the audit log.

---

## 7. Immutable Audit Trail

### 7.1 Design

The audit trail is an **append-only event log** with cryptographic chaining. It provides tamper evidence: any modification, deletion, or insertion is detectable.

Each entry has:

```
┌─────────────────────────────────────────────┐
│ audit_log row                                │
├─────────────────────────────────────────────┤
│ id: BIGSERIAL (monotonic, never reused)      │
│ tenant_id: UUID                              │
│ event_type: enum                             │
│ actor_id: UUID (who did it)                  │
│ resource_type: enum                          │
│ resource_id: UUID                            │
│ payload: JSONB (full snapshot of what changed)│
│ prev_hash: SHA-256(previous row's content)   │
│ content_hash: SHA-256(this row's content)    │
│ created_at: TIMESTAMPTZ                      │
└─────────────────────────────────────────────┘
```

### 7.2 Hash Chain Construction

```
Row N-1                          Row N
┌──────────────┐                ┌──────────────────────────────────┐
│ content_hash │ ─────────────► │ prev_hash = Row N-1.content_hash │
│ = H(N-1)     │                │ content_hash = H(                │
└──────────────┘                │     tenant_id +                   │
                                │     event_type +                  │
                                │     resource_id +                 │
                                │     payload +                     │
                                │     created_at +                  │
                                │     prev_hash                     │
                                │   )                               │
                                └──────────────────────────────────┘
```

### 7.3 What Gets Logged

| Event | When | Payload |
|---|---|---|
| `document.uploaded` | File received | `{ filename, source_type, file_hash, size_bytes }` |
| `document.processed` | Preprocessing done | `{ chunk_count, word_count, extraction_method }` |
| `evaluation.run` | Rule evaluated | `{ rule_id, document_id, chunk_index, triggered, confidence, evidence }` |
| `alert.created` | Alert generated | Full alert snapshot (all fields) |
| `alert.status_changed` | Status transition | `{ alert_id, from_status, to_status, changed_by }` |
| `alert.assigned` | User assigned | `{ alert_id, assigned_to }` |
| `rule.created` | Rule added | Full rule config snapshot |
| `rule.updated` | Rule changed | `{ rule_id, changed_fields, old_values, new_values }` |
| `user.login` | User authenticated | `{ user_id, ip_address }` |
| `tenant.config_changed` | Settings changed | `{ changed_fields, old_values, new_values }` |

### 7.4 Verification

A verification endpoint allows auditors (and tenants) to verify the chain:

```
GET /api/v1/audit/verify?tenant_id={id}&from={timestamp}&to={timestamp}

Response:
{
  "verified": true,
  "entries_checked": 14532,
  "first_entry": { "id": 1001, "created_at": "..." },
  "last_entry": { "id": 15533, "created_at": "..." },
  "chain_intact": true,
  "anomalies": []
}
```

Verification algorithm: walk every row from `from` to `to`, recompute each `content_hash`, and verify it matches the stored value and that `prev_hash` matches the previous row's `content_hash`.

### 7.5 Database-Level Protection

- The `audit_log` table has **no UPDATE or DELETE grants** for the application user. Only INSERT and SELECT.
- Use a PostgreSQL `BEFORE INSERT` trigger to automatically compute and set `prev_hash` and `content_hash`:

```sql
CREATE OR REPLACE FUNCTION audit_log_set_hashes()
RETURNS TRIGGER AS $$
DECLARE
  prev_hash_val TEXT;
  content_to_hash TEXT;
BEGIN
  -- Get the previous row's content_hash
  SELECT content_hash INTO prev_hash_val
  FROM audit_log
  WHERE tenant_id = NEW.tenant_id
  ORDER BY id DESC
  LIMIT 1;
  
  NEW.prev_hash := COALESCE(prev_hash_val, '0x0000000000000000000000000000000000000000000000000000000000000000');
  
  content_to_hash := NEW.tenant_id::TEXT || '|' ||
                     NEW.event_type::TEXT || '|' ||
                     COALESCE(NEW.resource_id::TEXT, '') || '|' ||
                     COALESCE(NEW.payload::TEXT, '{}') || '|' ||
                     NEW.created_at::TEXT || '|' ||
                     NEW.prev_hash;
  
  NEW.content_hash := encode(sha256(content_to_hash::bytea), 'hex');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_hashes
  BEFORE INSERT ON audit_log
  FOR EACH ROW
  EXECUTE FUNCTION audit_log_set_hashes();
```

### 7.6 Export & Reporting

The audit trail can be exported for external auditors:

- **CSV export**: Filtered by date range, event type, tenant. Downloadable from the dashboard.
- **Audit report PDF**: Generated on-demand with a summary + full log, suitable for regulatory filings.
- **API access**: `GET /api/v1/audit/export` with query params for filtering.

---

## 8. API Design

### 8.1 API Style

**REST** for MVP. It's simpler, well-understood, and maps naturally to CRUD resources. GraphQL can be added later if the dashboard needs flexible querying.

### 8.2 Authentication

- **API Keys** for programmatic access (ingestion API, webhooks). Scoped per tenant.
- **Session cookies** for dashboard access (Clerk or Lucia handles this).
- All endpoints require authentication. Tenant isolation is enforced via the auth context.

### 8.3 Key Endpoints

```
─── Ingestion ───────────────────────────────────────────

POST   /api/v1/ingest              Upload document(s) for processing
  Body: multipart/form-data (files[]) or JSON array
  Response: { documents: [{ id, status }] }

GET    /api/v1/ingest/:id/status   Check processing status

─── Documents ──────────────────────────────────────────

GET    /api/v1/documents           List documents (paginated, filterable)
GET    /api/v1/documents/:id       Get document with full text + chunks
DELETE /api/v1/documents/:id       Soft-delete (marks as archived, logged)

─── Rules ──────────────────────────────────────────────

GET    /api/v1/rules               List rules (by rule set, framework)
POST   /api/v1/rules               Create a new rule
PUT    /api/v1/rules/:id           Update an existing rule
DELETE /api/v1/rules/:id           Deactivate a rule

GET    /api/v1/rule-sets           List rule sets
POST   /api/v1/rule-sets           Create a rule set
PUT    /api/v1/rule-sets/:id       Update rule set (activate/deactivate)

POST   /api/v1/rules/:id/test      Test a rule against sample text
  Body: { text: "..." }
  Response: { triggered, confidence, evidence, reasoning }

─── Alerts ─────────────────────────────────────────────

GET    /api/v1/alerts              List alerts (paginated, filterable by status/severity/date)
GET    /api/v1/alerts/:id          Get alert with full details
PATCH  /api/v1/alerts/:id          Update alert (status, assignment)
POST   /api/v1/alerts/:id/acknowledge
POST   /api/v1/alerts/:id/resolve
POST   /api/v1/alerts/:id/false-positive

GET    /api/v1/alert-groups        List alert groups
GET    /api/v1/alert-groups/:id    Get group with all member alerts

─── Audit ──────────────────────────────────────────────

GET    /api/v1/audit               Query audit log (paginated, filtered)
GET    /api/v1/audit/verify        Verify hash chain integrity
GET    /api/v1/audit/export        Export audit log (CSV/JSON)

─── Dashboard ──────────────────────────────────────────

GET    /api/v1/dashboard/summary   Aggregated stats for dashboard
  Response: {
    total_documents, documents_this_week,
    open_alerts, alerts_by_severity,
    rules_active, evaluations_run,
    compliance_score (optional)
  }

─── Tenant Config ──────────────────────────────────────

GET    /api/v1/tenant              Current tenant settings
PUT    /api/v1/tenant              Update settings (notification prefs, etc.)
```

### 8.4 Pagination & Filtering Convention

```
GET /api/v1/alerts?status=open&severity=high&page=1&limit=20&sort=-created_at

Response:
{
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 147,
    "total_pages": 8
  }
}
```

### 8.5 Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Rule name is required",
    "details": [
      { "field": "name", "issue": "required" }
    ]
  }
}
```

---

## 9. Deployment Architecture

### 9.1 MVP Deployment (Single Server)

```
                          ┌─────────────┐
                          │   Internet   │
                          └──────┬──────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │   Reverse Proxy       │
                     │   (Vercel / Caddy)     │
                     │   Port 3000            │
                     └───────────┬───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │   TanStack Start App   │
                     │   (Node.js process)    │
                     │                        │
                     │  ┌─────────────────┐   │
                     │  │  SSR + API      │   │
                     │  │  (routes)       │   │
                     │  └─────────────────┘   │
                     │                        │
                     │  ┌─────────────────┐   │
                     │  │  BullMQ Workers │   │
                     │  │  (ingestion,    │   │
                     │  │   evaluation,   │   │
                     │  │   notification) │   │
                     │  └─────────────────┘   │
                     └───────────┬───────────┘
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
                    ▼            ▼            ▼
           ┌──────────┐  ┌──────────┐  ┌──────────┐
           │PostgreSQL│  │  Redis   │  │  Local   │
           │  (Neon)  │  │(Upstash) │  │  Disk    │
           └──────────┘  └──────────┘  │(uploads) │
                                       └──────────┘
```

For MVP, the BullMQ workers run **in the same Node.js process** as the web server (using `bullmq`'s worker mode). This avoids a separate deployment. Workers are lightweight — they mostly make HTTP calls (LLM API) and DB queries.

### 9.2 Production Scaling Path

When the MVP graduates to production:

1. **Separate worker process**: Extract BullMQ workers into a separate deployment (same codebase, different entry point).
2. **Object storage**: Move file uploads to S3/R2. The `FileStorage` abstraction makes this a config change.
3. **Multiple web instances**: Run 2-3 web instances behind a load balancer. Stateless (sessions in Redis).
4. **Separate read replica**: Route dashboard queries to a PostgreSQL read replica.

### 9.3 Monorepo Structure

```
regula-ai/
├── site/                       # Marketing site (existing TanStack Start app)
│   ├── src/
│   │   ├── routes/            # Marketing pages + app dashboard routes
│   │   │   ├── index.tsx      # Landing page (already exists)
│   │   │   ├── app/           # Dashboard routes (authenticated)
│   │   │   │   ├── __root.tsx
│   │   │   │   ├── index.tsx       # Dashboard home
│   │   │   │   ├── alerts.tsx      # Alerts page
│   │   │   │   ├── alerts.$id.tsx  # Alert detail
│   │   │   │   ├── documents.tsx   # Document library
│   │   │   │   ├── rules.tsx       # Rule configuration
│   │   │   │   ├── audit.tsx       # Audit log viewer
│   │   │   │   └── settings.tsx    # Tenant settings
│   │   │   └── api/
│   │   │       ├── signup.ts       # Existing beta signup
│   │   │       └── v1/             # Platform API routes
│   │   │           ├── ingest.ts
│   │   │           ├── documents.ts
│   │   │           ├── rules.ts
│   │   │           ├── alerts.ts
│   │   │           └── audit.ts
│   │   ├── lib/                    # Shared business logic
│   │   │   ├── db/                 # Drizzle schema + migrations
│   │   │   │   ├── schema.ts
│   │   │   │   └── migrations/
│   │   │   ├── ingestion/          # Text extraction, chunking
│   │   │   ├── rules/              # Rule engine (pattern, semantic, composite)
│   │   │   ├── alerts/             # Alert generation + grouping
│   │   │   ├── audit/              # Audit trail helpers
│   │   │   ├── queue/              # BullMQ queue definitions + workers
│   │   │   └── auth/               # Auth helpers
│   │   ├── components/             # Shared UI components (shadcn/ui)
│   │   └── styles/
│   ├── package.json
│   └── vite.config.ts
│
├── workers/                    # (Future) Separate worker deployment
│   └── entry.ts
│
└── docs/
    ├── architecture.md
    └── api.md
```

### 9.4 Environment Variables

```bash
# Required
DATABASE_URL=postgresql://...        # Neon PostgreSQL
OPENAI_API_KEY=sk-...                # For LLM evaluations + embeddings

# Optional (MVP can run without, but needed for production features)
REDIS_URL=redis://...                # Upstash Redis (for BullMQ)
CLERK_SECRET_KEY=sk_...              # Auth provider
CLERK_PUBLISHABLE_KEY=pk_...
SENDGRID_API_KEY=...                 # For email notifications
SLACK_BOT_TOKEN=...                  # For Slack integration
SLACK_SIGNING_SECRET=...
UPLOAD_DIR=/home/team/shared/site/data/uploads  # File storage path
```

---

## 10. Multi-Tenancy & SaaS Tiering

### 10.1 Tenant Isolation

**Shared database, row-level isolation.** Every table includes `tenant_id`. The application layer enforces that all queries are scoped to the authenticated user's tenant.

```typescript
// Example: Drizzle query always scoped to tenant
function getDocuments(db: DrizzleClient, tenantId: string, opts: QueryOpts) {
  return db.select()
    .from(documents)
    .where(eq(documents.tenantId, tenantId))  // ← enforced at query level
    .limit(opts.limit)
    .offset(opts.offset);
}
```

A middleware extracts `tenant_id` from the authenticated session and injects it into the request context. API routes never accept `tenant_id` as a parameter — it always comes from auth.

### 10.2 Subscription Tiers

| Capability | Starter | Professional | Enterprise |
|---|---|---|---|
| **Documents/month** | 100 | 1,000 | 10,000+ |
| **Rule sets** | 1 | 5 | Unlimited |
| **Custom rules** | ✗ | ✓ | ✓ |
| **Semantic (LLM) rules** | ✗ | 50 evals/day | Unlimited |
| **Alert history** | 30 days | 1 year | Unlimited |
| **Audit log retention** | 90 days | 7 years | Unlimited |
| **Export audit reports** | ✗ | ✓ | ✓ |
| **API access** | ✗ | ✓ | ✓ |
| **SSO** | ✗ | ✗ | ✓ |
| **Slack integration** | ✗ | ✓ | ✓ |
| **Email gateway** | ✗ | ✗ | ✓ |
| **Priority support** | ✗ | ✗ | ✓ |

### 10.3 Tier Enforcement

A `tenant.tier` field determines limits. Before each operation, check:

```typescript
async function checkDocumentLimit(tenantId: string) {
  const tenant = await getTenant(tenantId);
  const thisMonth = await countDocumentsThisMonth(tenantId);
  const limits = { starter: 100, professional: 1000, enterprise: Infinity };
  
  if (thisMonth >= limits[tenant.tier]) {
    throw new TierLimitError('Document limit reached. Upgrade to continue.');
  }
}
```

For LLM evaluations, a rate limiter using Redis counts evaluations per tenant per day and rejects if over limit.

### 10.4 Metering & Billing (Post-MVP)

For the MVP, billing is manual (Stripe links, invoices). The system tracks usage in a `usage_events` table:

```sql
CREATE TABLE usage_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  event_type TEXT NOT NULL,     -- 'document_ingested', 'evaluation_run', 'alert_generated'
  quantity INTEGER DEFAULT 1,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
```

Stripe integration comes after MVP.

---

## 11. MVP Scope & Build Plan

### 11.1 Phase 1: Foundation (Weeks 1–2)

**Goal: Core infrastructure, database, and ingestion.**

- [ ] Set up monorepo with Drizzle ORM, run migrations
- [ ] Implement tenant + user models with Clerk auth
- [ ] Build file upload endpoint with text extraction (PDF, DOCX, TXT)
- [ ] Implement BullMQ ingestion queue + worker (in-process)
- [ ] Build document listing + detail views in dashboard
- [ ] Set up audit log table with hash trigger

**Deliverable:** Users can sign up, upload documents, and see them processing.

### 11.2 Phase 2: Rule Engine (Weeks 3–4)

**Goal: Pattern and semantic rule evaluation.**

- [ ] Build rule set + rule CRUD (API + dashboard)
- [ ] Implement pattern rule evaluator (regex/keyword)
- [ ] Implement semantic rule evaluator (GPT-4o)
- [ ] Implement composite rule evaluator (AND/OR chains)
- [ ] Wire rule evaluation into the ingestion pipeline
- [ ] Build rule testing sandbox ("test this rule against sample text")

**Deliverable:** Documents are automatically evaluated against configured rules.

### 11.3 Phase 3: Alerts & Audit (Weeks 5–6)

**Goal: Explainable alerts and audit trail.**

- [ ] Build alert generation from evaluation results
- [ ] Implement alert grouping + daily digest logic
- [ ] Build alerts dashboard with filtering/sorting
- [ ] Implement alert lifecycle (acknowledge, resolve, false positive)
- [ ] Build audit log viewer with filtering
- [ ] Implement hash chain verification endpoint

**Deliverable:** Users receive explainable alerts and can review the audit trail.

### 11.4 Phase 4: Polish & Beta Launch (Weeks 7–8)

**Goal: Production readiness.**

- [ ] Dashboard polish: summary stats, charts, empty states
- [ ] Email notifications (daily digest, critical alerts)
- [ ] Tenant settings page (notification prefs, API key management)
- [ ] API key auth for programmatic ingestion
- [ ] Tier limit enforcement
- [ ] Load testing + performance tuning
- [ ] Security review: input validation, rate limiting, CSP headers
- [ ] Beta onboarding flow (invite codes or waitlist)

**Deliverable:** Beta-ready product. Invite first users from the waitlist.

### 11.5 What's Deferred (Post-MVP)

- Slack integration (webhook)
- Email gateway (inbound parse)
- Streaming/real-time ingestion
- Advanced analytics dashboard
- Stripe billing integration
- Python ML pipeline for custom models
- Elasticsearch for full-text search
- SSO / SAML integration
- SOC 2 certification
- Multi-region deployment

---

## 12. Open Questions & Future Extensions

### 12.1 Questions to Resolve

1. **Document size limits**: What's the maximum document size for MVP? Suggestion: 10MB / 100 pages. Larger documents can be split or rejected with a clear error.
2. **LLM cost budget**: At ~$2.50/1M input tokens (GPT-4o), 1,000-page documents evaluated with semantic rules could cost $50-100/month for a professional tenant. Is this acceptable, or should we start with only pattern rules on the lower tier?
3. **Rule set curation**: Who writes the default rule sets? Should we ship with pre-built SEC/FINRA/FDA/GDPR rule sets, or start with a blank canvas? Suggestion: Ship 5-10 starter rules per framework to demonstrate value immediately.
4. **Python sidecar**: Should the MVP include Python at all, or defer entirely? Suggestion: defer. `pdf-parse` + `mammoth` + OpenAI API covers the MVP needs. Add `unstructured` as a Python microservice only if PDF extraction quality proves insufficient.

### 12.2 Future Extensions

- **Custom ML models**: Fine-tuned classifiers per regulatory framework for lower latency/cost than GPT-4o.
- **Real-time streaming**: WebSocket or SSE for live alert feeds in the dashboard.
- **Workflow automation**: Integrate with Jira, ServiceNow, or GRC platforms. Auto-create tickets from alerts.
- **Regulatory change monitoring**: Periodically scan regulatory updates and suggest rule changes.
- **Model output monitoring SDK**: Lightweight client library that wraps LLM calls and automatically submits outputs for compliance review.
- **Compliance scoring**: Aggregate score per tenant showing overall compliance health over time.
- **Collaborative review**: Multiple users can comment on, assign, and discuss alerts.

---

## Appendix A: Key Technology Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Language | TypeScript (Node.js) | Single language for frontend + backend. Owner preference. |
| Framework | TanStack Start | Already deployed. Server functions eliminate API boilerplate. |
| Database | PostgreSQL (Neon) | Serverless, relational, full-text search. Matches existing `DATABASE_URL` pattern. |
| ORM | Drizzle | Lightweight, TypeScript-first, good migration DX. |
| Queue | BullMQ + Redis | Mature, in-process workers for MVP, scales to separate deployment. |
| Auth | Clerk | Fastest path to multi-tenant auth with SSO support. |
| LLM | OpenAI GPT-4o | No model training. Prompt-based rules. Pay-per-use. |
| File storage | Local disk (MVP) | Simplest. Abstracted behind an interface for S3 migration. |
| UI | Tailwind + shadcn/ui | Already using Tailwind. shadcn/ui adds accessible dashboard components. |
| API style | REST | Simpler than GraphQL for MVP. Well-understood. |
| Multi-tenancy | Shared DB, row-level | Simplest for single engineer. Pooling overhead acceptable for MVP. |

---

## Appendix B: Dependencies (package.json additions)

```json
{
  "dependencies": {
    "drizzle-orm": "^0.33",
    "postgres": "^3.4",
    "drizzle-kit": "^0.24",
    "bullmq": "^5.0",
    "ioredis": "^5.4",
    "pdf-parse": "^1.1",
    "mammoth": "^1.7",
    "openai": "^4.50",
    "zod": "^3.23",
    "clerk": "latest",
    "date-fns": "^3.6",
    "uuid": "^9.0"
  },
  "devDependencies": {
    "@types/pdf-parse": "^1.1",
    "@types/uuid": "^9.0"
  }
}
```

---

*End of architecture document. Ready for implementation.*
