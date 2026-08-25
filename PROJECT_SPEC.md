# PROJECT_SPEC.md

> Reference this file for all architecture, schema, and naming decisions. Do not invent alternate field names, endpoints, or statuses — extend this spec by editing it, not by diverging from it in code.

## 1. Project summary

**Name:** AI Revenue Recovery Agent
**Problem:** Businesses lose revenue silently at several points — failed subscription charges, failed one-off payments, abandoned checkouts, overdue B2B invoices. This agent detects at-risk revenue, diagnoses the cause, decides on a bounded recovery action, executes it, and proves the outcome with measured numbers.
**This build's scope:** Failed-subscription / payment-retry recovery only (not checkout abandonment or invoices — keep scope narrow).
**Success criteria:** Process a 50+ record synthetic batch end-to-end and report: total ₹ at risk, total ₹ recovered, net recovery (after incentive cost), recovery rate %, cause-wise breakdown, and an honest exception list of unresolved cases — all backed by a full audit trail.

## 2. Tech stack (fixed — do not substitute)

| Layer | Choice |
|---|---|
| Backend | Node.js + Express |
| Database | MongoDB (Mongoose ODM) |
| LLM | Gemini API (`@google/generative-ai`), structured JSON output |
| Payments | Razorpay Test Mode API |
| Frontend | React + Vite + Tailwind CSS + Recharts |
| Hosting | Render (backend) + Vercel (frontend) + MongoDB Atlas (DB) |

## 3. Repo structure

```
revenue-recovery-agent/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── config/
│   │   │   ├── db.js
│   │   │   └── gemini.js
│   │   ├── models/
│   │   │   ├── Event.js
│   │   │   ├── Case.js
│   │   │   └── AuditLog.js
│   │   ├── services/
│   │   │   ├── dataGenerator.js
│   │   │   ├── detection.js
│   │   │   ├── diagnosis.js
│   │   │   ├── decisionGate.js
│   │   │   ├── actionEngine.js
│   │   │   ├── razorpayClient.js
│   │   │   └── metrics.js
│   │   └── routes/
│   │       ├── cases.js
│   │       └── metrics.js
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── SummaryBar.jsx
│   │   │   ├── RecoveryChart.jsx
│   │   │   ├── CaseTable.jsx
│   │   │   └── CaseDrilldown.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── tailwind.config.js
├── .gitignore
├── README.md
└── PROJECT_SPEC.md
```

## 4. Environment variables

`backend/.env` (never commit — must be in `.gitignore`):
```
MONGODB_URI=
GEMINI_API_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
PORT=5000
```

`frontend/.env`:
```
VITE_API_URL=http://localhost:5000
```

## 5. Data model (MongoDB / Mongoose)

### `Event`
Raw synthetic events, generated once, never mutated by the pipeline.
```js
{
  customerId: String,
  type: String,          // enum: "subscription" | "payment"
  amount: Number,         // INR
  status: String,         // enum: "failed" | "pending"
  failureReason: String,  // enum: see FAILURE_REASONS below
  createdAt: Date
}
```

### `Case`
The working unit the whole pipeline operates on. One `Case` per deduplicated at-risk event.
```js
{
  eventId: ObjectId,          // ref: Event
  customerId: String,
  status: String,             // enum: see CASE_STATUSES below
  amountAtRisk: Number,
  amountRecovered: Number,    // default 0
  incentiveSpent: Number,     // default 0, for net-recovery calc
  cause: String,               // enum: see FAILURE_REASONS, set by diagnosis
  recommendedAction: String,   // enum: see ACTIONS below
  confidence: Number,          // 0–1, from Gemini
  reasoning: String,           // Gemini's stated reasoning
  gateOverridden: Boolean,     // true if decision gate overrode the LLM's action
  retryCount: Number,          // default 0
  nextActionAt: Date,          // when the next playbook step should fire
  createdAt: Date,
  updatedAt: Date
}
```

### `AuditLog`
Append-only. Every pipeline stage writes here — this is the audit trail the metrics/UI reads from.
```js
{
  caseId: ObjectId,       // ref: Case
  timestamp: Date,
  stage: String,          // enum: "detection" | "diagnosis" | "decision" | "action"
  detail: Mixed,          // stage-specific structured payload
  reasoning: String        // human-readable one-liner for the UI timeline
}
```

## 6. Fixed enums (do not add values without updating this file first)

**`FAILURE_REASONS`**
`insufficient_funds` | `expired_card` | `bank_server_error` | `wrong_cvv` | `fraud_flagged` | `network_timeout`

