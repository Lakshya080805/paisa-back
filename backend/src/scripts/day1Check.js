require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Event = require('../models/Event');
const Case = require('../models/Case');

const runDay1Check = async () => {
	try {
		await connectDB();

		const [eventCount, caseCount, statusBreakdown, sampleCases, invalidAmountCases] =
			await Promise.all([
				Event.countDocuments(),
				Case.countDocuments(),
				Case.aggregate([
					{ $group: { _id: '$status', count: { $sum: 1 } } },
					{ $sort: { _id: 1 } },
				]),
				Case.find()
					.sort({ createdAt: 1 })
					.limit(3)
					.populate('eventId')
					.lean(),
				Case.countDocuments({
					$or: [
						{ amountAtRisk: null },
						{ amountAtRisk: { $lte: 0 } },
					],
				}),
			]);

		console.log(`Total Event count: ${eventCount}`);
		console.log(`Total Case count: ${caseCount}`);
		console.log('Case count by status:');
		for (const status of statusBreakdown) {
			console.log(`  ${status._id}: ${status.count}`);
		}
		console.log('Sample of 3 Cases with linked Event data:');
		console.log(JSON.stringify(sampleCases, null, 2));
		console.log(
			`Amount-at-risk check: ${invalidAmountCases === 0 ? 'PASS' : 'FAIL'} (${invalidAmountCases} invalid Cases)`,
		);

		if (invalidAmountCases > 0) {
			process.exitCode = 1;
		}
	} catch (error) {
		console.error(`Day 1 check failed: ${error.message}`);
		process.exitCode = 1;
	} finally {
		await mongoose.disconnect();
	}
};

if (require.main === module) {
	runDay1Check();
}

module.exports = runDay1Check;
