# AI Optimization Report

## Project

ApparelFlow ERP — Cutting Verification & Sewing Queue

- Live application: https://apparelflow-5zii.onrender.com
- Repository: https://github.com/KKPremarathna/apparelflow-erp

This report documents how AI assistance was used, which suggestions
required correction, and how the implementation was reviewed and
hardened.

AI-generated code and audit conclusions were treated as proposals,
not as evidence that the application was correct.

## 1. Tools & Prompting

### Perplexity

Perplexity was used to assist with:

- Understanding the manufacturing workflow and assessment scope.
- Reviewing authentication and role boundaries.
- React component implementation and styling.
- Verification, rejection, resubmission, and sewing flow discussions.
- Input validation and defensive checks.
- Test review and test-environment safety.
- Deployment configuration for Render.
- Dependency audit interpretation.
- Documentation drafting.

Complete replacement files were requested rather than disconnected
patches to reduce integration mistakes.

### Antigravity

Antigravity was used for a repository-wide audit covering:

- Requirements.
- Backend and frontend structure.
- Authentication and authorization.
- Workflow integrity.
- Performance.
- Dependency risks.
- Tests.
- Deployment readiness.

The audit was requested as a review-only task, with restrictions
against modifying source files, applying dependency upgrades,
running destructive database operations, or deploying changes.

Its conclusions were subsequently reviewed. Some statements were
more confident than the available evidence justified and were not
accepted without qualification.

### Prompting Approach

Prompts emphasized:

- Real server authentication instead of a frontend-only role switch.
- Backend validation independent of disabled UI controls.
- Persistent relational data and verification snapshots.
- Explicit state transitions.
- A separate test database.
- No automatic database reset or force dependency fixes.
- Maintaining existing business behavior during styling updates.

## 2. Flawed / Broken / Suboptimal AI Output

### Example 1: Hardcoded Local API URL

An earlier API helper used:

```js
const API_BASE_URL = "http://localhost:5000/api";
```

This was suitable for local development but not for the deployed
application. In a deployed browser, localhost refers to the evaluator's
computer rather than the deployed backend.

The helper was updated to use:

- A configurable public API base if provided.
- `/api` in the same-origin production deployment.
- `http://localhost:5000/api` during local development.

The Express deployment serves both the frontend and API from one
origin.

This change addressed deployment compatibility. It did not alter
backend role enforcement or authentication rules.

### Example 2: Mixed React Component and Utility Exports

The AI-generated `WorkflowStatus.jsx` exported React components and
the ordinary helper function `getDecisionBorderColor`.

This produced a Fast Refresh-related lint issue in the component
module.

The module was refactored so that:

- Color helpers remain internal.
- A `VerificationAuditEntry` component handles the audit border.
- Consumers import React components rather than the ordinary helper.

The status colors and workflow behavior were preserved.

This illustrates why generated code must be checked with the
project's actual lint configuration, not only reviewed for syntax.

### Example 3: Hidden History Component Still Mounted

The app shell mounted Workspace and MyActivity together, then used
the HTML hidden attribute to choose the visible section.

This preserved workspace state, but hiding a component does not
prevent its effects from running. MyActivity can therefore make
an initial request before the user opens History.

This was identified as a performance follow-up.

It has not been documented as a completed lazy-loading optimization.
A future change must consider whether workspace form state should
remain mounted when navigating between sections.

### Example 4: Unsafe Dependency-Audit Interpretation

The audit suggested treating development/build findings as
irrelevant or cosmetic.

This was not accepted as a general security conclusion.

The actual npm report proposed force fixes including a Prisma
downgrade and a Nodemon downgrade. These changes were not applied
blindly.

The adopted approach was to:

- Review dependency paths.
- Separate runtime, development, build, and test exposure.
- Keep Prisma CLI tooling separate from runtime client packages.
- Evaluate targeted updates and compatibility tests.
- Avoid claiming that reclassifying a dependency patches its
  vulnerability.

Remaining dependency findings require follow-up.

## 3. Human Review, Refactoring & Optimization

The developer reviewed, integrated, and locally checked changes with
AI assistance. The decisions below distinguish implemented changes
from unresolved improvements.

### Completed-Count Requirement Before Rejection

The rejection flow was strengthened to require:

1. A valid saved count for every component.
2. No unsaved count changes.
3. A valid non-empty rejection reason.

The frontend disables rejection until these conditions are met.
The backend independently rejects a decision when required counts
are missing.

The purpose is to reduce accidental rejection and attach a complete
quantity inspection to the rejection record.

This is an implementation-specific workflow decision beyond the
mandatory reason requirement.

It does not imply that early defect rejection is invalid in all
manufacturing systems. A separate early-rejection path is outside
this implementation.

The suite includes a test for rejection with missing component counts.

### Defensive JWT Payload Validation

JWT payload validation was made explicit:

```js
if (
  payload === null ||
  typeof payload !== "object" ||
  typeof payload.sub !== "string" ||
  payload.sub.trim() === ""
) {
  return res.status(401).json({
    message: "Invalid session.",
  });
}
```

This adds:

