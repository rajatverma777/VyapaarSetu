import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ShoppingCart, Package, LayoutGrid, Keyboard, Plus, ArrowLeft,
  Tag, Layers, Clock, ShoppingBag
} from 'lucide-react'
import toast from 'react-hot-toast'

import { CartProvider, useCart, calcTotals } from '../components/cart/CartContext'
import ProductSearchBar from '../components/cart/ProductSearchBar'
import CartItemRow from '../components/cart/CartItemRow'
import CartSummaryPanel from '../components/cart/CartSummaryPanel'
import CustomerPanel from '../components/cart/CustomerPanel'
import BatchSelector from '../components/cart/BatchSelector'
import CheckoutModal from '../components/cart/CheckoutModal'
import { settingsAPI } from '../services/api'

// ── Keyboard shortcut hint bar ────────────────────────────────────────────────
function ShortcutBar() {
  const shortcuts = [
    ['F2', 'Search'],
    ['F4', 'Customer'],
    ['F8', 'Draft'],
    ['F9', 'Checkout'],
    ['ESC', 'Close'],
  ]
  return (
    <div className="flex items-center gap-3 flex-wrap text-[10px] text-gray-500 bg-white/20 dark:bg-black/10 px-3 py-1.5 rounded-xl border border-gray-200/40 dark:border-white/5 shadow-sm">
      {shortcuts.map(([key, label]) => (
        <span key={key} className="flex items-center gap-1.5">
          <kbd className="px-1.5 py-0.5 bg-gray-100/80 dark:bg-gray-800 rounded font-bold shadow-sm text-[10px]">{key}</kbd>
          {label}
        </span>
      ))}
    </div>
  )
}

