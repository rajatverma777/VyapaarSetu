import { useState } from 'react'
import { CheckCircle, Printer, ShoppingBag, X, ArrowRight, User, Package } from 'lucide-react'
import { salesAPI } from '../../services/api'
import { useCart } from './CartContext'
import { calcTotals } from './CartContext'
import PaymentModal from './PaymentModal'
import toast from 'react-hot-toast'

export default function CheckoutModal({ onClose, onSuccess }) {
  const { activeCart, activeId, clearActiveCart } = useCart()
  const { customer, items, isIgst, discPct, notes } = activeCart
  const [step, setStep] = useState(1) // 1=review, 2=payment, 3=success
  const [payments, setPayments] = useState([])
  const [saving, setSaving] = useState(false)
  const [savedSale, setSavedSale] = useState(null)

  const totals = calcTotals(items, discPct, isIgst)
  const { grandTotal, totalTaxable, totalCgst, totalSgst, totalIgst, invDisc } = totals

  const totalPaid = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const balance = grandTotal - totalPaid

  const handlePaymentConfirm = (payRows, paid) => {
    setPayments(payRows)
    setStep(3)
  }

  const handleSubmit = async () => {
    if (!items.length) return
    setSaving(true)
    try {
      // Determine primary payment mode and paid amount
      const primaryPayment = payments[0] || { mode: 'cash', amount: grandTotal }
      const paidAmount = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)

      const payload = {
        customer_id:      customer?.id || null,
        customer_name:    customer?.name || 'Walk-in Customer',
        items: items.map(i => ({
          product_id:       i.product_id,
          product_name:     i.product_name,
          sku:              i.sku,
          barcode:          i.barcode,
          hsn_code:         i.hsn_code,
          unit:             i.unit,
          quantity:         i.qty,
          rate:             i.rate,
          discount_percent: i.discount_pct,
          gst_rate:         i.gst_rate,
          batch_no:         i.batch_no || undefined,
        })),
        discount_percent: discPct,
        is_igst:          isIgst,
        payment_mode:     primaryPayment.mode,
        paid_amount:      paidAmount,
        notes,
        sale_type:        'sale',
      }

      const { data } = await salesAPI.create(payload)
      setSavedSale(data)
      setStep(4) // success
      clearActiveCart()

      // Open PDF
      try {
        const blobUrl = await salesAPI.getPdfBlob(data.id)
        window.open(blobUrl, '_blank')
      } catch { /* PDF optional */ }

      toast.success(`Invoice ${data.invoice_number} created!`)
      onSuccess?.()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to create invoice')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={step < 4 ? onClose : undefined} />

      {step === 2 && (
        <PaymentModal
          grandTotal={grandTotal}
          initialPayments={payments}
          onConfirm={handlePaymentConfirm}
          onClose={() => setStep(1)}
        />
      )}

      {step !== 2 && (
        <div
          className="relative w-full max-w-lg rounded-2xl shadow-2xl border border-gray-200/50 dark:border-white/10 overflow-hidden animate-modal-in bg-white/95 dark:bg-[#161720]/95 text-gray-900 dark:text-gray-100 backdrop-blur-2xl"
        >
          {/* Step 1: Review */}
          {step === 1 && (
            <>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70 dark:border-white/10">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Review & Checkout</h3>
                <button onClick={onClose} className="btn-icon w-7 h-7 p-1 text-gray-400 dark:text-gray-500 hover:dark:text-gray-300"><X size={16} /></button>
              </div>
              <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
                {/* Customer */}
                <div className="flex items-center gap-3 bg-gray-50/80 dark:bg-white/5 rounded-xl p-3">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
                    <User size={14} className="text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{customer?.name || 'Walk-in Customer'}</p>
                    {customer?.mobile && <p className="text-xs text-gray-500 dark:text-gray-400">{customer.mobile}</p>}
                  </div>
                </div>

                {/* Items summary */}
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    {items.length} items
                  </p>
                  {items.slice(0, 5).map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-100 dark:border-white/5 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <Package size={12} className="text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{item.product_name}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">×{item.qty}</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white flex-shrink-0 ml-2">
                        ₹{(item.total || 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {items.length > 5 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 py-1">+{items.length - 5} more items…</p>
                  )}
                </div>

                {/* Totals */}
                <div className="bg-indigo-50/60 dark:bg-indigo-900/20 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300">
                    <span>Taxable</span>
                    <span className="font-medium">₹{totalTaxable.toFixed(2)}</span>
                  </div>
                  {isIgst
                    ? <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400"><span>IGST</span><span>₹{totalIgst.toFixed(2)}</span></div>
                    : <>
                        <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400"><span>CGST</span><span>₹{totalCgst.toFixed(2)}</span></div>
                        <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400"><span>SGST</span><span>₹{totalSgst.toFixed(2)}</span></div>
                      </>
                  }
                  {invDisc > 0 && (
                    <div className="flex justify-between text-sm text-emerald-600">
                      <span>Discount ({discPct}%)</span>
                      <span>-₹{invDisc.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-indigo-200/60 dark:border-indigo-500/20 pt-2 flex justify-between font-bold text-base">
                    <span>Grand Total</span>
                    <span className="text-indigo-700 dark:text-indigo-400">₹{grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <div className="px-5 pb-5 flex gap-3">
                <button onClick={onClose} className="btn-secondary text-sm justify-center">Back</button>
                <button onClick={() => setStep(2)} className="btn-primary text-sm flex-1 gap-2 justify-center">
                  Payment <ArrowRight size={14} />
                </button>
              </div>
            </>
          )}

          {/* Step 3: Final confirm */}
          {step === 3 && (
            <>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70 dark:border-white/10">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Confirm Invoice</h3>
                <button onClick={() => setStep(1)} className="btn-icon w-7 h-7 p-1 text-gray-400 dark:text-gray-500 hover:dark:text-gray-300"><X size={16} /></button>
              </div>
              <div className="p-5 space-y-4">
                {/* Payment summary */}
                <div className="space-y-2">
                  {payments.map((p, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400 capitalize">{p.mode}</span>
                      <span className="font-semibold dark:text-white">₹{parseFloat(p.amount).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-200 dark:border-white/10 pt-2 flex justify-between font-bold">
                    <span>Total Paid</span>
                    <span className="text-emerald-600 dark:text-emerald-400">₹{totalPaid.toFixed(2)}</span>
                  </div>
                  {Math.abs(balance) > 0.01 && (
                    <div className="flex justify-between text-sm">
                      <span className={balance > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'}>
                        {balance > 0 ? 'Balance Due' : 'Change'}
                      </span>
                      <span className={`font-semibold ${balance > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'}`}>
                        ₹{Math.abs(balance).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep(2)} className="btn-secondary text-sm justify-center">Change Payment</button>
                  <button
                    onClick={handleSubmit}
                    disabled={saving}
                    className="btn-success text-sm flex-1 gap-2 font-bold justify-center"
                  >
                    {saving ? (
                      <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving…</>
                    ) : (
                      <><Printer size={15} /> Generate Invoice</>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Step 4: Success */}
          {step === 4 && (
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={36} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Invoice Created!</h3>
              {savedSale?.invoice_number && (
                <p className="text-sm text-indigo-600 dark:text-indigo-400 font-semibold mb-1">{savedSale.invoice_number}</p>
              )}
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">PDF opened in a new tab</p>
              <button onClick={onClose} className="btn-primary w-full justify-center">
                <ShoppingBag size={15} /> New Sale
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
