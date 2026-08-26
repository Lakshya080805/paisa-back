require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { getDiagnosis } = require('../config/gemini');
require('../models/Event');
const Case = require('../models/Case');
const AuditLog = require('../models/AuditLog');

const DELAY_MS = 300;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const diagnoseCases = async () => {
	const cases = await Case.find({ status: 'detected' })
		.populate('eventId')
		.sort({ createdAt: 1 });
	let fallbackCount = 0;

	for (const [index, caseDocument] of cases.entries()) {
		const event = caseDocument.eventId;
		const diagnosis = await getDiagnosis({
			failureReason: event?.failureReason,
			amount: event?.amount,
			type: event?.type,
			retryCount: caseDocument.retryCount,
		});
		const isFallback = diagnosis.cause === 'unknown';

		if (isFallback) {
			fallbackCount += 1;
		}

		const updatedAt = new Date();
		await Case.updateOne(
			{ _id: caseDocument._id },
			{
				$set: {
					cause: diagnosis.cause,
					recommendedAction: diagnosis.recommendedAction,
					confidence: diagnosis.confidence,
					reasoning: diagnosis.reasoning,
					status: 'diagnosing',
					updatedAt,
				},
			},
			{ runValidators: !isFallback },
		);

		await AuditLog.create({
			caseId: caseDocument._id,
			timestamp: updatedAt,
			stage: 'diagnosis',
			detail: diagnosis,
			reasoning: diagnosis.reasoning,
		});

		console.log(`Diagnosed ${index + 1}/${cases.length} cases`);

		if (index < cases.length - 1) {
			await delay(DELAY_MS);
		}
	}

	console.log(`Diagnosis complete: ${cases.length} cases processed, ${fallbackCount} fallback/error responses.`);
	return { processedCount: cases.length, fallbackCount };
};

const runDiagnosis = async () => {
	try {
		await connectDB();
		await diagnoseCases();
	} catch (error) {
		console.error(`Diagnosis failed: ${error.message}`);
		process.exitCode = 1;
	} finally {
		await mongoose.disconnect();
	}
};

if (require.main === module) {
	runDiagnosis();
}

module.exports = { diagnoseCases, runDiagnosis };
