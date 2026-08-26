import { useEffect, useState } from 'react'
import axios from 'axios'
import CaseDrilldown from './components/CaseDrilldown'
import CaseTable from './components/CaseTable'
import RecoveryChart from './components/RecoveryChart'
import SummaryBar from './components/SummaryBar'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
})

function App() {
  const [metrics, setMetrics] = useState(null)
  const [cases, setCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [runningBatch, setRunningBatch] = useState(false)
  const [error, setError] = useState('')
  const [selectedCaseId, setSelectedCaseId] = useState(null)

  const loadDashboard = async () => {
    setError('')
    const [metricsResponse, casesResponse] = await Promise.all([
      api.get('/api/metrics'),
      api.get('/api/cases'),
    ])
    setMetrics(metricsResponse.data)
    setCases(casesResponse.data)
  }

  useEffect(() => {
    let mounted = true

    Promise.all([
      api.get('/api/metrics'),
      api.get('/api/cases'),
    ])
      .then(([metricsResponse, casesResponse]) => {
        if (!mounted) return
        setMetrics(metricsResponse.data)
        setCases(casesResponse.data)
      })
      .catch(() => {
        if (mounted) setError('Could not load dashboard data. Check that the backend is running.')
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  const handleRunBatch = async () => {
    setRunningBatch(true)
    setError('')
    try {
      await api.post('/api/run-batch')
      await loadDashboard()
    } catch {
      setError('The batch could not be completed. Check the backend logs and try again.')
    } finally {
      setRunningBatch(false)
    }
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">Loading recovery dashboard...</main>
  }

  if (error && !metrics) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center text-rose-200">{error}</main>
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-slate-950 px-4 py-6 text-slate-100 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-4 border-b border-slate-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Revenue operations</p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">AI Revenue Recovery Agent</h1>
            <p className="mt-2 text-sm text-slate-400">Monitor at-risk payments, recovery outcomes, and human review.</p>
          </div>
          <button
            type="button"
            onClick={handleRunBatch}
            disabled={runningBatch}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-cyan-400 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {runningBatch && <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" aria-hidden="true" />}
            {runningBatch ? 'Running batch...' : 'Run Batch'}
          </button>
        </header>

        {runningBatch && <p className="-mt-5 mb-6 text-sm text-cyan-300">Running pipeline, this may take a minute...</p>}
        {error && <div className="mb-6 rounded-lg border border-rose-900 bg-rose-950/50 px-4 py-3 text-sm text-rose-200">{error}</div>}

        <div className="space-y-6">
          <SummaryBar metrics={metrics} />
          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
            <RecoveryChart byCause={metrics?.byCause || []} />
            <CaseTable cases={cases} onCaseClick={setSelectedCaseId} />
          </section>
          <CaseDrilldown caseId={selectedCaseId} onClose={() => setSelectedCaseId(null)} />
        </div>

        <footer className="mt-10 border-t border-slate-800 pt-5 text-xs leading-5 text-slate-500">
          SMS/email reminders and payment method links are simulated and logged; payment retries call Razorpay&apos;s real test-mode API.
        </footer>
      </div>
    </main>
  )
}

export default App
