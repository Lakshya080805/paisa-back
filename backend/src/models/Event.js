const mongoose = require('mongoose');

const FAILURE_REASONS = [
	'insufficient_funds',
	'expired_card',
	'bank_server_error',
	'wrong_cvv',
	'fraud_flagged',
	'network_timeout',
];

const eventSchema = new mongoose.Schema({
	customerId: { type: String, required: true },
	type: { type: String, enum: ['subscription', 'payment'], required: true },
	amount: { type: Number, required: true },
	status: { type: String, enum: ['failed', 'pending'], required: true },
	failureReason: { type: String, enum: FAILURE_REASONS },
	createdAt: { type: Date, required: true },
});

module.exports = mongoose.model('Event', eventSchema);
