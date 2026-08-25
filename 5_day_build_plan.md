# AI Revenue Recovery — 5-Day Build Plan

**Scope:** Failed-subscription / payment-retry recovery agent
**Stack:** Node.js + Express + MongoDB + Gemini API + Razorpay Test Mode API + React + Tailwind + Recharts
**Hosting:** Render (backend + MongoDB Atlas) + Vercel (frontend)
**Goal by Day 5:** A hosted, demoable agent that processes a 50+ record batch, shows measured recovery numbers, a full audit trail, and an honest exception list.

---

## Day 1 — Foundation: repo, data, and detection

**Goal:** Project skeleton exists, synthetic data is generated and stored in MongoDB, detection logic flags at-risk events.

### Morning (setup)
1. Create repo structure:
```
revenue-recovery-agent/
├── backend/
│   ├── src/
│   │   ├── server.js
│   │   ├── config/
│   │   │   ├── db.js               # mongoose connection
│   │   │   └── gemini.js           # Gemini client setup
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
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── tailwind.config.js
├── .gitignore
└── README.md
```
2. `git init`, push to GitHub (private is fine, make public before submission if required)
3. Backend setup: `npm init -y`, install `express mongoose dotenv cors @google/generative-ai razorpay uuid @faker-js/faker`
4. Frontend setup: `npm create vite@latest frontend -- --template react`, install `tailwindcss recharts axios`
5. Get: Razorpay test-mode API keys (dashboard → test mode → API keys), Gemini API key (Google AI Studio), MongoDB Atlas free-tier cluster + connection string. Store all in `backend/.env` (never commit — add to `.gitignore` immediately)

### Afternoon (data + detection)
6. Define Mongoose schemas:
   - `Event.js`: `customerId, type (subscription|payment|invoice), amount, status, failureReason, createdAt`
   - `Case.js`: `eventId, customerId, status (detected|diagnosing|action_taken|recovered|escalated|lost), amountAtRisk, amountRecovered, cause, recommendedAction, confidence, reasoning, nextActionAt, retryCount, createdAt, updatedAt`
   - `AuditLog.js`: `caseId, timestamp, stage (detection|diagnosis|decision|action), detail (Mixed/JSON), reasoning`
