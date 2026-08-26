require('dotenv').config();

const { GoogleGenerativeAI } = require('@google/generative-ai');

const FAILURE_REASONS = [
	'insufficient_funds',
	'expired_card',
	'bank_server_error',
	'wrong_cvv',
	'fraud_flagged',
	'network_timeout',
];

const ACTIONS = [
	'retry_immediate',
	'retry_delayed',
	'request_new_payment_method',
	'send_reminder',
	'escalate_human',
];

const diagnosisSchema = {
	type: 'OBJECT',
	properties: {
		cause: {
			type: 'STRING',
			enum: FAILURE_REASONS,
		},
		recommendedAction: {
			type: 'STRING',
			enum: ACTIONS,
		},
		confidence: {
			type: 'NUMBER',
			minimum: 0,
			maximum: 1,
		},
		reasoning: {
			type: 'STRING',
		},
	},
	required: ['cause', 'recommendedAction', 'confidence', 'reasoning'],
};

const systemInstruction = `You diagnose payment and subscription failures for an Indian payments platform.

Use the supplied failureReason, amount, type, and retryCount. Choose cause only from: ${FAILURE_REASONS.join(', ')}.
Choose recommendedAction only from: ${ACTIONS.join(', ')}.
Follow this action table exactly:
- retry_immediate: network_timeout or bank_server_error; perform an immediate Razorpay retry.
- retry_delayed: insufficient_funds; set the next action two days later, then retry.
- request_new_payment_method: expired_card or wrong_cvv; send a simulated payment-method link and do not retry.
- send_reminder: any case with retryCount greater than 0 that is still failing; send a simulated message and log it only.
- escalate_human: fraud_flagged, or any diagnosis with confidence below 0.6; take no automatic action and send it to human review.

Return one or two sentences in reasoning. Return only the requested JSON object.`;

const geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = geminiClient.getGenerativeModel({
	model: 'gemini-3.6-flash',
	systemInstruction,
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const FALLBACK_DIAGNOSIS_BY_FAILURE_REASON = {
	insufficient_funds: {
		cause: 'insufficient_funds',
		recommendedAction: 'retry_delayed',
		confidence: 0.82,
		reasoning: 'Fallback diagnosis: customer likely failed due to insufficient funds, so the retry should be delayed for two days.',
	},
	bank_server_error: {
		cause: 'bank_server_error',
		recommendedAction: 'retry_immediate',
		confidence: 0.86,
		reasoning: 'Fallback diagnosis: the bank server error is transient, so an immediate retry is the best bounded action.',
	},
	network_timeout: {
		cause: 'network_timeout',
		recommendedAction: 'retry_immediate',
		confidence: 0.9,
		reasoning: 'Fallback diagnosis: the payment failed because of a network timeout, so an immediate retry is appropriate.',
	},
	expired_card: {
		cause: 'expired_card',
		recommendedAction: 'request_new_payment_method',
		confidence: 0.88,
		reasoning: 'Fallback diagnosis: the card has expired, so the user should receive a payment-method refresh link instead of a retry.',
	},
	wrong_cvv: {
		cause: 'wrong_cvv',
		recommendedAction: 'request_new_payment_method',
		confidence: 0.88,
		reasoning: 'Fallback diagnosis: the CVV was invalid, so the payment method should be refreshed rather than retried automatically.',
	},
	fraud_flagged: {
		cause: 'fraud_flagged',
		recommendedAction: 'escalate_human',
		confidence: 0.96,
		reasoning: 'Fallback diagnosis: the transaction is flagged as potentially fraudulent, so it must be reviewed by a human.',
	},
};

const getFallbackDiagnosis = (eventContext = {}) => {
	const failureReason = eventContext.failureReason || 'network_timeout';
	return {
		...(FALLBACK_DIAGNOSIS_BY_FAILURE_REASON[failureReason] || {
			cause: 'unknown',
			recommendedAction: 'escalate_human',
			confidence: 0,
			reasoning: 'Fallback diagnosis: no valid cause was available for this event.',
		}),
	};
};

const isRateLimitError = (error) =>
	error?.status === 429 ||
	error?.response?.status === 429 ||
	error?.message?.includes('429') ||
	error?.message?.includes('quota');

const isDailyQuotaError = (error) =>
	error?.message?.includes('PerDayPerProjectPerModel-FreeTier');

const getDiagnosis = async (eventContext) => {
	let responseText;

	try {
		const prompt = `Diagnose this event:\n${JSON.stringify(eventContext)}`;
		for (let attempt = 0; attempt < 2; attempt += 1) {
			try {
				const result = await model.generateContent({
					contents: [{ role: 'user', parts: [{ text: prompt }] }],
					generationConfig: {
						responseMimeType: 'application/json',
						responseSchema: diagnosisSchema,
					},
				});
				responseText = result.response.text();
				break;
			} catch (error) {
				if (attempt === 0 && isRateLimitError(error) && !isDailyQuotaError(error)) {
					console.error('Gemini rate limit (429); retrying once in 20 seconds.');
					await delay(20000);
					continue;
				}
				throw error;
			}
		}
	} catch (error) {
		console.error('API call failed:', error instanceof Error ? `${error.message}\n${error.stack}` : error);
		if (isRateLimitError(error)) {
			return getFallbackDiagnosis(eventContext);
		}
		return {
			cause: 'unknown',
			recommendedAction: 'escalate_human',
			confidence: 0,
			reasoning: `Diagnosis failed: ${error.message}`,
		};
	}

	try {
		return JSON.parse(responseText);
	} catch (error) {
		console.error(
			'API succeeded but response was not valid JSON matching the schema:',
			error instanceof Error ? `${error.message}\n${error.stack}` : error,
		);
		return getFallbackDiagnosis(eventContext);
	}
};

module.exports = { getDiagnosis };