**`ACTIONS`**
| Action | Trigger cause | What it does |
|---|---|---|
| `retry_immediate` | `network_timeout`, `bank_server_error` | Immediate Razorpay retry |
| `retry_delayed` | `insufficient_funds` | Sets `nextActionAt` +2 days, then retries |
| `request_new_payment_method` | `expired_card`, `wrong_cvv` | Simulated link sent, no retry |
| `send_reminder` | any case with `retryCount > 0` and still failing | Simulated message, logged only |
| `escalate_human` | `fraud_flagged`, or `confidence < 0.6` (gate override) | No auto-action, goes to review queue |

**`CASE_STATUSES`**
`detected` → `diagnosing` → `action_taken` → one of terminal: `recovered` | `escalated` | `lost`

## 7. Pipeline stages (implement in this order)

1. **`dataGenerator.js`** — generates 60–80 `Event` docs via `@faker-js/faker`, distributed across all `FAILURE_REASONS`, amounts ₹200–₹15,000.
2. **`detection.js`** — reads `Event`s, **dedupes by `customerId` + `type`** (check-before-insert, no compound unique index side effects), creates `Case` docs with `status: 'detected'`.
3. **`diagnosis.js`** — for each `detected` case, calls Gemini with `responseMimeType: "application/json"` and a `responseSchema` matching:
   ```json
   { "cause": "...", "recommendedAction": "...", "confidence": 0.0, "reasoning": "..." }
   ```
   Updates the `Case`, sets `status: 'diagnosing'` → writes `AuditLog` (`stage: 'diagnosis'`).
4. **`decisionGate.js`** — if `confidence < 0.6`, force `recommendedAction = 'escalate_human'` and set `gateOverridden: true`. Writes `AuditLog` (`stage: 'decision'`) noting whether it was gated.
5. **`actionEngine.js`** — executes the action per the `ACTIONS` table above:
   - `retry_immediate` / `retry_delayed` (after delay) → call `razorpayClient.js` (real test-mode API call)
   - `send_reminder`, `request_new_payment_method` → simulate + log only
   - `escalate_human` → set `status: 'escalated'`, stop
   - **Guardrails (hard-coded, non-negotiable):** max 3 retries per case → then `status: 'lost'`; max 1 reminder per 24h (simulated); incentive spend capped at 10% of `amountAtRisk`.
   - Writes `AuditLog` (`stage: 'action'`) for every attempt, success or failure.
6. **`metrics.js`** — aggregates across all `Case`s: total at risk, total recovered, net recovery (`recovered - incentiveSpent`), recovery rate %, cause-wise breakdown, average time-to-recovery, full list of `escalated`/`lost` cases with reasons.

## 8. API routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/cases` | List cases, supports `?status=` filter |
| GET | `/api/cases/:id` | Single case + its full `AuditLog` timeline |
| GET | `/api/metrics` | Summary metrics object (see section 7.6) |
| POST | `/api/run-batch` | Triggers generate → detect → diagnose → decide → act, full pipeline, for the demo button |

## 9. Frontend requirements

- **`SummaryBar.jsx`**: total at-risk ₹, total recovered ₹, net recovery ₹, recovery rate %
- **`RecoveryChart.jsx`**: Recharts bar chart, recovery rate by `cause`
- **`CaseTable.jsx`**: sortable/filterable list, status badge per row (color-coded by `CASE_STATUSES`)
- **`CaseDrilldown.jsx`**: on row click, show the case's full `AuditLog` as a timeline (stage, timestamp, reasoning)
- **"Run batch" button**: calls `POST /api/run-batch`, shows a loading state, then refreshes table + metrics

## 10. Non-negotiables (what's actually being graded)

- Every action must be traceable in `AuditLog` — no silent state changes.
- Guardrails must be enforced in code, not just described (max retries, spend cap, reminder frequency).
- Report **net** recovery, not gross — cost of recovery matters.
- At least one case in the demo dataset must end in `lost` with a clean, logged reason — don't hide failures.
- Low-confidence diagnoses must route to `escalate_human`, not auto-act — this is the single clearest signal of a "bounded, gated" system.

## 11. Explicitly out of scope for this build

Checkout-abandonment recovery, B2B invoice chasing, real SMS/WhatsApp/email sending, multi-tenant auth, production-grade queueing (Kafka/BullMQ) — do not add these unless core scope (sections 5–9) is fully working with time to spare.
