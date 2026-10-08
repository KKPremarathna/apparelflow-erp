# ApparelFlow ERP — Cutting Verification & Sewing Queue

A full-stack garment-production checkpoint application built with React,
Express, Prisma, and PostgreSQL.

ApparelFlow prevents incomplete or unverified cutting batches from
entering the sewing queue. It combines authenticated role-based
workspaces, component-level quantity verification, rejection and
resubmission workflows, and persistent audit records.

## Live Demo

- Application: https://apparelflow-5zii.onrender.com
- Repository: https://github.com/KKPremarathna/apparelflow-erp

The frontend and API are deployed on a single Render Web Service.
PostgreSQL is hosted on Supabase.

If the application is hosted on a Render Free instance, an initial
request after inactivity may take longer while the service wakes up.

## Demo Accounts

These accounts are provided specifically for public evaluation.
Do not enter confidential information into the demo application.

| Role | Email | Password |
|---|---|---|
| Cutting Supervisor | supervisor@apparelflow.demo | Demo@12345 |
| Cutting Verifier | verifier@apparelflow.demo | Demo@12345 |
| Sewing Supervisor | sewing@apparelflow.demo | Demo@12345 |

The login page includes a visible demo credential panel.

Selecting "Use credentials" fills the login form. Authentication still
takes place through the backend. The panel does not change roles in
frontend state or bypass authorization.

Log out before evaluating another role.

## Technology Stack

### Frontend

- React
- Vite
- Tailwind CSS and custom CSS
- Fetch API with cookie credentials

### Backend

- Node.js
- Express 5
- Prisma 7
- PostgreSQL driver adapter: `@prisma/adapter-pg`
- JWT authentication
- bcrypt password hashing
- Helmet
- Cookie Parser
- Express Rate Limit
- CORS and custom CSRF request protection

### Testing

- Vitest
- Supertest
- A separate Supabase test project

### Deployment

- Render: frontend and Express API
- Supabase: PostgreSQL database

## Architecture

```text
Browser
   |
   | Same-origin requests to /api
   v
Render Web Service
   |
   +-- React production build
   |
   +-- Express API
          |
          +-- Authentication and role guards
          +-- Input validation
          +-- Manufacturing workflow rules
          +-- Transactional audit/activity writes
          |
          v
      Prisma + PostgreSQL adapter
          |
          v
      Supabase PostgreSQL
```

During local development:

- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- API base: http://localhost:5000/api

During production deployment:

- Frontend and API share the deployed origin.
- Frontend API requests use `/api`.
- Express serves the frontend build from `client/dist`.

## Roles and Responsibilities

### Cutting Supervisor

- Selects a production recipe.
- Creates cutting orders.
- Enters target garment quantity, fabric roll ID, and actual fabric usage.
- Reviews expected component counts.
- Tracks their cutting orders.
- Resubmits rejected batches after re-cutting.

A Cutting Supervisor cannot perform verification decisions or access
the sewing queue.

### Cutting Verifier

- Opens pending batches.
- Enters and saves actual component counts.
- Reviews live QC previews and saved verification results.
- Approves eligible batches.
- Rejects batches with a mandatory reason.

A Cutting Verifier cannot create cutting orders or access the sewing
queue.

### Sewing Supervisor

- Receives verified batches in the waiting queue.
- Reviews component snapshots and verifier audit details.
- Starts sewing assembly.

Pending and rejected batches must not be exposed through sewing
queue or batch-detail access.

## Production Workflow

```text
Order submission
      |
      v
PENDING_VERIFICATION
      |
      +-- Counts complete, no shortages
      |         |
      |         v
      |      VERIFIED
      |         |
      |         v
      |    Sewing waiting queue
      |         |
      |         v
      |    SEWING_IN_PROGRESS
      |
      +-- Rejection with completed counts and a valid reason
                |
                v
             REJECTED
                |
                v
        Supervisor re-cuts and resubmits
                |
                v
        PENDING_VERIFICATION
        Counts reset for a fresh inspection
```

## Component Verification Rules

Expected component quantities are derived from the selected recipe:

```text
Expected pieces =
Target garment quantity × Pieces per garment
```

| QC State | Condition | Meaning |
|---|---|---|
| GREEN | Actual = Expected | Match |
| YELLOW | Actual > Expected | Excess |
| RED | Actual < Expected | Shortage |

A yellow excess does not block approval.

Approval requires every component to have a valid saved count and
no component shortage.

Frontend previews are not treated as saved verification results.
The backend independently validates approval eligibility.

### Rejection Prerequisite

This implementation requires all component counts to be entered and
saved before rejection, together with a non-empty rejection reason.

This is an additional workflow-hardening decision. It reduces accidental
rejection and ensures that a rejection record includes a completed
quantity inspection.