7. Write `dataGenerator.js`: generate 60–80 synthetic failed-payment/subscription events using `@faker-js/faker`, with decline reasons distributed across: insufficient funds, expired card, bank server error, wrong CVV, fraud-flagged, network timeout. Vary amounts (₹200–₹15,000) and customer profiles. Insert into MongoDB via `Event.insertMany()`.
8. Write `detection.js`: read raw events, **dedupe by customerId + subscription/type** (don't double-count repeated failures for the same underlying case), create `Case` documents with `status: 'detected'` and `amountAtRisk`
9. Add a quick script/route to trigger generation + detection and log counts to console. Test with `node src/services/dataGenerator.js` then `node src/services/detection.js` (or wire as npm scripts)

**End of Day 1 checkpoint:** Running your seed scripts produces ~50+ deduplicated `Case` documents in MongoDB Atlas, verifiable via MongoDB Compass or Atlas UI.

---

## Day 2 — Diagnosis engine and decision gate

**Goal:** Every detected case gets a Gemini-backed diagnosis with a structured, auditable output, and a confidence-based gate decides whether to auto-act or escalate.

### Morning
1. Write `diagnosis.js`: for each case, call the Gemini API with the failure reason + context. Use Gemini's **structured output / JSON mode** (`responseMimeType: "application/json"` with a `responseSchema`) so you get a guaranteed-parseable object, not free text you have to regex out:
```json
{"cause": "insufficient_funds", "recommendedAction": "retry_delayed", "retryDelayDays": 2, "confidence": 0.87, "reasoning": "..."}
```
2. Define your action taxonomy up front (keep it small and real):
   - `retry_immediate` — network/timeout errors
   - `retry_delayed` — insufficient funds (wait for payday cycle)
   - `request_new_payment_method` — expired/invalid card
   - `send_reminder` — abandoned/pending, no hard failure
   - `escalate_human` — fraud-flagged or low confidence
3. Update the `Case` document with the diagnosis fields; write every diagnosis call to `AuditLog` (`stage: 'diagnosis'`, include the raw reasoning)

### Afternoon
4. Write `decisionGate.js`: apply a confidence threshold (e.g. `confidence < 0.6` → force `recommendedAction = 'escalate_human'`, overriding what Gemini suggested). This override is your credibility feature — don't skip it, and make sure it's visibly logged as a gate override, not silently applied.
5. Run diagnosis + decision gate across the full batch. Sanity-check: some percentage should route to human escalation — if 100% auto-act, your gate isn't doing anything.
6. Log the gate outcome to `AuditLog` (`stage: 'decision'`, note whether it was gated or passed through as-is)

**End of Day 2 checkpoint:** Every `Case` document has `cause`, `recommendedAction`, `confidence`, and a gate outcome, all traceable in `AuditLog`. Query MongoDB to print a quick summary table.

---

## Day 3 — Action engine, guardrails, Razorpay integration

**Goal:** Cases that pass the gate get real (simulated where sensible) recovery actions executed, with hard guardrails so nothing runs away.

### Morning
1. Write `actionEngine.js` — a state machine per case driven by `case.status` and `case.recommendedAction`:
   - `retry_immediate` → call Razorpay test-mode Payments/Subscriptions API to retry the charge
   - `retry_delayed` → set `case.nextActionAt` (simulate by fast-forwarding time in the demo rather than literally waiting days)
   - `send_reminder` → log a simulated message (don't wire real SMS/email unless there's spare time — a clearly logged simulation is safer and just as demonstrable)
   - `request_new_payment_method` → simulate a payment-method-update link sent
   - `escalate_human` → move to a review queue, no auto-action
2. Write `razorpayClient.js` wrapping the test-mode Payments/Subscriptions API for the retry action — this is your one "real" integration point, make it solid rather than spreading thin
3. Log every action attempt + outcome to `AuditLog` (`stage: 'action'`)

### Afternoon
4. Implement guardrails directly in `actionEngine.js`:
   - Max retry attempts per case (e.g. 3) → after that, auto-escalate or mark `lost`
   - Max reminder frequency (e.g. ≤1 reminder per 24 simulated hours)
   - Spend cap: if an action includes a discount/incentive, cap total incentive value per case (e.g. ≤10% of `amountAtRisk`) so recovery cost is tracked, not just recovery amount
5. Implement playbook sequencing (Day 0 retry → Day 1 reminder → Day 3 retry+incentive → Day 7 escalate) as transitions on `case.status`/`nextActionAt`
6. Run the full batch through the action engine until every case settles into a terminal state: `recovered`, `escalated`, or `lost`
7. **Deliberately verify at least one graceful failure case** — seed one input that will retry, fail, hit the guardrail limit, and stop cleanly with a logged reason. This is explicitly asked for in the brief.

**End of Day 3 checkpoint:** Running `detection → diagnosis → decision → action` end-to-end on the full batch produces terminal outcomes for every case, all logged, guardrails visibly enforced.

---

## Day 4 — Audit trail, metrics, and dashboard

**Goal:** The numbers are computed correctly and the UI makes the whole story visible and clickable.

### Morning (backend)
1. Write `metrics.js`:
   - Total amount at risk, total recovered, recovery rate %
   - Cause-wise breakdown (recovery rate segmented by failure cause)
   - Cost of recovery (total incentive/discount spend vs. amount recovered) — report **net** recovery, not gross
   - Average time-to-recovery
   - Full exception list: every case ending in `lost` or `escalated`, with the reason
2. Add Express routes:
   - `GET /api/cases` — list with status/filter query params
   - `GET /api/cases/:id` — full case doc + its audit trail (join/query `AuditLog` by `caseId`)
   - `GET /api/metrics` — summary numbers
   - `POST /api/run-batch` — triggers generation + full pipeline (for a live demo button)
3. Test each endpoint with `curl`/Postman/Thunder Client before touching the frontend

### Afternoon (frontend)
4. Build React dashboard:
   - **Summary bar**: total at-risk ₹, total recovered ₹, recovery rate %, net recovery (after cost)
   - **Recharts chart**: recovered vs. lost, or cause-wise recovery rate bar chart
   - **Live case feed/table**: status badges (detected/diagnosing/retrying/recovered/escalated/lost), sortable/filterable
   - **Case drill-down**: click a row → modal or side panel showing the full audit trail timeline (cause → action → outcome, each with timestamp and reasoning)
   - **"Run batch" button** wired to `POST /api/run-batch`, so you can trigger the whole pipeline live during the demo
5. Wire frontend to backend with `axios` (base URL from a Vite env var, e.g. `VITE_API_URL`), handle loading states

**End of Day 4 checkpoint:** Open the dashboard, click "run batch," watch it process, see the summary numbers, chart, and case list populate. Clicking any case shows its full story.

---

## Day 5 — Polish, testing, hosting, demo prep

**Goal:** Everything is deployed, reproducible, and you can demo it confidently in the time slot you're given.

### Morning (testing + polish)
1. Full run-through from a clean MongoDB collection: drop collections, regenerate data, run the full pipeline, confirm numbers look sane and reproducible
2. Fix obvious UI rough edges — spacing, empty states, loading spinners
3. Write a short note (README or in-app) on **what you'd guardrail further in production** — shows maturity and reads well to Razorpay evaluators
4. Double-check your one deliberate failure case is still visible and explainable in the demo data

### Afternoon (hosting)
5. **Database**: confirm your MongoDB Atlas free-tier cluster is set up with network access allowing Render's IPs (or `0.0.0.0/0` for hackathon simplicity), and your connection string is in Render's env vars, not committed to code
6. **Backend**: deploy Express app to **Render**
   - Add a `render.yaml` or configure manually: build command `npm install`, start command `node src/server.js`
   - Set env vars in Render's dashboard: `MONGODB_URI`, `GEMINI_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `PORT`
   - Enable CORS in Express (`cors` middleware) allowing your Vercel frontend's domain
7. **Frontend**: deploy React app to **Vercel**
   - Set `VITE_API_URL` env var in Vercel's dashboard pointing at your Render backend URL
   - Confirm the build works (`vite build`) and env var is actually picked up (Vite env vars must be prefixed `VITE_` and set at build time)
8. Smoke-test the live hosted version end-to-end — click "run batch" on the deployed site, confirm data flows through Gemini and Razorpay test APIs correctly. Catch CORS/env issues now, not during judging. Note: Render free tier can cold-start slowly after inactivity — hit it once before your demo slot to warm it up.

### Evening (submission prep)
9. Write the README: problem statement, architecture summary (you already have the diagram), how to run locally, live demo link, key metrics achieved, and an honest "what's simulated vs. real" section (e.g. "SMS/email are logged simulations; payment retry hits Razorpay's real test-mode API")
10. Record a short backup demo video/screen-recording in case live demo has network issues or Render cold-start during judging
11. Prepare your 60–90 second narrative: the problem → the loop (detect/diagnose/act) → the guardrails → the numbers (₹X at risk, ₹Y recovered, Z% rate, net of cost) → one honest failure case

**End of Day 5 checkpoint:** Live hosted link works end-to-end, README is submission-ready, you have a rehearsed narrative and a backup recording.

---

## Cut list if you fall behind

If you're short on time by Day 3–4, cut in this order (highest to lowest priority to keep):
1. **Keep**: detection → diagnosis → decision gate → single action type (retry) → audit log → basic metrics
2. **Cut first**: multiple action types (keep just retry + escalate, drop reminder/incentive sequencing)
3. **Cut second**: Recharts visualizations (a clean table with numbers is enough)
4. **Cut third**: real Razorpay API call (simulate it too, clearly labeled, if integration is eating time) — but try hard not to cut this, it's your strongest differentiator
5. **Never cut**: the audit trail and the honest exception list — these are explicitly what's being graded

## Stack-specific notes

- **Gemini structured output**: use `responseSchema` with `responseMimeType: "application/json"` on the generation config — this avoids brittle regex-parsing of the LLM's text output and keeps diagnosis fully auditable.
- **MongoDB dedup**: use a compound index or a query-before-insert check on `customerId + type` when creating cases in `detection.js`, so re-running detection on the same events doesn't create duplicate cases.
- **Render + MongoDB Atlas**: both have free tiers, but Render's free web service spins down after inactivity — factor the cold-start into your demo timing (hit the health endpoint a few minutes before presenting).
- **Vercel env vars**: remember Vite bakes `VITE_*` vars in at build time, not runtime — if you change the backend URL, you need to redeploy the frontend, not just update an env var and refresh.
