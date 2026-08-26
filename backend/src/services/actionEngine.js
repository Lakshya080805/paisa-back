require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Case = require('../models/Case');
require('../models/Event');
const AuditLog = require('../models/AuditLog');
const { retryPayment } = require('./razorpayClient');

const MAX_RETRIES = 3;
const MAX_INCENTIVE_RATE = 0.1;
const INCENTIVE_PERCENT = 0.05;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function addActionAuditLog(caseId, reasoning, detail = {}) {
  await AuditLog.create({
    caseId,
    timestamp: new Date(),
    stage: 'action',
    detail,
    reasoning,
  });
}

function calculateIncentiveAmount(amountAtRisk, incentiveSpent = 0) {
  const amount = Number(amountAtRisk) || 0;
  const spent = Number(incentiveSpent) || 0;

  if (amount <= 0) {
    return 0;
  }

  const maxAllowed = Math.round(amount * MAX_INCENTIVE_RATE);
  const remainingBudget = Math.max(0, maxAllowed - spent);
  if (remainingBudget <= 0) {
    return 0;
  }

  const suggested = Math.round(amount * INCENTIVE_PERCENT);
  return Math.min(suggested, remainingBudget);
}

async function getMostRecentEmailReminder(caseId) {
  return AuditLog.findOne({
    caseId,
    stage: 'action',
    'detail.channel': 'email',
    'detail.simulated': true,
  }).sort({ timestamp: -1 });
}

async function processRetryAttempt(caseDocument, actionName = 'retry_immediate') {
  const eventCustomerId = caseDocument.eventId?.customerId || '';
  const forceFail = eventCustomerId.startsWith('demo_guaranteed_failure_');
  const forceFailOnce = eventCustomerId.startsWith('demo_incentive_retry_once_')
    && (Number(caseDocument.retryCount) || 0) === 0;
  const paymentResult = await retryPayment({
    amountAtRisk: caseDocument.amountAtRisk,
    customerId: caseDocument.customerId,
    forceFail,
    forceFailOnce,
  });

  const retryCount = Number(caseDocument.retryCount) || 0;
  const hasPriorFailure = retryCount > 0;
  const incentiveAmount = hasPriorFailure
    ? calculateIncentiveAmount(caseDocument.amountAtRisk, caseDocument.incentiveSpent || 0)
    : 0;

  if (paymentResult.success) {
    const update = {
      status: 'recovered',
      amountRecovered: caseDocument.amountAtRisk,
      nextActionAt: null,
      updatedAt: new Date(),
    };

    if (incentiveAmount > 0) {
      update.incentiveSpent = (Number(caseDocument.incentiveSpent) || 0) + incentiveAmount;
    }

    const updatedCase = await Case.findByIdAndUpdate(
      caseDocument._id,
      update,
      { returnDocument: 'after' },
    );

    await addActionAuditLog(
      caseDocument._id,
      `Retry succeeded for ${caseDocument.customerId}; Razorpay order ${paymentResult.razorpayOrderId} was created successfully and the case was recovered.`,
      {
        action: actionName,
        incentiveApplied: incentiveAmount > 0,
        incentiveAmount,
        razorpayOrderId: paymentResult.razorpayOrderId,
        amountAtRisk: caseDocument.amountAtRisk,
        paymentResult,
      },
    );

    return {
      caseId: caseDocument._id,
      customerId: caseDocument.customerId,
      status: updatedCase.status,
      amountRecovered: updatedCase.amountRecovered,
      retryCount: updatedCase.retryCount || 0,
      incentiveSpent: updatedCase.incentiveSpent || 0,
    };
  }

  const nextRetryCount = retryCount + 1;
  const shouldStop = nextRetryCount >= MAX_RETRIES;

  const updatedCase = await Case.findByIdAndUpdate(
    caseDocument._id,
    {
      status: shouldStop ? 'lost' : 'action_taken',
      retryCount: nextRetryCount,
      updatedAt: new Date(),
    },
    { returnDocument: 'after' },
  );

  const reasoning = shouldStop
    ? `Retry failed after ${nextRetryCount} attempts; guardrail reached max retries and automatic retry was stopped.`
    : `Retry failed for ${caseDocument.customerId}; retryCount is now ${nextRetryCount} and the case is pending a future retry attempt.`;

  await addActionAuditLog(
    caseDocument._id,
    reasoning,
    {
      action: actionName,
      retryCount: nextRetryCount,
      maxRetries: MAX_RETRIES,
      paymentResult,
    },
  );

  return {
    caseId: caseDocument._id,
    customerId: caseDocument.customerId,
    status: updatedCase.status,
    retryCount: updatedCase.retryCount || 0,
  };
}

