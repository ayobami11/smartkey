**SMARTKEY**

**Backend System Design & Implementation**

Automated Key Request & Approval System

# 1\. Introduction

SmartKey is a web-based automated key request and approval system developed for the University of Lagos (UNILAG) to replace the manual, logbook-based access control process currently in use at the Senate Building security desk. The backend is the core engine of the system - it enforces business rules, applies AI-based risk scoring, manages authentication, stores all transactional records, and delivers real-time updates to every user role.

This document provides a comprehensive technical account of the SmartKey backend: its architecture, technology choices, database schema, API design, AI components, security model, and planned implementation roadmap. All design decisions are driven by the specific requirements of the access-control domain rather than general software trends.

# 2\. Backend Architecture Overview

The SmartKey backend is structured as a three-tier system. Responsibilities are clearly separated between the presentation layer (Next.js React dashboards), the application layer (Next.js API routes acting as the backend), and the data layer (Supabase/PostgreSQL). This section describes the application and data tiers in detail.

## 2.1 Architectural Pattern - Serverless Monolith

Rather than operating a separate, dedicated backend server (such as Flask, Express, or Django), SmartKey collapses all server-side logic into Next.js API routes, which are deployed as serverless functions on Vercel. This is deliberately chosen over a microservices architecture for several concrete reasons:

- Elimination of cross-origin (CORS) configuration - the frontend and API share the same host.
- No separate deployment pipeline, monitoring setup, or infrastructure cost for a standalone backend server.
- Serverless functions scale automatically and incur no cost when idle - appropriate for a pilot-scale university deployment.
- Newman's research on microservices shows that monolithic architectures reduce deployment failures and debugging complexity for moderately complex systems, which SmartKey qualifies as.

## 2.2 Platform: Supabase as Backend-as-a-Service

Supabase provides the backend infrastructure that would otherwise require multiple standalone services. The following Supabase capabilities are used directly:

| **Supabase Service**     | **Function in SmartKey**                                  | **Alternative Replaced**            | **Key Benefit**                                 |
| ------------------------ | --------------------------------------------------------- | ----------------------------------- | ----------------------------------------------- |
| PostgreSQL (hosted)      | Relational data store for all nine schema tables          | Self-hosted Postgres or Firebase    | Managed backups, connection pooling, SSL        |
| Supabase Auth            | Email/password login, OTP 2FA, invite links, JWT issuance | Auth0, Passport.js, custom auth     | Zero-cost; native RLS integration               |
| Row Level Security (RLS) | Database-level access control per user role               | Application-level permission checks | Eliminates OWASP A01 Broken Access Control risk |
| Supabase Storage         | Passport photos, HOD signatures, weekend letters          | AWS S3, Cloudinary                  | RLS policies apply to files; zero extra config  |
| Supabase Realtime        | Live queue updates for Verifier; CSO Building Pulse       | Socket.io, Pusher                   | WebSocket server built-in; synced to DB changes |
| Edge Functions           | Hourly overdue-key checks; daily shift summaries          | Cron jobs on a separate server      | Serverless; no separate scheduler needed        |

## 2.3 Request Lifecycle

Every client request passes through the following sequence:

