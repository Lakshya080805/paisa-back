const currencyFormatter = new Intl.NumberFormat('en-IN', {
	maximumFractionDigits: 0,
});

const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function SummaryBar({ metrics }) {
	const stats = [
		{ label: 'Total At Risk', value: safeNumber(metrics?.totalAtRisk) },
		{ label: 'Total Recovered', value: safeNumber(metrics?.totalRecovered) },
		{ label: 'Net Recovery', value: safeNumber(metrics?.netRecovered) },
		{ label: 'Recovery Rate', value: `${safeNumber(metrics?.recoveryRate)}%`, isRate: true },
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