async function processRetryImmediate(caseDocument) {
  return processRetryAttempt(caseDocument, 'retry_immediate');
}

async function processRetryDelayed(caseDocument) {
  const now = new Date();
  const nextActionAt = caseDocument.nextActionAt ? new Date(caseDocument.nextActionAt) : null;

  if (!nextActionAt || nextActionAt <= now) {
    return processRetryAttempt(caseDocument, 'retry_delayed');
  }

  const delayedAt = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const updatedCase = await Case.findByIdAndUpdate(
    caseDocument._id,
    {
      status: 'action_taken',
      nextActionAt: delayedAt,
      updatedAt: now,
    },
    { returnDocument: 'after' },
  );

  await addActionAuditLog(
    caseDocument._id,
    'Retry delayed by 2 days because the customer likely had insufficient funds; waiting for available balance before retrying.',
    {
      action: 'retry_delayed',
      delayDays: 2,
      nextActionAt: delayedAt,
      reason: 'insufficient_funds',
      cause: caseDocument.cause,
    },
  );

  return {
    caseId: caseDocument._id,
    customerId: caseDocument.customerId,
    status: updatedCase.status,
    nextActionAt: updatedCase.nextActionAt,
    delayed: true,
  };
}

async function processSendReminder(caseDocument) {
  if ((Number(caseDocument.retryCount) || 0) <= 0) {
    return {
      caseId: caseDocument._id,
      customerId: caseDocument.customerId,
      status: caseDocument.status || 'action_taken',
      skipped: true,
      reason: 'Reminder only applies after at least one retry attempt.',
    };
  }

  const lastReminder = await getMostRecentEmailReminder(caseDocument._id);
  const now = new Date();

  if (lastReminder && now.getTime() - new Date(lastReminder.timestamp).getTime() < ONE_DAY_MS) {
    const updatedCase = await Case.findByIdAndUpdate(
      caseDocument._id,
      {
        status: 'action_taken',
        updatedAt: now,
      },
      { returnDocument: 'after' },
    );

    await addActionAuditLog(
      caseDocument._id,
      'Reminder suppressed by guardrail: max 1 reminder per 24 simulated hours.',
      {
        action: 'send_reminder',
        simulated: true,
        channel: 'email',
        suppressed: true,
        lastReminderAt: lastReminder.timestamp,
      },
    );

    return {
      caseId: caseDocument._id,
      customerId: caseDocument.customerId,
      status: updatedCase.status,
      reminderBlocked: true,
    };
  }

  const reminderMessage = `We are following up on your failed payment for ₹${caseDocument.amountAtRisk}. Please confirm your balance or update your payment method.`;
  const updatedCase = await Case.findByIdAndUpdate(
    caseDocument._id,
    {
      status: 'action_taken',
      updatedAt: now,
    },
    { returnDocument: 'after' },
  );

  await addActionAuditLog(
    caseDocument._id,
    'Simulated reminder sent',
    {
      action: 'send_reminder',
      simulated: true,
      channel: 'email',
      message: reminderMessage,
    },
  );

  return {
    caseId: caseDocument._id,
    customerId: caseDocument.customerId,
    status: updatedCase.status,
    reminderSent: true,
  };
}

