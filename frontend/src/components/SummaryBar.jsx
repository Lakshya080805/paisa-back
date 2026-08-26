const currencyFormatter = new Intl.NumberFormat('en-IN', {
	maximumFractionDigits: 0,
});

function SummaryBar({ metrics }) {
	const stats = [
		{ label: 'Total At Risk', value: metrics?.totalAtRisk || 0 },
		{ label: 'Total Recovered', value: metrics?.totalRecovered || 0 },
		{ label: 'Net Recovery', value: metrics?.netRecovered || 0 },
		{ label: 'Recovery Rate', value: `${metrics?.recoveryRate || 0}%`, isRate: true },
	];

	return (
		<section aria-label="Recovery summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
			{stats.map((stat) => (
				<article key={stat.label} className="rounded-lg border border-slate-800 bg-slate-900 px-5 py-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{stat.label}</p>
					<p className="mt-2 text-2xl font-semibold tabular-nums text-white">
						{stat.isRate ? stat.value : `₹${currencyFormatter.format(stat.value)}`}
					</p>
				</article>
			))}
		</section>
	)
}

export default SummaryBar
