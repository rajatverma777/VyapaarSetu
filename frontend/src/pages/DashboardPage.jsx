import { useState, useEffect } from 'react'
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
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    try {
      const { data: d } = await reportAPI.dashboard()
      setData(d)
    } catch { /* */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

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
        <button onClick={load} className="btn-secondary gap-2">
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

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

      {/* Quick Actions */}
      <div className="card p-5">
        <h2 className="section-title mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate('/sales/new')}    className="btn-primary">New Sale Invoice</button>
          <button onClick={() => navigate('/purchases/new')} className="btn-secondary">New Purchase</button>
          <button onClick={() => navigate('/customers')}    className="btn-secondary">Add Customer</button>
          <button onClick={() => navigate('/products')}     className="btn-secondary">Add Product</button>
          <button onClick={() => navigate('/reports')}      className="btn-secondary">GST Report</button>
        </div>
      </div>
    </div>
  )
}
