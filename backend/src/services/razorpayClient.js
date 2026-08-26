const path = require('path');
const Razorpay = require('razorpay');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

const razorpay = keyId && keySecret
  ? new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    })
  : null;

function normalizeAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

async function retryPayment(caseData = {}) {
  const amountAtRiskInPaise = normalizeAmount(caseData.amountAtRisk);
  const customerId = caseData.customerId || 'unknown_customer';
  const forceFail = caseData.forceFail === true;
  const forceFailOnce = caseData.forceFailOnce === true;

  if (!amountAtRiskInPaise) {
    return {
      success: false,
      razorpayOrderId: null,
      amount: 0,
      error: 'Invalid amountAtRisk provided for Razorpay retry.',
    };
  }

  if (forceFail || forceFailOnce) {
    return {
      success: false,
      razorpayOrderId: null,
      amount: amountAtRiskInPaise,
      error: forceFailOnce
        ? 'Synthetic fail-once case: Razorpay retry is configured to fail on the first attempt only.'
        : 'Synthetic guaranteed-failure case: Razorpay retry is configured to fail for this demo case.',
    };
  }

  if (!razorpay) {
    return {
      success: false,
      razorpayOrderId: null,
      amount: amountAtRiskInPaise,
      error: 'RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing from environment.',
    };
  }

  try {
    const receiptCustomerId = String(customerId)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 35);
    const order = await razorpay.orders.create({
      amount: amountAtRiskInPaise,
      currency: 'INR',
      receipt: `retry_${receiptCustomerId}_${Date.now()}`,
      notes: {
        customerId: String(customerId),
        syntheticRetry: 'true',
        source: 'revenue-recovery-agent'
      },
    });

    // This success flag means the Razorpay API call itself succeeded and a test-mode
    // order was created. It does not mean a real customer was charged, because there
    // is no checkout/payment-method flow in this synthetic retry path.
    return {
      success: true,
      razorpayOrderId: order && order.id ? order.id : null,
      amount: amountAtRiskInPaise,
      error: null,
    };
  } catch (error) {
    const message =
      error && error.error && error.error.description
        ? error.error.description
        : error && error.message
          ? error.message
          : 'Unknown Razorpay order creation error.';

    return {
      success: false,
      razorpayOrderId: null,
      amount: amountAtRiskInPaise,
      error: message,
    };
  }
}

module.exports = { retryPayment };
