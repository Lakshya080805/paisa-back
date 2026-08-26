require('dotenv').config();

const cors = require('cors');
const express = require('express');
const connectDB = require('./config/db');
const Event = require('./models/Event');
const { generateEvents } = require('./services/dataGenerator');
const { detectCases } = require('./services/detection');
const { diagnoseCases } = require('./services/diagnosis');
const { applyDecisionGate } = require('./services/decisionGate');
const { runActionEngine } = require('./services/actionEngine');
const casesRouter = require('./routes/cases');
const metricsRouter = require('./routes/metrics');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/api/cases', casesRouter);
app.use('/api/metrics', metricsRouter);

app.post('/api/run-batch', async (req, res) => {
	try {
		const events = await Event.insertMany(generateEvents());
		console.log(`Batch stage complete: generated ${events.length} events.`);

		const detection = await detectCases();
		console.log(`Batch stage complete: detected ${detection.createdCount} cases.`);

		const diagnosis = await diagnoseCases();
		console.log(`Batch stage complete: diagnosed ${diagnosis.processedCount} cases.`);

		const gate = await applyDecisionGate();
		console.log(`Batch stage complete: gated ${gate.gatedCount} cases.`);

		const action = await runActionEngine();
		console.log(`Batch stage complete: processed ${action.summary.processed} cases.`);

		return res.json({
			eventsGenerated: events.length,
			casesDetected: detection.createdCount,
			casesDiagnosed: diagnosis.processedCount,
			casesGated: gate.gatedCount,
			casesProcessed: action.summary.processed,
			finalStatusBreakdown: action.finalStatusBreakdown,
		});
	} catch (error) {
		console.error(`Batch failed: ${error.message}`);
		return res.status(500).json({ error: error.message });
	}
});

app.get('/api/health', (req, res) => {
	res.json({ status: 'ok' });
});

const startServer = async () => {
	try {
		await connectDB();
		const server = app.listen(port, () => {
			console.log(`Server listening on port ${port}.`);
		});
		server.setTimeout(30 * 60 * 1000);
	} catch (error) {
		process.exitCode = 1;
	}
};

startServer();
