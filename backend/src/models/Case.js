const mongoose = require('mongoose');

const FAILURE_REASONS = [
	'insufficient_funds',
	'expired_card',
	'bank_server_error',
	'wrong_cvv',
	'fraud_flagged',
	'network_timeout',
];

const ACTIONS = [
	'retry_immediate',
	'retry_delayed',
	'request_new_payment_method',
	'send_reminder',
	'escalate_human',
];

const CASE_STATUSES = [
	'detected',
	'diagnosing',
	'action_taken',
	'recovered',
	'escalated',
	'lost',
];

const caseSchema = new mongoose.Schema({
	eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
	customerId: { type: String, required: true },
	type: { type: String, enum: ['subscription', 'payment'], required: true },
	status: { type: String, enum: CASE_STATUSES, required: true },
	amountAtRisk: { type: Number, required: true },
	relatedEventCount: { type: Number, default: 1 },
	amountRecovered: { type: Number, default: 0 },
	incentiveSpent: { type: Number, default: 0 },
	cause: { type: String, enum: FAILURE_REASONS },
	recommendedAction: { type: String, enum: ACTIONS },
	confidence: { type: Number, min: 0, max: 1 },
	reasoning: { type: String },
	gateOverridden: { type: Boolean, default: false },
	retryCount: { type: Number, default: 0 },
	nextActionAt: { type: Date },
	createdAt: { type: Date, required: true },
	updatedAt: { type: Date, required: true },
});

module.exports = mongoose.model('Case', caseSchema);
