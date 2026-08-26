require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Case = require('../models/Case');
const AuditLog = require('../models/AuditLog');

const CONFIDENCE_THRESHOLD = 0.6;

const applyDecisionGate = async () => {
	const cases = await Case.find({ status: 'diagnosing' }).sort({ createdAt: 1 });
	let gatedCount = 0;
	let passedThroughCount = 0;

	for (const caseDocument of cases) {
		const confidence = caseDocument.confidence;
		const originalAction = caseDocument.recommendedAction;
		const isGated = confidence < CONFIDENCE_THRESHOLD;
		const finalAction = isGated ? 'escalate_human' : originalAction;
		const timestamp = new Date();

		if (isGated) {
			await Case.updateOne(
				{ _id: caseDocument._id },
				{
					$set: {
						recommendedAction: finalAction,
						gateOverridden: true,
					},
				},
			);
			gatedCount += 1;
		} else {
			passedThroughCount += 1;
		}

		await AuditLog.create({
			caseId: caseDocument._id,
			timestamp,
			stage: 'decision',
			detail: {
				confidence,
				threshold: CONFIDENCE_THRESHOLD,
				gated: isGated,
				originalRecommendedAction: originalAction,
				finalRecommendedAction: finalAction,
			},
			reasoning: isGated
				? `Confidence ${confidence} below threshold - routed to human escalation`
				: `Confidence ${confidence} - proceeding with ${finalAction}`,
		});
	}

	console.log(
		`Decision gate complete: ${gatedCount} cases gated/overridden, ${passedThroughCount} passed through as-is.`,
	);
	return { processedCount: cases.length, gatedCount, passedThroughCount };
};

const runDecisionGate = async () => {
	try {
		await connectDB();
		await applyDecisionGate();
	} catch (error) {
		console.error(`Decision gate failed: ${error.message}`);
		process.exitCode = 1;
	} finally {
		await mongoose.disconnect();
	}
};

if (require.main === module) {
	runDecisionGate();
}

module.exports = { applyDecisionGate, runDecisionGate };