A separate early-rejection path for fabric defects discovered before
counting is outside the current scope.

### Resubmission

A rejected batch can be resubmitted by its authorized owner.

- Total fabric usage cannot be lower than the recorded usage.
- Component actual counts and QC statuses are reset.
- Existing rejection audit records are preserved.
- Fresh counts are required before another verification decision.

## Fabric Wastage

The backend computes and stores fabric variance:

```text
Expected fabric =
Target quantity × Standard fabric yards per garment

Fabric wastage % =
((Actual fabric − Expected fabric) / Expected fabric) × 100
```

Saved verification records carry the relevant wastage value into
the sewing handoff.

## Database Model

The core relational entities are:

| Entity | Purpose |
|---|---|
| User | Authentication, role, and user identity |
| Recipe | Garment recipe and fabric settings |
| RecipeComponent | Component names and pieces-per-garment values |
| CuttingOrder | Batch quantity, fabric usage, owner, and lifecycle status |
| VerificationItem | Expected and actual component counts |
| VerificationLog | Verification decisions, actor, snapshot, and timestamp |
| ActivityLog | User-scoped records of operational actions |

Relations connect users to created orders and verification decisions,
recipes to components and orders, and orders to verification items
and audit records.

The Prisma schema is located at:

```text
server/prisma/schema.prisma
```

Migration history is stored in:

```text
server/prisma/migrations
```

Production recipes used for evaluation include Casual Blouse
(`REC-BL01`) and Crop Top (`REC-CT02`).

## Security and Data Integrity

### Authentication

- Passwords are stored as bcrypt hashes.
- JWTs are stored in HttpOnly cookies.
- Cookies use the Secure attribute in production.
- JWT signature and payload shape are validated.
- The authenticated user is retrieved from the database.
- Invalid, null, or blank-subject payloads receive a controlled
  authentication error.

### Server-Side Authorization

Role and ownership checks are enforced by the API.

Hiding a frontend button or workspace is not relied upon as the
security boundary.

### Gatekeeper Hard Stop

The API rejects approval when components are missing, uncounted,
or short.

Non-verifier users cannot approve batches.

The sewing queue is filtered by verified status at the database-query
level.

### Request Protection

- Mutating requests require the custom CSRF protection header.
- Supplied origins must match the configured frontend origin.
- Login attempts are rate limited.
- JSON request size is limited.
- Input values are validated on the server.

### Audit Integrity

Verification audit records preserve verifier attribution, timestamps,
component snapshots, and wastage values.

The integration suite checks that existing verification audit records
cannot be updated or deleted through the tested database access path.

## Private Activity History

Each authenticated user can view their own operational activity.

Tracked actions include:

- ORDER_CREATED
- COMPONENT_COUNT_UPDATED
- BATCH_APPROVED
- BATCH_REJECTED
- ORDER_RESUBMITTED
- SEWING_STARTED

History is user-scoped, not shared across everyone with the same role.

The backend derives the actor from the authenticated context.
Actor and role query overrides are rejected.

Business updates and their corresponding activity records are written
transactionally. Failed activity writes must roll back the related
business update.

Private activity history is an additional feature beyond the core
manufacturing checkpoint.

## Repository Structure

```text
client/
  src/
    components/
    lib/
    App.jsx
    index.css
    DemoCredentials.css

server/
  src/
    controllers/
    db/
    middleware/
    routes/
    services/
    app.js
    server.js
  prisma/
    schema.prisma
    migrations/
    seed.js
  scripts/
    test-env.js
  tests/
  prisma7.config.ts
```

## Local Setup

Use a Node.js release supported by the locked dependencies.
The deployment configuration described below uses Node.js 22.14.0.

From the repository root:

```bash
cd client
npm ci --include=dev
cd ../server
npm ci --include=dev
npx prisma generate
```

Stop running development servers before reinstalling dependencies.
On Windows, running processes can hold native dependency files open.

### Backend Environment

Create `server/.env` with your own values:

```env
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:5173
DATABASE_URL=YOUR_RUNTIME_POSTGRESQL_CONNECTION_URL
DIRECT_URL=YOUR_PRISMA_CLI_POSTGRESQL_CONNECTION_URL
JWT_SECRET=YOUR_RANDOM_LOCAL_SECRET
```

Do not commit this file.

The runtime Prisma adapter uses `DATABASE_URL`.

The Prisma CLI configuration uses `DIRECT_URL`.
The existing configuration filename is `prisma7.config.ts`.

### Database Preparation

Check migration status:

```bash
cd server
npx prisma migrate status
```

For a new database with the committed migration history, review the
migration target before applying migrations:

```bash
npx prisma migrate deploy
```

