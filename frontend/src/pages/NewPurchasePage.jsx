import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Trash2, Save, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { purchaseAPI, supplierAPI, productAPI } from '../services/api'
import { Amount, SearchAutocomplete, DatePicker, GlassSelect } from '../components/ui'

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
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="page-title">New Purchase</h1>
        <div className="flex gap-2">
          <button onClick={handleCancel} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            <Save size={16} />{saving ? 'Saving…' : 'Save Purchase'}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <div className="md:col-span-3 space-y-4">
          {/* Supplier + Invoice Details */}
          <div className="card p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 relative z-30">
            <div className="sm:col-span-2">
              <label className="label text-xs">Supplier *</label>
              {supplier ? (
                <div className="flex items-center justify-between input">
                  <span className="font-medium">{supplier.name}</span>
                  <button onClick={() => setSupplier(null)} className="text-gray-400 hover:text-gray-600"><X size={14}/></button>
                </div>
              ) : (
                <SearchAutocomplete
                  className="w-full"
                  placeholder="Search supplier…"
                  onSearch={async (query) => {
                    const { data } = await supplierAPI.list({ search: query, limit: 50 })
                    return data.items
                  }}
                  onSelect={(s) => setSupplier(s)}
                  itemTemplate={(s) => (
                    <button type="button" className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex justify-between">
                      <span className="font-medium text-gray-900 dark:text-white">{s.name}</span>
                      {s.mobile && <span className="text-gray-500 dark:text-gray-400 text-xs ml-2">{s.mobile}</span>}
                    </button>
                  )}
                />
              )}
            </div>
            <div>
              <label className="label text-xs">Invoice No.</label>
              <input className="input" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Supplier's invoice no." />
            </div>
            <div>
              <label className="label text-xs">Purchase Date</label>
              <DatePicker className="w-full" value={purchaseDate} onChange={setPurchaseDate} />
            </div>
          </div>

          {/* Product Search */}
          <div className="card p-4 relative z-20">
            <SearchAutocomplete
              className="w-full"
              placeholder="Search product to add…"
              onSearch={async (query) => {
                const { data } = await productAPI.search(query, 50)
                return data
              }}
              onSelect={(p) => addProduct(p)}
              itemTemplate={(p) => (
                <button type="button" className="w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{p.brand ? `${p.brand} · ` : ''}{p.unit} · GST {p.gst_rate}%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-primary-600">₹{p.purchase_price?.toFixed(2)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Stock: {p.current_stock}</p>
                  </div>
                </button>
              )}
            />
          </div>

          {/* Items Table */}
          <div className="card overflow-hidden relative z-10">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th><th>Product</th><th>Batch No</th><th>Expiry</th><th>Unit</th>
                    <th className="w-24 text-center">Qty</th><th className="w-28 text-right">Rate ₹</th>
                    <th className="w-20 text-center">Disc%</th><th className="text-right">Taxable</th>
                    <th className="text-right">Tax</th><th className="text-right">Total</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={12} className="text-center py-10 text-sm text-gray-400">Search and add products above</td></tr>
                  ) : items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="text-gray-400 text-xs">{idx+1}</td>
                      <td>
                        <p className="font-medium text-sm">{item.product_name}</p>
                        {item.hsn_code && <p className="text-xs text-gray-500">HSN: {item.hsn_code}</p>}
                      </td>
                      <td>
                        <input type="text" value={item.batch_no || ''}
                          onChange={e => updateItem(idx, 'batch_no', e.target.value)}
                          placeholder="DEFAULT"
                          className="input w-24 p-1.5 text-sm" />
                      </td>
                      <td>
                        <input type="date" value={item.expiry || ''}
                          onChange={e => updateItem(idx, 'expiry', e.target.value)}
                          className="input w-32 p-1.5 text-sm" />
                      </td>
                      <td className="text-sm">{item.unit}</td>
                      <td>
                        <input type="number" min="0.01" step="0.01" value={item.qty}
                          onChange={e => updateItem(idx, 'qty', e.target.value)}
                          className="input w-20 text-center p-1.5 text-sm" />
                      </td>
                      <td>
                        <input type="number" min="0" step="0.01" value={item.rate}
                          onChange={e => updateItem(idx, 'rate', e.target.value)}
                          className="input w-24 p-1.5 text-sm text-right" />
                      </td>
                      <td>
                        <input type="number" min="0" max="100" step="0.1" value={item.discount_pct}
                          onChange={e => updateItem(idx, 'discount_pct', e.target.value)}
                          className="input w-16 p-1.5 text-sm text-center" />
                      </td>
                      <td className="text-right text-sm">₹{item.taxable.toFixed(2)}</td>
                      <td className="text-right text-xs text-gray-500">
                        {isIgst ? `₹${item.igst.toFixed(2)}` : `₹${(item.cgst + item.sgst).toFixed(2)}`}
                      </td>
                      <td className="text-right font-semibold">₹{item.total.toFixed(2)}</td>
                      <td>
                        <button onClick={() => setItems(p => p.filter((_, i) => i !== idx))} className="btn-icon text-red-400">
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

        {/* RIGHT: Summary */}
        <div className="space-y-4">
          <div className="card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Tax Type</h3>
            <div className="tax-toggle-track">
              <div
                className="tax-toggle-pill"
                style={{ transform: isIgst ? 'translateX(100%)' : 'translateX(0%)' }}
              />
              <button
                onClick={() => setIsIgst(false)}
                className={`tax-toggle-btn ${!isIgst ? 'tax-toggle-active' : ''}`}
              >
                CGST + SGST
              </button>
              <button
                onClick={() => setIsIgst(true)}
                className={`tax-toggle-btn ${isIgst ? 'tax-toggle-active' : ''}`}
              >
                IGST
              </button>
            </div>
          </div>

          <div className="card p-4 space-y-2.5">
            <h3 className="text-sm font-semibold">Summary</h3>
            {[
              ['Taxable', totalTaxable],
              ...(isIgst ? [['IGST', totalIgst]] : [['CGST', totalCgst], ['SGST', totalSgst]]),
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">{l}</span>
                <Amount value={v} />
              </div>
            ))}
            <div className="border-t pt-2 flex justify-between font-bold text-lg">
              <span>Total</span>
              <Amount value={grandTotal} className="text-primary-600" />
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Payment</h3>
            <GlassSelect
              value={payMode}
              onChange={setPayMode}
              options={PAYMENT_MODES.map(m => ({ value: m, label: m.toUpperCase() }))}
              placeholder="Select Payment Mode"
              className="w-full"
            />
            <div>
              <label className="label text-xs">Paid ₹</label>
              <input type="number" min="0" className="input" value={paidAmt} onChange={e => setPaidAmt(e.target.value)} />
            </div>
            <div className="flex justify-between text-sm font-medium text-orange-600">
              <span>Balance</span>
              <Amount value={grandTotal - (parseFloat(paidAmt) || 0)} />
            </div>
          </div>

          <div className="card p-4">
            <label className="label text-xs">Notes</label>
            <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <button onClick={handleSave} disabled={saving}
            className="btn-primary w-full justify-center py-3">
            <Save size={16} />{saving ? 'Saving…' : 'Save Purchase'}
          </button>
          <button onClick={handleCancel} className="btn-secondary w-full justify-center">Cancel</button>
        </div>
      </div>
    </div>
  )
}
