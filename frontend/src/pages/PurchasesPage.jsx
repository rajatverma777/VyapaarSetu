import { useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Plus, ShoppingBag } from 'lucide-react'
import toast from 'react-hot-toast'
import { purchaseAPI } from '../services/api'
import { Pagination, LoadingScreen, TableSkeleton, EmptyState, StatusBadge, Amount, Spinner, DatePicker } from '../components/ui'
import { format } from 'date-fns'

export default function PurchasesPage() {
  const navigate = useNavigate()
  const [purchases, setPurchases] = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(true)
  const [fromDate, setFromDate]   = useState('')
  const [toDate, setToDate]       = useState('')
  const limit = 50

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await purchaseAPI.list({
        from_date: fromDate || undefined,
        to_date:   toDate   || undefined,
        page, limit
      })
      setPurchases(data.items)
      setTotal(data.total)
    } catch { toast.error('Failed to load') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [fromDate, toDate, page])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Purchases</h1>
        <button onClick={() => navigate('/purchases/new')} className="btn-primary">
          <Plus size={16} /> New Purchase
        </button>
      </div>

      <div className="card p-4 flex flex-wrap gap-3 relative z-30">
        <DatePicker className="w-36 flex-shrink-0" value={fromDate} onChange={v => { setFromDate(v); setPage(1) }} />
        <DatePicker className="w-36 flex-shrink-0" value={toDate} onChange={v => { setToDate(v); setPage(1) }} />
        <button onClick={() => { setFromDate(''); setToDate('') }} className="btn-secondary text-xs">Clear</button>
        <p className="ml-auto text-sm text-gray-500 self-center">{total} records</p>
      </div>

      <div className="relative">
        <div className="table-container relative overflow-hidden">
          {loading && purchases.length > 0 && (
            <div className="table-loading-bar-container">
              <div className="table-loading-bar" />
            </div>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>Invoice No.</th><th>Supp. Invoice</th><th>Date</th><th>Supplier</th>
                <th className="text-right">Amount</th><th className="text-right">Paid</th>
                <th className="text-right">Balance</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading && purchases.length === 0 ? (
                <tr><td colSpan={8} className="p-0"><TableSkeleton rows={8} cols={8} /></td></tr>
              ) : purchases.length === 0 ? (
                <tr><td colSpan={8}>
                  <EmptyState icon={ShoppingBag} title="No purchases found"
                    action={<button onClick={() => navigate('/purchases/new')} className="btn-primary">New Purchase</button>} />
                </td></tr>
              ) : purchases.map(p => (
                <tr key={p.id}>
                  <td className="font-mono text-xs font-semibold text-primary-600">{p.sys_invoice_number}</td>
                  <td className="text-sm text-gray-500">{p.invoice_number !== p.sys_invoice_number ? p.invoice_number : '—'}</td>
                  <td className="text-sm">{format(new Date(p.purchase_date), 'dd/MM/yy')}</td>
                  <td className="font-medium">{p.supplier_name}</td>
                  <td className="text-right"><Amount value={p.total_amount} /></td>
                  <td className="text-right text-green-600"><Amount value={p.paid_amount} /></td>
                  <td className="text-right">
                    <span className={p.balance_amount > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>
                      <Amount value={p.balance_amount} />
                    </span>
                  </td>
                  <td><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>
    </div>
  )
}
