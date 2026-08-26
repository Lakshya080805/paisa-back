const Case = require('../models/Case');
const AuditLog = require('../models/AuditLog');

const FAILURE_REASONS = [
	'insufficient_funds',
	'expired_card',
	'bank_server_error',
	'wrong_cvv',
	'fraud_flagged',
	'network_timeout',
];

const roundToOneDecimal = (value) => Math.round(value * 10) / 10;

const percentage = (numerator, denominator) =>
	denominator > 0 ? roundToOneDecimal((numerator / denominator) * 100) : 0;

const getMetrics = async () => {
	const [cases, totals, causeGroups] = await Promise.all([
		Case.find().sort({ createdAt: 1 }).lean(),
		Case.aggregate([
			{
				$group: {
					_id: null,
					totalAtRisk: { $sum: { $ifNull: ['$amountAtRisk', 0] } },
					totalRecovered: { $sum: { $ifNull: ['$amountRecovered', 0] } },
					totalIncentiveSpent: { $sum: { $ifNull: ['$incentiveSpent', 0] } },
				},
			},
		]),
		Case.aggregate([
			{ $match: { cause: { $in: FAILURE_REASONS } } },
			{
				$group: {
					_id: '$cause',
					totalCases: { $sum: 1 },
					recoveredCases: {
						$sum: { $cond: [{ $eq: ['$status', 'recovered'] }, 1, 0] },
					},
				},
			},
		]),
	]);

	const totalsDocument = totals[0] || {
		totalAtRisk: 0,
		totalRecovered: 0,
		totalIncentiveSpent: 0,
	};
	const recoveredCases = cases.filter((caseDocument) => caseDocument.status === 'recovered');
	const causeGroupByName = new Map(causeGroups.map((group) => [group._id, group]));

	const byCause = FAILURE_REASONS
		.filter((cause) => causeGroupByName.has(cause))
		.map((cause) => {
			const group = causeGroupByName.get(cause);
			return {
				cause,
				totalCases: group.totalCases,
				recoveredCases: group.recoveredCases,
				recoveryRate: percentage(group.recoveredCases, group.totalCases),
			};
		});

	const averageRecoveryDurationHours = recoveredCases.length
		? recoveredCases.reduce((total, caseDocument) => {
			const durationMs = new Date(caseDocument.updatedAt).getTime()
				- new Date(caseDocument.createdAt).getTime();
			return total + Math.max(0, durationMs) / (60 * 60 * 1000);
		}, 0) / recoveredCases.length
		: 0;

	const exceptionCases = cases.filter((caseDocument) =>
		['escalated', 'lost'].includes(caseDocument.status),
	);
	const exceptions = await Promise.all(exceptionCases.map(async (caseDocument) => {
		const lastAuditLog = await AuditLog.findOne({ caseId: caseDocument._id })
			.sort({ timestamp: -1, _id: -1 })
			.lean();

		return {
			caseId: String(caseDocument._id),
			customerId: caseDocument.customerId,
			amountAtRisk: caseDocument.amountAtRisk,
			cause: caseDocument.cause,
			status: caseDocument.status,
			reasoning: lastAuditLog?.reasoning || caseDocument.reasoning || '',
		};
	}));

	return {
		totalAtRisk: totalsDocument.totalAtRisk,
		totalRecovered: totalsDocument.totalRecovered,
		totalIncentiveSpent: totalsDocument.totalIncentiveSpent,
		netRecovered: totalsDocument.totalRecovered - totalsDocument.totalIncentiveSpent,
		recoveryRate: percentage(recoveredCases.length, cases.length),
		byCause,
		avgTimeToRecoveryHours: roundToOneDecimal(averageRecoveryDurationHours),
		exceptions,
	};
};

module.exports = { getMetrics };
