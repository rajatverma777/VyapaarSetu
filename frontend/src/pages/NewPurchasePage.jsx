import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Trash2, Save, X, Truck, PackagePlus, Receipt, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { purchaseAPI, supplierAPI, productAPI, settingsAPI } from '../services/api'
import { Amount, SearchAutocomplete, DatePicker, GlassSelect } from '../components/ui'
import { INDIAN_STATES } from '../services/constants'

const PAYMENT_MODES = ['credit','cash','upi','card','cheque','neft']

function calcItem(item) {
  const gross   = item.rate * item.qty
  const disc    = gross * (item.discount_pct / 100)
  const taxable = gross - disc
  const half    = item.gst_rate / 2
  const cgst    = item.is_igst ? 0 : taxable * half / 100
  const sgst    = item.is_igst ? 0 : taxable * half / 100
  const igst    = item.is_igst ? taxable * item.gst_rate / 100 : 0
  return { ...item, taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst }
}

export default function NewPurchasePage() {
  const navigate = useNavigate()

  const [supplier, setSupplier]       = useState(() => {
    try {
      const saved = sessionStorage.getItem('pending_purchase_supplier')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [invoiceNo, setInvoiceNo]     = useState(() => sessionStorage.getItem('pending_purchase_invoiceNo') || '')
  const [purchaseDate, setPurchaseDate] = useState(() => sessionStorage.getItem('pending_purchase_purchaseDate') || new Date().toISOString().slice(0, 10))
  const [items, setItems]             = useState(() => {
    try {
      const saved = sessionStorage.getItem('pending_purchase_items')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [isIgst, setIsIgst]           = useState(() => sessionStorage.getItem('pending_purchase_isIgst') === 'true')
  const [payMode, setPayMode]         = useState(() => sessionStorage.getItem('pending_purchase_payMode') || 'credit')
  const [paidAmt, setPaidAmt]         = useState(() => sessionStorage.getItem('pending_purchase_paidAmt') || '0')
  const [saving, setSaving]           = useState(false)
  const [notes, setNotes]             = useState(() => sessionStorage.getItem('pending_purchase_notes') || '')
  const [company, setCompany]         = useState(null)

  useEffect(() => {
    const fetchCompany = async () => {
      try {
        const { data } = await settingsAPI.getCompany()
        setCompany(data)
      } catch (err) {
        console.error('Failed to load company settings:', err)
      }
    }
    fetchCompany()
  }, [])

  // Auto-fill isIgst based on supplier state vs company state
  useEffect(() => {
    if (supplier && company) {
      let supplierStateCode = ''
      if (supplier.gstin && supplier.gstin.length >= 2) {
        supplierStateCode = supplier.gstin.slice(0, 2)
      } else if (supplier.address?.state) {
        const matched = INDIAN_STATES.find(s => s.name === supplier.address.state)
        if (matched) supplierStateCode = matched.code
      }
      
      const companyStateCode = company.state_code || ''
      if (supplierStateCode && companyStateCode) {
        const isInterstate = supplierStateCode !== companyStateCode
        setIsIgst(isInterstate)
      }
    }
  }, [supplier, company])

  useEffect(() => {
    sessionStorage.setItem('pending_purchase_supplier', supplier ? JSON.stringify(supplier) : '')
  }, [supplier])

  useEffect(() => {
    sessionStorage.setItem('pending_purchase_invoiceNo', invoiceNo)
  }, [invoiceNo])

  useEffect(() => {
    sessionStorage.setItem('pending_purchase_purchaseDate', purchaseDate)
  }, [purchaseDate])

  useEffect(() => {
    sessionStorage.setItem('pending_purchase_items', JSON.stringify(items))
  }, [items])

  useEffect(() => {
    sessionStorage.setItem('pending_purchase_isIgst', isIgst.toString())
  }, [isIgst])

  useEffect(() => {
    sessionStorage.setItem('pending_purchase_payMode', payMode)
  }, [payMode])

  useEffect(() => {
    sessionStorage.setItem('pending_purchase_paidAmt', paidAmt)
  }, [paidAmt])

  useEffect(() => {
    sessionStorage.setItem('pending_purchase_notes', notes)
  }, [notes])

  const clearPendingForm = () => {
    sessionStorage.removeItem('pending_purchase_supplier')
    sessionStorage.removeItem('pending_purchase_invoiceNo')
    sessionStorage.removeItem('pending_purchase_purchaseDate')
    sessionStorage.removeItem('pending_purchase_items')
    sessionStorage.removeItem('pending_purchase_isIgst')
    sessionStorage.removeItem('pending_purchase_payMode')
    sessionStorage.removeItem('pending_purchase_paidAmt')
    sessionStorage.removeItem('pending_purchase_notes')
  }

  const handleCancel = () => {
    clearPendingForm()
    navigate('/purchases')
  }

  const addProduct = (product) => {
    setItems(prev => {
      const existing = prev.findIndex(i => i.product_id === product.id)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = calcItem({ ...updated[existing], qty: updated[existing].qty + 1 })
        return updated
      }
      return [...prev, calcItem({
        product_id: product.id, product_name: product.name,
        hsn_code: product.hsn_code, unit: product.unit || 'PCS',
        qty: 1, rate: product.purchase_price || 0,
        discount_pct: 0, gst_rate: product.gst_rate || 0, is_igst: isIgst,
        batch_no: 'DEFAULT', expiry: ''
      })]
    })
  }

  const updateItem = (idx, key, value) => {
    setItems(prev => {
      const updated = [...prev]
      const val = (key === 'batch_no' || key === 'expiry') ? value : (parseFloat(value) || 0)
      updated[idx] = calcItem({ ...updated[idx], [key]: val, is_igst: isIgst })
      return updated
    })
  }

  useEffect(() => {
    setItems(prev => prev.map(it => calcItem({ ...it, is_igst: isIgst })))
  }, [isIgst])

  const totalTaxable = items.reduce((s, i) => s + i.taxable, 0)
  const totalCgst    = items.reduce((s, i) => s + i.cgst, 0)
  const totalSgst    = items.reduce((s, i) => s + i.sgst, 0)
  const totalIgst    = items.reduce((s, i) => s + i.igst, 0)
  const grandTotal   = totalTaxable + totalCgst + totalSgst + totalIgst

  const handleSave = async () => {
    if (!supplier)       return toast.error('Select a supplier')
    if (!items.length)   return toast.error('Add at least one product')
    setSaving(true)
    try {
      const payload = {
        supplier_id: supplier.id,
        invoice_number: invoiceNo || undefined,
        purchase_date: purchaseDate ? new Date(purchaseDate).toISOString() : undefined,
        items: items.map(i => ({
          product_id: i.product_id, product_name: i.product_name,
          hsn_code: i.hsn_code, unit: i.unit,
          quantity: i.qty, rate: i.rate,
          discount_percent: i.discount_pct, gst_rate: i.gst_rate,
          batch_no: i.batch_no || 'DEFAULT',
          expiry: i.expiry ? new Date(i.expiry).toISOString() : undefined
        })),
        is_igst: isIgst,
        payment_mode: payMode,
        paid_amount: parseFloat(paidAmt) || 0,
        notes, purchase_type: 'purchase',
      }
      const { data } = await purchaseAPI.create(payload)
      toast.success(`Purchase ${data.invoice_number} created!`)
      clearPendingForm()
      navigate('/purchases')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      {/* Top Header & Breadcrumbs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
            <button 
              type="button" 
              onClick={() => navigate('/purchases')} 
              className="hover:text-[#0071e3] dark:hover:text-[#0a84ff] transition-colors flex items-center gap-1 cursor-pointer"
            >
              Purchases
            </button>
            <span>/</span>
            <span className="text-gray-800 dark:text-gray-200">New Purchase</span>
          </div>
          <h1 className="page-title text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            New Inward Purchase
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={handleCancel} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            <Save size={15} />{saving ? 'Saving…' : 'Save Purchase'}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="md:col-span-3 space-y-4">
          {/* Supplier + Invoice Details */}
          <div className="card p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 relative z-30">
            <div className="sm:col-span-2">
              <label className="label text-xs flex items-center gap-1.5">
                <Truck size={12} className="text-[#0071e3] dark:text-[#0a84ff]" />
                Supplier *
              </label>
              {supplier ? (
                <div className="flex items-center justify-between p-2.5 px-3 rounded-xl bg-[#0071e3]/8 dark:bg-[#0a84ff]/10 border border-[#0071e3]/20 dark:border-[#0a84ff]/25 backdrop-blur-md">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs bg-[#0071e3]/15 dark:bg-[#0a84ff]/20 text-[#0071e3] dark:text-[#0a84ff] flex-shrink-0">
                      {supplier.name ? supplier.name.charAt(0).toUpperCase() : 'S'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">{supplier.name}</span>
                        {supplier.gstin ? (
                          <span className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded bg-black/[0.04] dark:bg-white/[0.08] text-gray-600 dark:text-gray-300">
                            {supplier.gstin}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {supplier.mobile && <span>{supplier.mobile}</span>}
                        {supplier.address?.city && <span>· {supplier.address.city}</span>}
                        {supplier.address?.state && <span>, {supplier.address.state}</span>}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSupplier(null)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors ml-2 flex-shrink-0 cursor-pointer"
                    title="Change supplier"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <SearchAutocomplete
                  className="w-full"
                  placeholder="Search supplier by name or mobile…"
                  onSearch={async (query) => {
                    const { data } = await supplierAPI.list({ search: query, limit: 50 })
                    return data.items
                  }}
                  onSelect={(s) => setSupplier(s)}
                  itemTemplate={(s) => (
                    <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 border border-[#0071e3]/20 dark:border-[#0a84ff]/25 text-[#0071e3] dark:text-[#0a84ff] flex-shrink-0">
                          {s.name ? s.name.charAt(0).toUpperCase() : 'S'}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-gray-900 dark:text-white truncate">{s.name}</div>
                          <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                            {s.gstin ? <span className="font-mono">GST: {s.gstin}</span> : <span>Unregistered</span>}
                            {s.address?.city && <span>· {s.address.city}</span>}
                          </div>
                        </div>
                      </div>
                      {s.mobile && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono flex-shrink-0">
                          {s.mobile}
                        </span>
                      )}
                    </div>
                  )}
                />
              )}
            </div>
            <div>
              <label className="label text-xs">Invoice No.</label>
              <input className="input font-mono text-sm" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Supplier's bill no." />
            </div>
            <div>
              <label className="label text-xs">Purchase Date</label>
              <DatePicker className="w-full" value={purchaseDate} onChange={setPurchaseDate} />
            </div>
          </div>

          {/* Product Search */}
          <div className="card p-4 relative z-20">
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <PackagePlus size={13} className="text-[#0071e3] dark:text-[#0a84ff]" />
              Add Products
            </div>
            <SearchAutocomplete
              className="w-full"
              placeholder="Search product by name, brand or SKU to add to order…"
              onSearch={async (query) => {
                const { data } = await productAPI.search(query, 50)
                return data
              }}
              onSelect={(p) => addProduct(p)}
              itemTemplate={(p) => (
                <div className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 border border-[#0071e3]/20 dark:border-[#0a84ff]/25 text-[#0071e3] dark:text-[#0a84ff] flex-shrink-0">
                      {p.name ? p.name.charAt(0).toUpperCase() : 'P'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{p.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-xs text-gray-500 dark:text-gray-400">
                        {p.brand && (
                          <span className="px-1.5 py-0.2 rounded bg-black/[0.04] dark:bg-white/[0.06] text-gray-600 dark:text-gray-300 font-medium text-[11px]">
                            {p.brand}
                          </span>
                        )}
                        <span>{p.unit || 'PCS'}</span>
                        <span>·</span>
                        <span>GST {p.gst_rate}%</span>
                        {p.hsn_code && <span>· HSN {p.hsn_code}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-[#0071e3] dark:text-[#0a84ff]">₹{(p.purchase_price || 0).toFixed(2)}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Stock: <span className="font-medium text-gray-700 dark:text-gray-300">{p.current_stock ?? 0}</span>
                    </p>
                  </div>
                </div>
              )}
            />
          </div>

          {/* Items Table */}
          <div className="table-container relative overflow-hidden z-10">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Product</th>
                    <th>Batch No</th>
                    <th>Expiry</th>
                    <th>Unit</th>
                    <th className="w-24 text-center">Qty</th>
                    <th className="w-28 text-right">Rate ₹</th>
                    <th className="w-20 text-center">Disc%</th>
                    <th className="text-right">Taxable</th>
                    <th className="text-right">Tax</th>
                    <th className="text-right">Total</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 text-[#0071e3] dark:text-[#0a84ff] mb-3">
                            <PackagePlus size={22} />
                          </div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">No products added yet</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                            Search and select products in the search bar above to build this inward purchase order.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : items.map((item, idx) => (
                    <tr key={idx} className="animate-fade-in">
                      <td className="text-gray-400 text-xs font-mono">{idx + 1}</td>
                      <td>
                        <p className="font-semibold text-sm text-gray-900 dark:text-white">{item.product_name}</p>
                        {item.hsn_code && <p className="text-[11px] font-mono text-gray-400">HSN: {item.hsn_code}</p>}
                      </td>
                      <td>
                        <input
                          type="text"
                          value={item.batch_no || ''}
                          onChange={e => updateItem(idx, 'batch_no', e.target.value)}
                          placeholder="DEFAULT"
                          className="input w-24 p-1.5 text-xs text-center font-mono"
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          value={item.expiry || ''}
                          onChange={e => updateItem(idx, 'expiry', e.target.value)}
                          className="input w-32 p-1.5 text-xs font-mono"
                        />
                      </td>
                      <td className="text-xs font-medium text-gray-600 dark:text-gray-300">{item.unit}</td>
                      <td>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.qty}
                          onChange={e => updateItem(idx, 'qty', e.target.value)}
                          className="input w-20 text-center p-1.5 text-sm font-semibold"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate}
                          onChange={e => updateItem(idx, 'rate', e.target.value)}
                          className="input w-24 p-1.5 text-sm text-right font-semibold"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={item.discount_pct}
                          onChange={e => updateItem(idx, 'discount_pct', e.target.value)}
                          className="input w-16 p-1.5 text-xs text-center"
                        />
                      </td>
                      <td className="text-right text-sm font-medium">₹{item.taxable.toFixed(2)}</td>
                      <td className="text-right text-xs text-gray-500 dark:text-gray-400">
                        {isIgst ? `₹${item.igst.toFixed(2)}` : `₹${(item.cgst + item.sgst).toFixed(2)}`}
                      </td>
                      <td className="text-right font-bold text-gray-900 dark:text-white">₹{item.total.toFixed(2)}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setItems(p => p.filter((_, i) => i !== idx))}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Remove item"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT: Summary & Actions */}
        <div className="space-y-4">
          {/* Tax Type */}
          <div className="card p-4 space-y-2.5">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tax Type</h3>
            <div className="tax-toggle-track">
              <div
                className="tax-toggle-pill"
                style={{ transform: isIgst ? 'translateX(100%)' : 'translateX(0%)' }}
              />
              <button
                type="button"
                onClick={() => setIsIgst(false)}
                className={`tax-toggle-btn ${!isIgst ? 'tax-toggle-active' : ''}`}
              >
                CGST + SGST
              </button>
              <button
                type="button"
                onClick={() => setIsIgst(true)}
                className={`tax-toggle-btn ${isIgst ? 'tax-toggle-active' : ''}`}
              >
                IGST
              </button>
            </div>
          </div>

          {/* Summary */}
          <div className="card p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center justify-between">
              <span>Order Summary</span>
              <Receipt size={13} className="text-[#0071e3] dark:text-[#0a84ff]" />
            </h3>
            <div className="space-y-2 text-sm">
              {[
                ['Taxable Value', totalTaxable],
                ...(isIgst ? [['IGST', totalIgst]] : [['CGST', totalCgst], ['SGST', totalSgst]]),
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between items-center text-gray-600 dark:text-gray-400">
                  <span>{l}</span>
                  <Amount value={v} />
                </div>
              ))}
            </div>
            <div className="border-t border-black/[0.06] dark:border-white/[0.08] pt-3 flex justify-between items-baseline">
              <span className="font-semibold text-base text-gray-900 dark:text-white">Grand Total</span>
              <Amount value={grandTotal} className="text-[#0071e3] dark:text-[#0a84ff] text-xl font-bold" />
            </div>
          </div>

          {/* Payment */}
          <div className="card p-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Payment Details</h3>
            <div>
              <label className="label text-xs">Payment Mode</label>
              <GlassSelect
                value={payMode}
                onChange={setPayMode}
                options={PAYMENT_MODES.map(m => ({ value: m, label: m.toUpperCase() }))}
                placeholder="Select Payment Mode"
                className="w-full"
              />
            </div>
            <div>
              <label className="label text-xs">Paid Amount (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input font-semibold"
                value={paidAmt}
                onChange={e => setPaidAmt(e.target.value)}
              />
            </div>
            {(() => {
              const balance = grandTotal - (parseFloat(paidAmt) || 0)
              const isSettled = balance <= 0
              return (
                <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                  isSettled 
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-[#34c759] dark:text-[#30d158]' 
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                }`}>
                  <span>{isSettled ? 'Paid in Full' : 'Pending Balance'}</span>
                  <Amount value={Math.max(0, balance)} />
                </div>
              )
            })()}
          </div>

          {/* Notes */}
          <div className="card p-4 space-y-2">
            <label className="label text-xs">Notes & Terms</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Add optional purchase notes..."
            />
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary w-full justify-center py-3 font-semibold shadow-lg shadow-blue-500/20 cursor-pointer"
            >
              <Save size={16} />{saving ? 'Saving Purchase…' : 'Save Purchase'}
            </button>
            <button
              onClick={handleCancel}
              className="btn-secondary w-full justify-center py-2.5 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

