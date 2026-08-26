import { useState } from 'react'

const CASE_STATUSES = ['detected', 'diagnosing', 'action_taken', 'recovered', 'escalated', 'lost']

const statusClasses = {
	recovered: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/30',
	escalated: 'bg-amber-400/15 text-amber-300 ring-amber-400/30',
	lost: 'bg-red-400/15 text-red-300 ring-red-400/30',
	detected: 'bg-slate-700 text-slate-300 ring-slate-600',
	diagnosing: 'bg-slate-700 text-slate-300 ring-slate-600',
	action_taken: 'bg-slate-700 text-slate-300 ring-slate-600',
}

const currencyFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

function CaseTable({ cases = [], onCaseClick }) {
	const [statusFilter, setStatusFilter] = useState('all')
	const filteredCases = statusFilter === 'all'
		? cases
		: cases.filter((caseDocument) => caseDocument.status === statusFilter)

	return (
		<section aria-label="Cases" className="rounded-lg border border-slate-800 bg-slate-900 p-5">
			<div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 className="text-lg font-semibold text-white">Cases</h2>
					<p className="mt-1 text-sm text-slate-400">{filteredCases.length} of {cases.length} cases</p>
				</div>
				<label className="flex items-center gap-2 text-sm text-slate-400">
					<span>Status</span>
					<select
						value={statusFilter}
						onChange={(event) => setStatusFilter(event.target.value)}
						className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-cyan-400"
					>
						<option value="all">All</option>
						{CASE_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
					</select>
				</label>
			</div>

			<div className="overflow-x-auto">
				<table className="w-full min-w-[900px] border-collapse text-left text-sm">
					<thead>
						<tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
							{['Customer ID', 'Cause', 'Recommended Action', 'At Risk', 'Recovered', 'Status', 'Confidence'].map((heading) => (
								<th key={heading} className="px-3 py-3 font-semibold">{heading}</th>
							))}
						</tr>
					</thead>
					<tbody>
						{filteredCases.map((caseDocument) => (
							<tr
								key={caseDocument._id}
								onClick={() => onCaseClick?.(caseDocument._id)}
								onKeyDown={(event) => {
									if (event.key === 'Enter' || event.key === ' ') onCaseClick?.(caseDocument._id)
								}}
								tabIndex="0"
								className="cursor-pointer border-b border-slate-800/80 text-slate-300 outline-none transition hover:bg-slate-800/60 focus:bg-slate-800/60"
							>
								<td className="max-w-56 truncate px-3 py-3 font-mono text-xs text-slate-200">{caseDocument.customerId}</td>
								<td className="px-3 py-3">{caseDocument.cause || '—'}</td>
								<td className="px-3 py-3">{caseDocument.recommendedAction || '—'}</td>
								<td className="px-3 py-3 tabular-nums">₹{currencyFormatter.format(caseDocument.amountAtRisk || 0)}</td>
								<td className="px-3 py-3 tabular-nums">₹{currencyFormatter.format(caseDocument.amountRecovered || 0)}</td>
								<td className="px-3 py-3">
									<span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${statusClasses[caseDocument.status] || statusClasses.detected}`}>
										{caseDocument.status?.replace('_', ' ') || 'unknown'}
									</span>
								</td>
								<td className="px-3 py-3 tabular-nums">{typeof caseDocument.confidence === 'number' ? `${Math.round(caseDocument.confidence * 100)}%` : '—'}</td>
							</tr>
						))}
					</tbody>
				</table>
				{filteredCases.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No cases match this status.</p>}
			</div>
		</section>
	)
}

export default CaseTable
