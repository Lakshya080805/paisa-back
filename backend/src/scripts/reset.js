require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/db');

const COLLECTIONS = ['events', 'cases', 'auditlogs'];

const resetDatabase = async () => {
	try {
		await connectDB();

		for (const collectionName of COLLECTIONS) {
			try {
				await mongoose.connection.dropCollection(collectionName);
				console.log(`Dropped collection: ${collectionName}`);
			} catch (error) {
				if (error.codeName === 'NamespaceNotFound' || error.code === 26) {
					console.log(`Collection already absent: ${collectionName}`);
					continue;
				}
				throw error;
			}
		}

		console.log('Reset complete: events, cases, and auditlogs are empty.');
	} catch (error) {
		console.error(`Reset failed: ${error.message}`);
		process.exitCode = 1;
	} finally {
		await mongoose.disconnect();
	}
};

if (require.main === module) {
	resetDatabase();
}

module.exports = { resetDatabase };