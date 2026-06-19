import { useState, useEffect } from 'react'
import { BarChart3, TrendingUp, ShoppingBag, IndianRupee, Package, Users } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { reportAPI } from '../services/api'
import { LoadingScreen, Amount, DatePicker } from '../components/ui'
import toast from 'react-hot-toast'

const TABS = ['sales', 'purchases', 'gst', 'profit-loss', 'stock', 'outstanding']
const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

function SummaryCard({ label, value, color = 'blue', sub }) {
  const clr = { blue: 'text-indigo-600 dark:text-indigo-400', green: 'text-green-600', red: 'text-red-600', orange: 'text-orange-600' }
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${clr[color] || clr.blue}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
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
        <div className="card p-4 flex flex-wrap gap-3">
          <div>
            <label className="label text-xs">From Date</label>
            <DatePicker className="w-36 flex-shrink-0" value={fromDate} onChange={setFromDate} />
          </div>
          <div>
            <label className="label text-xs">To Date</label>
            <DatePicker className="w-36 flex-shrink-0" value={toDate} onChange={setToDate} />
          </div>
          <div className="flex items-end">
            <button onClick={() => { setFromDate(''); setToDate('') }} className="btn-secondary text-xs">Clear</button>
          </div>
        </div>
      )}

      {loading ? <LoadingScreen /> : data && (
        <>
          {/* Sales Report */}
          {tab === 'sales' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <SummaryCard label="Total Sales"    value={<Amount value={data.summary?.total_amount} />} color="blue" />
                <SummaryCard label="Taxable Amount" value={<Amount value={data.summary?.taxable_amount} />} color="green" />
                <SummaryCard label="Total Tax"      value={<Amount value={data.summary?.total_tax} />} color="orange" />
                <SummaryCard label="Outstanding"    value={<Amount value={data.summary?.outstanding} />} color="red" sub={`${data.summary?.count} invoices`} />
              </div>
              <div className="card p-5">
                <h2 className="section-title mb-4">Daily Sales</h2>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.data || []} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="glassBar-light" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity={0.7} />
                        <stop offset="100%" stopColor="#ffffff" stopOpacity={0.3} />
                      </linearGradient>
                      <linearGradient id="glassBar-dark" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#ffffff" stopOpacity={0.06} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" />
                    <XAxis dataKey="_id" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => [`₹${Number(v).toLocaleString('en-IN')}`, 'Amount']} />
                    <Bar dataKey="total_amount" className="recharts-glass-bar" radius={[12, 12, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <div className="card-header"><h2 className="section-title">Daily Breakdown</h2></div>
                <div className="table-container">
                  <table className="table">
                    <thead><tr><th>Date</th><th className="text-right">Amount</th><th className="text-right">Tax</th><th className="text-right">Invoices</th></tr></thead>
                    <tbody>
                      {(data.data || []).map(r => (
                        <tr key={r._id}>
                          <td>{r._id}</td>
                          <td className="text-right font-medium"><Amount value={r.total_amount} /></td>
                          <td className="text-right"><Amount value={r.total_tax} /></td>
                          <td className="text-right">{r.count}</td>
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
                <SummaryCard label="Total Purchases" value={<Amount value={data.summary?.total_amount} />} color="blue" />
                <SummaryCard label="Taxable"          value={<Amount value={data.summary?.taxable_amount || 0} />} color="green" />
                <SummaryCard label="Total Tax"        value={<Amount value={data.summary?.total_tax} />} color="orange" />
                <SummaryCard label="Outstanding"      value={<Amount value={data.summary?.outstanding} />} color="red" />
              </div>
              <div className="card">
                <div className="card-header"><h2 className="section-title">Daily Purchases</h2></div>
                <div className="table-container">
                  <table className="table">
                    <thead><tr><th>Date</th><th className="text-right">Amount</th><th className="text-right">Tax</th><th className="text-right">Count</th></tr></thead>
                    <tbody>
                      {(data.data || []).map(r => (
                        <tr key={r._id}>
                          <td>{r._id}</td>
                          <td className="text-right"><Amount value={r.total_amount} /></td>
                          <td className="text-right"><Amount value={r.total_tax} /></td>
                          <td className="text-right">{r.count}</td>
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
                  <h3 className="section-title text-green-600 mb-3">Output Tax (Sales)</h3>
                  {[['Taxable', data.sales_gst?.taxable], ['CGST', data.sales_gst?.cgst], ['SGST', data.sales_gst?.sgst], ['IGST', data.sales_gst?.igst], ['Total Tax', data.sales_gst?.total_tax]].map(([l, v]) => (
                    <div key={l} className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 text-sm last:border-0 last:font-bold">
                      <span className="text-gray-600 dark:text-gray-400">{l}</span>
                      <Amount value={v || 0} />
                    </div>
                  ))}
                </div>
                {/* Input Tax */}
                <div className="card p-5">
                  <h3 className="section-title text-red-600 mb-3">Input Tax (Purchases)</h3>
                  {[['Taxable', data.purchase_gst?.taxable], ['CGST', data.purchase_gst?.cgst], ['SGST', data.purchase_gst?.sgst], ['IGST', data.purchase_gst?.igst], ['Total Tax', data.purchase_gst?.total_tax]].map(([l, v]) => (
                    <div key={l} className="flex justify-between py-1.5 border-b border-gray-100 dark:border-gray-700 text-sm last:border-0 last:font-bold">
                      <span className="text-gray-600 dark:text-gray-400">{l}</span>
                      <Amount value={v || 0} />
                    </div>
                  ))}
                </div>
                {/* Net Liability */}
                <div className="card p-5">
                  <h3 className="section-title text-indigo-600 dark:text-indigo-400 mb-3">Net GST Liability</h3>
                  {[['CGST Payable', data.net_gst_liability?.cgst], ['SGST Payable', data.net_gst_liability?.sgst], ['IGST Payable', data.net_gst_liability?.igst]].map(([l, v]) => (
                    <div key={l} className="flex justify-between py-2 border-b border-gray-200/20 dark:border-white/5 text-sm last:border-0">
                      <span className="text-gray-600 dark:text-gray-400">{l}</span>
                      <Amount value={v || 0} className="font-semibold text-gray-900 dark:text-white" />
                    </div>
                  ))}
                  <div className="flex justify-between pt-3 font-bold text-base">
                    <span className="text-gray-900 dark:text-white">Total Payable</span>
                    <Amount value={(data.net_gst_liability?.cgst || 0) + (data.net_gst_liability?.sgst || 0) + (data.net_gst_liability?.igst || 0)}
                      className="text-gray-900 dark:text-white" />
                  </div>
                </div>
              </div>
              {/* HSN Wise */}
              {data.hsn_wise?.length > 0 && (
                <div className="card">
                  <div className="card-header"><h2 className="section-title">HSN-wise Summary</h2></div>
                  <div className="table-container">
                    <table className="table">
                      <thead><tr><th>HSN Code</th><th className="text-right">Taxable</th><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">IGST</th><th className="text-right">Qty</th></tr></thead>
                      <tbody>
                        {data.hsn_wise.map(r => (
                          <tr key={r._id}>
                            <td className="font-mono font-semibold">{r._id || 'N/A'}</td>
                            <td className="text-right"><Amount value={r.taxable} /></td>
                            <td className="text-right"><Amount value={r.cgst} /></td>
                            <td className="text-right"><Amount value={r.sgst} /></td>
                            <td className="text-right"><Amount value={r.igst} /></td>
                            <td className="text-right">{r.quantity?.toFixed(2)}</td>
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
                    <div key={l} className={`flex justify-between py-2 border-b border-gray-100 dark:border-gray-700 ${['Net Revenue', 'Gross Profit'].includes(l) ? 'font-bold text-base' : 'text-sm'}`}>
                      <span className="text-gray-700 dark:text-gray-300">{l}</span>
                      <Amount value={v || 0} className={c === 'green' ? 'text-green-600' : c === 'red' ? 'text-red-600' : 'text-indigo-600 dark:text-indigo-400'} />
                    </div>
                  ))}
                  <div className="pt-2 text-center">
                    <p className="text-xs text-gray-500">Gross Margin</p>
                    <p className={`text-2xl font-bold ${data.gross_margin_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {data.gross_margin_percent?.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
              <div className="card p-5 flex items-center justify-center">
                <PieChart width={280} height={280}>
                  <Pie data={[{ name: 'COGS', value: data.cogs || 0 }, { name: 'Gross Profit', value: Math.max(0, data.gross_profit || 0) }]}
                    cx={140} cy={140} outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    <Cell fill="#ef4444" />
                    <Cell fill="#10b981" />
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
                <SummaryCard label="Total Items"   value={data.total_items} color="blue" />
                <SummaryCard label="Stock Value"   value={<Amount value={data.total_value} />} color="green" />
              </div>
              <div className="card">
                <div className="table-container">
                  <table className="table">
                    <thead><tr><th>Product</th><th>Category</th><th>Unit</th>
                      <th className="text-right">Stock</th><th className="text-right">Purchase ₹</th><th className="text-right">Value</th></tr></thead>
                    <tbody>
                      {(data.products || []).map(p => (
                        <tr key={p.id}>
                          <td className="font-medium">{p.name}</td>
                          <td className="text-sm text-gray-500">{p.category_name || '—'}</td>
                          <td>{p.unit}</td>
                          <td className={`text-right font-semibold ${p.current_stock <= 0 ? 'text-red-600' : ''}`}>{p.current_stock}</td>
                          <td className="text-right"><Amount value={p.purchase_price} /></td>
                          <td className="text-right"><Amount value={p.stock_value || 0} /></td>
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
              <div className="card p-4 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Total Outstanding</span>
                <Amount value={data.total_outstanding} className="text-xl font-bold text-red-600" />
              </div>
              <div className="card">
                <div className="table-container">
                  <table className="table">
                    <thead><tr><th>Customer</th><th>Mobile</th><th>GSTIN</th>
                      <th className="text-right">Balance</th><th className="text-right">Credit Limit</th></tr></thead>
                    <tbody>
                      {(data.parties || []).map(p => (
                        <tr key={p.id}>
                          <td className="font-medium">{p.name}</td>
                          <td className="text-sm text-gray-500">{p.mobile || '—'}</td>
                          <td className="font-mono text-xs">{p.gstin || '—'}</td>
                          <td className="text-right text-red-600 font-semibold"><Amount value={p.current_balance} /></td>
                          <td className="text-right text-gray-500"><Amount value={p.credit_limit} /></td>
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
