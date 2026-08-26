import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts'

function RecoveryTooltip({ active, payload, label }) {
	if (!active || !payload?.length) return null

	const cause = payload[0].payload
	return (
		<div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm shadow-xl">
			<p className="font-semibold text-white">{label}</p>
			<p className="mt-1 text-slate-300">Recovery rate: {cause.recoveryRate}%</p>
			<p className="text-slate-400">Recovered: {cause.recoveredCases} / {cause.totalCases}</p>
		</div>
	)
}

function RecoveryChart({ byCause = [] }) {
	if (!byCause.length) {
		return (
			<section aria-label="Recovery by cause" className="rounded-lg border border-slate-800 bg-slate-900 p-5">
				<h2 className="text-lg font-semibold text-white">Recovery by cause</h2>
				<p className="mt-4 text-sm text-slate-400">No data yet — run a batch to get started</p>
			</section>
		)
	}

	return (
		<section aria-label="Recovery by cause" className="rounded-lg border border-slate-800 bg-slate-900 p-5">
			<div className="mb-4">
				<h2 className="text-lg font-semibold text-white">Recovery by cause</h2>
				<p className="mt-1 text-sm text-slate-400">Recovered cases as a percentage of each failure cause.</p>
			</div>
			<div className="h-72 w-full">
				<ResponsiveContainer width="100%" height="100%">
					<BarChart data={byCause} margin={{ top: 8, right: 8, left: -12, bottom: 52 }}>
						<CartesianGrid stroke="#263244" strokeDasharray="3 3" vertical={false} />
						<XAxis
							dataKey="cause"
							angle={-28}
							textAnchor="end"
							height={64}
							interval={0}
							tick={{ fill: '#94a3b8', fontSize: 11 }}
							tickLine={false}
							axisLine={false}
						/>
						<YAxis
							domain={[0, 100]}
							tickFormatter={(value) => `${value}%`}
							tick={{ fill: '#94a3b8', fontSize: 11 }}
							tickLine={false}
							axisLine={false}
						/>
						<Tooltip content={<RecoveryTooltip />} cursor={{ fill: '#1e293b' }} />
						<Bar dataKey="recoveryRate" fill="#22d3ee" radius={[4, 4, 0, 0]} />
					</BarChart>
				</ResponsiveContainer>
			</div>
		</section>
	)
}

export default RecoveryChart
