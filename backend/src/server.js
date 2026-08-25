require('dotenv').config();

const cors = require('cors');
const express = require('express');
const connectDB = require('./config/db');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
	res.json({ status: 'ok' });
});

const startServer = async () => {
	try {
		await connectDB();
		app.listen(port, () => {
			console.log(`Server listening on port ${port}.`);
		});
	} catch (error) {
		process.exitCode = 1;
	}
};

startServer();