- A null guard before property access.
- A supported payload-shape check.
- A string subject check.
- A non-empty trimmed subject check.

This was a defensive refinement, not a claimed failure in the normal
login flow.

JWT verification remains in place, and the current user is retrieved
from the database before access is granted.

A dedicated malformed-payload regression test is a follow-up; the
existing suite must not be described as proving every payload edge case.

### Private Activity History

A private My History feature was added for authenticated users
across all three roles.

Important design decisions:

- Actor identity comes from authenticated context.
- History is scoped by user, not merely by role.
- Users with the same role cannot see each other's history.
- Actor/role query overrides are rejected.
- Relevant business updates and activity writes share a transaction.
- Failed or duplicate actions must not produce successful-action logs.

Tracked actions include order creation, component updates, rejection,
approval, resubmission, and sewing start.

Tests cover identity isolation, transactional rollback, and duplicate
or failed-action logging behavior.

### UI Improvements Without Permission Changes

The UI was refined with:

- Readable dark input text on light backgrounds.
- Two-column batch details.
- A cutting-order form with a live preview.
- Red rejected statuses and green verified statuses.
- QC labels accompanying status colors.
- Red rejection and green approval buttons.
- A compact visible demo credential panel.

Demo account selection fills credentials only. It does not set an
authenticated role in frontend state.

### Transaction Timeout Mitigation

A create-order transaction exceeded the original five-second timeout.

The interactive transaction default was increased to fifteen seconds
as a temporary mitigation.

This does not make queries faster. It allows additional time for
the transaction to complete while performance is investigated.

Verification snapshots and activity records were not moved outside
transactions simply to improve apparent response time.

### Test Database Protection

The test wrapper checks that:

- Runtime and migration URLs identify the same test project.
- Test URLs do not identify the demo project.
- The environment is explicitly marked as test.
- A test JWT secret is present.

The wrapper refuses to proceed when these checks fail.

Tests are invoked through the wrapper rather than bypassing it.

## 4. Defensive Architecture

### Server-Derived Identity

The backend derives user identity from a verified token and database
lookup.

Verifier attribution and activity actor identity are not taken from
client-supplied identity fields.

### Role and Ownership Boundaries

Backend middleware and queries enforce role restrictions and relevant
ownership checks.

The frontend displays appropriate workspaces, but hidden controls
are not relied on as authorization.

Direct approval requests from non-verifier roles must receive 403.

### Server-Enforced Approval Gate

The backend validates current persisted component counts before
approval.

An order must not be approved when:

- Required components/counts are missing.
- Components are uncounted.
- Any component is short.

The UI distinguishes draft previews from saved counts and prevents
approval with unsaved edits.

Direct API attempts must fail even if UI restrictions are bypassed.

### Sewing Queue Isolation

The waiting queue query selects verified batches.

Changing a requested status parameter must not expose pending or
rejected orders.

Starting assembly transitions an eligible batch to sewing-in-progress.
Duplicate starts are rejected, and the batch leaves the waiting queue.

### Audit Preservation

Verification decisions retain:

- Verifier identity.
- Timestamp.
- Component snapshot and variances.
- Fabric wastage.
- Rejection reason when applicable.

Resubmission resets current inspection counts without replacing
historical rejection records.

Tests attempt direct database update and delete operations against
existing audit records and expect rejection.

These tests demonstrate the tested immutability path; they do not
claim protection against every possible privileged database action.

### Atomic Activity Logging

Activity records are written with business changes using the same
transaction client.

A log failure must roll back the business update rather than leave
an untracked successful state change.

The suite explicitly checks rollback behavior.

### Request and Input Protection

The application uses:

- HttpOnly authentication cookies.
- Secure production cookies.
- JWT signature and payload validation.
- Origin validation for supplied origins on mutating requests.
- A required custom CSRF protection header.
- Login rate limiting.
- Server-side quantity and fabric validation.
- Bounded request-body size.

Quantities and component counts must satisfy integer and range
requirements. Fabric usage accepts validated positive decimal values
with at most two decimal places.

## Verification Evidence and Limitations

### Checks Performed

I completed the following checks:

- Built the frontend successfully for production.
- Generated Prisma Client successfully.
- Checked that the database migrations were up to date.
- Deployed the application to Render and checked its operation.
- Ran the supplied test suite against the dedicated test project;
  all 22 tests passed.

These checks do not establish complete production readiness.
Broader concurrency, load, and security validation remain follow-up work.

### Remaining Work

- Query-level deployed performance measurement.
- Pagination for unbounded list endpoints.
- Lazy loading of private history.
- Targeted dependency remediation and compatibility checks.
- Dedicated malformed JWT payload tests.
- Broader concurrency and load testing.
- A separate early-defect rejection path if future requirements need it.

## Conclusion

AI assistance accelerated implementation, styling, review, and
documentation, but generated output was not accepted without scrutiny.

The most important engineering decisions were server-enforced workflow
rules, authenticated actor attribution, persisted audit records,
transactional consistency, and an isolated test environment.

Deployment success and passing tests are useful evidence, but they do
not justify claiming that all security, performance, or production
operational risks have been eliminated.