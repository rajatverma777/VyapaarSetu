import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Trash2, Printer, Save, User, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { salesAPI, customerAPI, productAPI, settingsAPI } from '../services/api'
import { Amount, SearchAutocomplete, GlassSelect } from '../components/ui'
import { INDIAN_STATES } from '../services/constants'

const PAYMENT_MODES = ['cash','credit','upi','card','cheque','neft']

function calcItem(item) {
  const gross = item.rate * item.qty
  const disc  = gross * (item.discount_pct / 100)
  const taxable = gross - disc
  const half = item.gst_rate / 2
  const cgst = item.is_igst ? 0 : taxable * half / 100
  const sgst = item.is_igst ? 0 : taxable * half / 100
  const igst = item.is_igst ? taxable * item.gst_rate / 100 : 0
  return { ...item, taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst }
}

export default function NewSalePage() {
  const navigate = useNavigate()
  const [customer, setCustomer]   = useState(() => {
    try {
      const saved = sessionStorage.getItem('pending_sale_customer')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [items, setItems]         = useState(() => {
    try {
      const saved = sessionStorage.getItem('pending_sale_items')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [isIgst, setIsIgst]       = useState(() => sessionStorage.getItem('pending_sale_isIgst') === 'true')
  const [discPct, setDiscPct]     = useState(() => parseFloat(sessionStorage.getItem('pending_sale_discPct')) || 0)
  const [payMode, setPayMode]     = useState(() => sessionStorage.getItem('pending_sale_payMode') || 'cash')
  const [paidAmt, setPaidAmt]     = useState(() => sessionStorage.getItem('pending_sale_paidAmt') || '')
  const [saving, setSaving]       = useState(false)
  const [notes, setNotes]         = useState(() => sessionStorage.getItem('pending_sale_notes') || '')
  const [company, setCompany]     = useState(null)

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

  // Auto-fill isIgst based on customer state vs company state
  useEffect(() => {
    if (customer && company) {
      let customerStateCode = ''
      if (customer.gstin && customer.gstin.length >= 2) {
        customerStateCode = customer.gstin.slice(0, 2)
      } else if (customer.address?.state) {
        const matched = INDIAN_STATES.find(s => s.name === customer.address.state)
        if (matched) customerStateCode = matched.code
      }
      
      const companyStateCode = company.state_code || ''
      if (customerStateCode && companyStateCode) {
        const isInterstate = customerStateCode !== companyStateCode
        setIsIgst(isInterstate)
      }
    }
  }, [customer, company])

  useEffect(() => {
    sessionStorage.setItem('pending_sale_customer', customer ? JSON.stringify(customer) : '')
  }, [customer])

  useEffect(() => {
    sessionStorage.setItem('pending_sale_items', JSON.stringify(items))
  }, [items])

  useEffect(() => {
    sessionStorage.setItem('pending_sale_isIgst', isIgst.toString())
  }, [isIgst])

  useEffect(() => {
    sessionStorage.setItem('pending_sale_discPct', discPct.toString())
  }, [discPct])

  useEffect(() => {
    sessionStorage.setItem('pending_sale_payMode', payMode)
  }, [payMode])

  useEffect(() => {
    sessionStorage.setItem('pending_sale_paidAmt', paidAmt)
  }, [paidAmt])

  useEffect(() => {
    sessionStorage.setItem('pending_sale_notes', notes)
  }, [notes])

  const clearPendingForm = () => {
    sessionStorage.removeItem('pending_sale_customer')
    sessionStorage.removeItem('pending_sale_items')
    sessionStorage.removeItem('pending_sale_isIgst')
    sessionStorage.removeItem('pending_sale_discPct')
    sessionStorage.removeItem('pending_sale_payMode')
    sessionStorage.removeItem('pending_sale_paidAmt')
    sessionStorage.removeItem('pending_sale_notes')
  }

  const handleCancel = () => {
    clearPendingForm()
    navigate('/sales')
  }

  const custSearchRef = useRef()
  const prodSearchRef = useRef()
  const paidAmtRef = useRef()

  // Keyboard shortcuts: 
  // F1 = focus customer search
  // F2 = focus product search
  // F8 = focus paid amount
  // F9 = cancel / close
  // Ctrl+Enter / Cmd+Enter = save & print
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'F1') {
        e.preventDefault()
        custSearchRef.current?.focus()
      } else if (e.key === 'F2') {
        e.preventDefault()
        prodSearchRef.current?.focus()
      } else if (e.key === 'F8') {
        e.preventDefault()
        paidAmtRef.current?.focus()
      } else if (e.key === 'F9') {
        e.preventDefault()
        handleCancel()
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleSave()
      }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [items, customer, isIgst, discPct, payMode, paidAmt, notes])

  const addProduct = (product) => {
    const stock = product.current_stock ?? 0
    if (stock <= 0) {
      toast.error('Product is out of stock!')
      return
    }
    setItems(prev => {
      const existing = prev.findIndex(i => i.product_id === product.id)
      if (existing >= 0) {
        const updated = [...prev]
        const maxStock = updated[existing].max_stock ?? 999999
        if (updated[existing].qty >= maxStock) {
          toast.error('Cannot add more. Stock limit reached!')
          return prev
        }
        const newQty = Math.min(updated[existing].qty + 1, maxStock)
        updated[existing] = calcItem({ ...updated[existing], qty: newQty })
        return updated
      }
      return [...prev, calcItem({
        product_id:   product.id,
        product_name: product.name,
        sku:          product.sku,
        barcode:      product.barcode,
        hsn_code:     product.hsn_code,
        unit:         product.unit || 'PCS',
        qty:          1,
        rate:         product.selling_price,
        discount_pct: 0,
        gst_rate:     product.gst_rate || 0,
        max_stock:    product.current_stock,
        is_igst:      isIgst,
      })]
    })
    prodSearchRef.current?.focus()
  }

  const updateItem = (idx, key, value) => {
    setItems(prev => {
      const updated = [...prev]
      const item = { ...updated[idx], [key]: parseFloat(value) || 0, is_igst: isIgst }
      if (key === 'qty') {
        const maxStock = item.max_stock ?? 999999
        const requested = parseFloat(value) || 0
        if (requested > maxStock) {
          toast.error(`Stock limit: only ${maxStock} available`)
        }
        item.qty = Math.max(0, Math.min(requested, maxStock))
      }
      updated[idx] = calcItem(item)
      return updated
    })
  }

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx))

  // Recalculate when IGST changes
  useEffect(() => {
    setItems(prev => prev.map(it => calcItem({ ...it, is_igst: isIgst })))
  }, [isIgst])

  // Totals
  const subtotal    = items.reduce((s, i) => s + i.taxable + (i.taxable * (i.discount_pct / 100 === 0 ? 0 : 0)), 0)
  const totalTaxable = items.reduce((s, i) => s + i.taxable, 0)
  const totalCgst   = items.reduce((s, i) => s + i.cgst, 0)
  const totalSgst   = items.reduce((s, i) => s + i.sgst, 0)
  const totalIgst   = items.reduce((s, i) => s + i.igst, 0)
  const invDisc     = totalTaxable * discPct / 100
  const grandTotal  = totalTaxable - invDisc + totalCgst + totalSgst + totalIgst
  const balance     = grandTotal - (parseFloat(paidAmt) || 0)

  const handleSave = async () => {
    if (!items.length) return toast.error('Add at least one product')
    setSaving(true)
    try {
      const payload = {
        customer_id:   customer?.id || null,
        customer_name: customer?.name || 'Walk-in Customer',
        items: items.map(i => ({
          product_id:      i.product_id,
          product_name:    i.product_name,
          sku:             i.sku,
          barcode:         i.barcode,
          hsn_code:        i.hsn_code,
          unit:            i.unit,
          quantity:        i.qty,
          rate:            i.rate,
          discount_percent:i.discount_pct,
          gst_rate:        i.gst_rate,
        })),
        discount_percent: discPct,
        is_igst: isIgst,
        payment_mode: payMode,
        paid_amount: parseFloat(paidAmt) || (payMode === 'cash' ? grandTotal : 0),
        notes,
        sale_type: 'sale',
      }
      const { data } = await salesAPI.create(payload)
      toast.success(`Invoice ${data.invoice_number} created!`)

      // Open PDF (using authenticated blob method)
      try {
        const blobUrl = await salesAPI.getPdfBlob(data.id)
        window.open(blobUrl, '_blank')
      } catch (pdfErr) {
        console.error("PDF fetch error:", pdfErr)
        toast.error('Failed to open PDF invoice')
      }

      clearPendingForm()
      navigate('/sales')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="page-title">New Sale Invoice</h1>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 bg-white/20 dark:bg-black/10 px-3 py-1.5 rounded-xl border border-gray-200/40 dark:border-white/5 shadow-sm">
            <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 bg-gray-100/80 dark:bg-gray-800 rounded font-bold shadow-sm">F1</kbd> Customer</span>
            <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 bg-gray-100/80 dark:bg-gray-800 rounded font-bold shadow-sm">F2</kbd> Product</span>
            <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 bg-gray-100/80 dark:bg-gray-800 rounded font-bold shadow-sm">F8</kbd> Payment</span>
            <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 bg-gray-100/80 dark:bg-gray-800 rounded font-bold shadow-sm">F9</kbd> Cancel</span>
            <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 bg-gray-100/80 dark:bg-gray-800 rounded font-bold shadow-sm">Ctrl+Enter</kbd> Save</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleCancel} className="btn-secondary">Cancel <span className="text-[10px] text-gray-400 font-bold ml-1">(F9)</span></button>
          <button onClick={handleSave} disabled={saving || items.length === 0} className="btn-primary">
            <Save size={16} />
            <span>{saving ? 'Saving…' : 'Save & Print'}</span>
            <span className="text-[10px] text-indigo-200 font-bold ml-1">(Ctrl+↵)</span>
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        {/* LEFT: Items */}
        <div className="md:col-span-3 space-y-4">
          {/* Customer Selector */}
          <div className="card p-4 relative z-30">
            <div className="flex items-center gap-3">
              <User size={16} className="text-gray-400 flex-shrink-0" />
              {customer ? (
                <div className="flex-1 flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900 dark:text-white">{customer.name}</span>
                    {customer.mobile && <span className="text-sm text-gray-500 ml-2">{customer.mobile}</span>}
                    {customer.current_balance > 0 && (
                      <span className="ml-2 text-xs text-orange-600">Outstanding: ₹{customer.current_balance.toFixed(2)}</span>
                    )}
                  </div>
                  <button onClick={() => setCustomer(null)} className="btn-icon text-gray-400"><X size={15}/></button>
                </div>
              ) : (
                <SearchAutocomplete
                  inputRef={custSearchRef}
                  className="flex-1"
                  placeholder="Search customer (or leave as Walk-in)… (F1)"
                  onSearch={async (query) => {
                    const { data } = await customerAPI.list({ search: query, limit: 50 })
                    return data.items
                  }}
                  onSelect={(c) => setCustomer(c)}
                  itemTemplate={(c) => (
                    <button type="button" className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex justify-between">
                      <span className="font-medium text-gray-900 dark:text-white">{c.name}</span>
                      {c.mobile && <span className="text-gray-500 text-xs ml-2">{c.mobile}</span>}
                    </button>
                  )}
                />
              )}
            </div>
          </div>

          {/* Product Search */}
          <div className="card p-4 relative z-20">
            <SearchAutocomplete
              inputRef={prodSearchRef}
              className="w-full"
              placeholder="Search product by name, SKU, or scan barcode… (F2)"
              onSearch={async (query) => {
                const { data } = await productAPI.search(query, 50)
                return data
              }}
              onSelect={(p) => addProduct(p)}
              itemTemplate={(p) => (
                <button
                  type="button"
                  className="w-full px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between gap-4"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.brand ? `${p.brand} · ` : ''}{p.sku || p.barcode ? `${p.sku || p.barcode} · ` : ''}{p.unit} · GST {p.gst_rate}%</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-primary-600">₹{p.selling_price?.toFixed(2)}</p>
                    <p className={`text-xs ${p.current_stock <= 0 ? 'text-red-500' : 'text-gray-500'}`}>
                      Stock: {p.current_stock}
                    </p>
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
                    <th>#</th>
                    <th>Product</th>
                    <th>Unit</th>
                    <th className="w-24 text-center">Qty</th>
                    <th className="w-28 text-right">Rate ₹</th>
                    <th className="w-20 text-center">Disc%</th>
                    <th className="text-right">Taxable</th>
                    <th className="text-right">GST</th>
                    <th className="text-right">Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-10 text-sm text-gray-400">
                      Add products using the search above
                    </td></tr>
                  ) : items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="text-gray-400 text-xs">{idx + 1}</td>
                      <td>
                        <p className="font-medium text-sm">{item.product_name}</p>
                        <p className="text-xs text-gray-500">{item.hsn_code ? `HSN: ${item.hsn_code}` : item.sku || ''}</p>
                      </td>
                      <td className="text-sm">{item.unit}</td>
                      <td>
                        <input
                          type="number" min="0.01" step="0.01"
                          max={item.max_stock != null ? item.max_stock : undefined}
                          value={item.qty}
                          onChange={e => updateItem(idx, 'qty', e.target.value)}
                          className="input w-20 text-center p-1.5 text-sm"
                        />
                      </td>
                      <td>
                        <input
                          type="number" min="0" step="0.01"
                          value={item.rate}
                          onChange={e => updateItem(idx, 'rate', e.target.value)}
                          className="input w-24 p-1.5 text-sm text-right"
                        />
                      </td>
                      <td>
                        <input
                          type="number" min="0" max="100" step="0.1"
                          value={item.discount_pct}
                          onChange={e => updateItem(idx, 'discount_pct', e.target.value)}
                          className="input w-16 p-1.5 text-sm text-center"
                        />
                      </td>
                      <td className="text-right text-sm">₹{item.taxable.toFixed(2)}</td>
                      <td className="text-right text-xs text-gray-500">
                        {isIgst ? `₹${item.igst.toFixed(2)}` : `₹${item.cgst.toFixed(2)}+${item.sgst.toFixed(2)}`}
                      </td>
                      <td className="text-right font-semibold">₹{item.total.toFixed(2)}</td>
                      <td>
                        <button onClick={() => removeItem(idx)} className="btn-icon text-red-400 hover:text-red-600">
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
          {/* Tax toggle */}
          <div className="card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tax Type</h3>
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

          {/* Totals */}
          <div className="card p-4 space-y-2.5">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Invoice Summary</h3>
            {[
              ['Taxable Amount', totalTaxable],
              ...(isIgst ? [['IGST', totalIgst]] : [['CGST', totalCgst], ['SGST', totalSgst]]),
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">{l}</span>
                <Amount value={v} />
              </div>
            ))}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Discount (%)</span>
              <input
                type="number" min="0" max="100" step="0.1"
                value={discPct}
                onChange={e => setDiscPct(parseFloat(e.target.value) || 0)}
                className="input w-20 text-right p-1.5 text-sm h-7"
              />
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-bold text-lg">
              <span>Grand Total</span>
              <Amount value={grandTotal} className="text-primary-600" />
            </div>
          </div>

          {/* Payment */}
          <div className="card p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Payment</h3>
            <GlassSelect
              value={payMode}
              onChange={setPayMode}
              options={PAYMENT_MODES.map(m => ({ value: m, label: m.toUpperCase() }))}
              placeholder="Select Payment Mode"
              className="w-full"
            />
            <div>
              <label className="label text-xs">Paid Amount ₹</label>
              <input
                ref={paidAmtRef}
                type="number" min="0" step="0.01"
                value={paidAmt}
                onChange={e => setPaidAmt(e.target.value)}
                placeholder={`₹${grandTotal.toFixed(2)}`}
                className="input"
              />
            </div>
            <div className={`flex justify-between text-sm font-medium ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              <span>Balance</span>
              <Amount value={balance} />
            </div>
          </div>

          {/* Notes */}
          <div className="card p-4">
            <label className="label text-xs">Notes</label>
            <textarea className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes…" />
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={saving || items.length === 0}
            className="btn-primary w-full justify-center py-3 text-base"
          >
            <Save size={16} />
            {saving ? 'Saving…' : 'Save & Print'}
          </button>
          <button onClick={handleCancel} className="btn-secondary w-full justify-center">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
