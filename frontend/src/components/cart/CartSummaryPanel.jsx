import { useEffect, useRef, useState } from 'react'
import { ShoppingCart, Save, Trash2, FileText, ChevronDown, IndianRupee } from 'lucide-react'
import { useCart, calcTotals } from './CartContext'
import toast from 'react-hot-toast'

const PAYMENT_MODES = ['cash', 'credit', 'upi', 'card', 'cheque', 'neft']

function AnimatedAmount({ value, className = '' }) {
  const [display, setDisplay] = useState(value)
  const rafRef = useRef()
  const prevRef = useRef(value)

  useEffect(() => {
    const start = prevRef.current
    const end = value
    const diff = end - start
    if (Math.abs(diff) < 0.01) { setDisplay(value); return }
    const duration = 300
    const startTime = performance.now()

    const animate = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setDisplay(start + diff * eased)
      if (progress < 1) rafRef.current = requestAnimationFrame(animate)
      else prevRef.current = end
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value])

  return (
    <span className={className}>
      ₹{display.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
    </span>
  )
}

export default function CartSummaryPanel({ onCheckout, onSaveDraft }) {
  const { activeCart, setDiscPct, setIsIgst, setNotes, setPayMode, clearActiveCart } = useCart()
  const { items, isIgst, discPct, payMode, notes, customer } = activeCart
  const totals = calcTotals(items, discPct, isIgst)
  const { totalTaxable, totalCgst, totalSgst, totalIgst, invDisc, grandTotal } = totals

  const handleClearCart = () => {
    if (!items.length) return
    if (window.confirm('Clear all items from cart?')) clearActiveCart()
  }

  return (
    <div className="flex flex-col h-full gap-3">

      {/* Tax Type Toggle */}
      <div className="card p-4">
        <p className="label mb-2.5">Tax Type</p>
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

      {/* Invoice Summary */}
      <div className="card p-4 space-y-2.5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Invoice Summary</h3>

        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Taxable</span>
          <AnimatedAmount value={totalTaxable} className="font-medium text-gray-700 dark:text-gray-200" />
        </div>

        {isIgst ? (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">IGST</span>
            <AnimatedAmount value={totalIgst} className="text-gray-700 dark:text-gray-200" />
          </div>
        ) : (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">CGST</span>
              <AnimatedAmount value={totalCgst} className="text-gray-700 dark:text-gray-200" />
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">SGST</span>
              <AnimatedAmount value={totalSgst} className="text-gray-700 dark:text-gray-200" />
            </div>
          </>
        )}

        {/* Invoice Discount */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Disc. %</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={discPct}
            onChange={e => setDiscPct(parseFloat(e.target.value) || 0)}
            className="input w-20 text-right py-1 px-2 text-sm h-7"
          />
        </div>
        {invDisc > 0 && (
          <div className="flex justify-between text-xs text-emerald-600">
            <span>Discount saved</span>
            <span>-₹{invDisc.toFixed(2)}</span>
          </div>
        )}

        <div className="border-t border-gray-200 dark:border-gray-700 pt-2.5 flex justify-between font-bold text-lg">
          <span className="text-gray-900 dark:text-white">Total</span>
          <AnimatedAmount value={grandTotal} className="text-indigo-600 dark:text-indigo-400 tabular-nums" />
        </div>

        <p className="text-[10px] text-gray-400">
          {items.length} item{items.length !== 1 ? 's' : ''} ·{' '}
          {items.reduce((s, i) => s + i.qty, 0)} units
        </p>
      </div>

      {/* Notes */}
      <div className="card p-3">
        <label className="label text-[10px] mb-1.5 block">Notes (optional)</label>
        <textarea
          className="input text-xs"
          rows={2}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add order notes…"
        />
      </div>

      {/* Actions */}
      <div className="space-y-2 mt-auto">
        {/* Save Draft */}
        <button
          onClick={onSaveDraft}
          className="btn-secondary w-full justify-center text-sm gap-2 whitespace-nowrap"
        >
          <Save size={14} />
          Save Draft
          <span className="text-[10px] opacity-60">(F8)</span>
        </button>

        {/* Checkout */}
        <button
          onClick={onCheckout}
          disabled={items.length === 0}
          className="btn-success w-full justify-center py-3.5 text-base font-bold gap-2 disabled:opacity-40 whitespace-nowrap"
        >
          <ShoppingCart size={18} />
          Checkout
          <span className="text-[11px] opacity-70">(F9)</span>
        </button>

        {/* Clear */}
        {items.length > 0 && (
          <button
            onClick={handleClearCart}
            className="w-full text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center gap-1 py-1"
          >
            <Trash2 size={11} />
            Clear cart
          </button>
        )}
      </div>
    </div>
  )
}
