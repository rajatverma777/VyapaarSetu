import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, ShoppingBag, Users, Package,
  AlertTriangle, IndianRupee, ArrowRight, RefreshCw,
  TrendingDown, Minus, BarChart2, ShoppingCart, Zap
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'
import { reportAPI } from '../services/api'
import { LoadingScreen, Amount, StatusBadge } from '../components/ui'
import { format } from 'date-fns'

// ── Animated counter ──────────────────────────────────────────────────────────
function useCountUp(target, duration = 1200) {
  const [count, setCount] = useState(0)
  const startRef = useRef(null)
  useEffect(() => {
    if (target == null || isNaN(Number(target))) return
    const end = Number(target)
    const start = performance.now()
    const step = (now) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.round(eased * end))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration])
  return count
}

// ── Premium Stat Card ────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, accentColor, onClick, trend, trendLabel, sparkData }) {
  const numericValue = typeof value === 'number' ? value : null
  const displayValue = numericValue !== null
    ? new Intl.NumberFormat('en-IN').format(numericValue)
    : value

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendClass = trend === 'up' ? 'trend-up' : trend === 'down' ? 'trend-down' : 'trend-neutral'

  return (
    <button onClick={onClick} className="stat-card-v2 text-left w-full" aria-label={label}>
      {/* Left accent bar */}
      <div className="stat-card-accent" style={{ background: accentColor }} />

      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">
            {label}
          </p>
          <p className="text-2xl font-black text-gray-900 dark:text-white animated-counter leading-none" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-0.02em' }}>
            {displayValue}
          </p>
          {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: accentColor + '18', color: accentColor }}
        >
          <Icon size={18} />
        </div>
      </div>

      {/* Sparkline if data provided */}
      {sparkData && sparkData.length > 1 && (
        <div className="mb-2 opacity-60">
          <ResponsiveContainer width="100%" height={32}>
            <AreaChart data={sparkData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${label.replace(/\s/g,'')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accentColor} stopOpacity={0.35}/>
                  <stop offset="100%" stopColor={accentColor} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="amount"
                stroke={accentColor}
                strokeWidth={1.5}
                fill={`url(#spark-${label.replace(/\s/g,'')})`}
                dot={false}
                isAnimationActive={true}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Trend badge */}
      {trend && trendLabel && (
        <div className="flex items-center gap-1.5">
          <span className={`trend-badge ${trendClass}`}>
            <TrendIcon size={10} />
            {trendLabel}
          </span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">vs yesterday</span>
        </div>
      )}
    </button>
  )
}

// ── Custom tooltip for main chart ────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 shadow-xl rounded-xl p-3 border border-gray-200/60 dark:border-gray-700/60 backdrop-blur-md">
      <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
        ₹{Number(payload[0]?.value || 0).toLocaleString('en-IN')}
      </p>
      <p className="text-xs text-gray-500">{payload[0]?.payload?.count} invoices</p>
    </div>
  )
}

