import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, ShoppingBag, Users, Package,
  AlertTriangle, IndianRupee, ArrowRight, RefreshCw,
  TrendingDown, Minus, BarChart2, ShoppingCart, Zap,
  RotateCcw, Activity
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

// ── Premium Stat Card (Apple Human Interface Guidelines) ─────────────────────
function StatCard({ icon: Icon, label, value, sub, accentColor = '#0071e3', onClick, trend, trendLabel, sparkData }) {
  const numericValue = typeof value === 'number' ? value : null
  const displayValue = numericValue !== null
    ? new Intl.NumberFormat('en-IN').format(numericValue)
    : value

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendClass = trend === 'up' ? 'trend-up' : trend === 'down' ? 'trend-down' : 'trend-neutral'

  return (
    <button
      onClick={onClick}
      className="stat-card-v2 text-left w-full relative overflow-hidden group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none"
      aria-label={label}
      title={`Click to view ${label}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            {label}
            <ArrowRight size={10} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-indigo-500" />
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white animated-counter leading-none tracking-tight">
            {displayValue}
          </p>
          {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">{sub}</p>}
        </div>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.04] dark:border-white/[0.08] transition-transform duration-200 group-hover:scale-110"
          style={{ color: accentColor }}
        >
          <Icon size={18} strokeWidth={2} />
        </div>
      </div>

      {/* Sparkline if data provided */}
      {sparkData && sparkData.length > 1 && (
        <div className="mb-2 opacity-50">
          <ResponsiveContainer width="100%" height={28}>
            <AreaChart data={sparkData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`spark-${label.replace(/\s/g,'')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accentColor} stopOpacity={0.25}/>
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
        <div className="flex items-center gap-1.5 mt-2">
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
        <div
          onClick={() => navigate('/traceability')}
          className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3 text-red-800 dark:text-red-400 cursor-pointer hover:bg-red-500/15 transition-all group"
          title="Click to view Batch Recall in Traceability"
        >
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5 text-red-600 animate-pulse" />
          <div className="flex-1">
            <p className="font-bold text-sm flex items-center gap-2">
              CRITICAL: Active Batch Recall
              <ArrowRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity text-red-600" />
            </p>
            <p className="text-xs mt-0.5 leading-relaxed">
              Batches flagged: <b>{data.batch_recall_alerts.map(r => r.batch_no).join(', ')}</b>. Click to open Traceability module.
            </p>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); navigate('/traceability') }}
            className="btn-danger text-[11px] px-3 py-1.5 flex-shrink-0"
          >
            View Traceability
          </button>
        </div>
      )}

      {/* ── KPI Row 1: Financial ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp}
          label="Today's Sales"
          value={<Amount value={data?.today_sales?.amount} />}
          sub={`${data?.today_sales?.count || 0} invoices · Click for Sales`}
          accentColor="#0071e3"
          sparkData={sparkSales}
          trend="up" trendLabel="+12%"
          onClick={() => navigate('/sales')}
        />
        <StatCard
          icon={ShoppingBag}
          label="Today's Purchases"
          value={<Amount value={data?.today_purchases?.amount} />}
          sub={`${data?.today_purchases?.count || 0} entries · Click for Purchases`}
          accentColor="#0071e3"
          trend="neutral" trendLabel="—"
          onClick={() => navigate('/purchases')}
        />
        <StatCard
          icon={IndianRupee}
          label="Customer Dues"
          value={<Amount value={data?.customer_outstanding} />}
          sub="Total receivable · Click for Payments"
          accentColor="#d97706"
          trend="down" trendLabel="-3%"
          onClick={() => navigate('/payments')}
        />
        <StatCard
          icon={IndianRupee}
          label="Supplier Dues"
          value={<Amount value={data?.supplier_outstanding} />}
          sub="Total payable · Click for Payments"
          accentColor="#64748b"
          trend="neutral" trendLabel="—"
          onClick={() => navigate('/payments')}
        />
      </div>

      {/* ── KPI Row 2: Counts ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Customers"
          value={data?.total_customers}
          sub="Active accounts · Click for Customers"
          accentColor="#0071e3"
          onClick={() => navigate('/customers')}
        />
        <StatCard
          icon={Package}
          label="Products"
          value={data?.total_products}
          sub="Catalog items · Click for Products"
          accentColor="#0071e3"
          onClick={() => navigate('/products')}
        />
        <StatCard
          icon={AlertTriangle}
          label="Low Stock"
          value={data?.low_stock_count}
          sub="Items below threshold · Click for Inventory"
          accentColor="#e11d48"
          trend={data?.low_stock_count > 0 ? 'down' : 'neutral'}
          trendLabel={data?.low_stock_count > 0 ? 'Action needed' : 'All good'}
          onClick={() => navigate('/inventory')}
        />
        <StatCard
          icon={Users}
          label="Suppliers"
          value={data?.total_suppliers}
          sub="Vendors · Click for Suppliers"
          accentColor="#64748b"
          onClick={() => navigate('/suppliers')}
        />
      </div>

      {/* ── Charts + Recent Sales ────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Sales Area Chart */}
        <div
          onClick={() => navigate('/reports')}
          className="lg:col-span-2 card p-5 cursor-pointer group hover:border-indigo-400/50 transition-all duration-200"
          title="Click to view full Sales Report"
        >
          <div className="section-header mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)' }}>
                <BarChart2 size={14} style={{ color: '#6366f1' }} />
              </div>
              <h2 className="section-header-title group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                Sales — Last 7 Days
                <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-indigo-500" />
              </h2>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); navigate('/reports') }}
              className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
            >
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
              <p className="text-sm text-gray-400">No sales data yet · Click to view Sales</p>
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
            <button
              onClick={() => navigate('/sales')}
              className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
            >
              All Sales <ArrowRight size={11} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {(data?.recent_sales || []).length > 0 ? (
              <div className="divide-y divide-gray-100/60 dark:divide-white/5">
                {(data?.recent_sales || []).map(s => (
                  <div
                    key={s.id}
                    onClick={() => navigate('/sales')}
                    className="px-5 py-3 hover:bg-white/40 dark:hover:bg-white/5 transition-colors cursor-pointer group"
                    title="Click to view sales invoices"
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-[13px] font-semibold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                        {s.customer_name}
                        <ArrowRight size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                      </p>
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
              <div
                onClick={() => navigate('/sales')}
                className="flex items-center justify-center h-full py-12 cursor-pointer group"
              >
                <div className="text-center">
                  <ShoppingCart size={28} className="text-gray-200 dark:text-gray-700 mx-auto mb-2 group-hover:text-indigo-400 transition-colors" />
                  <p className="text-sm text-gray-400 group-hover:text-indigo-500 transition-colors">No sales yet today · Click for Sales</p>
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
            <button
              onClick={() => navigate('/reports')}
              className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
            >
              Full Analytics <ArrowRight size={11} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div
              onClick={() => navigate('/reports')}
              className="p-3 -m-1 rounded-xl cursor-pointer hover:bg-indigo-500/[0.04] dark:hover:bg-indigo-500/[0.08] transition-all group"
              title="Click to view volume reports"
            >
              <div className="flex items-center justify-between mb-2 border-b border-gray-100 dark:border-white/5 pb-1.5">
                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Top Volume</p>
                <span className="text-[10px] text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity font-semibold flex items-center gap-0.5">
                  Report <ArrowRight size={9} />
                </span>
              </div>
              <div className="space-y-2.5">
                {(data?.most_sold_brands || []).map((b, idx) => {
                  const maxQty = Math.max(...(data?.most_sold_brands || []).map(x => x.quantity || 1), 1)
                  const pct = Math.min(100, Math.round(((b.quantity || 0) / maxQty) * 100))
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[100px]">{b.brand}</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 text-[11px]">{b.quantity} pcs</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-white/5 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-indigo-500/80 dark:bg-indigo-400 h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
                {!data?.most_sold_brands?.length && <p className="text-xs text-gray-400 py-2">No data · Click for reports</p>}
              </div>
            </div>
            <div
              onClick={() => navigate('/reports')}
              className="p-3 -m-1 rounded-xl cursor-pointer hover:bg-emerald-500/[0.04] dark:hover:bg-emerald-500/[0.08] transition-all group"
              title="Click to view profit report"
            >
              <div className="flex items-center justify-between mb-2 border-b border-gray-100 dark:border-white/5 pb-1.5">
                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Top Profit</p>
                <span className="text-[10px] text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity font-semibold flex items-center gap-0.5">
                  Report <ArrowRight size={9} />
                </span>
              </div>
              <div className="space-y-2.5">
                {(data?.most_profitable_brands || []).map((b, idx) => {
                  const maxProfit = Math.max(...(data?.most_profitable_brands || []).map(x => x.profit || 1), 1)
                  const pct = Math.min(100, Math.round((Math.max(0, b.profit || 0) / maxProfit) * 100))
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[100px]">{b.brand}</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">₹{b.profit?.toFixed(0)}</span>
                      </div>
                      <div className="w-full bg-gray-100 dark:bg-white/5 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-500/80 dark:bg-emerald-400 h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
                {!data?.most_profitable_brands?.length && <p className="text-xs text-gray-400 py-2">No data · Click for reports</p>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Returns & Movements — Clickable to Returns & Traceability ── */}
        <div className="card p-5">
          <div className="section-header mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <RotateCcw size={14} style={{ color: '#ef4444' }} />
              </div>
              <h2 className="section-header-title">Returns &amp; Movements</h2>
            </div>
            <button
              onClick={() => navigate('/returns')}
              className="text-xs text-rose-500 dark:text-rose-400 hover:underline flex items-center gap-1 font-semibold"
            >
              Returns Center <ArrowRight size={11} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Top Returns Column — Clickable return graph to /returns */}
            <div
              onClick={() => navigate('/returns')}
              className="p-3 -m-1 rounded-xl cursor-pointer hover:bg-rose-500/[0.05] dark:hover:bg-rose-500/[0.08] transition-all group"
              title="Click to open Returns Center"
            >
              <div className="flex items-center justify-between mb-2 border-b border-gray-100 dark:border-white/5 pb-1.5">
                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1">
                  Top Returns
                  <RotateCcw size={10} className="text-rose-500" />
                </p>
                <span className="text-[10px] text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity font-semibold flex items-center gap-0.5">
                  Open <ArrowRight size={9} />
                </span>
              </div>
              <div className="space-y-2.5">
                {(data?.most_returned_products || []).map((p, idx) => {
                  const maxQty = Math.max(...(data?.most_returned_products || []).map(x => x.quantity || 1), 1)
                  const pct = Math.min(100, Math.round(((p.quantity || 0) / maxQty) * 100))
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[100px]" title={p.name}>
                          {p.name}
                        </span>
                        <span className="font-bold text-rose-500 text-[11px] flex-shrink-0">
                          {p.quantity} pcs
                        </span>
                      </div>
                      {/* Visual mini bar graph for returns */}
                      <div className="w-full bg-gray-100 dark:bg-white/5 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-rose-500/80 dark:bg-rose-400 h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
                {!data?.most_returned_products?.length && (
                  <div className="py-3 text-center">
                    <p className="text-xs text-gray-400">No returns recorded</p>
                    <span className="text-[11px] text-rose-500 font-semibold group-hover:underline mt-0.5 inline-block">
                      Open Returns Center →
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Recent Movement Logs Column — Clickable to /traceability */}
            <div
              onClick={() => navigate('/traceability')}
              className="p-3 -m-1 rounded-xl cursor-pointer hover:bg-indigo-500/[0.05] dark:hover:bg-indigo-500/[0.08] transition-all group"
              title="Click to open Traceability module"
            >
              <div className="flex items-center justify-between mb-2 border-b border-gray-100 dark:border-white/5 pb-1.5">
                <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest flex items-center gap-1">
                  Recent Logs
                </p>
                <span className="text-[10px] text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity font-semibold flex items-center gap-0.5">
                  Trace <ArrowRight size={9} />
                </span>
              </div>
              <div className="space-y-2">
                {(data?.product_movement_history || []).map((l, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[11px]">
                    <span className="font-medium text-gray-700 dark:text-gray-300 truncate max-w-[90px]" title={l.product_name}>
                      {l.product_name}
                    </span>
                    <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                      l.quantity > 0
                        ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10'
                        : 'text-red-500 bg-red-50 dark:bg-red-500/10'
                    }`}>
                      {l.quantity > 0 ? `+${l.quantity}` : l.quantity}
                    </span>
                  </div>
                ))}
                {!data?.product_movement_history?.length && (
                  <div className="py-3 text-center">
                    <p className="text-xs text-gray-400">No recent movement logs</p>
                    <span className="text-[11px] text-indigo-500 font-semibold group-hover:underline mt-0.5 inline-block">
                      View Traceability →
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── All Sections & Quick Navigation (1-click to every section) ────────── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="section-header-title">All Sections &amp; Direct Access</h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">1-click jump to any module without menus</p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
          <button onClick={() => navigate('/sales/new')} className="btn-primary text-xs justify-center py-2.5 shadow-sm">
            ＋ New Sale
          </button>
          <button onClick={() => navigate('/sales')} className="btn-secondary text-xs justify-center py-2.5">
            Sales &amp; Bills
          </button>
          <button onClick={() => navigate('/customers')} className="btn-secondary text-xs justify-center py-2.5">
            Customers &amp; Khata
          </button>
          <button onClick={() => navigate('/payments')} className="btn-secondary text-xs justify-center py-2.5">
            Payments / Dues
          </button>
          <button onClick={() => navigate('/inventory')} className="btn-secondary text-xs justify-center py-2.5">
            Inventory &amp; Stock
          </button>
          <button onClick={() => navigate('/products')} className="btn-secondary text-xs justify-center py-2.5">
            Products Catalog
          </button>
          <button onClick={() => navigate('/purchases/new')} className="btn-secondary text-xs justify-center py-2.5">
            ＋ New Purchase
          </button>
          <button onClick={() => navigate('/purchases')} className="btn-secondary text-xs justify-center py-2.5">
            Purchases List
          </button>
          <button onClick={() => navigate('/suppliers')} className="btn-secondary text-xs justify-center py-2.5">
            Suppliers
          </button>
          <button onClick={() => navigate('/returns')} className="btn-secondary text-xs justify-center py-2.5 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:border-rose-500">
            Returns Center
          </button>
          <button onClick={() => navigate('/traceability')} className="btn-secondary text-xs justify-center py-2.5">
            Traceability
          </button>
          <button onClick={() => navigate('/reports')} className="btn-secondary text-xs justify-center py-2.5">
            GST Reports
          </button>
          <button onClick={() => navigate('/documents')} className="btn-secondary text-xs justify-center py-2.5">
            Letterhead
          </button>
          <button onClick={() => navigate('/settings')} className="btn-secondary text-xs justify-center py-2.5">
            Settings
          </button>
        </div>
      </div>

    </div>
  )
}
