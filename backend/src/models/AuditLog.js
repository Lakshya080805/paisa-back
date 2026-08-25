const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
	caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', required: true },
	timestamp: { type: Date, required: true },
	stage: {
		type: String,
		enum: ['detection', 'diagnosis', 'decision', 'action'],
		required: true,
	},
	detail: { type: mongoose.Schema.Types.Mixed },
	reasoning: { type: String },
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
