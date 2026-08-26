import { useEffect, useState } from 'react'
import axios from 'axios'

const api = axios.create({
	baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
})

function CaseDrilldown({ caseId, onClose }) {
	const [caseData, setCaseData] = useState(null)
	const [error, setError] = useState('')
	const [errorCaseId, setErrorCaseId] = useState(null)

	useEffect(() => {
		if (!caseId) return undefined
		let mounted = true

		api.get(`/api/cases/${caseId}`)
			.then((response) => {
				if (mounted) setCaseData(response.data)
			})
			.catch(() => {
				if (mounted) {
					setError('Could not load this case timeline.')
					setErrorCaseId(caseId)
				}
			})

		return () => { mounted = false }
	}, [caseId])

	useEffect(() => {
		if (!caseId) return undefined
		const handleKeyDown = (event) => {
			if (event.key === 'Escape') onClose()
		}
		document.addEventListener('keydown', handleKeyDown)
		return () => document.removeEventListener('keydown', handleKeyDown)
	}, [caseId, onClose])

	if (!caseId) return null
	const loading = !caseData || caseData._id !== caseId
	const selectedError = errorCaseId === caseId ? error : ''

	return (
		<div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
			<aside aria-label="Case audit trail" className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-700 bg-slate-900 p-6 shadow-2xl">
				<div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-5">
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Case drilldown</p>
						<h2 className="mt-2 text-xl font-semibold text-white">Audit timeline</h2>
					</div>
					<button type="button" onClick={onClose} aria-label="Close case drilldown" className="rounded-md px-3 py-2 text-2xl leading-none text-slate-400 hover:bg-slate-800 hover:text-white">×</button>
				</div>

				{loading && <p className="py-8 text-sm text-slate-400">Loading case details...</p>}
				{selectedError && <p className="mt-6 rounded-md border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200">{selectedError}</p>}
				{caseData && (
					<>
						<div className="grid grid-cols-2 gap-3 border-b border-slate-800 py-5 text-sm">
							<div className="col-span-2"><p className="text-slate-500">Customer</p><p className="mt-1 break-all font-mono text-xs text-slate-200">{caseData.customerId}</p></div>
							<div><p className="text-slate-500">Status</p><p className="mt-1 capitalize text-slate-200">{caseData.status.replace('_', ' ')}</p></div>
							<div><p className="text-slate-500">Cause</p><p className="mt-1 text-slate-200">{caseData.cause || '—'}</p></div>
							<div><p className="text-slate-500">Amount at risk</p><p className="mt-1 text-slate-200">₹{new Intl.NumberFormat('en-IN').format(caseData.amountAtRisk || 0)}</p></div>
							<div><p className="text-slate-500">Recovered</p><p className="mt-1 text-slate-200">₹{new Intl.NumberFormat('en-IN').format(caseData.amountRecovered || 0)}</p></div>
							<div><p className="text-slate-500">Confidence</p><p className="mt-1 text-slate-200">{typeof caseData.confidence === 'number' ? `${Math.round(caseData.confidence * 100)}%` : '—'}</p></div>
							<div><p className="text-slate-500">Retries</p><p className="mt-1 text-slate-200">{caseData.retryCount || 0}</p></div>
						</div>
						<div className="relative py-6">
							{caseData.auditTrail?.map((entry, index) => (
								<div key={entry._id || `${entry.timestamp}-${index}`} className="relative flex gap-4 pb-7 last:pb-0">
									<div className="relative flex w-4 shrink-0 justify-center"><span className="z-10 mt-1 h-3 w-3 rounded-full bg-cyan-400 ring-4 ring-slate-900" />{index < caseData.auditTrail.length - 1 && <span className="absolute top-4 h-full w-px bg-slate-700" />}</div>
									<div className="min-w-0"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><p className="text-sm font-semibold capitalize text-white">{entry.stage}</p><time className="text-xs text-slate-500">{new Date(entry.timestamp).toLocaleString()}</time></div><p className="mt-2 text-sm leading-6 text-slate-300">{entry.reasoning || 'No reasoning recorded.'}</p></div>
								</div>
							))}
						</div>
					</>
				)}
			</aside>
		</div>
	)
}

export default CaseDrilldown
