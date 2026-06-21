import { useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Plus, CreditCard, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { paymentAPI, customerAPI, supplierAPI } from '../services/api'
import { Modal, Pagination, EmptyState, LoadingScreen, TableSkeleton, Amount, FormField, Spinner, DatePicker, GlassSelect } from '../components/ui'
import { format } from 'date-fns'

export default function PaymentsPage() {
  const [payments, setPayments] = useState([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(1)
  const [loading, setLoading]   = useState(true)
  const [partyType, setPartyType] = useState('customer')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [form, setForm]         = useState({
    party_type: 'customer', party_id: '', amount: '', payment_mode: 'cash',
    reference_no: '', payment_date: new Date().toISOString().slice(0,10), notes: ''
  })
  const [partySearch, setPartySearch] = useState('')
  const [partyResults, setPartyResults] = useState([])
  const [selectedParty, setSelectedParty] = useState(null)
  const partyRef = useRef()

  const triggerSearchAllParties = async () => {
    try {
      const api = form.party_type === 'customer' ? customerAPI : supplierAPI
      const { data } = await api.list({ search: '', limit: 50 })
      setPartyResults(data.items)
    } catch { /**/ }
  }

  useEffect(() => {
    const h = (e) => { if (!partyRef.current?.contains(e.target)) setPartyResults([]) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const limit = 50

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await paymentAPI.list({ party_type: partyType || undefined, page, limit })
      setPayments(data.items)
      setTotal(data.total)
    } catch { toast.error('Failed to load') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [partyType, page])

  useEffect(() => {
    if (partySearch.length < 1) { setPartyResults([]); return }
    const t = setTimeout(async () => {
      const api = form.party_type === 'customer' ? customerAPI : supplierAPI
      const { data } = await api.list({ search: partySearch, limit: 8 })
      setPartyResults(data.items)
    }, 250)
    return () => clearTimeout(t)
  }, [partySearch, form.party_type])

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.party_id) return toast.error('Select a party')
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter valid amount')
    setSaving(true)
    try {
      await paymentAPI.create({ ...form, amount: parseFloat(form.amount) })
      toast.success('Payment recorded')
      setShowForm(false)
      setSelectedParty(null)
      setPartySearch('')
      setForm({ party_type: 'customer', party_id: '', amount: '', payment_mode: 'cash', reference_no: '', payment_date: new Date().toISOString().slice(0,10), notes: '' })
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Payments</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary"><Plus size={16}/> Record Payment</button>
      </div>

      <div className="card p-4 flex gap-3">
        <GlassSelect
          value={partyType}
          onChange={v => { setPartyType(v); setPage(1) }}
          options={[
            { value: '', label: 'All Party Types' },
            { value: 'customer', label: 'Customer' },
            { value: 'supplier', label: 'Supplier' }
          ]}
          placeholder="All Party Types"
          className="w-48"
        />
        <p className="text-sm text-gray-500 self-center">{total} records</p>
      </div>

      <div className="relative">
        <div className="table-container relative overflow-hidden">
          {loading && payments.length > 0 && (
            <div className="table-loading-bar-container">
              <div className="table-loading-bar" />
            </div>
          )}
          <table className="table">
            <thead>
              <tr><th>Date</th><th>Party</th><th>Type</th><th>Mode</th>
                <th className="text-right">Amount</th><th>Reference</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {loading && payments.length === 0 ? (
                <tr><td colSpan={7} className="p-0"><TableSkeleton rows={8} cols={7} /></td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan={7}>
                  <EmptyState icon={CreditCard} title="No payments recorded"
                    action={<button onClick={() => setShowForm(true)} className="btn-primary">Record Payment</button>} />
                </td></tr>
              ) : payments.map(p => (
                <tr key={p.id}>
                  <td className="text-sm">{p.payment_date ? format(new Date(p.payment_date), 'dd/MM/yy') : '—'}</td>
                  <td className="font-medium">{p.party_name}</td>
                  <td className="capitalize"><span className="badge-blue">{p.party_type}</span></td>
                  <td className="uppercase text-xs">{p.payment_mode}</td>
                  <td className="text-right font-semibold text-green-600"><Amount value={p.amount} /></td>
                  <td className="text-sm text-gray-500">{p.reference_no || '—'}</td>
                  <td className="text-sm text-gray-500 max-w-[120px] truncate">{p.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Record Payment" size="md"
        footer={<>
          <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-success">
            {saving ? 'Saving…' : 'Record'}
          </button>
        </>}
      >
        <div className="space-y-4">
          <FormField label="Party Type">
            <GlassSelect
              value={form.party_type}
              onChange={v => { setF('party_type', v); setSelectedParty(null); setF('party_id', '') }}
              options={[
                { value: 'customer', label: 'Customer (Receipt)' },
                { value: 'supplier', label: 'Supplier (Payment)' }
              ]}
              className="w-full"
            />
          </FormField>
          <FormField label={`Select ${form.party_type === 'customer' ? 'Customer' : 'Supplier'}`} required>
            {selectedParty ? (
              <div className="input flex justify-between items-center">
                <span>{selectedParty.name}</span>
                <button onClick={() => { setSelectedParty(null); setF('party_id', '') }} className="text-gray-400">✕</button>
              </div>
            ) : (
              <div className="relative" ref={partyRef}>
                <Search size={16} 
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-indigo-300/70 cursor-pointer hover:text-primary-600 dark:hover:text-indigo-400 transition-colors z-10" 
                        onClick={triggerSearchAllParties} 
                />
                <input className="input pl-9" value={partySearch} onChange={e => setPartySearch(e.target.value)} placeholder="Search…" />
                {partyResults.length > 0 && (
                  <div className="dropdown-glass">
                    {partyResults.map(p => (
                      <button key={p.id} onClick={() => { setSelectedParty(p); setF('party_id', p.id); setPartySearch(''); setPartyResults([]) }}
                        className="w-full px-4 py-2.5 text-left text-sm hover:bg-indigo-50/60 dark:hover:bg-white/5 transition-colors border-b border-gray-100 dark:border-white/5 last:border-0">
                        <span className="font-medium text-gray-900 dark:text-white">{p.name}</span>
                        {p.mobile && <span className="text-gray-500 dark:text-gray-400 ml-2">· {p.mobile}</span>}
                        {p.current_balance > 0 && <span className="text-red-500 ml-2 font-semibold">₹{p.current_balance?.toFixed(2)}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Amount ₹" required>
              <input type="number" min="0.01" step="0.01" className="input" value={form.amount} onChange={e => setF('amount', e.target.value)} />
            </FormField>
            <FormField label="Payment Mode">
              <GlassSelect
                value={form.payment_mode}
                onChange={v => setF('payment_mode', v)}
                options={['cash','upi','card','cheque','neft'].map(m => ({ value: m, label: m.toUpperCase() }))}
                className="w-full"
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Date">
              <DatePicker className="w-full" value={form.payment_date} onChange={(v) => setF('payment_date', v)} />
            </FormField>
            <FormField label="Reference No.">
              <input className="input" value={form.reference_no} onChange={e => setF('reference_no', e.target.value)} />
            </FormField>
          </div>
          <FormField label="Notes">
            <input className="input" value={form.notes} onChange={e => setF('notes', e.target.value)} />
          </FormField>
        </div>
      </Modal>
    </div>
  )
}