// ── Main Dashboard Component ──────────────────────────────────────────────────
export default function DashboardPage() {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const navigate   = useNavigate()
  const intervalRef = useRef(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const { data: d } = await reportAPI.dashboard()
      setData(d)
      setLastUpdated(new Date())
    } catch { /* */ }
    finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    intervalRef.current = setInterval(() => load(true), 60000)
    const onVisible = () => { if (document.visibilityState === 'visible') load(true) }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  if (loading) return <LoadingScreen />

  const chart = (data?.sales_chart || []).map(d => ({ date: d._id, amount: d.amount, count: d.count }))

  // Build sparkline data from chart for stat cards
  const sparkSales   = chart.slice(-7)
  const sparkEmpty   = []

  return (
    <div className="space-y-5">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-gray-900 dark:text-white" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-0.02em' }}>
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'} 👋
          </h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-medium">
            {format(new Date(), 'EEEE, d MMMM yyyy')}
            {lastUpdated && (
              <span className="ml-2 text-gray-300 dark:text-gray-600">
                · Updated {format(lastUpdated, 'h:mm a')}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {refreshing && (
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <RefreshCw size={12} className="animate-spin" />
              Syncing…
            </div>
          )}
          <button onClick={() => load(false)} disabled={loading || refreshing} className="btn-secondary gap-2 text-xs">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Recall Alert Banner ──────────────────────────────────────────────── */}
      {data?.batch_recall_alerts?.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3 text-red-800 dark:text-red-400">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5 text-red-600 animate-pulse" />
          <div className="flex-1">
            <p className="font-bold text-sm">CRITICAL: Active Batch Recall</p>
            <p className="text-xs mt-0.5 leading-relaxed">
              Batches flagged: <b>{data.batch_recall_alerts.map(r => r.batch_no).join(', ')}</b>. Check Traceability module.
            </p>
          </div>
          <button onClick={() => navigate('/traceability')} className="btn-danger text-[11px] px-3 py-1.5 flex-shrink-0">
            View
          </button>
        </div>
      )}

      {/* ── KPI Row 1: Financial ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp}
          label="Today's Sales"
          value={<Amount value={data?.today_sales?.amount} />}
          sub={`${data?.today_sales?.count || 0} invoices`}
          accentColor="#6366f1"
          sparkData={sparkSales}
          trend="up" trendLabel="+12%"
          onClick={() => navigate('/sales')}
        />
        <StatCard
          icon={ShoppingBag}
          label="Today's Purchases"
          value={<Amount value={data?.today_purchases?.amount} />}
          sub={`${data?.today_purchases?.count || 0} entries`}
          accentColor="#a855f7"
          trend="neutral" trendLabel="—"
          onClick={() => navigate('/purchases')}
        />
        <StatCard
          icon={IndianRupee}
          label="Customer Dues"
          value={<Amount value={data?.customer_outstanding} />}
          sub="Total receivable"
          accentColor="#f59e0b"
          trend="down" trendLabel="-3%"
          onClick={() => navigate('/reports')}
        />
        <StatCard
          icon={IndianRupee}
          label="Supplier Dues"
          value={<Amount value={data?.supplier_outstanding} />}
          sub="Total payable"
          accentColor="#ef4444"
          trend="neutral" trendLabel="—"
          onClick={() => navigate('/reports')}
        />
      </div>

      {/* ── KPI Row 2: Counts ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}         label="Customers"  value={data?.total_customers}  accentColor="#10b981" onClick={() => navigate('/customers')} />
        <StatCard icon={Package}       label="Products"   value={data?.total_products}   accentColor="#6366f1" onClick={() => navigate('/products')} />
        <StatCard
          icon={AlertTriangle}
          label="Low Stock"
          value={data?.low_stock_count}
          sub="Items below threshold"
          accentColor="#ef4444"
          trend={data?.low_stock_count > 0 ? 'down' : 'neutral'}
          trendLabel={data?.low_stock_count > 0 ? 'Action needed' : 'All good'}
          onClick={() => navigate('/inventory')}
        />
        <StatCard icon={Users}         label="Suppliers"  value={data?.total_suppliers}  accentColor="#a855f7" onClick={() => navigate('/suppliers')} />
      </div>

      {/* ── Charts + Recent Sales ────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Sales Area Chart */}
        <div className="lg:col-span-2 card p-5">
          <div className="section-header mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)' }}>
                <BarChart2 size={14} style={{ color: '#6366f1' }} />
              </div>
              <h2 className="section-header-title">Sales — Last 7 Days</h2>
            </div>
            <button onClick={() => navigate('/reports')} className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold">
              Full Report <ArrowRight size={11} />
            </button>
          </div>
          {chart.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-main" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" className="dark:opacity-20" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fontFamily: 'Inter', fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fontFamily: 'Inter', fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#6366f1"
                  fill="url(#grad-main)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#6366f1', strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: '#6366f1', stroke: 'white', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center">
              <p className="text-sm text-gray-400">No sales data yet</p>
            </div>
          )}
        </div>

        {/* Recent Sales */}
        <div className="card flex flex-col">
          <div className="card-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                <Zap size={14} style={{ color: '#10b981' }} />
              </div>
              <h2 className="section-header-title">Recent Sales</h2>
            </div>
            <button onClick={() => navigate('/sales')} className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold">
              All <ArrowRight size={11} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {(data?.recent_sales || []).length > 0 ? (
              <div className="divide-y divide-gray-100/60 dark:divide-white/5">
                {(data?.recent_sales || []).map(s => (
                  <div key={s.id} className="px-5 py-3 hover:bg-white/40 dark:hover:bg-white/3 transition-colors">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-[13px] font-semibold text-gray-900 dark:text-white truncate">{s.customer_name}</p>
                      <Amount value={s.total_amount} className="text-[13px] font-bold text-indigo-600 dark:text-indigo-400 flex-shrink-0 ml-2" />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">{s.invoice_number}</p>
                      <StatusBadge status={s.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full py-12">
                <div className="text-center">
                  <ShoppingCart size={28} className="text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No sales yet today</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Brand Analytics ──────────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <div className="section-header mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)' }}>
                <TrendingUp size={14} style={{ color: '#6366f1' }} />
              </div>
              <h2 className="section-header-title">Brand Performance</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 border-b border-gray-100 dark:border-white/5 pb-1.5">Top Volume</p>
              <div className="space-y-2">
                {(data?.most_sold_brands || []).map((b, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs">
                    <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[100px]">{b.brand}</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400 text-[11px]">{b.quantity} pcs</span>
                  </div>
                ))}
                {!data?.most_sold_brands?.length && <p className="text-xs text-gray-400">No data</p>}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 border-b border-gray-100 dark:border-white/5 pb-1.5">Top Profit</p>
              <div className="space-y-2">
                {(data?.most_profitable_brands || []).map((b, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs">
                    <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[100px]">{b.brand}</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">₹{b.profit?.toFixed(0)}</span>
                  </div>
                ))}
                {!data?.most_profitable_brands?.length && <p className="text-xs text-gray-400">No data</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="section-header mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.08)' }}>
                <Package size={14} style={{ color: '#ef4444' }} />
              </div>
              <h2 className="section-header-title">Returns &amp; Movements</h2>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 border-b border-gray-100 dark:border-white/5 pb-1.5">Top Returns</p>
              <div className="space-y-2">
                {(data?.most_returned_products || []).map((p, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs">
                    <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[90px]" title={p.name}>{p.name}</span>
                    <span className="font-bold text-red-500 text-[11px]">{p.quantity} pcs</span>
                  </div>
                ))}
                {!data?.most_returned_products?.length && <p className="text-xs text-gray-400">No returns</p>}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 border-b border-gray-100 dark:border-white/5 pb-1.5">Recent Logs</p>
              <div className="space-y-1.5">
                {(data?.product_movement_history || []).map((l, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[11px]">
                    <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[80px]">{l.product_name}</span>
                    <span className={`font-bold ${l.quantity > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {l.quantity > 0 ? `+${l.quantity}` : l.quantity}
                    </span>
                  </div>
                ))}
                {!data?.product_movement_history?.length && <p className="text-xs text-gray-400">No logs</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Actions ────────────────────────────────────────────────────── */}
      <div className="card p-5">
        <h2 className="section-header-title mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-2.5">
          <button onClick={() => navigate('/sales/new')}    className="btn-primary text-sm">New Sale Invoice</button>
          <button onClick={() => navigate('/purchases/new')} className="btn-secondary text-sm">New Purchase</button>
          <button onClick={() => navigate('/returns')}       className="btn-secondary text-sm">Returns Center</button>
          <button onClick={() => navigate('/traceability')}  className="btn-secondary text-sm">Traceability</button>
          <button onClick={() => navigate('/reports')}       className="btn-secondary text-sm">GST Reports</button>
        </div>
      </div>

    </div>
  )
}
