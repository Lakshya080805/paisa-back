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

const requestedRecordCount = Number.parseInt(process.env.SEED_COUNT || '72', 10);
const RECORD_COUNT = Number.isInteger(requestedRecordCount)
	? Math.min(Math.max(requestedRecordCount, 1), 80)
	: 72;
const PENDING_COUNT = Math.max(1, Math.floor(RECORD_COUNT * 0.14));
const REPEATED_CUSTOMER_COUNT = Math.min(8, Math.max(1, Math.floor(RECORD_COUNT / 5)));
const GUARANTEED_FAILURE_COUNT = Math.min(3, RECORD_COUNT);

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
	const guaranteedFailureStart = Math.max(PENDING_COUNT, RECORD_COUNT - GUARANTEED_FAILURE_COUNT);

	return Array.from({ length: RECORD_COUNT }, (_, index) => {
		const isGuaranteedFailure = index >= guaranteedFailureStart;
		const isPending = index < PENDING_COUNT && !isGuaranteedFailure;
		const isRepeatedCustomer = index < REPEATED_CUSTOMER_COUNT * 2;
		const type = isRepeatedCustomer
			? 'subscription'
			: faker.helpers.arrayElement(['subscription', 'payment']);
		const customerId = isGuaranteedFailure
			? `demo_guaranteed_failure_${index}_${faker.string.uuid()}`
			: customerIds[index];

		return {
			customerId,
			type,
			amount: faker.number.int({ min: 200, max: 15000 }),
			status: isPending ? 'pending' : 'failed',
			...(isPending
				? {}
				: {
					failureReason: isGuaranteedFailure
						? 'network_timeout'
						: FAILURE_REASONS[(index - PENDING_COUNT) % FAILURE_REASONS.length],
				}),
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
