import { useState, useEffect, useCallback, useRef } from 'react'
import {
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  History, Star, Zap, AlertTriangle, Info, X, Package,
  Clock, User, RotateCcw, Check
} from 'lucide-react'
import { pricingAPI } from '../../services/api'
import PriceHistoryModal from './PriceHistoryModal'

// ── Session memory: remember last chosen pricing mode ────────────────────────
const SESSION_PRICING_MODE_KEY = 'smart_pricing_last_mode'

function getSessionPricingMode() {
  try { return sessionStorage.getItem(SESSION_PRICING_MODE_KEY) || 'recommended' } catch { return 'recommended' }
}
function setSessionPricingMode(mode) {
  try { sessionStorage.setItem(SESSION_PRICING_MODE_KEY, mode) } catch {}
}

// ── Profit calculator ─────────────────────────────────────────────────────────
function calcProfit(sellingPrice, purchasePrice) {
  const profit = sellingPrice - purchasePrice
  const margin = purchasePrice > 0 ? (profit / sellingPrice) * 100 : 0
  return { profit, margin }
}

// ── Margin color tier ─────────────────────────────────────────────────────────
function marginColor(margin) {
  if (margin >= 15) return { label: 'Healthy', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800/40' }
  if (margin >= 5) return { label: 'Low Margin', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800/40' }
  return { label: margin < 0 ? 'Loss!' : 'Very Low', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800/40' }
}

// ── Price change badge ────────────────────────────────────────────────────────
function PriceChangeBadge({ currentPrice, referencePrice, label }) {
  if (!referencePrice || referencePrice === 0) return null
  const diff = currentPrice - referencePrice
  const pct  = ((diff / referencePrice) * 100).toFixed(1)
  if (Math.abs(diff) < 0.01) return null
  const isUp = diff > 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${isUp ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
      {isUp ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
      {isUp ? '+' : ''}{pct}% vs {label}
    </span>
  )
}

// ── Quick suggestion button ───────────────────────────────────────────────────
function QuickBtn({ label, price, active, badge, onClick, disabled }) {
  if (!price || price <= 0) return null
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`relative flex flex-col items-center px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all duration-150 min-w-[72px]
        ${active
          ? 'bg-primary-600 border-primary-600 text-white shadow-md shadow-primary-200 dark:shadow-primary-900/40'
          : 'bg-white dark:bg-gray-800/60 border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:border-primary-400 hover:text-primary-600'
        }`}
    >
      {badge && (
        <span className={`absolute -top-1.5 -right-1 text-[9px] font-bold px-1 py-0.5 rounded-full leading-none
          ${active ? 'bg-white text-primary-600' : 'bg-primary-600 text-white'}`}>
          {badge}
        </span>
      )}
      <span className="text-[10px] font-semibold leading-none mb-0.5">{label}</span>
      <span className="text-[11px]">₹{Number(price).toFixed(2)}</span>
    </button>
  )
}

/**
 * SmartPriceAssistant
 *
 * A fully reusable pricing panel. Slide-in on product staging, allows price selection
 * before committing to cart.
 *
 * Props:
 *   product     – staged product object (from product search result)
 *   customer    – current customer object (may be null for walk-in)
 *   isIgst      – boolean (needed for downstream GST calc context)
 *   onConfirm   – (product, price, qty) => void
 *   onCancel    – () => void
 */
export default function SmartPriceAssistant({ product, customer, isIgst, onConfirm, onCancel }) {
  const [pricing, setPricing]             = useState(null)
  const [loading, setLoading]             = useState(true)
  const [sellingPrice, setSellingPrice]   = useState('')
  const [qty, setQty]                     = useState(1)
  const [expanded, setExpanded]           = useState(false)
  const [activeMode, setActiveMode]       = useState(getSessionPricingMode())
  const [historyOpen, setHistoryOpen]     = useState(false)
  const [priceError, setPriceError]       = useState('')
  const priceRef = useRef(null)

  // ── Load pricing history ────────────────────────────────────────────────────
  useEffect(() => {
    if (!product?.id) return
    setLoading(true)
    setPricing(null)
    setPriceError('')

    pricingAPI.history(product.id, customer?.id || null)
      .then(({ data }) => {
        setPricing(data)
        // Apply initial price based on remembered mode
        const suggestions = data.suggestions || {}
        const mode = getSessionPricingMode()
        const price = resolvePrice(mode, suggestions, data.selling_price)
        setSellingPrice(Number(price || data.selling_price || 0).toFixed(2))
      })
      .catch(() => {
        // Fallback: use product's default selling price
        setSellingPrice(Number(product.selling_price || 0).toFixed(2))
      })
      .finally(() => setLoading(false))
  }, [product?.id, customer?.id])

  // ── Keyboard shortcut: Alt+L = last price, Alt+R = recommended ─────────────
  useEffect(() => {
    const handler = (e) => {
      if (!pricing) return
      if (e.altKey && e.key === 'l') {
        e.preventDefault()
        applyMode('last_customer', pricing.suggestions, pricing.selling_price)
      } else if (e.altKey && e.key === 'r') {
        e.preventDefault()
        applyMode('recommended', pricing.suggestions, pricing.selling_price)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [pricing])

  function resolvePrice(mode, suggestions, defaultPrice) {
    const map = {
      recommended:     suggestions.recommended_price,
      last_customer:   suggestions.last_customer_price,
      last_global:     suggestions.last_global_price,
      avg_customer:    suggestions.avg_customer_price,
      avg_global:      suggestions.avg_global_price,
      most_used:       suggestions.most_used_price,
      mrp:             pricing?.mrp,
      default:         defaultPrice,
    }
    return map[mode] || defaultPrice || 0
  }

  function applyMode(mode, suggestions, defaultPrice) {
    const price = resolvePrice(mode, suggestions || pricing?.suggestions || {}, defaultPrice || pricing?.selling_price)
    if (price && price > 0) {
      setSellingPrice(Number(price).toFixed(2))
      setActiveMode(mode)
      setSessionPricingMode(mode)
      setPriceError('')
    }
  }

  // ── Validate price ──────────────────────────────────────────────────────────
  const validateAndConfirm = () => {
    const price = parseFloat(sellingPrice)
    if (isNaN(price) || price < 0) {
      setPriceError('Selling price cannot be negative')
      priceRef.current?.focus()
      return
    }
    if (price === 0) {
      setPriceError('Enter a valid selling price')
      priceRef.current?.focus()
      return
    }
    setPriceError('')
    onConfirm(product, price, qty)
  }

  // ── Handle Enter key in price field ────────────────────────────────────────
  const handlePriceKey = (e) => {
    if (e.key === 'Enter') validateAndConfirm()
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const price    = parseFloat(sellingPrice) || 0
  const purchase = pricing?.purchase_price || 0
  const mrp      = pricing?.mrp || 0
  const stock    = pricing?.current_stock ?? product?.current_stock ?? 0
  const { profit, margin } = calcProfit(price, purchase)
  const tier     = marginColor(margin)
  const suggestions = pricing?.suggestions || {}
  const lastCustPrice = suggestions.last_customer_price
  const noHistory     = !loading && pricing?.customer_history?.length === 0 && !customer
  const aboveMrp      = mrp > 0 && price > mrp

  return (
    <>
      {/* Main Panel */}
      <div className="rounded-2xl border border-primary-200 dark:border-primary-800/40 bg-gradient-to-br from-white via-primary-50/30 to-indigo-50/20 dark:from-[#151922] dark:via-primary-950/20 dark:to-indigo-950/20 shadow-lg shadow-primary-100/40 dark:shadow-primary-950/30 overflow-hidden animate-modal-in">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 bg-primary-600/5 dark:bg-primary-500/10 border-b border-primary-200/60 dark:border-primary-800/30">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center">
              <Zap size={13} className="text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-primary-800 dark:text-primary-200 leading-none">Smart Pricing Assistant</p>
              <p className="text-[11px] text-primary-600/70 dark:text-primary-400/70 mt-0.5 leading-none truncate max-w-[240px]">{product?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 bg-white/60 dark:bg-white/5 px-2 py-1 rounded-lg border border-gray-200/60 dark:border-white/5">
              <Package size={10} />
              {stock} in stock
            </span>
            <button type="button" onClick={onCancel} className="btn-icon text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 w-7 h-7">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">

          {/* ── Selling Price field + quick buttons ── */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                Selling Price
              </label>
              <div className="flex items-center gap-1.5">
                {lastCustPrice && (
                  <PriceChangeBadge currentPrice={price} referencePrice={lastCustPrice} label="last" />
                )}
                <span className="text-[10px] text-gray-400">
                  <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[9px] font-bold">Alt+L</kbd> Last &nbsp;
                  <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-[9px] font-bold">Alt+R</kbd> Rec.
                </span>
              </div>
            </div>

            {/* Price input */}
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-semibold text-sm">₹</span>
              <input
                ref={priceRef}
                autoFocus
                type="number"
                min="0"
                step="0.01"
                value={sellingPrice}
                onChange={e => { setSellingPrice(e.target.value); setActiveMode('custom'); setPriceError('') }}
                onKeyDown={handlePriceKey}
                className={`input pl-8 text-xl font-bold text-gray-900 dark:text-white h-12 w-full ${priceError ? 'border-red-400 dark:border-red-500' : ''}`}
              />
              {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {priceError && (
              <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={11} />{priceError}</p>
            )}

            {/* Warnings */}
            {!loading && purchase > 0 && price < purchase && price > 0 && (
              <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl px-3 py-2">
                <AlertTriangle size={13} className="flex-shrink-0" />
                Selling below purchase price! Loss of ₹{(purchase - price).toFixed(2)} per unit.
              </div>
            )}
            {!loading && aboveMrp && (
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl px-3 py-2">
                <AlertTriangle size={13} className="flex-shrink-0" />
                Price exceeds MRP (₹{mrp.toFixed(2)})
              </div>
            )}
          </div>

          {/* ── Quick Suggestion Buttons ── */}
          {!loading && (
            <div className="flex flex-wrap gap-2">
              {lastCustPrice && (
                <QuickBtn
                  label="Last Price"
                  price={lastCustPrice}
                  active={activeMode === 'last_customer'}
                  badge="★"
                  onClick={() => applyMode('last_customer', suggestions, pricing?.selling_price)}
                />
              )}
              {suggestions.recommended_price && (
                <QuickBtn
                  label="Recommended"
                  price={suggestions.recommended_price}
                  active={activeMode === 'recommended'}
                  badge="✓"
                  onClick={() => applyMode('recommended', suggestions, pricing?.selling_price)}
                />
              )}
              {suggestions.most_used_price && suggestions.most_used_price !== suggestions.recommended_price && (
                <QuickBtn
                  label="Most Used"
                  price={suggestions.most_used_price}
                  active={activeMode === 'most_used'}
                  onClick={() => applyMode('most_used', suggestions, pricing?.selling_price)}
                />
              )}
              {mrp > 0 && (
                <QuickBtn
                  label="MRP"
                  price={mrp}
                  active={activeMode === 'mrp'}
                  onClick={() => applyMode('mrp', suggestions, pricing?.selling_price)}
                />
              )}
              {pricing?.selling_price > 0 && (
                <QuickBtn
                  label="Default"
                  price={pricing.selling_price}
                  active={activeMode === 'default'}
                  onClick={() => applyMode('default', suggestions, pricing?.selling_price)}
                />
              )}
            </div>
          )}

          {/* ── Profit Analysis + Customer Pricing (side by side) ── */}
          {!loading && (
            <div className="grid grid-cols-2 gap-3">
              {/* Profit Analysis */}
              <div className={`rounded-xl border p-3 space-y-1.5 ${tier.bg} ${tier.border}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wide ${tier.color}`}>💰 Profit Analysis</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Purchase</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">₹{purchase.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Profit/unit</span>
                    <span className={`font-semibold ${profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      {profit >= 0 ? '+' : ''}₹{profit.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">Margin</span>
                    <span className={`font-bold ${tier.color}`}>{margin.toFixed(1)}% {tier.label}</span>
                  </div>
                  <div className="flex justify-between border-t border-current/10 pt-1">
                    <span className="text-gray-500 dark:text-gray-400">Total Profit</span>
                    <span className={`font-bold ${profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                      {profit >= 0 ? '+' : ''}₹{(profit * qty).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Customer Pricing */}
              <div className="rounded-xl border border-indigo-200/60 dark:border-indigo-800/30 bg-indigo-50/60 dark:bg-indigo-950/20 p-3 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">👤 Customer Pricing</p>
                {!customer ? (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">Select a customer to see their pricing history</p>
                ) : pricing?.customer_history?.length === 0 ? (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">No previous sales to this customer for this product</p>
                ) : (
                  <div className="space-y-1.5">
                    {pricing.customer_label && (
                      <p className="text-[11px] text-indigo-700 dark:text-indigo-300 font-medium leading-snug">{pricing.customer_label}</p>
                    )}
                    {pricing.customer_history?.slice(0, 2).map((h, i) => (
                      <div key={h.id || i} className="text-[11px] space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500 dark:text-gray-400">{i === 0 ? 'Last Sale' : 'Previous'}</span>
                          <button
                            type="button"
                            onClick={() => { setSellingPrice(h.rate.toFixed(2)); setActiveMode('last_customer') }}
                            className="font-bold text-indigo-700 dark:text-indigo-300 hover:underline"
                          >
                            ₹{(h.rate || 0).toFixed(2)}
                          </button>
                        </div>
                        <div className="text-gray-400 text-[10px]">
                          {h.invoice_number} · {h.days_ago != null ? `${h.days_ago}d ago` : ''}
                          {h.quantity ? ` · Qty: ${h.quantity}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Expandable global avg row ── */}
          {!loading && (suggestions.avg_global_price || suggestions.avg_customer_price) && (
            <div>
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {expanded ? 'Hide' : 'Show'} price averages &amp; trends
              </button>

              {expanded && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {suggestions.avg_customer_price && (
                    <div className="flex justify-between items-center bg-white/70 dark:bg-white/5 border border-gray-200/60 dark:border-white/5 rounded-xl px-3 py-2 text-xs">
                      <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1"><User size={10} />Avg (this customer)</span>
                      <button
                        type="button"
                        onClick={() => applyMode('avg_customer', suggestions, pricing?.selling_price)}
                        className="font-semibold text-gray-800 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400"
                      >
                        ₹{suggestions.avg_customer_price.toFixed(2)}
                      </button>
                    </div>
                  )}
                  {suggestions.avg_global_price && (
                    <div className="flex justify-between items-center bg-white/70 dark:bg-white/5 border border-gray-200/60 dark:border-white/5 rounded-xl px-3 py-2 text-xs">
                      <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1"><TrendingUp size={10} />Avg (all customers)</span>
                      <button
                        type="button"
                        onClick={() => applyMode('avg_global', suggestions, pricing?.selling_price)}
                        className="font-semibold text-gray-800 dark:text-gray-200 hover:text-primary-600 dark:hover:text-primary-400"
                      >
                        ₹{suggestions.avg_global_price.toFixed(2)}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Quantity + Add to Cart ── */}
          <div className="flex items-center gap-3 pt-1">
            <div className="flex-shrink-0">
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide block mb-1">Qty</label>
              <input
                type="number"
                min="0.01"
                step="1"
                max={stock || undefined}
                value={qty}
                onChange={e => setQty(Math.max(0.01, parseFloat(e.target.value) || 1))}
                className="input w-20 text-center font-semibold"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <button
                type="button"
                onClick={validateAndConfirm}
                className="btn-primary w-full justify-center h-10 text-sm font-semibold"
              >
                <Check size={15} />
                Add to Cart
              </button>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="btn-secondary flex-1 justify-center h-8 text-xs gap-1"
                  disabled={!pricing?.global_history?.length}
                >
                  <History size={12} />
                  Price History
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="btn-secondary flex-1 justify-center h-8 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>

          {/* ── Loading shimmer ── */}
          {loading && (
            <div className="absolute inset-0 bg-white/50 dark:bg-black/30 backdrop-blur-sm rounded-2xl flex items-center justify-center">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <div className="w-4 h-4 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                Loading price intelligence…
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Price History Modal */}
      <PriceHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        productName={product?.name}
        globalHistory={pricing?.global_history || []}
        onApplyPrice={(rate) => { setSellingPrice(rate.toFixed(2)); setActiveMode('custom') }}
      />
    </>
  )
}