async function processRequestNewPaymentMethod(caseDocument) {
  const now = new Date();
  const message = `Please update your saved payment method to continue this payment of ₹${caseDocument.amountAtRisk}.`;
  const updatedCase = await Case.findByIdAndUpdate(
    caseDocument._id,
    {
      status: 'escalated',
      updatedAt: now,
    },
    { returnDocument: 'after' },
  );

  await addActionAuditLog(
    caseDocument._id,
    'Simulated payment-method update link sent; this simulation has no response mechanism, so the case was escalated for human follow-up.',
    {
      action: 'request_new_payment_method',
      simulated: true,
      channel: 'email',
      message,
    },
  );

  return {
    caseId: caseDocument._id,
    customerId: caseDocument.customerId,
    status: updatedCase.status,
    escalated: true,
  };
}

async function processEscalateHuman(caseDocument) {
  const updatedCase = await Case.findByIdAndUpdate(
    caseDocument._id,
    {
      status: 'escalated',
      updatedAt: new Date(),
    },
    { returnDocument: 'after' },
  );

  await addActionAuditLog(
    caseDocument._id,
    'Routed to human review, no automatic action taken.',
    {
      action: 'escalate_human',
      reason: 'manual_review_required',
      recommendedAction: caseDocument.recommendedAction,
    },
  );

  return {
    caseId: caseDocument._id,
    customerId: caseDocument.customerId,
    status: updatedCase.status,
  };
}

async function dispatchCaseAction(caseDocument) {
  if (!caseDocument || !caseDocument.recommendedAction) {
    return {
      caseId: caseDocument ? caseDocument._id : null,
      customerId: caseDocument ? caseDocument.customerId : null,
      status: caseDocument ? caseDocument.status : null,
      skipped: true,
    };
  }

  switch (caseDocument.recommendedAction) {
    case 'retry_immediate':
      return processRetryImmediate(caseDocument);
    case 'retry_delayed':
      return processRetryDelayed(caseDocument);
    case 'send_reminder':
      return processSendReminder(caseDocument);
    case 'request_new_payment_method':
      return processRequestNewPaymentMethod(caseDocument);
    case 'escalate_human':
      return processEscalateHuman(caseDocument);
    default:
      return {
        caseId: caseDocument._id,
        customerId: caseDocument.customerId,
        status: caseDocument.status,
        skipped: true,
        reason: `No handler implemented for ${caseDocument.recommendedAction}.`,
      };
  }
}

async function runActionEngine() {
  await connectDB();

  const cases = await Case.find({
    status: { $nin: ['recovered', 'escalated', 'lost'] },
    recommendedAction: {
      $in: ['retry_immediate', 'retry_delayed', 'send_reminder', 'request_new_payment_method', 'escalate_human'],
    },
  }).populate('eventId').sort({ createdAt: 1 });

  const summary = {
    recovered: 0,
    escalated: 0,
    lost: 0,
    pendingRetry: 0,
    processed: 0,
  };

  const processedCases = [];

  for (const caseDocument of cases) {
    const result = await dispatchCaseAction(caseDocument);
    processedCases.push(result);
    summary.processed += 1;

    if (result.status === 'recovered') {
      summary.recovered += 1;
    } else if (result.status === 'escalated') {
      summary.escalated += 1;
    } else if (result.status === 'lost') {
      summary.lost += 1;
    } else if (result.status === 'action_taken') {
      summary.pendingRetry += 1;
    }
  }

  const finalStatusBreakdown = await Case.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  console.log('Action Engine Summary');
  console.log(JSON.stringify(summary, null, 2));
  console.log('Final Status Breakdown Across All Cases');
  console.log(JSON.stringify(finalStatusBreakdown, null, 2));
  console.log('Processed Cases');
  console.log(JSON.stringify(processedCases, null, 2));

  return { summary, finalStatusBreakdown };
}

if (require.main === module) {
  runActionEngine()
    .catch((error) => {
      console.error(`Action engine failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => {
      mongoose.disconnect();
    });
}

module.exports = {
  dispatchCaseAction,
  runActionEngine,
};
