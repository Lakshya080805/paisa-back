require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Event = require('../models/Event');

const INCENTIVE_CASE_COUNT = 3;

const addIncentiveCases = async () => {
	try {
		await connectDB();
		const now = new Date();
		const events = Array.from({ length: INCENTIVE_CASE_COUNT }, (_, index) => ({
			customerId: `demo_incentive_retry_once_${index}_${Date.now()}`,
			type: 'payment',
			amount: 4000 + index * 1000,
			status: 'failed',
			failureReason: 'network_timeout',
			createdAt: new Date(now.getTime() + index),
		}));

		const insertedEvents = await Event.insertMany(events);
		console.log(`Inserted ${insertedEvents.length} incentive verification Event documents.`);
		console.log(JSON.stringify(insertedEvents.map((event) => ({
			eventId: event._id,
			customerId: event.customerId,
			amount: event.amount,
		})), null, 2));
	} catch (error) {
		console.error(`Incentive case seed failed: ${error.message}`);
		process.exitCode = 1;
	} finally {
		await mongoose.disconnect();
	}
};

if (require.main === module) {
	addIncentiveCases();
}

module.exports = { addIncentiveCases };