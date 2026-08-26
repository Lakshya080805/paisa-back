require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Case = require('../models/Case');

const HISTOGRAM_BUCKETS = [
	{ label: '0.0-0.2', minimum: 0, maximum: 0.2 },
	{ label: '0.2-0.4', minimum: 0.2, maximum: 0.4 },
	{ label: '0.4-0.6', minimum: 0.4, maximum: 0.6 },
	{ label: '0.6-0.8', minimum: 0.6, maximum: 0.8 },
	{ label: '0.8-1.0', minimum: 0.8, maximum: 1 },
];

const getConfidenceBucket = (confidence) => {
	const bucketIndex = Math.min(Math.floor(confidence / 0.2), HISTOGRAM_BUCKETS.length - 1);
	return HISTOGRAM_BUCKETS[bucketIndex].label;
};

const runDay2Check = async () => {
	try {
		await connectDB();
		const cases = await Case.find().sort({ createdAt: 1 }).lean();
		const actionCounts = {};
		const gateCounts = { true: 0, false: 0 };
		const histogram = Object.fromEntries(HISTOGRAM_BUCKETS.map((bucket) => [bucket.label, 0]));
		const confidenceScores = [];

		for (const caseDocument of cases) {
			const action = caseDocument.recommendedAction || 'unset';
			actionCounts[action] = (actionCounts[action] || 0) + 1;

			const gateKey = caseDocument.gateOverridden === true ? 'true' : 'false';
			gateCounts[gateKey] += 1;

			if (typeof caseDocument.confidence === 'number' && Number.isFinite(caseDocument.confidence)) {
				const confidence = Math.min(Math.max(caseDocument.confidence, 0), 1);
				confidenceScores.push(confidence);
				histogram[getConfidenceBucket(confidence)] += 1;
			}
		}

		const confidenceMinimum = confidenceScores.length ? Math.min(...confidenceScores) : null;
		const confidenceMaximum = confidenceScores.length ? Math.max(...confidenceScores) : null;
		const confidenceAverage = confidenceScores.length
			? confidenceScores.reduce((total, confidence) => total + confidence, 0) / confidenceScores.length
			: null;
		const gatedPercentage = cases.length ? (gateCounts.true / cases.length) * 100 : 0;

		console.log(`Total Cases inspected: ${cases.length}`);
		console.log('Cases by recommendedAction (post-gate):');
		console.log(JSON.stringify(actionCounts, null, 2));
		console.log('Cases by gateOverridden:');
		console.log(JSON.stringify(gateCounts, null, 2));
		console.log('Confidence distribution:');
		console.log(JSON.stringify({
			min: confidenceMinimum,
			max: confidenceMaximum,
			average: confidenceAverage,
			histogram,
		}, null, 2));
		console.log('Sample of 3 Cases:');
		console.log(JSON.stringify(cases.slice(0, 3), null, 2));

		if (gatedPercentage === 0 || gatedPercentage === 100) {
			console.warn(
				`WARNING: ${gatedPercentage}% of Cases were gated; review the confidence threshold or Gemini prompt.`,
			);
		} else {
			console.log(`Gating sanity check: ${gatedPercentage.toFixed(1)}% of Cases were gated.`);
		}
	} catch (error) {
		console.error(`Day 2 check failed: ${error.message}`);
		process.exitCode = 1;
	} finally {
		await mongoose.disconnect();
	}
};

if (require.main === module) {
	runDay2Check();
}

module.exports = runDay2Check;