Inspect the seed script before running:

```bash
npx prisma db seed
```

Do not reset, seed, or migrate an existing demo/production database
without reviewing the operation and intended target.

### Start Development Servers

Backend terminal:

```bash
cd server
npm run dev
```

Frontend terminal:

```bash
cd client
npm run dev
```

## Automated Tests

Run the suite through the guarded test command:

```bash
cd server
npm test
```

The suite uses Vitest and Supertest and contains 22 tests across the
three supplied test files.

All 22 tests passed in the dedicated local test environment.
Post-deployment browser and API smoke tests are still required
to validate the deployed configuration.

### Dedicated Test Database

Tests create and update orders, users, counts, and audit records.

They must use a separate Supabase project, not the live demo database.

Create `server/.env.test` with:

```env
NODE_ENV=test
CLIENT_URL=http://localhost:5173
DATABASE_URL=YOUR_SEPARATE_TEST_PROJECT_RUNTIME_URL
DIRECT_URL=YOUR_SEPARATE_TEST_PROJECT_CLI_URL
JWT_SECRET=YOUR_TEST_SECRET
```

The wrapper in `server/scripts/test-env.js`:

- Identifies Supabase project references from pooler URLs.
- Ensures test runtime and migration URLs target the same project.
- Refuses to run when test URLs identify the demo project.
- Requires `NODE_ENV=test` and a JWT secret.
- Passes the test environment to the child process.

The wrapper expects Supabase pooler URLs with project-identifying
usernames. Direct hostnames or custom database usernames require
a deliberate update to this validation logic.

If the dedicated test project needs preparation, inspect its target
and the seed script before using:

```bash
npm run test:db:migrate
npm run test:db:seed
```

Some test-created orders and audit records remain in the test project.
Use a disposable or dedicated test environment.

### Covered Rules

The suite includes:

- Successful all-GREEN approval.
- Shortage and missing-count approval rejection.
- Rejection without a valid reason.
- Non-verifier approval denial.
- Verified-only sewing queue isolation.
- Rejection blocked when counts are missing.
- Resubmission count reset and audit preservation.
- Single-start sewing behavior.
- Verification audit update/delete blocking.
- CSRF header and origin checks.
- Authentication requirements for history.
- Per-user activity isolation.
- Actor identity override protection.
- Activity rollback consistency.
- No successful-action logs for failed or duplicate decisions.

## Frontend Checks

```bash
cd client
npm run lint
npm run build
```

A successful frontend build does not by itself prove runtime workflow
or authorization correctness.

## Render Deployment

Deploy the repository as a single Node Web Service.

### Settings

| Setting | Value |
|---|---|
| Root Directory | Empty when `client/` and `server/` are at repository root |
| Region | Oregon (US West)  |
| Health Check Path | /api/health |
| Start Command | cd server && npm start |

Build command:

```bash
cd client && npm ci --include=dev && npm run build && cd ../server && npm ci --include=dev && npx prisma generate
```

Environment-variable names:

```text
NODE_ENV
NODE_VERSION
DATABASE_URL
DIRECT_URL
JWT_SECRET
CLIENT_URL
TRUST_PROXY
```

Deployment configuration:

```text
NODE_ENV=production
NODE_VERSION=22.14.0
TRUST_PROXY=1
```

Set `CLIENT_URL` to the exact deployed HTTPS origin, without `/api`
or a trailing slash.

Do not place database URLs or JWT secrets in Vite variables.

The health endpoint confirms API availability; it does not query
PostgreSQL.

### Post-Deployment Checks

- Login for all three demo accounts.
- Session persistence after refresh.
- Logout and protected-route denial.
- Order creation.
- Component count saving.
- UI and API shortage hard stop.
- Rejection and resubmission.
- Verified sewing handoff and assembly start.
- Private history isolation.
- Mobile form/table usability.

## Known Limitations and Follow-Up Work

- Some order and queue lists are not paginated.
- Database/network performance needs measurement under representative
  deployed load.
- The interactive transaction timeout was increased to 15 seconds as
  a mitigation, not a speed optimization.
- The current app mounts My History while hiding it, which can cause
  an additional initial fetch; lazy loading remains a follow-up.
- Dependency security findings were identified in development/build
  tooling. These require targeted review and compatible updates;
  they are not dismissed as cosmetic.
- Shared public demo accounts are intended for evaluation, not
  confidential production use.
- Early rejection before completed component counting is not
  implemented.
- Production readiness requires broader load, operational, security,
  and concurrency validation than the current assessment scope.

## AI Assistance

AI-assisted development, reviewed defects, refactoring decisions,
and defensive architecture are documented in:

```text
AI_OPTIMIZATION_REPORT.md
```