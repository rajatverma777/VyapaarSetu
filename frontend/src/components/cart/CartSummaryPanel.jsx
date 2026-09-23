import { useEffect, useRef, useState } from 'react'
import {
  ShoppingCart, Save, Trash2, Plus, Minus, Tag, CreditCard,
  Banknote, QrCode, ArrowRight, Zap, Check, ChevronDown, ChevronUp,
  User, Clock, AlertCircle, Percent, Sparkles, FileText, X,
  ShoppingBag, ShieldCheck, Wallet
} from 'lucide-react'
import { useCart, calcTotals } from './CartContext'
import toast from 'react-hot-toast'

// ── Payment modes config ───────────────────────────────────────────────────
const PAYMENT_OPTIONS = [
  { id: 'cash',   label: 'Cash',   icon: Banknote },
  { id: 'upi',    label: 'UPI',    icon: QrCode },
  { id: 'credit', label: 'Credit', icon: Clock },
  { id: 'card',   label: 'Card',   icon: CreditCard },
]

const QUICK_DISCOUNTS = [0, 5, 10, 15]
const QUICK_NOTES = ['Urgent Delivery', 'Self Pickup', 'COD', 'Pack & Hold']

function AnimatedAmount({ value, className = '' }) {
  const [display, setDisplay] = useState(value)
  const rafRef = useRef()
  const prevRef = useRef(value)

  useEffect(() => {
    const start = prevRef.current
    const end = value
    const diff = end - start
    if (Math.abs(diff) < 0.01) { setDisplay(value); return }
    const duration = 250
    const startTime = performance.now()

    const animate = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
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
  const {
    activeId,
    activeCart,
    setDiscPct,
    setIsIgst,
    setNotes,
    setPayMode,
    updateItem,
    removeItem,
    clearActiveCart,
    CART_IDS,
    setActiveId,
    getCartItemCount,
  } = useCart()

  const { items, isIgst, discPct, payMode, notes, customer } = activeCart
  const totals = calcTotals(items, discPct, isIgst)
  const { totalTaxable, totalCgst, totalSgst, totalIgst, invDisc, grandTotal } = totals

  const totalUnits = items.reduce((s, i) => s + (i.qty || 0), 0)
  const [showNotes, setShowNotes] = useState(false)

  const handleClearCart = () => {
    if (!items.length) return
    if (window.confirm(`Clear all items from Cart ${activeId}?`)) {
      clearActiveCart()
      toast.success(`Cart ${activeId} cleared`)
    }
  }

  const handleDecrease = (idx, currentQty) => {
    if (currentQty > 1) {
      updateItem(idx, 'qty', currentQty - 1)
    } else {
      removeItem(idx)
    }
    if ('vibrate' in navigator) navigator.vibrate(25)
  }

  const handleIncrease = (idx, currentQty, maxStock) => {
    if (maxStock != null && currentQty >= maxStock) {
      toast.error(`Stock limit: only ${maxStock} available`)
      return
    }
    updateItem(idx, 'qty', currentQty + 1)
    if ('vibrate' in navigator) navigator.vibrate(25)
  }

  const addQuickNote = (tag) => {
    if (!notes) {
      setNotes(tag)
    } else if (!notes.includes(tag)) {
      setNotes(`${notes}, ${tag}`)
    }
  }

  return (
    <div className="card h-full flex flex-col min-h-0 p-0 overflow-hidden border border-black/[0.08] dark:border-white/[0.10] shadow-2xl backdrop-blur-3xl">

      {/* ── TOP TERMINAL BAR ────────────────────────────────────────────── */}
      <div className="px-3.5 py-3 border-b border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] flex items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-xl bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 flex items-center justify-center text-[#0071e3] dark:text-[#0a84ff] border border-[#0071e3]/20 dark:border-[#0a84ff]/25 flex-shrink-0 shadow-xs">
            <ShoppingCart size={14} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-bold text-xs text-gray-900 dark:text-white tracking-tight">Order Terminal</h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#0071e3]/12 text-[#0071e3] dark:text-[#0a84ff] border border-[#0071e3]/20">
                Cart {activeId}
              </span>
            </div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
              {items.length} product{items.length !== 1 ? 's' : ''} · {totalUnits} unit{totalUnits !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={handleClearCart}
            title="Clear all items from this cart"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0 cursor-pointer"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* ── TAX TYPE + CUSTOMER STATUS SUB-BAR ───────────────────────────── */}
      <div className="px-3 py-2 border-b border-black/[0.04] dark:border-white/[0.06] bg-black/[0.01] dark:bg-white/[0.01] flex items-center justify-between gap-2 flex-shrink-0 text-xs">
        {/* Tax Mode Segmented Pills */}
        <div className="glass-tab-track flex-1 max-w-[190px]">
          <button
            type="button"
            onClick={() => setIsIgst(false)}
            className={`glass-tab-btn flex-1 py-1 text-[11px] ${!isIgst ? 'active' : ''}`}
          >
            {!isIgst && (
              <>
                <div className="glass-tab-active-pill" />
                <div className="glass-tab-active-shadow" />
              </>
            )}
            <span className="relative z-10 font-semibold">CGST+SGST</span>
          </button>
          <button
            type="button"
            onClick={() => setIsIgst(true)}
            className={`glass-tab-btn flex-1 py-1 text-[11px] ${isIgst ? 'active' : ''}`}
          >
            {isIgst && (
              <>
                <div className="glass-tab-active-pill" />
                <div className="glass-tab-active-shadow" />
              </>
            )}
            <span className="relative z-10 font-semibold">IGST</span>
          </button>
        </div>

        {/* Customer Balance Capsule */}
        {customer ? (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.04] dark:border-white/[0.08] text-[10px] font-medium text-gray-700 dark:text-gray-200 truncate max-w-[150px]">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <span className="truncate font-semibold">{customer.name}</span>
          </div>
        ) : (
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Walk-in Order</span>
        )}
      </div>

      {/* ── MIDDLE: LIVE CART ITEMS STREAM (OR ENGAGING EMPTY STATION) ─── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-2.5 space-y-2">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-6 px-3">
            <div className="w-14 h-14 rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] flex items-center justify-center mb-3 text-gray-400 dark:text-gray-500 shadow-inner">
              <ShoppingBag size={24} />
            </div>
            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-200 mb-0.5">Order Cart is Empty</h4>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 max-w-[220px] mb-4 leading-relaxed">
              Tap any item on the product catalog or press <kbd className="px-1 py-0.2 bg-black/[0.05] dark:bg-white/10 rounded font-mono text-[9px]">F2</kbd> to search products.
            </p>

            {/* Quick POS Shortcut Cards */}
            <div className="w-full space-y-1.5 bg-black/[0.02] dark:bg-white/[0.03] p-2.5 rounded-xl border border-black/[0.04] dark:border-white/[0.06] text-left">
              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Keyboard Shortcuts</p>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-white/10 rounded font-bold border border-black/[0.08] dark:border-white/[0.14] text-gray-800 dark:text-gray-200 font-mono text-[9px]">F2</kbd>
                  <span>Search</span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-white/10 rounded font-bold border border-black/[0.08] dark:border-white/[0.14] text-gray-800 dark:text-gray-200 font-mono text-[9px]">F4</kbd>
                  <span>Customer</span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-white/10 rounded font-bold border border-black/[0.08] dark:border-white/[0.14] text-gray-800 dark:text-gray-200 font-mono text-[9px]">F8</kbd>
                  <span>Save Draft</span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                  <kbd className="px-1.5 py-0.5 bg-white dark:bg-white/10 rounded font-bold border border-black/[0.08] dark:border-white/[0.14] text-gray-800 dark:text-gray-200 font-mono text-[9px]">F9</kbd>
                  <span>Checkout</span>
                </div>
              </div>
            </div>

            {/* Customer due overview if selected */}
            {customer && (
              <div className="w-full mt-2 p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.06] text-left">
                <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                  <span>Customer Outstanding</span>
                  <span className={customer.current_balance > 0 ? 'text-amber-500 font-bold' : 'text-emerald-500 font-bold'}>
                    {customer.current_balance > 0 ? `₹${customer.current_balance.toLocaleString('en-IN')}` : 'All Clear'}
                  </span>
                </div>
                {customer.credit_limit > 0 && (
                  <div className="flex items-center justify-between text-[9.5px] text-gray-400">
                    <span>Credit Limit:</span>
                    <span>₹{customer.credit_limit.toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Items in Order</span>
              <span className="text-[10px] text-gray-400">{items.length} lines</span>
            </div>

            {items.map((item, idx) => (
              <div
                key={item._key || idx}
                className="group relative rounded-xl p-2.5 bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.06] hover:border-black/[0.10] dark:hover:border-white/[0.12] transition-all"
              >
                {/* Product Name + Delete Button */}
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-xs text-gray-900 dark:text-white truncate">
                      {item.product_name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-gray-400">
                      {item.brand && <span>{item.brand}</span>}
                      {item.batch_no && (
                        <span className="px-1 py-0.2 rounded bg-black/[0.04] dark:bg-white/[0.08] font-mono text-[9px]">
                          #{item.batch_no}
                        </span>
                      )}
                      <span>· ₹{Number(item.rate || 0).toFixed(2)}/{item.unit || 'PCS'}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="w-5 h-5 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-500/10 opacity-70 group-hover:opacity-100 transition-all cursor-pointer"
                    title="Remove item"
                  >
                    <X size={12} />
                  </button>
                </div>

                {/* Stepper + Line Total */}
                <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-black/[0.03] dark:border-white/[0.04]">
                  {/* Stepper */}
                  <div className="flex items-center rounded-lg bg-black/[0.04] dark:bg-white/[0.08] p-0.5 border border-black/[0.04] dark:border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => handleDecrease(idx, item.qty)}
                      className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      <Minus size={10} />
                    </button>
                    <span className="w-8 text-center font-bold text-xs text-gray-900 dark:text-white select-none">
                      {item.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleIncrease(idx, item.qty, item.max_stock)}
                      disabled={item.max_stock != null && item.qty >= item.max_stock}
                      className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-black/[0.06] dark:hover:bg-white/10 transition-colors disabled:opacity-30 cursor-pointer"
                    >
                      <Plus size={10} />
                    </button>
                  </div>

                  {/* Line Total */}
                  <div className="text-right">
                    <span className="font-bold text-xs text-gray-900 dark:text-white">
                      ₹{(item.total || 0).toFixed(2)}
                    </span>
                    {item.discount_pct > 0 && (
                      <span className="block text-[9px] text-emerald-500 font-medium">
                        {item.discount_pct}% off
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── PAYMENT METHOD SELECTOR ──────────────────────────────────────── */}
      <div className="px-3.5 py-2 border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.015] flex-shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Payment Mode
          </label>
          <span className="text-[10px] font-bold uppercase text-[#0071e3] dark:text-[#0a84ff]">
            {payMode || 'cash'}
          </span>
        </div>
        <div className="glass-tab-track">
          {PAYMENT_OPTIONS.map(opt => {
            const Icon = opt.icon
            const isSelected = payMode === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPayMode(opt.id)}
                className={`glass-tab-btn flex-1 py-1 text-[11px] ${isSelected ? 'active' : ''}`}
              >
                {isSelected && (
                  <>
                    <div className="glass-tab-active-pill" />
                    <div className="glass-tab-active-shadow" />
                  </>
                )}
                <Icon size={11} className="relative z-10 flex-shrink-0" />
                <span className="relative z-10 font-semibold">{opt.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── FINANCIAL BILL BREAKDOWN ─────────────────────────────────────── */}
      <div className="px-3.5 py-2.5 border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02] flex-shrink-0 space-y-1.5 text-xs">
        <div className="flex justify-between text-gray-500 dark:text-gray-400">
          <span>Taxable Subtotal</span>
          <AnimatedAmount value={totalTaxable} className="font-semibold text-gray-800 dark:text-gray-200" />
        </div>

        {isIgst ? (
          <div className="flex justify-between text-gray-500 dark:text-gray-400">
            <span>IGST</span>
            <AnimatedAmount value={totalIgst} className="font-semibold text-gray-800 dark:text-gray-200" />
          </div>
        ) : (
          <div className="flex justify-between text-gray-500 dark:text-gray-400">
            <span>GST (CGST + SGST)</span>
            <AnimatedAmount value={totalCgst + totalSgst} className="font-semibold text-gray-800 dark:text-gray-200" />
          </div>
        )}

        {/* Invoice Discount with quick pills */}
        <div className="flex items-center justify-between pt-1 border-t border-black/[0.04] dark:border-white/[0.06]">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 dark:text-gray-400">Discount</span>
            <div className="flex items-center gap-1">
              {QUICK_DISCOUNTS.map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDiscPct(d)}
                  className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded transition-all cursor-pointer ${
                    discPct === d
                      ? 'bg-[#0071e3] text-white'
                      : 'bg-black/[0.04] dark:bg-white/[0.06] text-gray-600 dark:text-gray-300 hover:bg-black/[0.08]'
                  }`}
                >
                  {d}%
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={discPct}
              onChange={e => setDiscPct(parseFloat(e.target.value) || 0)}
              className="input w-14 text-right py-0.5 px-1.5 text-xs h-6 font-semibold"
            />
            <span className="text-[10px] text-gray-400">%</span>
          </div>
        </div>

        {invDisc > 0 && (
          <div className="flex justify-between text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <span>Discount Savings</span>
            <span>-₹{invDisc.toFixed(2)}</span>
          </div>
        )}

        {/* Grand Total */}
        <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.08] flex justify-between items-baseline">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-900 dark:text-white block">
              Grand Total
            </span>
            <span className="text-[10px] text-gray-400">
              Incl. all taxes
            </span>
          </div>
          <AnimatedAmount
            value={grandTotal}
            className="text-2xl font-black text-[#0071e3] dark:text-[#0a84ff] tracking-tight"
          />
        </div>
      </div>

      {/* ── NOTES (EXPANDABLE) ───────────────────────────────────────────── */}
      <div className="px-3.5 py-1.5 border-t border-black/[0.04] dark:border-white/[0.06] bg-black/[0.01] dark:bg-white/[0.01] flex-shrink-0">
        <button
          type="button"
          onClick={() => setShowNotes(v => !v)}
          className="flex items-center justify-between w-full text-[10px] font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1">
            <FileText size={10} />
            <span>Order Notes {notes ? '•' : ''}</span>
          </span>
          {showNotes ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {showNotes && (
          <div className="mt-1.5 space-y-1.5 animate-in fade-in">
            <textarea
              className="input text-xs resize-none w-full py-1.5 px-2"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Special instructions, delivery notes…"
            />
            <div className="flex flex-wrap gap-1">
              {QUICK_NOTES.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => addQuickNote(tag)}
                  className="text-[9px] px-1.5 py-0.5 rounded-full bg-black/[0.03] dark:bg-white/[0.06] text-gray-600 dark:text-gray-300 hover:bg-black/[0.06] cursor-pointer"
                >
                  +{tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── BOTTOM ACTIONS STATION ──────────────────────────────────────── */}
      <div className="p-3 bg-black/[0.03] dark:bg-white/[0.04] border-t border-black/[0.08] dark:border-white/[0.10] flex-shrink-0 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={onSaveDraft}
            className="btn-secondary col-span-1 justify-center text-xs font-semibold py-2.5 px-2 gap-1.5 whitespace-nowrap cursor-pointer"
            title="Save Cart as Draft (F8)"
          >
            <Save size={13} />
            <span>Draft</span>
            <kbd className="text-[9px] opacity-60 bg-black/[0.04] dark:bg-white/[0.08] px-1 py-0.5 rounded font-mono">F8</kbd>
          </button>

          <button
            type="button"
            onClick={onCheckout}
            disabled={items.length === 0}
            className="btn-primary col-span-2 justify-center py-2.5 px-3 text-xs font-bold gap-2 disabled:opacity-40 whitespace-nowrap shadow-md cursor-pointer"
            title="Proceed to Payment (F9)"
          >
            <ShoppingCart size={14} />
            <span>Checkout</span>
            <span className="font-mono text-xs opacity-90">
              ₹{grandTotal.toFixed(2)}
            </span>
            <kbd className="text-[9px] opacity-70 bg-white/20 px-1 py-0.5 rounded font-mono">F9</kbd>
          </button>
        </div>
      </div>

    </div>
  )
}
