const express = require('express');
const mongoose = require('mongoose');
const Case = require('../models/Case');
const AuditLog = require('../models/AuditLog');

const router = express.Router();

const CASE_STATUSES = [
	'detected',
	'diagnosing',
	'action_taken',
	'recovered',
	'escalated',
	'lost',
];

router.get('/', async (req, res) => {
	try {
		const { status } = req.query;
		if (status && !CASE_STATUSES.includes(status)) {
			return res.status(400).json({
			error: `Invalid status "${status}". Expected one of: ${CASE_STATUSES.join(', ')}.`,
		});
		}

		const filter = status ? { status } : {};
		const cases = await Case.find(filter).sort({ createdAt: -1 }).lean();
		return res.json(cases);
	} catch (error) {
		return res.status(500).json({ error: error.message });
	}
});

router.get('/:id', async (req, res) => {
	if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
		return res.status(404).json({ error: 'Case not found.' });
	}

	try {
		const caseDocument = await Case.findById(req.params.id).lean();
		if (!caseDocument) {
			return res.status(404).json({ error: 'Case not found.' });
		}

		const auditTrail = await AuditLog.find({ caseId: caseDocument._id })
			.sort({ timestamp: 1, _id: 1 })
			.lean();

		return res.json({ ...caseDocument, auditTrail });
	} catch (error) {
		return res.status(500).json({ error: error.message });
	}
});

module.exports = router;