import { useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { Plus, Edit2, Trash2, Users, BookOpen, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { customerAPI } from '../services/api'
import {
  Modal, ConfirmDialog, Pagination, EmptyState,
  SearchInput, LoadingScreen, TableSkeleton, Amount, FormField, StatusBadge, Spinner
} from '../components/ui'
import { format } from 'date-fns'

const INDIAN_STATES = [
  { name: "Jammu & Kashmir", code: "01" },
  { name: "Himachal Pradesh", code: "02" },
  { name: "Punjab", code: "03" },
  { name: "Chandigarh", code: "04" },
  { name: "Uttarakhand", code: "05" },
  { name: "Haryana", code: "06" },
  { name: "Delhi", code: "07" },
  { name: "Rajasthan", code: "08" },
  { name: "Uttar Pradesh", code: "09" },
  { name: "Bihar", code: "10" },
  { name: "Sikkim", code: "11" },
  { name: "Arunachal Pradesh", code: "12" },
  { name: "Nagaland", code: "13" },
  { name: "Manipur", code: "14" },
  { name: "Mizoram", code: "15" },
  { name: "Tripura", code: "16" },
  { name: "Meghalaya", code: "17" },
  { name: "Assam", code: "18" },
  { name: "West Bengal", code: "19" },
  { name: "Jharkhand", code: "20" },
  { name: "Odisha", code: "21" },
  { name: "Chhattisgarh", code: "22" },
  { name: "Madhya Pradesh", code: "23" },
  { name: "Gujarat", code: "24" },
  { name: "Daman & Diu", code: "26" },
  { name: "Dadra & Nagar Haveli", code: "26" },
  { name: "Maharashtra", code: "27" },
  { name: "Andhra Pradesh", code: "37" },
  { name: "Karnataka", code: "29" },
  { name: "Goa", code: "30" },
  { name: "Lakshadweep", code: "31" },
  { name: "Kerala", code: "32" },
  { name: "Tamil Nadu", code: "33" },
  { name: "Puducherry", code: "34" },
  { name: "Andaman & Nicobar Islands", code: "35" },
  { name: "Telangana", code: "36" },
  { name: "Ladakh", code: "38" }
]

const EMPTY = {
  name: '', mobile: '', email: '', gstin: '',
  address: { street: '', city: '', state: '', pincode: '' },
  credit_limit: 0, opening_balance: 0, price_level: 'retail', is_active: true
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)

  const [showForm, setShowForm]         = useState(false)
  const [editItem, setEditItem]         = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [saving, setSaving]             = useState(false)
  const [form, setForm]                 = useState(EMPTY)

  const [ledgerModal, setLedgerModal]   = useState(null)
  const [ledger, setLedger]             = useState(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)

  const limit = 50

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await customerAPI.list({ search: search || undefined, page, limit })
      setCustomers(data.items)
      setTotal(data.total)
    } catch { toast.error('Failed to load customers') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [search, page])

  const openAdd = () => { setForm(EMPTY); setEditItem(null); setShowForm(true) }
  const openEdit = (c) => {
    setForm({
      name: c.name, mobile: c.mobile || '', email: c.email || '',
      gstin: c.gstin || '',
      address: c.address || { street: '', city: '', state: '', pincode: '' },
      credit_limit: c.credit_limit || 0, opening_balance: 0,
      price_level: c.price_level || 'retail', is_active: c.is_active
    })
    setEditItem(c)
    setShowForm(true)
  }

  const openLedger = async (c) => {
    setLedgerModal(c)
    setLedgerLoading(true)
    try {
      const { data } = await customerAPI.ledger(c.id)
      setLedger(data)
    } catch { toast.error('Failed to load ledger') }
    finally { setLedgerLoading(false) }
  }

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setAddr = (k, v) => setForm(f => ({ ...f, address: { ...f.address, [k]: v } }))

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Customer name required')
    setSaving(true)
    try {
      if (editItem) {
        await customerAPI.update(editItem.id, form)
        toast.success('Customer updated')
      } else {
        await customerAPI.create(form)
        toast.success('Customer created')
      }
      setShowForm(false)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    try {
      await customerAPI.delete(id)
      toast.success('Customer deleted')
      load()
    } catch { toast.error('Delete failed') }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Customers</h1>
        <button onClick={openAdd} className="btn-primary"><Plus size={16} /> Add Customer</button>
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }}
          placeholder="Search name, mobile, GSTIN…" className="flex-1 min-w-[200px]" />
        <button onClick={load} className="btn-icon text-gray-500"><RefreshCw size={15} /></button>
        <p className="text-sm text-gray-500 self-center">{total} customers</p>
      </div>

      <div className="relative">
        <div className="table-container relative overflow-hidden">
          {loading && customers.length > 0 && (
            <div className="table-loading-bar-container">
              <div className="table-loading-bar" />
            </div>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Mobile</th>
                <th>GSTIN</th>
                <th>Price Level</th>
                <th className="text-right">Credit Limit</th>
                <th className="text-right">Balance</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && customers.length === 0 ? (
                <tr><td colSpan={8} className="p-0"><TableSkeleton rows={8} cols={8} /></td></tr>
              ) : customers.length === 0 ? (
                <tr><td colSpan={8}>
                  <EmptyState icon={Users} title="No customers found"
                    action={<button onClick={openAdd} className="btn-primary">Add Customer</button>}
                  />
                </td></tr>
              ) : customers.map(c => (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}</td>
                  <td className="text-sm text-gray-600 dark:text-gray-400">{c.mobile || '—'}</td>
                  <td className="font-mono text-xs">{c.gstin || '—'}</td>
                  <td className="capitalize">{c.price_level}</td>
                  <td className="text-right"><Amount value={c.credit_limit} /></td>
                  <td className="text-right">
                    <span className={c.current_balance > 0 ? 'text-red-600 font-semibold' : ''}>
                      <Amount value={c.current_balance || 0} />
                    </span>
                  </td>
                  <td><StatusBadge status={c.is_active ? 'active' : 'inactive'} /></td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openLedger(c)} className="btn-icon text-purple-600" title="Ledger"><BookOpen size={14} /></button>
                      <button onClick={() => openEdit(c)} className="btn-icon text-indigo-600 dark:text-indigo-400"><Edit2 size={14} /></button>
                      <button onClick={() => setDeleteTarget(c)} className="btn-icon text-red-500"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>

      {/* Add/Edit Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)}
        title={editItem ? 'Edit Customer' : 'Add Customer'} size="lg"
        footer={<>
          <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : (editItem ? 'Update' : 'Create')}
          </button>
        </>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <FormField label="Customer Name" required>
              <input className="input" value={form.name} onChange={e => setF('name', e.target.value)} />
            </FormField>
          </div>
          <FormField label="Mobile">
            <input className="input" value={form.mobile} onChange={e => setF('mobile', e.target.value)} />
          </FormField>
          <FormField label="Email">
            <input type="email" className="input" value={form.email} onChange={e => setF('email', e.target.value)} />
          </FormField>
          <FormField label="GSTIN">
            <input 
              className="input font-mono" 
              value={form.gstin} 
              onChange={e => {
                const val = e.target.value.toUpperCase()
                const stateCode = val.slice(0, 2)
                const matchedState = INDIAN_STATES.find(s => s.code === stateCode)
                setForm(prev => ({
                  ...prev,
                  gstin: val,
                  address: {
                    ...(prev.address || {}),
                    state: matchedState ? matchedState.name : (prev.address?.state || '')
                  }
                }))
              }} 
              placeholder="22AAAAA0000A1Z5" 
            />
          </FormField>
          <FormField label="Price Level">
            <select className="select" value={form.price_level} onChange={e => setF('price_level', e.target.value)}>
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
              <option value="distributor">Distributor</option>
            </select>
          </FormField>
          <FormField label="Credit Limit ₹">
            <input type="number" className="input" value={form.credit_limit} onChange={e => setF('credit_limit', parseFloat(e.target.value) || 0)} min="0" />
          </FormField>
          {!editItem && (
            <FormField label="Opening Balance ₹" hint="Positive = receivable, Negative = payable">
              <input type="number" className="input" value={form.opening_balance} onChange={e => setF('opening_balance', parseFloat(e.target.value) || 0)} />
            </FormField>
          )}
          <div className="sm:col-span-2">
            <p className="label mb-2">Address</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <input className="input" placeholder="Street" value={form.address?.street || ''} onChange={e => setAddr('street', e.target.value)} />
              </div>
              <input className="input" placeholder="City" value={form.address?.city || ''} onChange={e => setAddr('city', e.target.value)} />
              <select 
                className="select py-[8.5px] text-xs font-semibold" 
                value={form.address?.state || ''} 
                onChange={e => {
                  const stateName = e.target.value
                  const matched = INDIAN_STATES.find(s => s.name === stateName)
                  setForm(prev => {
                    let updatedGstin = prev.gstin || ''
                    if (matched && (!prev.gstin || /^\d{2}$/.test(prev.gstin.slice(0, 2)) || prev.gstin.length < 2)) {
                      updatedGstin = matched.code + updatedGstin.slice(2)
                    }
                    return {
                      ...prev,
                      gstin: updatedGstin,
                      address: {
                        ...(prev.address || {}),
                        state: stateName
                      }
                    }
                  })
                }}
              >
                <option value="">Select State</option>
                {INDIAN_STATES.map(s => (
                  <option key={s.code + '-' + s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
              <input className="input" placeholder="Pincode" value={form.address?.pincode || ''} onChange={e => setAddr('pincode', e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setF('is_active', e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
          </label>
        </div>
      </Modal>

      {/* Ledger Modal */}
      <Modal open={!!ledgerModal} onClose={() => setLedgerModal(null)}
        title={`Ledger: ${ledgerModal?.name}`} size="2xl"
      >
        {ledgerLoading ? <LoadingScreen /> : ledger && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="card p-4 text-center">
                <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold uppercase tracking-wider text-[10px]">Current Balance</p>
                <Amount value={ledger.customer?.current_balance || 0} className="text-lg font-black text-indigo-700 dark:text-indigo-350 mt-1 block" />
              </div>
              <div className="card p-4 text-center">
                <p className="text-xs text-green-600 dark:text-green-400 font-semibold uppercase tracking-wider text-[10px]">Credit Limit</p>
                <Amount value={ledger.customer?.credit_limit || 0} className="text-lg font-black text-green-700 dark:text-green-350 mt-1 block" />
              </div>
              <div className="card p-4 text-center">
                <p className="text-xs text-orange-600 dark:text-orange-400 font-semibold uppercase tracking-wider text-[10px]">Price Level</p>
                <p className="text-lg font-black text-orange-700 dark:text-orange-350 capitalize mt-1">{ledger.customer?.price_level}</p>
              </div>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Reference</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Credit</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.entries?.map((e, i) => (
                    <tr key={i}>
                      <td className="text-sm">{e.date ? format(new Date(e.date), 'dd/MM/yy') : '—'}</td>
                      <td className="capitalize"><span className="badge-blue">{e.type}</span></td>
                      <td className="text-sm text-gray-600 dark:text-gray-400">{e.reference}</td>
                      <td className="text-right text-red-600">{e.debit > 0 ? <Amount value={e.debit} /> : '—'}</td>
                      <td className="text-right text-green-600">{e.credit > 0 ? <Amount value={e.credit} /> : '—'}</td>
                      <td className="text-right font-medium"><Amount value={e.balance} /></td>
                    </tr>
                  ))}
                  {!ledger.entries?.length && (
                    <tr><td colSpan={6} className="text-center py-8 text-gray-400">No ledger entries</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget?.id)}
        title="Delete Customer" message={`Delete "${deleteTarget?.name}"?`} danger
      />
    </div>
  )
}