- Client (Next.js page) makes an authenticated HTTP request to a Next.js API route (e.g., POST /api/requests/submit).
- The API route validates the JWT issued by Supabase Auth, confirming the user's identity and role.
- Business logic executes: the AI risk engine queries the database, computes a risk score, and attaches a recommendation to the request record.
- The API route performs the required database operation via the Supabase client library (@supabase/supabase-js), with Row Level Security enforcing data isolation.
- If the operation triggers a Realtime subscription (e.g., a new request appears in the Verifier's queue), Supabase pushes an update over WebSocket to all subscribed clients.
- The API route returns a JSON response (success or error) to the client.

# 3\. Technology Stack

The technology stack was selected to address the precise technical requirements of SmartKey. Each component was chosen to solve a specific problem, not for general popularity.

| **Component**         | **Technology**          | **Version / Tier**                      | **Justification**                                                                                    |
| --------------------- | ----------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Frontend & API Host   | Next.js (React)         | v14+                                    | Unified frontend + serverless API; server-side rendering; no separate backend server needed          |
| Styling               | Tailwind CSS            | v3                                      | Utility-first; rapid responsive dashboard development without custom CSS files                       |
| Database              | PostgreSQL via Supabase | Postgres 15                             | Relational model; ACID transactions; UNIQUE/CHECK constraints enforce business rules at DB level     |
| Authentication & 2FA  | Supabase Auth           | Free tier                               | Built-in email OTP, invite links, JWT; integrates directly with RLS policies                         |
| File Storage          | Supabase Storage        | Free tier                               | Passport photos, signatures, weekend letters; access controlled by same RLS policies                 |
| Real-time Updates     | Supabase Realtime       | Free tier                               | WebSocket-based; pushes DB change events to Verifier queue and CSO dashboard                         |
| AI: Pattern Detection | SQL + TypeScript        | In-process                              | No external library; parameterized SQL COUNT/WHERE; weighted risk score function in API route        |
| AI: Incident Reports  | Google Gemini API       | gemini-3.0-flash (free tier 15 req/min) | Best free-tier LLM for narrative text generation; simple REST call; template fallback if unavailable |
| AI: Signature Verify  | sharp + pixelmatch      | v0.33 / v6.0                            | Pixel-level comparison; no GPU, no training data, no cost; detects gross tampering reliably          |
| QR Code               | qrcode.react            | Latest                                  | Generates temporary collection tokens for Security Verifier desk                                     |
| Background Jobs       | Supabase Edge Functions | Deno runtime                            | Hourly overdue-key alerts; daily shift summary generation                                            |
| Deployment            | Vercel + Supabase Cloud | Free/Pro tiers                          | Zero-config Next.js deployment; managed database and services                                        |

# 4\. Database Schema Design

The SmartKey database is implemented in PostgreSQL on Supabase. It consists of nine tables whose schemas are designed to enforce all business rules at the database level - not just in application code. This ensures constraints cannot be bypassed by bugs, race conditions, or direct API calls. The following subsections document each table in full.

## 4.1 Design Principles

- Primary keys are UUIDs (auto-generated) to prevent enumeration attacks.
- Foreign keys enforce referential integrity for all cross-table relationships.
- UNIQUE constraints enforce uniqueness rules (e.g., one signature per HOD; one slot per room/position pair).
- CHECK constraints enforce value-range rules at the engine level (e.g., slot_number IN 1-3).
- ENUM types restrict fields to defined value sets, preventing invalid states.
- TIMESTAMPTZ (timestamp with time zone) is used for all temporal fields to ensure consistent logging across time zones.
- Row Level Security (RLS) policies are defined on every table so that each user role can only read or modify the rows their permissions allow.

## 4.2 Users Table

Every person in the system - CSO, HODs, staff collectors, and security verifiers - is stored in the users table. The role field is an ENUM restricted to the four valid values. Department association is enforced by a foreign key.

| **Column**             | **Type & Constraint**                             | **Purpose**                                                               |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| **id**                 | UUID - Primary Key                                | Auto-generated unique identifier for each user                            |
| **email**              | VARCHAR - UNIQUE, NOT NULL                        | Official UNILAG or personal email; used for login and OTP delivery        |
| **first_name**         | VARCHAR - NOT NULL                                | User's first name                                                         |
| **last_name**          | VARCHAR - NOT NULL                                | User's last name                                                          |
| **phone_number**       | VARCHAR                                           | Optional contact number                                                   |
| **role**               | ENUM (cso \| hod \| staff \| security) - NOT NULL | Determines dashboard access, RLS policies, and 2FA requirements           |
| **department_id**      | UUID - FK → departments                           | Associates user with their university department                          |
| **passport_photo_url** | VARCHAR                                           | Supabase Storage path for staff identity photo shown to Security Verifier |
| **is_active**          | BOOLEAN - DEFAULT true                            | CSO sets to false to revoke access without deleting the audit record      |
| **invited_by**         | UUID - FK → users                                 | Chain-of-custody: records which superior account created this user        |
| **created_at**         | TIMESTAMPTZ - DEFAULT now()                       | Account creation timestamp; immutable after insertion                     |

## 4.3 Departments Table

Stores university departments with their building zone and current HOD assignment.

| **Column**      | **Type & Constraint**                      | **Purpose**                                          |
| --------------- | ------------------------------------------ | ---------------------------------------------------- |
| **id**          | UUID - Primary Key                         | Auto-generated identifier                            |
| **name**        | VARCHAR - UNIQUE, NOT NULL                 | Department name (e.g., Chemistry)                    |
| **zone**        | ENUM (new_senate \| old_senate) - NOT NULL | Building zone for location-based CSO filtering       |
| **hod_user_id** | UUID - FK → users                          | References the current HOD; updated when HOD changes |

## 4.4 Rooms Table

Records every room or office whose physical key is managed through the security desk.

| **Column**        | **Type & Constraint**                      | **Purpose**                                      |
| ----------------- | ------------------------------------------ | ------------------------------------------------ |
| **id**            | UUID - Primary Key                         | Auto-generated identifier                        |
| **code**          | VARCHAR - UNIQUE, NOT NULL                 | Human-readable room code (e.g., ENG-201)         |
| **department_id** | UUID - FK → departments                    | Owning department; drives HOD visibility via RLS |
| **zone**          | ENUM (new_senate \| old_senate) - NOT NULL | Building zone; enables location filtering        |
| **description**   | VARCHAR                                    | Optional label (e.g., Engineering Lab 1)         |

## 4.5 Authorization Slots Table

This is the most critical enforcement table in the schema. It implements the rule that no more than three staff members may be authorized to collect the key for any single room. The constraint is enforced at the database engine level, not in application code, eliminating any possibility of a race condition or bug bypassing it.

| **Column**          | **Type & Constraint**                | **Purpose**                                                          |
| ------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| **id**              | UUID - Primary Key                   | Auto-generated identifier                                            |
| **room_id**         | UUID - FK → rooms, NOT NULL          | Identifies the room this authorization applies to                    |
| **slot_number**     | INT - CHECK (slot_number IN (1,2,3)) | Slot position; engine rejects any value outside 1-3                  |
| **user_id**         | UUID - FK → users, NOT NULL          | Staff member assigned to this slot                                   |
| **assigned_by**     | UUID - FK → users                    | HOD who submitted the appointment memo                               |
| **approved_by_cso** | BOOLEAN - DEFAULT false              | CSO must confirm before slot becomes active                          |
| **created_at**      | TIMESTAMPTZ - DEFAULT now()          | Assignment timestamp for audit trail                                 |
| **-**               | UNIQUE (room_id, slot_number)        | Physically prevents a 4th collector from being inserted for any room |

## 4.6 Key Transactions Table

The primary audit trail. Every physical key handover and return is logged here with exact timestamps and the identities of both the requester and the verifying security officer. This table is the foundation for overdue alerts and AI incident analysis.

| **Column**             | **Type & Constraint**                          | **Purpose**                                                       |
| ---------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| **id**                 | UUID - Primary Key                             | Auto-generated transaction identifier                             |
| **room_id**            | UUID - FK → rooms, NOT NULL                    | Which room's key was issued                                       |
| **requester_id**       | UUID - FK → users, NOT NULL                    | Staff member who collected the key                                |
| **verifier_id**        | UUID - FK → users, NOT NULL                    | Security officer who issued the key                               |
| **collected_at**       | TIMESTAMPTZ - NOT NULL                         | Exact time of physical key handover                               |
| **expected_return**    | TIMESTAMPTZ                                    | Computed return deadline; basis for overdue alerts                |
| **returned_at**        | TIMESTAMPTZ - NULL until returned              | Filled in when key is physically returned                         |
| **returned_by**        | UUID - FK → users                              | Person who returned the key (may differ from collector)           |
| **return_verifier_id** | UUID - FK → users                              | Officer who received the key back                                 |
| **key_count**          | INT - NOT NULL                                 | Number of keys in the bunch issued                                |
| **status**             | ENUM (out\|returned\|overdue\|lost) - NOT NULL | Current state of the key; updated by Edge Functions for overdue   |
| **is_weekend**         | BOOLEAN - DEFAULT false                        | Flags after-hours or weekend transactions for additional scrutiny |

## 4.7 Access Requests Table

Tracks the complete lifecycle of every digital request from submission through approval to physical collection. The AI risk score and recommendation are stored alongside human decisions to enable full auditability of both automated and manual judgements.

| **Column**             | **Type & Constraint**                                                               | **Purpose**                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **id**                 | UUID - Primary Key                                                                  | Auto-generated request identifier                                           |
| **requester_id**       | UUID - FK → users, NOT NULL                                                         | Staff member submitting the request                                         |
| **room_id**            | UUID - FK → rooms, NOT NULL                                                         | Room whose key is being requested                                           |
| **request_type**       | ENUM (pickup \| authorization) - NOT NULL                                           | Distinguishes routine collection from a new authorization request           |
| **status**             | ENUM (pending\|hod_approved\|cso_approved\|denied\|collected\|cancelled) - NOT NULL | Current lifecycle stage of the request                                      |
| **hod_decision_by**    | UUID - FK → users                                                                   | HOD who approved or denied                                                  |
| **hod_decision_at**    | TIMESTAMPTZ                                                                         | Timestamp of HOD decision                                                   |
| **cso_decision_by**    | UUID - FK → users                                                                   | CSO who approved or denied (for escalated requests)                         |
| **cso_decision_at**    | TIMESTAMPTZ                                                                         | Timestamp of CSO decision                                                   |
| **weekend_letter_url** | VARCHAR                                                                             | Supabase Storage path for uploaded HOD weekend approval letter              |
| **qr_token**           | VARCHAR - UNIQUE                                                                    | Temporary one-time collection token; displayed as QR code for Verifier scan |
| **ai_risk_score**      | FLOAT                                                                               | Calculated risk score in range 0.0-1.0                                      |
| **ai_recommendation**  | ENUM (auto_approve\|review\|deny)                                                   | AI engine's recommendation based on risk score and history                  |
| **created_at**         | TIMESTAMPTZ - DEFAULT now()                                                         | Request submission timestamp                                                |

## 4.8 Shifts Table

Records security verifier shifts and the chain-of-custody handover between shifts. The incoming verifier must acknowledge the count of outstanding keys from the previous shift before their shift begins.

| **Column**                       | **Type & Constraint**       | **Purpose**                                                                   |
| -------------------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| **id**                           | UUID - Primary Key          | Auto-generated shift identifier                                               |
| **verifier_id**                  | UUID - FK → users, NOT NULL | Security officer on this shift                                                |
| **shift_start**                  | TIMESTAMPTZ - NOT NULL      | Shift start time (e.g., 7:00 AM)                                              |
| **shift_end**                    | TIMESTAMPTZ - NOT NULL      | Shift end time (e.g., 2:00 PM)                                                |
| **handover_acknowledged**        | BOOLEAN - DEFAULT false     | Set to true when incoming officer confirms outstanding key count              |
| **outstanding_keys_at_handover** | INT                         | Number of keys still out when shift changed; basis for chain-of-custody audit |
| **notes**                        | TEXT                        | Free-text shift report notes                                                  |

## 4.9 Incident Log Table

Designed as an append-only table: the database role used by the application has INSERT permission but explicitly no UPDATE or DELETE permissions on this table. This mirrors the requirement of a physical incident book - once an entry is made, it cannot be altered. The ai_summary column stores the LLM-generated narrative report.

| **Column**         | **Type & Constraint**                                                       | **Purpose**                                               |
| ------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| **id**             | UUID - Primary Key                                                          | Auto-generated incident identifier                        |
| **transaction_id** | UUID - FK → key_transactions                                                | Related key transaction, if applicable                    |
| **reported_by**    | UUID - FK → users, NOT NULL                                                 | User who filed the incident                               |
| **incident_type**  | ENUM (lost_key\|unauthorized_attempt\|overdue\|tampering\|other) - NOT NULL | Classifies the incident for filtering and reporting       |
| **description**    | TEXT - NOT NULL                                                             | Human-written account of what occurred                    |
| **ai_summary**     | TEXT                                                                        | LLM-generated formal narrative report (Gemini API output) |
| **severity**       | ENUM (low\|medium\|high\|critical) - NOT NULL                               | Severity classification; high/critical triggers CSO alert |
| **created_at**     | TIMESTAMPTZ - DEFAULT now()                                                 | Immutable filing timestamp                                |
| **-**              | APPEND-ONLY (PostgreSQL permission constraint)                              | Application role has INSERT only; no UPDATE or DELETE     |

## 4.10 HOD Signatures Table

Stores the reference signature and stamp images that were uploaded during the HOD's registration. These serve as the baseline for pixel-level comparison when new documents are submitted for verification.

| **Column**        | **Type & Constraint**       | **Purpose**                                                                              |
| ----------------- | --------------------------- | ---------------------------------------------------------------------------------------- |
| **id**            | UUID - Primary Key          | Auto-generated identifier                                                                |
| **hod_user_id**   | UUID - FK → users, UNIQUE   | UNIQUE constraint ensures exactly one reference record per HOD                           |
| **signature_url** | VARCHAR - NOT NULL          | Supabase Storage path to the reference signature image (processed: 200×100px, grayscale) |
| **stamp_url**     | VARCHAR - NOT NULL          | Supabase Storage path to the reference stamp image (same processing)                     |
| **uploaded_at**   | TIMESTAMPTZ - DEFAULT now() | Timestamp of reference upload                                                            |

# 5\. API Routes Design

All backend logic is implemented as Next.js API routes (pages/api/ or app/api/ directory). Each route executes as a serverless function. Routes are grouped by functional domain. All routes require a valid Supabase JWT in the Authorization header; role checks are enforced both by the route handler and by Supabase RLS.

## 5.1 Authentication Routes

| **Method** | **Route**                | **Role(s)**                       | **Description**                                                                |
| ---------- | ------------------------ | --------------------------------- | ------------------------------------------------------------------------------ |
| POST       | /api/auth/login          | All                               | Validates email + password; triggers OTP for HOD/Verifier; returns session JWT |
| POST       | /api/auth/verify-otp     | HOD, Verifier, Staff (new device) | Validates email OTP; completes 2FA; returns full session                       |
| POST       | /api/auth/register       | Staff (invite)                    | Completes staff registration: uploads passport photo, sets password            |
| POST       | /api/auth/activate-hod   | HOD (invite)                      | HOD clicks invite link; uploads signature + stamp; sets password; enables 2FA  |
| POST       | /api/auth/logout         | All                               | Invalidates Supabase session token                                             |
| POST       | /api/auth/reset-password | All                               | Triggers Supabase Auth password reset email                                    |

## 5.2 Request Management Routes

| **Method** | **Route**                  | **Role(s)**       | **Description**                                                                    |
| ---------- | -------------------------- | ----------------- | ---------------------------------------------------------------------------------- |
| POST       | /api/requests/submit       | Staff             | Submits a new key request; triggers AI risk scoring; stores score + recommendation |
| GET        | /api/requests/my           | Staff             | Returns the authenticated staff member's request history                           |
| GET        | /api/requests/pending      | HOD               | Returns pending requests for the HOD's department                                  |
| POST       | /api/requests/hod-decision | HOD               | HOD approves or denies; generates QR token on approval                             |
| GET        | /api/requests/cso-queue    | CSO               | Returns high-risk or escalated requests awaiting CSO review                        |
| POST       | /api/requests/cso-decision | CSO               | CSO approves or denies; updates request status                                     |
| GET        | /api/requests/live-queue   | Security Verifier | Returns all approved requests pending physical key collection                      |
| POST       | /api/requests/collect      | Security Verifier | Verifier scans QR; confirms identity; issues key; logs transaction                 |
| POST       | /api/requests/cancel       | Staff             | Staff cancels a pending request (only if status = pending)                         |

## 5.3 Key Transaction Routes

| **Method** | **Route**           | **Role(s)**       | **Description**                                                |
| ---------- | ------------------- | ----------------- | -------------------------------------------------------------- |
| POST       | /api/keys/return    | Security Verifier | Logs key return; updates transaction status to 'returned'      |
| GET        | /api/keys/out       | CSO, Verifier     | Returns all transactions with status = 'out' or 'overdue'      |
| GET        | /api/keys/history   | CSO, HOD          | Returns paginated key transaction history with filters         |
| POST       | /api/keys/mark-lost | CSO               | Marks a key as lost; triggers incident log entry automatically |

## 5.4 User Administration Routes

| **Method** | **Route**                     | **Role(s)** | **Description**                                                       |
| ---------- | ----------------------------- | ----------- | --------------------------------------------------------------------- |
| POST       | /api/admin/create-hod         | CSO         | Creates HOD account; sends invite link to official email              |
| POST       | /api/admin/create-verifier    | CSO         | Creates Security Verifier account; sends invite link                  |
| PATCH      | /api/admin/revoke-access      | CSO         | Sets is_active = false on user record; immediately blocks login       |
| GET        | /api/admin/users              | CSO         | Lists all users with role, department, and status filters             |
| POST       | /api/admin/nominate-collector | HOD         | Submits collector appointment memo; creates authorization_slot record |
| DELETE     | /api/admin/remove-collector   | HOD         | Removes collector from a room slot; requires memo reference           |

## 5.5 AI and Reporting Routes

| **Method** | **Route**                | **Role(s)**       | **Description**                                                                  |
| ---------- | ------------------------ | ----------------- | -------------------------------------------------------------------------------- |
| GET        | /api/ai/risk-alerts      | CSO               | Returns current high-risk access patterns detected by the rule engine            |
| POST       | /api/ai/generate-report  | CSO               | Calls Gemini API with incident data; stores ai_summary in incident_log           |
| POST       | /api/ai/verify-signature | System (internal) | Processes uploaded document through sharp + pixelmatch; returns match ratio      |
| GET        | /api/incidents           | CSO               | Returns paginated incident log (read-only; no update/delete endpoint exists)     |
| POST       | /api/incidents/log       | CSO, Verifier     | Appends a new incident entry; triggers AI summary generation if severity >= high |

# 6\. AI Component Design

The SmartKey AI layer uses four distinct techniques, each selected to match the characteristics of the specific sub-problem it solves. This is deliberate: a single model would be less accurate and less explainable than specialised approaches applied to the right tasks.

## 6.1 Pattern Detection and Risk Scoring

### Approach: Rule-Based Expert System

Pattern detection uses a rule-based expert system implemented entirely in TypeScript and SQL - no external AI library is required. When a staff member submits a new access request, the API route at POST /api/requests/submit executes three parameterized SQL queries against the PostgreSQL database and combines their outputs into a risk score.

The three detection rules are:

- Frequency Flag: Counts how many requests the same user has submitted in the past 24 hours. A count above a configurable threshold (default: 5) sets this flag.
- After-Hours Flag: Checks whether the request time falls outside weekday operating hours (07:00-18:00). Weekend requests always set this flag.
- Restricted-Zone Flag: Checks whether the requested room is marked restricted in the rooms table AND whether the requester does not appear in the authorization_slots table for that room.

Each flag carries a configurable weight. The default weights are:

| **Frequency Flag Weight**       | 0.30 |
| ------------------------------- | ---- |
| **After-Hours Flag Weight**     | 0.40 |
| **Restricted-Zone Flag Weight** | 0.30 |

The risk score is the weighted sum of active flags, normalized to \[0.0, 1.0\]. A score above the threshold (default: 0.60) produces an ai_recommendation of 'review'; scores at or below produce 'auto_approve'. The threshold and weights are stored as environment variables, allowing adjustment during pilot testing without code changes.

This approach is deterministic (same inputs always produce the same output), fully explainable (each decision links to specific rules and thresholds), and requires no training data - critical for a system with no historical digital records at launch.

## 6.2 Approval Recommendation System

### Approach: SQL Historical Pattern Matching

The approval recommendation system extends the risk scoring logic with a historical routine-detection query. After the risk score is computed, the API route queries the key_transactions table to find past approved transactions matching the current request on four dimensions:

- Same requesting user
- Same room
- Same day of the week
- Within a two-hour window of the current request time

If at least three matching historical transactions are found AND no risk flag is currently active, the system marks the request as 'routine' and recommends auto_approval, bypassing manual HOD review. Otherwise the request proceeds to HOD for human review. This is a lookup, not a machine learning model, and it improves automatically as more legitimate transactions accumulate - without retraining.

## 6.3 Incident Report Generation

### Approach: Large Language Model (Google Gemini API)

Incident report generation is the only task in SmartKey that requires a Large Language Model (LLM). It is used exclusively for converting structured database records into formal, readable narrative prose - a task where LLMs outperform deterministic methods. All other AI tasks use rule-based or pixel-level methods.

Implementation details:

- Model: Google Gemini (gemini-3.0-flash) via REST API.
- Selection rationale: Google offers a free tier of 15 requests per minute with no billing required, sufficient for pilot-scale incident report generation; the flash model excels at structured-data-to-narrative conversion.
- Invocation: Called from POST /api/ai/generate-report. The route collects data from incident_log, key_transactions, and users tables, assembles a structured prompt including timestamps, names, room codes, transaction status, and prior flags, and sends it to the Gemini REST endpoint via a standard fetch call (no SDK dependency).
- Output: The LLM returns a formal incident summary in paragraph form. The summary is stored in the ai_summary column of incident_log.
- Fallback: If the Gemini API is unavailable or the free-tier quota is exhausted, a TypeScript template function fills a pre-defined Markdown template using string interpolation, producing a structured (though less natural) report. This ensures the feature always produces output regardless of external API availability.

## 6.4 Signature and Stamp Verification

### Approach: Pixel-Level Image Comparison (sharp + pixelmatch)

Signature and stamp verification uses two open-source Node.js libraries: sharp (v0.33) for image preprocessing and pixelmatch (v6.0) for pixel-level comparison. No machine learning model, GPU, or training data is required.

Verification workflow:

- During HOD registration, the uploaded signature and stamp images are preprocessed by sharp: resized to 200×100 pixels and converted to grayscale. The processed images are saved to Supabase Storage as reference images and their paths recorded in hod_signatures.
- When a document requiring HOD authorization is submitted, the signature or stamp region is extracted and processed identically by sharp (same dimensions and colour space).
- pixelmatch compares the two images pixel by pixel and returns a count of differing pixels. This count is divided by the total pixel count (20,000) to produce a difference ratio.
- If the ratio exceeds the configurable threshold (default: 0.15, i.e., 15% of pixels differ), the document is flagged as potentially tampered and routed to the CSO for manual review.

This method is specifically designed to detect gross tampering (e.g., a completely different signature pasted onto a document), not to perform forensic-level verification. Both libraries are lightweight (Sharp: ~7 MB; pixelmatch: zero dependencies), run entirely server-side, and add no cost to the project.

# 7\. Authentication and Security Model

## 7.1 Authentication Flow

SmartKey uses Supabase Auth for all authentication operations. The flow is role-differentiated:

| **Role**          | **2FA Requirement**                           | **Registration Method**                                 | **OTP Delivery** |
| ----------------- | --------------------------------------------- | ------------------------------------------------------- | ---------------- |
| CSO               | Every login                                   | Super-admin seed; Supabase dashboard                    | Email OTP        |
| HOD               | Every login                                   | CSO creates account; invite link sent to official email | Email OTP        |
| Security Verifier | Every login                                   | CSO creates account; invite link                        | Email OTP        |
| Staff             | First login from new device; weekend requests | HOD nominates; automated invitation                     | Email OTP        |

Upon successful authentication, Supabase issues a JWT containing the user's id and a custom role claim. This JWT is included in every subsequent API request as a Bearer token. The Supabase client library on the server verifies the JWT signature on every request; no separate token validation library is needed.

## 7.2 Row Level Security (RLS)

Row Level Security is the primary data isolation mechanism. RLS policies are defined on every table and are evaluated by the PostgreSQL engine before any query executes. This means a HOD cannot read another department's data, even via a direct API call that bypasses application-level checks - the database itself enforces the isolation.

Example RLS policies:

- users table: A user may read only their own row. CSO may read all rows.
- access_requests table: Staff may read only their own requests. HOD may read requests for their department. CSO may read all.
- key_transactions table: Verifier may insert and read. CSO may read all. Staff may read their own.
- incident_log table: All authenticated users may insert. CSO may read all. No role may update or delete.

This approach directly eliminates OWASP API Security Top 10 risk A01 (Broken Object Level Authorization), as the database - not the application - enforces row-level permissions.

## 7.3 Registration Chain of Trust

User registration follows a structured three-wave chain of trust, ensuring every system account is vouched for by a verified superior:

- Wave 1: CSO initialised via super-admin seed. CSO creates HOD accounts using the official UNILAG staff directory and dispatches invite links to official university email addresses.
- Wave 2: HOD clicks invite link, sets password, completes 2FA setup, uploads reference signature and stamp, and nominates up to three staff collectors per managed room.
- Wave 3: Nominated collectors receive automated invitations, register their profiles, and upload their passport photographs.

This cascade ensures that no unauthorized person can self-register. Every account in the system is traceable to a verifiable superior authority via the invited_by foreign key in the users table.

## 7.4 Additional Security Measures

- Append-only Incident Log: The application database role has INSERT permission only on incident_log. UPDATE and DELETE permissions are explicitly revoked at the PostgreSQL level, matching the tamper-evidence requirement of a physical incident book.
- Temporary QR Tokens: The qr_token field in access_requests stores a one-time token generated on approval. It is invalidated immediately upon key collection (status → collected), preventing replay attacks.
- File Storage RLS: All uploaded files (passport photos, signatures, weekend letters) are stored in Supabase Storage with RLS policies that mirror the database table policies, preventing unauthorized file access.
- UNIQUE Constraint on Slots: The UNIQUE(room_id, slot_number) constraint in authorization_slots prevents race conditions that could otherwise allow a fourth collector to be inserted concurrently.

# 8\. Real-Time Communication

Real-time updates are essential for two roles: the Security Verifier, whose queue must update immediately when a new request is approved, and the CSO, whose Building Pulse dashboard must reflect live key counts and overdue alerts.

## 8.1 Mechanism: Supabase Realtime

Supabase Realtime uses the WebSocket protocol (RFC 6455) combined with PostgreSQL's logical replication mechanism. When a row is inserted, updated, or deleted in a subscribed table, Supabase pushes the change event over WebSocket to all currently connected clients subscribed to that table and channel.

This eliminates the need for polling (periodic HTTP requests) and the complexity of setting up a separate WebSocket server such as Socket.io. Real-time events are guaranteed to be in sync with the database, since they originate from PostgreSQL's own replication log.

## 8.2 Subscriptions in SmartKey

| **Security Verifier Live Queue**       | Subscribes to INSERT events on access_requests WHERE status = 'cso_approved'. New requests appear instantly without page refresh. |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **CSO Building Pulse - Keys Out**      | Subscribes to UPDATE events on key_transactions WHERE status changes to 'out' or 'returned'. Live counter updates.                |
| **CSO Building Pulse - Overdue Count** | Subscribes to UPDATE events on key_transactions WHERE status changes to 'overdue' (set by Edge Function). Live alert count.       |
| **CSO Risk Alert Feed**                | Subscribes to INSERT events on access_requests with ai_risk_score > threshold. New high-risk requests surface immediately.        |

# 9\. Background Jobs (Edge Functions)

Two recurring backend jobs are implemented as Supabase Edge Functions running on the Deno runtime. These handle tasks that must execute on a schedule rather than in response to a user request.

## 9.1 Overdue Key Check (Hourly)

An Edge Function executes on a one-hour cron schedule. It queries key_transactions for all rows where status = 'out' AND expected_return < now(). For each such row it: sets status = 'overdue', inserts a low-severity incident_log entry, and triggers a Realtime event to the CSO dashboard overdue counter.

## 9.2 Daily Shift Summary (End-of-Day)

An Edge Function executes at the end of each operating day (default: 18:00). It queries the shifts table for the current day's shift record, aggregates key transaction counts (issued, returned, overdue, lost), and writes a summary to the shifts.notes column. This provides the CSO with a daily operational overview without manual compilation.

# 10\. Key Backend Workflows

## 10.1 Key Request Submission

- Staff submits POST /api/requests/submit with room_id and request_type.
- API route verifies JWT; confirms staff is in authorization_slots for the room (if request_type = pickup).
- AI risk engine executes three SQL queries; computes weighted risk score; sets ai_recommendation.
- New record inserted into access_requests with status = 'pending' and AI fields populated.
- If ai_recommendation = 'auto_approve' AND routine check passes: status advances to 'hod_approved' automatically; QR token generated.
- Otherwise: HOD receives a Realtime notification of a pending request in their queue.

## 10.2 HOD Approval and QR Token Generation

- HOD reviews request via their dashboard; calls POST /api/requests/hod-decision.
- On approval: API generates a UUID-based QR token; stores it in qr_token; sets status = 'hod_approved'.
- For standard rooms: status advances directly to 'cso_approved' (no separate CSO action needed).
- For high-risk (score > 0.6) or restricted-zone requests: status remains 'hod_approved'; CSO receives alert and must approve via POST /api/requests/cso-decision.
- Staff receives dashboard notification that their request is approved and QR code is ready.

## 10.3 Physical Key Collection

- Staff presents QR code at the security desk. Verifier scans it via their dashboard.
- API route validates qr_token; retrieves requester's passport_photo_url; displays photo for Verifier identity confirmation.
- Verifier confirms identity and calls POST /api/requests/collect.
- API inserts a new row in key_transactions with status = 'out', collected_at = now(), expected_return computed.
- qr_token is cleared (set to null) to prevent reuse. Request status updated to 'collected'.
- CSO Building Pulse live counter updates via Realtime.

## 10.4 Key Return

- Returning person (may differ from collector) presents at the security desk.
- Verifier calls POST /api/keys/return with transaction_id and returned_by user ID.
- API sets returned_at = now(), returned_by, return_verifier_id, and status = 'returned'.
- CSO Building Pulse counter decrements via Realtime.

# 11\. Performance and Scalability

SmartKey is designed for pilot deployment across two to three university departments. The following performance targets and design choices support this scope while leaving room for university-wide expansion.

| **Metric**                 | **Target**             | **Design Choice Supporting It**                    | **Notes**                              |
| -------------------------- | ---------------------- | -------------------------------------------------- | -------------------------------------- |
| Request processing time    | < 2 seconds end-to-end | Serverless API routes; Supabase connection pooling | vs. 45-60 min manual process           |
| Record-keeping error rate  | < 1% (target: 0%)      | Database UNIQUE/CHECK constraints; ENUM types      | vs. frequent illegible/missing entries |
| Real-time update latency   | < 500ms                | Supabase Realtime WebSocket; no polling            | Verifier queue and CSO dashboard       |
| Concurrent users           | Up to 50 (pilot)       | Vercel serverless auto-scaling                     | Expandable with Supabase Pro tier      |
| Incident report generation | < 10 seconds           | Gemini flash model; template fallback              | Fallback always available              |
| Signature verification     | < 200ms                | sharp + pixelmatch; in-process; no network call    | Full server-side; no GPU needed        |

Database indexes are defined on the most frequently queried columns: requester_id and room_id in access_requests, requester_id and room_id in key_transactions, and hod_user_id in authorization_slots. These support the AI pattern detection queries and reduce their execution time to single-digit milliseconds at pilot scale.

# 12\. Deployment Architecture

## 12.1 Production Environment

| **Frontend + API Routes**                | Vercel (zero-config Next.js deployment; global CDN; automatic HTTPS)                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Database + Auth + Storage + Realtime** | Supabase Cloud (managed PostgreSQL; automatic backups; SSL enforced)                                       |
| **Background Edge Functions**            | Supabase Edge Functions (Deno runtime; cron triggers)                                                      |
| **Environment Variables**                | Vercel environment variable store (SUPABASE_URL, SUPABASE_ANON_KEY, GEMINI_API_KEY, risk score thresholds) |
| **Database Migrations**                  | Supabase CLI migration files; applied via CI/CD pipeline on merge to main                                  |
| **CI/CD**                                | GitHub Actions: lint → unit tests → integration tests → deploy to Vercel + Supabase                        |

## 12.2 Environment Configuration

All configurable parameters are stored as environment variables to allow threshold adjustment during pilot testing without code changes:

- SUPABASE_URL and SUPABASE_ANON_KEY - database and auth connection
- GEMINI_API_KEY - Google Gemini API access
- RISK_SCORE_THRESHOLD - default 0.60; adjustable during pilot
- RISK_WEIGHT_FREQUENCY, RISK_WEIGHT_AFTER_HOURS, RISK_WEIGHT_RESTRICTED - default 0.30 / 0.40 / 0.30
- SIGNATURE_DIFF_THRESHOLD - default 0.15; adjustable based on HOD signature variability observed in pilot
- OPERATING_HOURS_START, OPERATING_HOURS_END - default 07:00 / 18:00

# 13\. Implementation Roadmap (Second Semester)

Backend development is organized into five Agile sprints, each producing a working, testable increment. All sprints are scheduled for the second semester.

| **Sprint** | **Focus Area**                           | **Key Backend Deliverables**                                                                                                      | **Testing Approach**                                                                               |
| ---------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Sprint 1   | Authentication & Registration            | Supabase Auth integration; three-wave registration flow; JWT middleware; RLS policies for users table                             | Unit tests for each auth route; invite link flow tested end-to-end                                 |
| Sprint 2   | Dashboards & Request Workflow            | All request management API routes; HOD approval flow; QR token generation; Realtime subscriptions for Verifier queue              | Integration tests for full request lifecycle; Realtime update latency measured                     |
| Sprint 3   | AI Rule Engine & Risk Scoring            | TypeScript risk scoring function; three SQL detection queries; approval recommendation lookup; environment variable configuration | Unit tests for risk score function with boundary inputs; rule output verified against manual cases |
| Sprint 4   | LLM Integration & Signature Verification | Gemini API call + template fallback; sharp + pixelmatch verification module; signature storage pipeline                           | Gemini output quality reviewed; pixelmatch threshold calibrated with real HOD signature samples    |
| Sprint 5   | CSO Dashboard & Background Jobs          | Building Pulse Realtime subscriptions; overdue check Edge Function; daily shift summary Edge Function; full audit log API         | End-to-end CSO workflow tested; Edge Function cron timing verified; performance metrics captured   |

# 14\. Implementation Status

Track progress here after every merged PR. Update the status column; link the PR.

| Component | Status | PR |
| --- | --- | --- |
| Supabase project setup + packages | 🔄 In progress | #9 |
| Database schema (all 11 tables) | ⬜ Not started | — |
| RLS policies | ⬜ Not started | — |
| Postgres RPCs (10 functions) | ⬜ Not started | — |
| Supabase client utilities + logger + audit writer | ⬜ Not started | — |
| Auth middleware (role gating) | ⬜ Not started | — |
| Auth API routes (login, OTP, register, activate) | ⬜ Not started | — |
| Request management API routes | ⬜ Not started | — |
| Key transaction + admin API routes | ⬜ Not started | — |
| Supabase Realtime subscriptions | ⬜ Not started | — |
| Rule-based risk scoring engine + unit tests | ⬜ Not started | — |
| Risk tier UI (RiskTierBadge, RiskFactorPopover) | ⬜ Not started | — |
| Gemini shift report generation | ⬜ Not started | — |
| Signature verification (Sharp + Pixelmatch) | ⬜ Not started | — |
| Supabase Storage (photos, signatures, letters) | ⬜ Not started | — |
| Shift handover + incident + report API routes | ⬜ Not started | — |
| Edge Functions (overdue check + daily summary) | ⬜ Not started | — |
| CI/CD pipeline (GitHub Actions) | ⬜ Not started | — |

Statuses: `⬜ Not started` → `🔄 In progress` → `✅ Done`

# 15\. Conclusion

The SmartKey backend is designed as a coherent, purposefully assembled system in which every component addresses a specific, demonstrated requirement of the university access-control domain. The architecture collapses what would typically require five or more separate services - a backend server, a database, an authentication service, a file storage service, and a WebSocket server - into two managed platforms: Next.js on Vercel and Supabase Cloud.

The database schema enforces all business-critical rules at the engine level, not just in application code: the three-collector-per-room limit, the append-only incident log, the chain-of-custody shift handover, and role-based data isolation through Row Level Security. The AI layer applies four distinct techniques matched to the characteristics of each sub-problem: a rule-based expert system for transparent, explainable risk scoring; SQL historical matching for approval recommendations; Google Gemini for narrative incident report generation; and pixel-level image comparison for signature verification.

Against the current manual system - which requires 45 to 60 minutes per transaction, produces frequent illegible or incomplete records, and cannot detect suspicious access patterns - the SmartKey backend is projected to reduce processing time by 80-90%, eliminate record-keeping errors, and provide continuous, automated security monitoring. The second-semester implementation sprints will validate these projections through user acceptance testing with pilot departments.