// ── Cart Tab Button ───────────────────────────────────────────────────────────
function CartTab({ cartId, isActive, itemCount, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
        isActive
          ? 'text-indigo-700 dark:text-indigo-300 border border-indigo-400/40 dark:border-indigo-400/20'
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-transparent hover:border-gray-200 dark:hover:border-white/10'
      }`}
      style={isActive ? {
        background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.6) 100%)',
        boxShadow: '0 4px 15px rgba(99,102,241,0.12), inset 0 2px 1.5px rgba(255,255,255,0.95)'
      } : {
        background: 'transparent'
      }}
    >
      <ShoppingCart size={13} />
      Cart {cartId}
      {itemCount > 0 && (
        <span className={`absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-bold text-white px-1 cart-badge-pulse ${
          isActive ? 'bg-indigo-500' : 'bg-gray-400'
        }`}>
          {itemCount}
        </span>
      )}
    </button>
  )
}

// ── Empty Cart State ──────────────────────────────────────────────────────────
function EmptyCartState({ onFocusSearch }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-20 h-20 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-5">
        <ShoppingBag size={36} className="text-indigo-400" />
      </div>
      <h3 className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-1">Cart is empty</h3>
      <p className="text-sm text-gray-400 mb-6 max-w-xs">
        Search for a product above, scan a barcode, or press <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-bold text-[10px]">F2</kbd> to start
      </p>
      <button onClick={onFocusSearch} className="btn-primary text-sm gap-2">
        <Plus size={14} /> Add Product
      </button>
    </div>
  )
}

// ── Inner SmartCart (needs CartProvider above) ────────────────────────────────
function SmartCartInner() {
  const navigate = useNavigate()
  const { CART_IDS, activeId, setActiveId, activeCart, addProduct, getCartItemCount } = useCart()
  const { items, isIgst, discPct } = activeCart
  const totals = calcTotals(items, discPct, isIgst)

  const [company, setCompany] = useState(null)
  const [showCheckout, setShowCheckout] = useState(false)
  const [batchPicker, setBatchPicker] = useState(null) // { product, batches }

  const searchRef = useRef()
  const customerSearchRef = useRef()

  // Load company settings
  useEffect(() => {
    settingsAPI.getCompany().then(({ data }) => setCompany(data)).catch(() => {})
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      // F2 → product search
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus() }
      // F4 → customer search (focus inside customer panel)
      if (e.key === 'F4') { e.preventDefault(); customerSearchRef.current?.focus() }
      // F8 → save draft toast
      if (e.key === 'F8') { e.preventDefault(); handleSaveDraft() }
      // F9 → checkout
      if (e.key === 'F9') { e.preventDefault(); if (items.length > 0) setShowCheckout(true) }
      // ESC → close modal
      if (e.key === 'Escape') { setShowCheckout(false); setBatchPicker(null) }
      // Ctrl+K → focus search
      if (e.key === 'k' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); searchRef.current?.focus() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [items.length])

  const handleSaveDraft = useCallback(() => {
    toast.success(`Cart ${activeId} saved as draft`, { icon: '💾' })
  }, [activeId])

  const handleProductSelect = useCallback((product, batchInfo) => {
    addProduct(product, batchInfo)
    // Small vibration feedback
    if ('vibrate' in navigator) navigator.vibrate(30)
  }, [addProduct])

  const handleBatchSelect = useCallback((product, batches) => {
    setBatchPicker({ product, batches })
  }, [])

  const handleBatchConfirm = useCallback((product, batch) => {
    addProduct(product, batch)
    setBatchPicker(null)
  }, [addProduct])

  return (
    <div className="flex flex-col h-full gap-4 min-h-0">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {/* Back */}
          <button
            onClick={() => navigate('/sales')}
            className="btn-icon w-8 h-8"
          >
            <ArrowLeft size={15} />
          </button>
          <h1 className="page-title">Smart Cart</h1>
          <ShortcutBar />
        </div>

        {/* Cart tabs */}
        <div className="flex items-center gap-2">
          {CART_IDS.map(id => (
            <CartTab
              key={id}
              cartId={id}
              isActive={id === activeId}
              itemCount={getCartItemCount(id)}
              onClick={() => setActiveId(id)}
            />
          ))}
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">

        {/* LEFT: Cart workspace */}
        <div className="flex flex-col flex-1 min-w-0 gap-3 min-h-0">

          {/* Customer selector */}
          <div className="card p-4 relative z-30 flex-shrink-0">
            <CustomerPanel
              company={company}
              inputRef={customerSearchRef}
            />
          </div>

          {/* Product search */}
          <div className="card p-3 relative z-20 flex-shrink-0">
            <ProductSearchBar
              inputRef={searchRef}
              onSelect={handleProductSelect}
              onBatchSelect={handleBatchSelect}
              autoFocus
            />
          </div>

          {/* Cart items table */}
          <div className="card overflow-hidden flex-1 flex flex-col min-h-0 relative z-10">
            <div className="overflow-y-auto flex-1">
              {items.length === 0 ? (
                <EmptyCartState onFocusSearch={() => searchRef.current?.focus()} />
              ) : (
                <table className="table w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="px-3 w-8">#</th>
                      <th className="px-2">Product</th>
                      <th className="px-2 w-12 text-center">Unit</th>
                      <th className="px-2 w-28 text-center">Qty</th>
                      <th className="px-2 w-24 text-right">Rate ₹</th>
                      <th className="px-2 w-16 text-center">Disc%</th>
                      <th className="px-2 w-24 text-right">Taxable</th>
                      <th className="px-2 w-28 text-right">GST</th>
                      <th className="px-2 w-24 text-right">Total</th>
                      <th className="px-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <CartItemRow
                        key={item._key || idx}
                        item={item}
                        idx={idx}
                        isIgst={isIgst}
                      />
                    ))}
                  </tbody>
                  {/* Footer total row */}
                  <tfoot>
                    <tr className="border-t-2 border-indigo-200/60 dark:border-indigo-700/30 bg-indigo-50/30 dark:bg-indigo-900/10">
                      <td colSpan={6} className="px-3 py-2.5 text-xs font-semibold text-gray-500">
                        {items.length} items · {items.reduce((s, i) => s + i.qty, 0)} units
                      </td>
                      <td className="px-2 py-2.5 text-right text-sm font-semibold text-gray-700 dark:text-gray-200">
                        ₹{totals.totalTaxable.toFixed(2)}
                      </td>
                      <td className="px-2 py-2.5 text-right text-xs text-gray-500">
                        {isIgst
                          ? `₹${totals.totalIgst.toFixed(2)}`
                          : `₹${(totals.totalCgst + totals.totalSgst).toFixed(2)}`
                        }
                      </td>
                      <td className="px-2 py-2.5 text-right font-bold text-base text-indigo-700 dark:text-indigo-300">
                        ₹{totals.grandTotal.toFixed(2)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: Summary panel */}
        <div className="w-72 flex-shrink-0 flex flex-col min-h-0 overflow-y-auto">
          <CartSummaryPanel
            onCheckout={() => setShowCheckout(true)}
            onSaveDraft={handleSaveDraft}
          />
        </div>
      </div>

      {/* ── Modals ── */}
      {batchPicker && (
        <BatchSelector
          product={batchPicker.product}
          batches={batchPicker.batches}
          onSelect={handleBatchConfirm}
          onClose={() => setBatchPicker(null)}
        />
      )}

      {showCheckout && (
        <CheckoutModal
          onClose={() => setShowCheckout(false)}
          onSuccess={() => {
            setShowCheckout(false)
            // Focus search for next sale
            setTimeout(() => searchRef.current?.focus(), 300)
          }}
        />
      )}
    </div>
  )
}

// ── Default export wrapped in CartProvider ────────────────────────────────────
export default function SmartCartPage() {
  return (
    <CartProvider>
      <SmartCartInner />
    </CartProvider>
  )
}
