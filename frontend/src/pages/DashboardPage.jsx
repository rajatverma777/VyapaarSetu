import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, ShoppingBag, Users, Package,
  AlertTriangle, IndianRupee, ArrowRight, RefreshCw
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts'
import { reportAPI } from '../services/api'
import { LoadingScreen, Amount, StatusBadge } from '../components/ui'
import { format } from 'date-fns'

function StatCard({ icon: Icon, label, value, sub, color, onClick }) {
  const colorMap = {
    blue:   'text-indigo-600 dark:text-indigo-400',
    green:  'text-green-650 dark:text-green-400',
    orange: 'text-orange-600 dark:text-orange-400',
    red:    'text-red-650 dark:text-red-400',
    purple: 'text-purple-600 dark:text-purple-400',
  }
  return (
    <button
      onClick={onClick}
      className="card p-5 text-left hover:shadow-md transition-shadow w-full"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 glass-icon-container ${colorMap[color]}`}>
          <Icon size={20} />
        </div>
      </div>
    </button>
  )
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl p-3 border border-gray-200 dark:border-gray-700">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</p>
      <p className="text-sm font-bold text-primary-600">₹{Number(payload[0]?.value || 0).toLocaleString('en-IN')}</p>
      <p className="text-xs text-gray-500">{payload[0]?.payload?.count} invoices</p>
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const navigate = useNavigate()
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
    // Auto-refresh every 60 seconds
    intervalRef.current = setInterval(() => load(true), 60000)
    // Refresh when tab becomes visible again
    const onVisible = () => { if (document.visibilityState === 'visible') load(true) }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(intervalRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  if (loading) return <LoadingScreen />

  const chart = (data?.sales_chart || []).map(d => ({
    date:   d._id,
    amount: d.amount,
    count:  d.count
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {format(new Date(), 'EEEE, d MMMM yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-400 hidden sm:block">
              Updated {format(lastUpdated, 'h:mm:ss a')}
            </span>
          )}
          <button onClick={() => load(false)} disabled={loading || refreshing} className="btn-secondary gap-2">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Recall Alerts Warning Banner */}
      {data?.batch_recall_alerts?.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-start gap-3 text-red-800 dark:text-red-400 animate-pulse">
          <AlertTriangle size={20} className="flex-shrink-0 mt-0.5 text-red-600" />
          <div className="flex-1">
            <p className="font-bold text-sm">CRITICAL ALERT: Active Batch Recalls</p>
            <p className="text-xs mt-1">
              The following batch(es) have been flagged for immediate recall: <b>{data.batch_recall_alerts.map(r => r.batch_no).join(', ')}</b>.
              Please check the <b>Traceability</b> module to export the list of affected customers.
            </p>
          </div>
          <button onClick={() => navigate('/traceability')} className="btn-primary bg-red-600 hover:bg-red-750 text-[10px] px-2.5 py-1">
            View Recalls
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp} label="Today's Sales"
          value={<Amount value={data?.today_sales?.amount} />}
          sub={`${data?.today_sales?.count || 0} invoices`}
          color="blue"
          onClick={() => navigate('/sales')}
        />
        <StatCard
          icon={ShoppingBag} label="Today's Purchases"
          value={<Amount value={data?.today_purchases?.amount} />}
          sub={`${data?.today_purchases?.count || 0} entries`}
          color="purple"
          onClick={() => navigate('/purchases')}
        />
        <StatCard
          icon={IndianRupee} label="Customer Outstanding"
          value={<Amount value={data?.customer_outstanding} />}
          sub="Total receivable"
          color="orange"
          onClick={() => navigate('/reports')}
        />
        <StatCard
          icon={IndianRupee} label="Supplier Outstanding"
          value={<Amount value={data?.supplier_outstanding} />}
          sub="Total payable"
          color="red"
          onClick={() => navigate('/reports')}
        />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}   label="Customers"  value={data?.total_customers}  color="green"  onClick={() => navigate('/customers')} />
        <StatCard icon={Package} label="Products"   value={data?.total_products}   color="blue"   onClick={() => navigate('/products')} />
        <StatCard
          icon={AlertTriangle} label="Low Stock"
          value={data?.low_stock_count}
          sub="Items below threshold"
          color="red"
          onClick={() => navigate('/inventory')}
        />
        <StatCard icon={Users}   label="Suppliers"  value={data?.total_suppliers}  color="purple" onClick={() => navigate('/suppliers')} />
      </div>

      {/* Charts + Recent */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <div className="lg:col-span-2 card p-5">
          <h2 className="section-title mb-4">Sales – Last 7 Days</h2>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chart} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="amount" stroke="#6366f1" fill="url(#grad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Sales */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h2 className="section-title">Recent Sales</h2>
            <button onClick={() => navigate('/sales')} className="text-xs text-primary-600 hover:underline flex items-center gap-1">
              View all <ArrowRight size={12} />
            </button>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {(data?.recent_sales || []).map(s => (
              <div key={s.id} className="px-5 py-3">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{s.customer_name}</p>
                  <Amount value={s.total_amount} className="text-sm font-semibold text-primary-600" />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500">{s.invoice_number}</p>
                  <StatusBadge status={s.status} />
                </div>
              </div>
            ))}
            {!data?.recent_sales?.length && (
              <div className="px-5 py-8 text-center text-sm text-gray-400">No sales yet today</div>
            )}
          </div>
        </div>
      </div>

      {/* Brand Analytics Grid (NEW) */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Most Sold Brands & Most Profitable Brands */}
        <div className="card p-5 space-y-4">
          <h2 className="section-title flex items-center gap-1.5 text-indigo-700 dark:text-indigo-400">
            <TrendingUp size={16} /> Brand Sales &amp; Profit Margins
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Sold */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-1">Top Volume Brands</p>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {(data?.most_sold_brands || []).map((b, idx) => (
                  <div key={idx} className="py-2 flex justify-between text-xs">
                    <span className="font-medium truncate max-w-[100px]">{b.brand}</span>
                    <span className="font-bold text-indigo-600">{b.quantity} PCS</span>
                  </div>
                ))}
                {!data?.most_sold_brands?.length && <p className="text-xs text-gray-400 py-3">No sales yet</p>}
              </div>
            </div>
            {/* Profitable */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-1">Top Profit Brands</p>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {(data?.most_profitable_brands || []).map((b, idx) => (
                  <div key={idx} className="py-2 flex justify-between text-xs">
                    <span className="font-medium truncate max-w-[100px]">{b.brand}</span>
                    <span className="font-bold text-green-600">₹{b.profit?.toFixed(0)}</span>
                  </div>
                ))}
                {!data?.most_profitable_brands?.length && <p className="text-xs text-gray-400 py-3">No profit data</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Most Returned Products & Movement History (NEW) */}
        <div className="card p-5 space-y-4">
          <h2 className="section-title flex items-center gap-1.5 text-red-650 dark:text-red-400">
            <Package size={16} /> Stock Returns &amp; Movements
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Returned */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-1">Top Returned Products</p>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {(data?.most_returned_products || []).map((p, idx) => (
                  <div key={idx} className="py-2 flex justify-between text-xs">
                    <span className="font-medium truncate max-w-[100px]" title={p.name}>{p.name}</span>
                    <span className="font-bold text-red-500">{p.quantity} PCS</span>
                  </div>
                ))}
                {!data?.most_returned_products?.length && <p className="text-xs text-gray-400 py-3">No returns logged</p>}
              </div>
            </div>
            {/* Movement logs */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b pb-1">Recent Inventory Logs</p>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {(data?.product_movement_history || []).map((l, idx) => (
                  <div key={idx} className="py-1.5 flex flex-col text-[11px] leading-tight">
                    <div className="flex justify-between font-medium">
                      <span className="truncate max-w-[90px]" title={l.product_name}>{l.product_name}</span>
                      <span className={l.quantity > 0 ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
                        {l.quantity > 0 ? `+${l.quantity}` : l.quantity}
                      </span>
                    </div>
                    <span className="text-[9px] text-gray-400 uppercase">{l.type?.replace('_', ' ')}</span>
                  </div>
                ))}
                {!data?.product_movement_history?.length && <p className="text-xs text-gray-400 py-3">No stock logs</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card p-5">
        <h2 className="section-title mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate('/sales/new')}    className="btn-primary">New Sale Invoice</button>
          <button onClick={() => navigate('/purchases/new')} className="btn-secondary">New Purchase</button>
          <button onClick={() => navigate('/returns')}       className="btn-secondary">Returns Center</button>
          <button onClick={() => navigate('/traceability')}  className="btn-secondary">Traceability Center</button>
          <button onClick={() => navigate('/reports')}      className="btn-secondary">GST Report</button>
        </div>
      </div>
    </div>
  )
}
