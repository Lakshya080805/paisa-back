require('dotenv').config();

const { faker } = require('@faker-js/faker');
const connectDB = require('../config/db');
const Event = require('../models/Event');

const FAILURE_REASONS = [
	'insufficient_funds',
	'expired_card',
	'bank_server_error',
	'wrong_cvv',
	'fraud_flagged',
	'network_timeout',
];

const RECORD_COUNT = 72;
const PENDING_COUNT = 10;
const REPEATED_CUSTOMER_COUNT = 8;

const randomDateWithinLast14Days = () => {
	const now = Date.now();
	const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
	return new Date(faker.number.int({ min: fourteenDaysAgo, max: now }));
};

const buildCustomerIds = () => {
	const repeatedCustomerIds = Array.from(
		{ length: REPEATED_CUSTOMER_COUNT },
		() => faker.string.uuid(),
	);
	const uniqueCustomerIds = Array.from(
		{ length: RECORD_COUNT - REPEATED_CUSTOMER_COUNT * 2 },
		() => faker.string.uuid(),
	);

	return [
		...repeatedCustomerIds.flatMap((customerId) => [customerId, customerId]),
		...uniqueCustomerIds,
	];
};

const generateEvents = () => {
	const customerIds = buildCustomerIds();

	return Array.from({ length: RECORD_COUNT }, (_, index) => {
		const isPending = index < PENDING_COUNT;
		const isRepeatedCustomer = index < REPEATED_CUSTOMER_COUNT * 2;
		const type = isRepeatedCustomer
			? index % 2 === 0
				? 'subscription'
				: 'subscription'
			: faker.helpers.arrayElement(['subscription', 'payment']);

		return {
			customerId: customerIds[index],
			type,
			amount: faker.number.int({ min: 200, max: 15000 }),
			status: isPending ? 'pending' : 'failed',
			...(isPending
				? {}
				: { failureReason: FAILURE_REASONS[(index - PENDING_COUNT) % FAILURE_REASONS.length] }),
			createdAt: randomDateWithinLast14Days(),
		};
	});
};

const seedEvents = async () => {
	try {
		await connectDB();
		const events = generateEvents();
		const insertedEvents = await Event.insertMany(events);
		console.log(`Inserted ${insertedEvents.length} Event documents.`);
	} catch (error) {
		console.error(`Event seed failed: ${error.message}`);
		process.exitCode = 1;
	} finally {
		await require('mongoose').disconnect();
	}
};

if (require.main === module) {
	seedEvents();
}

module.exports = { generateEvents, seedEvents };
