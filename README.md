# AI Revenue Recovery Agent

## Problem

Businesses lose revenue silently through failed subscription charges and one-off payments. This agent detects at-risk revenue, diagnoses the failure cause, chooses a bounded recovery action, executes it, and proves the outcome with measured numbers and an audit trail.

This build focuses on failed subscription and payment retry recovery. Checkout abandonment and B2B invoice recovery are out of scope.

## Architecture

Synthetic payment events enter the pipeline and are deduplicated into cases during detection. Diagnosis classifies each case, the decision gate enforces confidence rules, and the action engine executes the bounded playbook. Every stage writes to the audit log; metrics aggregate the results for the React dashboard.

The flow is: detection → diagnosis → decision gate → action engine → audit log → metrics → dashboard.

## Tech Stack

- Backend: Node.js and Express
- Database: MongoDB with Mongoose
- LLM: Gemini API with structured JSON output
- Payments: Razorpay Test Mode API
- Frontend: React, Vite, Tailwind CSS, and Recharts
- Hosting target: Render, Vercel, and MongoDB Atlas

## Run Locally

### Prerequisites

- Node.js
- MongoDB connection
- Gemini API key
- Razorpay test-mode credentials

### Environment

Create `backend/.env` from the `backend/.env.example` template. Required variables are:

```text
MONGODB_URI=
GEMINI_API_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
PORT=5000
```

Create `frontend/.env` with:

```text
VITE_API_BASE_URL=http://localhost:5000
```

### Install

```bash
cd backend
npm install

cd ../frontend
npm install
```

### Start the pipeline

In separate terminals:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

Backend pipeline scripts:

- `npm run seed` — generate synthetic events
- `npm run detect` — create deduplicated cases
- `npm run diagnose` — diagnose detected cases
- `npm run gate` — apply confidence gating
- `npm run act` — execute bounded recovery actions
- `npm run reset` — drop the events, cases, and auditlogs collections
- `npm run dev` — start the backend development server

The frontend also supports `npm run dev`, `npm run build`, `npm run lint`, and `npm run preview`.

## API and Demo

Live demo: [DEPLOYED_URL_HERE]

Key API routes:

- `GET /api/cases`
- `GET /api/cases/:id`
- `GET /api/metrics`
- `POST /api/run-batch`

## Verified Batch Metrics

The last documented metrics snapshot covered 67 cases, including the three incentive-verification cases:

- Recovery rate: 52.2%
- Total recovered: ₹282,348
- Net recovery: ₹281,598
- Recovered: 35
- Escalated: 29
- Lost: 3

The ₹750 difference between gross and net recovery came from three applied incentives: ₹200, ₹250, and ₹300.

## What's Simulated vs. Real

Razorpay payment retries call the real Razorpay Test Mode API and create test-mode orders. SMS and email reminders, along with payment-method-link actions, are simulated and logged; they are not sent to real customers.

## Guardrails

- Maximum 3 retry attempts per case; after that, the case becomes `lost`.
- Incentive spend is capped at 10% of `amountAtRisk`.
- Reminder frequency is limited to once per 24 simulated hours.
- Diagnoses below 0.6 confidence are routed to `escalate_human` instead of acting automatically.
