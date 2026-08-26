require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Event = require('../models/Event');
const Case = require('../models/Case');
const AuditLog = require('../models/AuditLog');

const groupEventsByCustomerAndType = (events) => {
	const groups = new Map();

	for (const event of events) {
		const key = `${event.customerId}:${event.type}`;
		const group = groups.get(key) || [];
		group.push(event);
		groups.set(key, group);
	}

	return groups;
};

const detectCases = async () => {
	const events = await Event.find({
		status: { $in: ['failed', 'pending'] },
	}).sort({ createdAt: -1 });
	const eventGroups = groupEventsByCustomerAndType(events);
	let createdCount = 0;
	let skippedCount = 0;

	for (const relatedEvents of eventGroups.values()) {
		const newestEvent = relatedEvents[0];
		const existingCase = await Case.findOne({
			customerId: newestEvent.customerId,
			type: newestEvent.type,
		});

		if (existingCase) {
			skippedCount += 1;
			continue;
		}

		const now = new Date();
		const newCase = await Case.create({
			eventId: newestEvent._id,
			customerId: newestEvent.customerId,
			type: newestEvent.type,
			status: 'detected',
			amountAtRisk: newestEvent.amount,
			relatedEventCount: relatedEvents.length,
			cause: newestEvent.failureReason,
			createdAt: now,
			updatedAt: now,
		});

		await AuditLog.create({
			caseId: newCase._id,
			timestamp: now,
			stage: 'detection',
			detail: {
				eventCount: relatedEvents.length,
				latestEventId: newestEvent._id,
				amountAtRisk: newestEvent.amount,
			},
			reasoning: `Detected ${relatedEvents.length} event(s) for this customer, amount at risk ₹${newestEvent.amount}.`,
		});

		createdCount += 1;
	}

	console.log(`Detection complete: ${createdCount} Cases created, ${skippedCount} skipped as already-existing.`);
	return { createdCount, skippedCount };
};

const runDetection = async () => {
	try {
		await connectDB();
		await detectCases();
	} catch (error) {
		console.error(`Detection failed: ${error.message}`);
		process.exitCode = 1;
	} finally {
		await mongoose.disconnect();
	}
};

if (require.main === module) {
	runDetection();
}

module.exports = { detectCases, runDetection };
