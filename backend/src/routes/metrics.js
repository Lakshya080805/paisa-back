const express = require('express');
const { getMetrics } = require('../services/metrics');

const router = express.Router();

router.get('/', async (req, res) => {
	try {
		return res.json(await getMetrics());
	} catch (error) {
		return res.status(500).json({ error: error.message });
	}
});

module.exports = router;