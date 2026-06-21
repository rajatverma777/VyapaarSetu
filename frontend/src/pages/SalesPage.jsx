import { useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Printer, CreditCard, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { salesAPI } from '../services/api'
import { Pagination, LoadingScreen, TableSkeleton, EmptyState, SearchInput, StatusBadge, Amount, Modal, Spinner, DatePicker, GlassSelect } from '../components/ui'
import { format } from 'date-fns'

export default function SalesPage() {
  const navigate = useNavigate()
  const [sales, setSales]   = useState([])
  const [total, setTotal]   = useState(0)
  const [page, setPage]     = useState(1)
  const [loading, setLoading] = useState(true)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]     = useState('')
  const [status, setStatus]     = useState('')
  const [payModal, setPayModal] = useState(null)
  const [payAmt, setPayAmt]     = useState('')
  const [payMode, setPayMode]   = useState('cash')
  const limit = 50

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await salesAPI.list({ from_date: fromDate || undefined, to_date: toDate || undefined, status: status || undefined, page, limit })
      setSales(data.items)
      setTotal(data.total)
    } catch { toast.error('Failed to load sales') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [fromDate, toDate, status, page])

  const openPdf = async (id) => {
    try {
      const blobUrl = await salesAPI.getPdfBlob(id)
      const win = window.open(blobUrl, '_blank')
      if (win) {
        win.addEventListener('load', () => {
          setTimeout(() => { win.focus(); win.print() }, 400)
        })
      }
    } catch (e) {
      toast.error('Failed to load invoice PDF')
    }
  }

  const downloadPdf = async (id, invNo) => {
    try {
      const blobUrl = await salesAPI.getPdfBlob(id)
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `Invoice-${invNo}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
    } catch (e) {
      toast.error('Failed to download invoice PDF')
    }
  }

  const submitPayment = async () => {
    if (!payAmt || parseFloat(payAmt) <= 0) return toast.error('Enter valid amount')
    try {
      await salesAPI.payment(payModal.id, parseFloat(payAmt), payMode)
      toast.success('Payment recorded')
      setPayModal(null)
      load()
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed') }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Sales Invoices</h1>
        <button onClick={() => navigate('/sales/new')} className="btn-primary gap-2">
          <Plus size={16} /> New Sale
          <span className="text-[10px] opacity-70 font-normal ml-0.5">Smart Cart</span>
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3 relative z-30">
        <DatePicker className="w-36 flex-shrink-0" value={fromDate} onChange={v => { setFromDate(v); setPage(1) }} />
        <DatePicker className="w-36 flex-shrink-0" value={toDate} onChange={v => { setToDate(v); setPage(1) }} />
        <GlassSelect
          value={status}
          onChange={v => { setStatus(v); setPage(1) }}
          options={[
            { value: '', label: 'All Status' },
            { value: 'paid', label: 'Paid' },
            { value: 'partial', label: 'Partial' },
            { value: 'unpaid', label: 'Unpaid' }
          ]}
          placeholder="All Status"
          className="w-36"
        />
        <button onClick={() => { setFromDate(''); setToDate(''); setStatus('') }} className="btn-secondary text-xs">Clear</button>
        <p className="ml-auto text-sm text-gray-500 self-center">{total} invoices</p>
      </div>

      <div className="relative">
        <div className="table-container relative overflow-hidden">
          {loading && sales.length > 0 && (
            <div className="table-loading-bar-container">
              <div className="table-loading-bar" />
            </div>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Customer</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Balance</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && sales.length === 0 ? (
                <tr><td colSpan={9} className="p-0"><TableSkeleton rows={8} cols={7} /></td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={9}>
                  <EmptyState icon={FileText} title="No sales found"
                    action={<button onClick={() => navigate('/sales/new')} className="btn-primary">Create First Sale</button>}
                  />
                </td></tr>
              ) : sales.map(s => (
                <tr key={s.id}>
                  <td className="font-mono text-xs font-semibold text-primary-600">{s.invoice_number}</td>
                  <td className="text-sm">{format(new Date(s.sale_date), 'dd/MM/yy')}</td>
                  <td className="font-medium">{s.customer_name}</td>
                  <td className="text-right"><Amount value={s.total_amount} /></td>
                  <td className="text-right text-green-600"><Amount value={s.paid_amount} /></td>
                  <td className="text-right">
                    <span className={s.balance_amount > 0 ? 'text-red-600 font-semibold' : 'text-gray-400'}>
                      <Amount value={s.balance_amount} />
                    </span>
                  </td>
                  <td className="text-xs uppercase">{s.payment_mode}</td>
                  <td><StatusBadge status={s.status} /></td>
                  <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openPdf(s.id)} className="btn-icon text-indigo-600 dark:text-indigo-400 hover:text-indigo-800" title="Print Invoice">
                          <Printer size={14} />
                        </button>
                        <button onClick={() => downloadPdf(s.id, s.invoice_number)} className="btn-icon text-gray-500 hover:text-gray-700" title="Download PDF">
                          <Download size={14} />
                        </button>
                      {s.balance_amount > 0 && (
                        <button onClick={() => { setPayModal(s); setPayAmt(s.balance_amount.toFixed(2)) }} className="btn-icon text-green-600" title="Record Payment">
                          <CreditCard size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title="Record Payment" size="sm"
        footer={<>
          <button onClick={() => setPayModal(null)} className="btn-secondary">Cancel</button>
          <button onClick={submitPayment} className="btn-success">Record Payment</button>
        </>}
      >
        {payModal && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 space-y-1">
              <p className="text-sm"><b>Invoice:</b> {payModal.invoice_number}</p>
              <p className="text-sm"><b>Total:</b> ₹{payModal.total_amount?.toFixed(2)}</p>
              <p className="text-sm text-red-600"><b>Balance:</b> ₹{payModal.balance_amount?.toFixed(2)}</p>
            </div>
            <div>
              <label className="label">Amount ₹</label>
              <input type="number" className="input" value={payAmt} onChange={e => setPayAmt(e.target.value)} />
            </div>
            <div>
              <label className="label">Payment Mode</label>
              <select className="select" value={payMode} onChange={e => setPayMode(e.target.value)}>
                {['cash','upi','card','cheque','neft'].map(m => <option key={m}>{m.toUpperCase()}</option>)}
              </select>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
