import { useState, useEffect } from 'react'
import { flushSync } from 'react-dom'
import { Plus, Edit2, Trash2, Truck, BookOpen, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { supplierAPI } from '../services/api'
import {
  Modal, ConfirmDialog, Pagination, EmptyState,
  SearchInput, LoadingScreen, TableSkeleton, Amount, FormField, StatusBadge, Spinner
} from '../components/ui'
import { format } from 'date-fns'
import { INDIAN_STATES } from '../services/constants'

const EMPTY = {
  name: '', mobile: '', email: '', gstin: '',
  address: { street: '', city: '', state: '', pincode: '' },
  opening_balance: 0, is_active: true
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [editItem, setEditItem]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [saving, setSaving]       = useState(false)
  const [form, setForm]           = useState(EMPTY)
  const [ledgerModal, setLedgerModal] = useState(null)
  const [ledger, setLedger]           = useState(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const limit = 50

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await supplierAPI.list({ search: search || undefined, page, limit })
      setSuppliers(data.items)
      setTotal(data.total)
    } catch { toast.error('Failed to load suppliers') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [search, page])

  const openAdd  = () => { setForm(EMPTY); setEditItem(null); setShowForm(true) }
  const openEdit = (s) => {
    setForm({ name: s.name, mobile: s.mobile || '', email: s.email || '', gstin: s.gstin || '',
      address: s.address || { street: '', city: '', state: '', pincode: '' },
      opening_balance: 0, is_active: s.is_active })
    setEditItem(s)
    setShowForm(true)
  }

  const openLedger = async (s) => {
    setLedgerModal(s)
    setLedgerLoading(true)
    try {
      const { data } = await supplierAPI.ledger(s.id)
      setLedger(data)
    } catch { toast.error('Failed') }
    finally { setLedgerLoading(false) }
  }

  const setF    = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setAddr = (k, v) => setForm(f => ({ ...f, address: { ...f.address, [k]: v } }))

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Name required')
    setSaving(true)
    try {
      if (editItem) {
        await supplierAPI.update(editItem.id, form)
        toast.success('Supplier updated')
      } else {
        await supplierAPI.create(form)
        toast.success('Supplier created')
      }
      setShowForm(false)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    try { await supplierAPI.delete(id); toast.success('Deleted'); load() }
    catch { toast.error('Delete failed') }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Suppliers</h1>
        <button onClick={openAdd} className="btn-primary"><Plus size={16} /> Add Supplier</button>
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }}
          placeholder="Search name, mobile…" className="flex-1 min-w-[200px]" />
        <button onClick={load} className="btn-icon text-gray-500"><RefreshCw size={15} /></button>
        <p className="text-sm text-gray-500 self-center">{total} suppliers</p>
      </div>

      <div className="relative">
        <div className="table-container relative overflow-hidden">
          {loading && suppliers.length > 0 && (
            <div className="table-loading-bar-container">
              <div className="table-loading-bar" />
            </div>
          )}
          <table className="table">
            <thead>
              <tr>
                <th>Name</th><th>Mobile</th><th>GSTIN</th>
                <th className="text-right">Balance</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && suppliers.length === 0 ? (
                <tr><td colSpan={6} className="p-0"><TableSkeleton rows={8} cols={6} /></td></tr>
              ) : suppliers.length === 0 ? (
                <tr><td colSpan={6}>
                  <EmptyState icon={Truck} title="No suppliers"
                    action={<button onClick={openAdd} className="btn-primary">Add Supplier</button>} />
                </td></tr>
              ) : suppliers.map(s => (
                <tr key={s.id}>
                  <td className="font-medium">{s.name}</td>
                  <td className="text-sm text-gray-500">{s.mobile || '—'}</td>
                  <td className="font-mono text-xs">{s.gstin || '—'}</td>
                  <td className="text-right">
                    <span className={s.current_balance > 0 ? 'text-red-600 font-semibold' : ''}>
                      <Amount value={s.current_balance || 0} />
                    </span>
                  </td>
                  <td><StatusBadge status={s.is_active ? 'active' : 'inactive'} /></td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openLedger(s)} className="btn-icon text-purple-600"><BookOpen size={14} /></button>
                      <button onClick={() => openEdit(s)} className="btn-icon text-indigo-600 dark:text-indigo-400"><Edit2 size={14} /></button>
                      <button onClick={() => setDeleteTarget(s)} className="btn-icon text-red-500"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)}
        title={editItem ? 'Edit Supplier' : 'Add Supplier'} size="lg"
        footer={<>
          <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : (editItem ? 'Update' : 'Create')}
          </button>
        </>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <FormField label="Supplier Name" required>
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
          {!editItem && (
            <FormField label="Opening Balance ₹">
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
                className="select" 
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
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={!!ledgerModal} onClose={() => setLedgerModal(null)}
        title={`Ledger: ${ledgerModal?.name}`} size="2xl">
        {ledgerLoading ? <LoadingScreen /> : ledger && (
          <div className="space-y-4">
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-4 flex items-center justify-between">
              <span className="text-sm font-medium text-orange-700 dark:text-orange-400">Current Balance (Payable)</span>
              <Amount value={ledger.supplier?.current_balance || 0} className="text-lg font-bold text-orange-700" />
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Type</th><th>Reference</th>
                    <th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr>
                </thead>
                <tbody>
                  {ledger.entries?.map((e, i) => (
                    <tr key={i}>
                      <td className="text-sm">{e.date ? format(new Date(e.date), 'dd/MM/yy') : '—'}</td>
                      <td className="capitalize"><span className="badge-blue">{e.type}</span></td>
                      <td className="text-sm text-gray-500">{e.reference}</td>
                      <td className="text-right text-red-600">{e.debit > 0 ? <Amount value={e.debit} /> : '—'}</td>
                      <td className="text-right text-green-600">{e.credit > 0 ? <Amount value={e.credit} /> : '—'}</td>
                      <td className="text-right font-medium"><Amount value={e.balance} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget?.id)}
        title="Delete Supplier" message={`Delete "${deleteTarget?.name}"?`} danger />
    </div>
  )
}
