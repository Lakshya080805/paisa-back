require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Case = require('../models/Case');
const AuditLog = require('../models/AuditLog');

const EXPECTED_STATUSES = ['recovered', 'escalated', 'lost', 'action_taken'];
const EXPECTED_STAGES = ['detection', 'diagnosis', 'decision', 'action'];

const formatTimestamp = (timestamp) => new Date(timestamp).toISOString();

const printAuditTimeline = async (caseDocument, label) => {
	console.log(`\n${label} sample case`);
	console.log(JSON.stringify({
		caseId: caseDocument._id,
		customerId: caseDocument.customerId,
		status: caseDocument.status,
		amountAtRisk: caseDocument.amountAtRisk,
		amountRecovered: caseDocument.amountRecovered,
		retryCount: caseDocument.retryCount,
	}, null, 2));

	const auditLogs = await AuditLog.find({ caseId: caseDocument._id })
		.sort({ timestamp: 1, _id: 1 })
		.lean();

	console.log('AuditLog timeline:');
	for (const [index, auditLog] of auditLogs.entries()) {
		console.log(`${index + 1}. [${formatTimestamp(auditLog.timestamp)}] ${auditLog.stage}`);
		console.log(`   reasoning: ${auditLog.reasoning || '(none)'}`);
		console.log(`   detail: ${JSON.stringify(auditLog.detail || {})}`);
	}

	return auditLogs;
};

const runDay3Check = async () => {
	let verificationFailed = false;

	try {
		await connectDB();
		const [cases, amountTotals, auditStageCounts, recoveredCase, lostCase, unresolvedGuardrailCases] =
			await Promise.all([
				Case.find().sort({ createdAt: 1 }).lean(),
				Case.aggregate([
					{
						$group: {
							_id: null,
							totalAmountAtRisk: { $sum: '$amountAtRisk' },
							totalAmountRecovered: { $sum: '$amountRecovered' },
							totalIncentiveSpent: { $sum: '$incentiveSpent' },
						},
					},
				]),
				AuditLog.aggregate([
					{ $group: { _id: '$stage', count: { $sum: 1 } } },
					{ $sort: { _id: 1 } },
				]),
				Case.findOne({ status: 'recovered' }).sort({ updatedAt: 1 }).lean(),
				Case.findOne({ status: 'lost' }).sort({ updatedAt: 1 }).lean(),
				Case.find({ status: 'action_taken', retryCount: { $gte: 3 } }).lean(),
			]);

		const statusCounts = Object.fromEntries(EXPECTED_STATUSES.map((status) => [status, 0]));
		for (const caseDocument of cases) {
			statusCounts[caseDocument.status] = (statusCounts[caseDocument.status] || 0) + 1;
		}

		console.log('Day 3 Verification Check');
		console.log('Final Case count by status:');
		console.log(JSON.stringify(statusCounts, null, 2));

		console.log('Amount totals across all Cases (INR):');
		console.log(JSON.stringify(amountTotals[0] || {
			totalAmountAtRisk: 0,
			totalAmountRecovered: 0,
			totalIncentiveSpent: 0,
		}, null, 2));

		const stageCounts = Object.fromEntries(EXPECTED_STAGES.map((stage) => [stage, 0]));
		for (const stageCount of auditStageCounts) {
			stageCounts[stageCount._id] = stageCount.count;
		}
		console.log('AuditLog count by stage:');
		console.log(JSON.stringify(stageCounts, null, 2));

		if (EXPECTED_STAGES.some((stage) => stageCounts[stage] === 0)) {
			console.error('FAIL: one or more required pipeline stages have no AuditLog entries.');
			verificationFailed = true;
		} else {
			console.log('AuditLog stage coverage: PASS');
		}

		if (unresolvedGuardrailCases.length > 0) {
			console.error('Guardrail check: FAIL');
			console.error(JSON.stringify(unresolvedGuardrailCases, null, 2));
			verificationFailed = true;
		} else {
			console.log('Guardrail check: PASS - no action_taken case has retryCount >= 3.');
		}

		if (!recoveredCase || !lostCase) {
			console.error('Sample case check: FAIL - both recovered and lost cases are required.');
			verificationFailed = true;
		} else {
			await printAuditTimeline(recoveredCase, 'Recovered');
			await printAuditTimeline(lostCase, 'Lost');
		}

		if (verificationFailed) {
			process.exitCode = 1;
		} else {
			console.log('\nDay 3 verification: PASS');
		}
	} catch (error) {
		console.error(`Day 3 check failed: ${error.message}`);
		process.exitCode = 1;
	} finally {
		await mongoose.disconnect();
	}
};

if (require.main === module) {
	runDay3Check();
}

module.exports = runDay3Check;