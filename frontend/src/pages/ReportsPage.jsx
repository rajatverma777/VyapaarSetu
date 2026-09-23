import { useState, useEffect } from 'react'
import { BarChart3, TrendingUp, ShoppingBag, IndianRupee, Package, Users, Percent, Calendar, AlertCircle } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { reportAPI } from '../services/api'
import { LoadingScreen, Amount, DatePicker } from '../components/ui'
import toast from 'react-hot-toast'

const TABS = ['sales', 'purchases', 'gst', 'profit-loss', 'stock', 'outstanding']

function CustomChartTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 dark:bg-[#1a1c24] backdrop-blur-2xl border border-black/10 dark:border-white/15 rounded-xl p-3 shadow-xl text-xs">
        <p className="font-semibold text-gray-500 dark:text-gray-400 mb-1">{label}</p>
        <p className="font-bold text-sm text-[#0071e3] dark:text-[#0a84ff]">
          ₹{Number(payload[0].value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </p>
      </div>
    )
  }
  return null
}

function SummaryCard({ label, value, color = 'blue', sub, icon: Icon = IndianRupee }) {
  const styles = {
    blue: {
      iconBg: 'bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 border border-[#0071e3]/20 dark:border-[#0a84ff]/25',
      iconClr: 'text-[#0071e3] dark:text-[#0a84ff]',
      valClr: 'text-[#0071e3] dark:text-[#0a84ff]',
    },
    green: {
      iconBg: 'bg-emerald-500/10 dark:bg-emerald-400/15 border border-emerald-500/20 dark:border-emerald-400/25',
      iconClr: 'text-emerald-600 dark:text-emerald-400',
      valClr: 'text-emerald-600 dark:text-emerald-400',
    },
    orange: {
      iconBg: 'bg-amber-500/10 dark:bg-amber-400/15 border border-amber-500/20 dark:border-amber-400/25',
      iconClr: 'text-amber-600 dark:text-amber-400',
      valClr: 'text-amber-600 dark:text-amber-400',
    },
    red: {
      iconBg: 'bg-rose-500/10 dark:bg-rose-400/15 border border-rose-500/20 dark:border-rose-400/25',
      iconClr: 'text-rose-600 dark:text-rose-400',
      valClr: 'text-rose-600 dark:text-rose-400',
    },
  }

  const s = styles[color] || styles.blue

  return (
    <div className="card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-sm ${s.iconBg}`}>
          <Icon size={16} className={s.iconClr} />
        </div>
      </div>
      <div>
        <div className={`text-xl sm:text-2xl font-bold tracking-tight ${s.valClr}`}>
          {value}
        </div>
        {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const [tab, setTab]             = useState('sales')
  const [fromDate, setFromDate]   = useState('')
  const [toDate, setToDate]       = useState('')
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(false)

  const load = async () => {
    setLoading(true)
    const params = { from_date: fromDate || undefined, to_date: toDate || undefined }
    try {
      let res
      if (tab === 'sales')        res = await reportAPI.sales({ ...params, group_by: 'day' })
      else if (tab === 'purchases') res = await reportAPI.purchases(params)
      else if (tab === 'gst')     res = await reportAPI.gstSummary(params)
      else if (tab === 'profit-loss') res = await reportAPI.profitLoss(params)
      else if (tab === 'stock')   res = await reportAPI.stock({})
      else if (tab === 'outstanding') res = await reportAPI.outstanding({ party_type: 'customer' })
      setData(res?.data)
    } catch { toast.error('Failed to load report') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [tab, fromDate, toDate])

  const tabLabels = {
    'sales': 'Sales', 'purchases': 'Purchases', 'gst': 'GST Summary',
    'profit-loss': 'Profit & Loss', 'stock': 'Stock', 'outstanding': 'Outstanding'
  }

  return (
    <div className="space-y-5">
      <h1 className="page-title">Reports</h1>

      {/* Tab Selector */}
      <div className="glass-tab-track">
        {TABS.map(t => {
          const isActive = tab === t
          return (
            <button
              key={t}
              onClick={() => {
                setTab(t)
              }}
              className={`glass-tab-btn ${isActive ? 'active' : ''}`}
            >
              {isActive && (
                <>
                  <div className="glass-tab-active-pill" />
                  <div className="glass-tab-active-shadow" />
                </>
              )}
              <span className="relative z-10">{tabLabels[t]}</span>
            </button>
          )
        })}
      </div>

      {/* Date Filters */}
      {['sales', 'purchases', 'gst', 'profit-loss'].includes(tab) && (
        <div className="card p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 relative z-30">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 mr-1 flex items-center gap-1.5">
              <Calendar size={13} className="text-[#0071e3] dark:text-[#0a84ff]" /> Period:
            </span>
            {[
              { label: 'All Time', from: '', to: '' },
              { 
                label: '7 Days', 
                from: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0], 
                to: new Date().toISOString().split('T')[0] 
              },
              { 
                label: '30 Days', 
                from: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0], 
                to: new Date().toISOString().split('T')[0] 
              },
              { 
                label: 'This Month', 
                from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], 
                to: new Date().toISOString().split('T')[0] 
              }
            ].map(p => {
              const isSelected = fromDate === p.from && toDate === p.to
              return (
                <button
                  key={p.label}
                  onClick={() => { setFromDate(p.from); setToDate(p.to) }}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                    isSelected
                      ? 'bg-[#0071e3] dark:bg-[#0a84ff] text-white shadow-sm'
                      : 'bg-black/[0.03] dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.10] text-gray-600 dark:text-gray-300 border border-black/[0.06] dark:border-white/[0.08]'
                  }`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2">
              <DatePicker className="w-36 flex-shrink-0" value={fromDate} onChange={setFromDate} />
              <span className="text-xs text-gray-400">to</span>
              <DatePicker className="w-36 flex-shrink-0" value={toDate} onChange={setToDate} />
            </div>
            {(fromDate || toDate) && (
              <button 
                onClick={() => { setFromDate(''); setToDate('') }} 
                className="btn-secondary text-xs py-1.5 px-2.5 text-gray-500"
                title="Reset Dates"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? <LoadingScreen /> : data && (
        <>
          {/* Sales Report */}
          {tab === 'sales' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard label="Total Sales"    value={<Amount value={data.summary?.total_amount} />} color="blue" icon={IndianRupee} />
                <SummaryCard label="Taxable Amount" value={<Amount value={data.summary?.taxable_amount} />} color="green" icon={TrendingUp} />
                <SummaryCard label="Total Tax"      value={<Amount value={data.summary?.total_tax} />} color="orange" icon={Percent} />
                <SummaryCard label="Outstanding"    value={<Amount value={data.summary?.outstanding} />} color="red" icon={AlertCircle} sub={`${data.summary?.count || 0} invoices`} />
              </div>
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="section-title">Daily Sales Trend</h2>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#0071e3] dark:bg-[#0a84ff]" />
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Sales Amount (₹)</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={290}>
                  <BarChart data={data.data || []} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
                    <defs>
                      <linearGradient id="glassBar-light" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0071e3" stopOpacity={0.92} />
                        <stop offset="100%" stopColor="#0071e3" stopOpacity={0.45} />
                      </linearGradient>
                      <linearGradient id="glassBar-dark" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0a84ff" stopOpacity={0.95} />
                        <stop offset="60%" stopColor="#0a84ff" stopOpacity={0.65} />
                        <stop offset="100%" stopColor="#0051a8" stopOpacity={0.35} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis 
                      dataKey="_id" 
                      tick={{ fontSize: 11 }} 
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                    />
                    <YAxis 
                      tick={{ fontSize: 11 }} 
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}
                    />
                    <Tooltip content={<CustomChartTooltip />} />
                    <Bar 
                      dataKey="total_amount" 
                      className="recharts-glass-bar" 
                      radius={[6, 6, 0, 0]} 
                      maxBarSize={48}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-gray-100/80 dark:border-white/5 flex items-center justify-between">
                  <h2 className="section-title">Daily Breakdown</h2>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                    {(data.data || []).length} days recorded
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th className="text-right">Amount</th>
                        <th className="text-right">Tax</th>
                        <th className="text-right">Invoices</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.data || []).map(r => (
                        <tr key={r._id}>
                          <td className="font-mono text-xs font-semibold">{r._id}</td>
                          <td className="text-right font-semibold text-gray-900 dark:text-white"><Amount value={r.total_amount} /></td>
                          <td className="text-right text-gray-500 dark:text-gray-400"><Amount value={r.total_tax} /></td>
                          <td className="text-right">
                            <span className="badge-blue text-[10px] px-2 py-0.5">{r.count}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Purchases Report */}
          {tab === 'purchases' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard label="Total Purchases" value={<Amount value={data.summary?.total_amount} />} color="blue" icon={ShoppingBag} />
                <SummaryCard label="Taxable"          value={<Amount value={data.summary?.taxable_amount || 0} />} color="green" icon={TrendingUp} />
                <SummaryCard label="Total Tax"        value={<Amount value={data.summary?.total_tax} />} color="orange" icon={Percent} />
                <SummaryCard label="Outstanding"      value={<Amount value={data.summary?.outstanding} />} color="red" icon={AlertCircle} />
              </div>
              <div className="card overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-gray-100/80 dark:border-white/5 flex items-center justify-between">
                  <h2 className="section-title">Daily Purchases</h2>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                    {(data.data || []).length} entries
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead><tr><th>Date</th><th className="text-right">Amount</th><th className="text-right">Tax</th><th className="text-right">Count</th></tr></thead>
                    <tbody>
                      {(data.data || []).map(r => (
                        <tr key={r._id}>
                          <td className="font-mono text-xs font-semibold">{r._id}</td>
                          <td className="text-right font-semibold text-gray-900 dark:text-white"><Amount value={r.total_amount} /></td>
                          <td className="text-right text-gray-500 dark:text-gray-400"><Amount value={r.total_tax} /></td>
                          <td className="text-right">
                            <span className="badge-blue text-[10px] px-2 py-0.5">{r.count}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* GST Summary */}
          {tab === 'gst' && (
            <div className="space-y-5">
              <div className="grid lg:grid-cols-3 gap-4">
                {/* Output Tax */}
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="section-title">Output Tax</h3>
                    <span className="badge-green text-[10px] px-2 py-0.5">Sales</span>
                  </div>
                  {[['Taxable', data.sales_gst?.taxable], ['CGST', data.sales_gst?.cgst], ['SGST', data.sales_gst?.sgst], ['IGST', data.sales_gst?.igst], ['Total Tax', data.sales_gst?.total_tax]].map(([l, v]) => (
                    <div key={l} className="flex justify-between py-2 border-b border-gray-100 dark:border-white/5 text-sm last:border-0 last:font-bold">
                      <span className="text-gray-500 dark:text-gray-400">{l}</span>
                      <Amount value={v || 0} className={l === 'Total Tax' ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-gray-900 dark:text-white font-medium'} />
                    </div>
                  ))}
                </div>
                {/* Input Tax */}
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="section-title">Input Tax</h3>
                    <span className="badge-red text-[10px] px-2 py-0.5">Purchases</span>
                  </div>
                  {[['Taxable', data.purchase_gst?.taxable], ['CGST', data.purchase_gst?.cgst], ['SGST', data.purchase_gst?.sgst], ['IGST', data.purchase_gst?.igst], ['Total Tax', data.purchase_gst?.total_tax]].map(([l, v]) => (
                    <div key={l} className="flex justify-between py-2 border-b border-gray-100 dark:border-white/5 text-sm last:border-0 last:font-bold">
                      <span className="text-gray-500 dark:text-gray-400">{l}</span>
                      <Amount value={v || 0} className={l === 'Total Tax' ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-gray-900 dark:text-white font-medium'} />
                    </div>
                  ))}
                </div>
                {/* Net Liability */}
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="section-title">Net GST Liability</h3>
                    <span className="badge-blue text-[10px] px-2 py-0.5">Payable</span>
                  </div>
                  {[['CGST Payable', data.net_gst_liability?.cgst], ['SGST Payable', data.net_gst_liability?.sgst], ['IGST Payable', data.net_gst_liability?.igst]].map(([l, v]) => (
                    <div key={l} className="flex justify-between py-2 border-b border-gray-100 dark:border-white/5 text-sm last:border-0">
                      <span className="text-gray-500 dark:text-gray-400">{l}</span>
                      <Amount value={v || 0} className="font-semibold text-gray-900 dark:text-white" />
                    </div>
                  ))}
                  <div className="flex justify-between pt-3 font-bold text-base border-t border-gray-200/40 dark:border-white/10 mt-1">
                    <span className="text-gray-900 dark:text-white">Total Payable</span>
                    <Amount value={(data.net_gst_liability?.cgst || 0) + (data.net_gst_liability?.sgst || 0) + (data.net_gst_liability?.igst || 0)}
                      className="text-[#0071e3] dark:text-[#0a84ff] font-bold" />
                  </div>
                </div>
              </div>
              {/* HSN Wise */}
              {data.hsn_wise?.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="p-4 sm:p-5 border-b border-gray-100/80 dark:border-white/5 flex items-center justify-between">
                    <h2 className="section-title">HSN-wise Summary</h2>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                      {data.hsn_wise.length} HSN categories
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="table">
                      <thead><tr><th>HSN Code</th><th className="text-right">Taxable</th><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">IGST</th><th className="text-right">Qty</th></tr></thead>
                      <tbody>
                        {data.hsn_wise.map(r => (
                          <tr key={r._id}>
                            <td className="font-mono font-semibold text-gray-900 dark:text-white">{r._id || 'N/A'}</td>
                            <td className="text-right font-medium"><Amount value={r.taxable} /></td>
                            <td className="text-right text-gray-500 dark:text-gray-400"><Amount value={r.cgst} /></td>
                            <td className="text-right text-gray-500 dark:text-gray-400"><Amount value={r.sgst} /></td>
                            <td className="text-right text-gray-500 dark:text-gray-400"><Amount value={r.igst} /></td>
                            <td className="text-right font-medium">{r.quantity?.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Profit & Loss */}
          {tab === 'profit-loss' && (
            <div className="grid lg:grid-cols-2 gap-5">
              <div className="card p-5">
                <h2 className="section-title mb-4">Profit & Loss Summary</h2>
                <div className="space-y-3">
                  {[
                    ['Revenue (incl. tax)', data.revenue, 'green'],
                    ['Less: Sales Tax', data.sales_tax, 'red'],
                    ['Net Revenue', data.net_revenue, 'blue'],
                    ['Less: Cost of Goods', data.cogs, 'red'],
                    ['Gross Profit', data.gross_profit, data.gross_profit >= 0 ? 'green' : 'red'],
                  ].map(([l, v, c]) => (
                    <div key={l} className={`flex justify-between py-2 border-b border-gray-100 dark:border-white/5 ${['Net Revenue', 'Gross Profit'].includes(l) ? 'font-bold text-base' : 'text-sm'}`}>
                      <span className="text-gray-600 dark:text-gray-400">{l}</span>
                      <Amount value={v || 0} className={c === 'green' ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : c === 'red' ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-[#0071e3] dark:text-[#0a84ff] font-semibold'} />
                    </div>
                  ))}
                  <div className="pt-3 flex items-center justify-between bg-black/[0.02] dark:bg-white/[0.04] p-3 rounded-xl border border-black/[0.04] dark:border-white/[0.06]">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Gross Margin</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Profit ratio on net revenue</p>
                    </div>
                    <span className={`text-2xl font-bold ${data.gross_margin_percent >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {data.gross_margin_percent?.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
              <div className="card p-5 flex flex-col items-center justify-center">
                <h3 className="section-title mb-2 text-center">Cost vs Profit Ratio</h3>
                <PieChart width={280} height={260}>
                  <Pie data={[{ name: 'COGS', value: data.cogs || 0 }, { name: 'Gross Profit', value: Math.max(0, data.gross_profit || 0) }]}
                    cx={140} cy={130} outerRadius={90} innerRadius={50} paddingAngle={4} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    <Cell fill="#ff453a" />
                    <Cell fill="#34c759" />
                  </Pie>
                  <Tooltip formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
                </PieChart>
              </div>
            </div>
          )}

          {/* Stock Report */}
          {tab === 'stock' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <SummaryCard label="Total Items"   value={data.total_items} color="blue" icon={Package} />
                <SummaryCard label="Stock Value"   value={<Amount value={data.total_value} />} color="green" icon={TrendingUp} />
              </div>
              <div className="card overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-gray-100/80 dark:border-white/5 flex items-center justify-between">
                  <h2 className="section-title">Stock Status</h2>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                    {(data.products || []).length} products
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead><tr><th>Product</th><th>Category</th><th>Unit</th>
                      <th className="text-right">Stock</th><th className="text-right">Purchase ₹</th><th className="text-right">Value</th></tr></thead>
                    <tbody>
                      {(data.products || []).map(p => (
                        <tr key={p.id}>
                          <td className="font-medium text-gray-900 dark:text-white">{p.name}</td>
                          <td className="text-sm text-gray-500">{p.category_name || '—'}</td>
                          <td>{p.unit}</td>
                          <td className="text-right font-semibold">
                            <span className={p.current_stock <= 0 ? 'badge-red text-[11px]' : 'font-mono text-gray-900 dark:text-white'}>
                              {p.current_stock}
                            </span>
                          </td>
                          <td className="text-right"><Amount value={p.purchase_price} /></td>
                          <td className="text-right font-semibold text-gray-900 dark:text-white"><Amount value={p.stock_value || 0} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Outstanding */}
          {tab === 'outstanding' && (
            <div className="space-y-4">
              <div className="card p-4.5 sm:p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-rose-500/10 dark:bg-rose-400/15 border border-rose-500/20 dark:border-rose-400/25">
                    <Users size={18} className="text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Customer Receivables</span>
                    <p className="text-xs text-gray-400 mt-0.5">Accumulated pending balances across active parties</p>
                  </div>
                </div>
                <Amount value={data.total_outstanding} className="text-2xl font-bold text-rose-600 dark:text-rose-400" />
              </div>
              <div className="card overflow-hidden">
                <div className="p-4 sm:p-5 border-b border-gray-100/80 dark:border-white/5 flex items-center justify-between">
                  <h2 className="section-title">Customer Ledger Balances</h2>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                    {(data.parties || []).length} accounts
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead><tr><th>Customer</th><th>Mobile</th><th>GSTIN</th>
                      <th className="text-right">Balance</th><th className="text-right">Credit Limit</th></tr></thead>
                    <tbody>
                      {(data.parties || []).map(p => (
                        <tr key={p.id}>
                          <td className="font-medium text-gray-900 dark:text-white">{p.name}</td>
                          <td className="text-sm text-gray-500">{p.mobile || '—'}</td>
                          <td className="font-mono text-xs text-gray-400">{p.gstin || '—'}</td>
                          <td className="text-right text-rose-600 dark:text-rose-400 font-bold"><Amount value={p.current_balance} /></td>
                          <td className="text-right text-gray-500 dark:text-gray-400"><Amount value={p.credit_limit} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
