const mongoose = require('mongoose');

const connectDB = async () => {
	const mongoUri = process.env.MONGODB_URI;

	if (!mongoUri) {
		console.error('MongoDB connection failed: MONGODB_URI is not set.');
		throw new Error('MONGODB_URI is not set');
	}

	try {
		await mongoose.connect(mongoUri);
		console.log('MongoDB connected successfully.');
	} catch (error) {
		console.error(`MongoDB connection failed: ${error.message}`);
		throw error;
	}
};

module.exports = connectDB;
