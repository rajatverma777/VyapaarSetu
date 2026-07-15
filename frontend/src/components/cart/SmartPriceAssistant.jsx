import { useState, useEffect, useCallback, useRef } from 'react'
import {
  TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp,
  History, Star, Zap, AlertTriangle, Info, X, Package,
  Clock, User, RotateCcw, Check, RefreshCw, ShoppingCart,
  Award, Activity, BarChart2
} from 'lucide-react'
import { pricingAPI, healthAPI } from '../../services/api'
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
  if (margin >= 5)  return { label: 'Low Margin', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800/40' }
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

// ── Customer Insight row ──────────────────────────────────────────────────────
function InsightRow({ icon: Icon, label, value, valueClass = '' }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-center justify-between text-[11px] py-0.5">
      <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
        <Icon size={9} className="flex-shrink-0" />
        {label}
      </span>
      <span className={`font-semibold ${valueClass || 'text-gray-800 dark:text-gray-200'}`}>{value}</span>
    </div>
  )
}

/**
 * SmartPriceAssistant – Enterprise Grade
 *
 * Handles Render free-tier cold starts gracefully with retry + warm-up logic.
 * Shows full customer pricing intelligence: history, insights, trends, margins.
 *
 * Props:
 *   product     – staged product object (from product search result)
 *   customer    – current customer object (may be null for walk-in)
 *   isIgst      – boolean (needed for downstream GST calc context)
 *   onConfirm   – (product, price, qty) => void
 *   onCancel    – () => void
 */
export default function SmartPriceAssistant({ product, customer, isIgst, onConfirm, onCancel }) {
  const [pricing, setPricing]           = useState(null)
  const [loading, setLoading]           = useState(true)
  const [loadingMsg, setLoadingMsg]     = useState('Loading price intelligence…')
  const [sellingPrice, setSellingPrice] = useState('')
  const [qty, setQty]                   = useState(1)
  const [expanded, setExpanded]         = useState(false)
  const [activeMode, setActiveMode]     = useState(getSessionPricingMode())
  const [historyOpen, setHistoryOpen]   = useState(false)
  const [priceError, setPriceError]     = useState('')
  const [fetchError, setFetchError]     = useState(null)
  const [retryCount, setRetryCount]     = useState(0)
  const priceRef  = useRef(null)
  const abortRef  = useRef(null)

  // ── Load pricing history with warm-up retry for cold starts ────────────────
  const fetchPricing = useCallback(async (productId, customerId, attempt = 0) => {
    // Cancel any previous in-flight request
    if (abortRef.current) abortRef.current()

    setLoading(true)
    setFetchError(null)
    setPricing(null)
    setPriceError('')

    if (attempt > 0) {
      setLoadingMsg(`Connecting to server… (attempt ${attempt + 1})`)
    } else {
      setLoadingMsg('Loading price intelligence…')
    }

    let cancelled = false
    abortRef.current = () => { cancelled = true }

    try {
      const { data } = await pricingAPI.history(productId, customerId || null)
      if (cancelled) return

      setPricing(data)
      setFetchError(null)

      // Apply initial price based on remembered mode
      const suggestions = data.suggestions || {}
      const mode  = getSessionPricingMode()
      const price = resolvePriceFromSuggestions(mode, suggestions, data.selling_price)
      setSellingPrice(Number(price || data.selling_price || 0).toFixed(2))

    } catch (err) {
      if (cancelled) return

      // Detect network/timeout error (Render cold start)
      const isNetworkError = !err.response || err.code === 'ECONNABORTED' || err.message?.includes('timeout') || err.message?.includes('Network Error')

      if (isNetworkError && attempt < 2) {
        // Retry after a short warm-up delay (Render free tier needs ~50s to wake)
        setLoadingMsg('Server is waking up, please wait…')
        await new Promise(res => setTimeout(res, 5000))
        if (!cancelled) {
          setRetryCount(c => c + 1)
          return fetchPricing(productId, customerId, attempt + 1)
        }
        return
      }

      // Final fallback: use product's default selling price
      setFetchError(isNetworkError
        ? 'Server is starting up. Pricing history will load shortly. You can still set a price manually.'
        : `Could not load pricing history. (${err.response?.data?.detail || err.message || 'Unknown error'})`)
      setSellingPrice(Number(product?.selling_price || 0).toFixed(2))

    } finally {
      if (!cancelled) setLoading(false)
    }
  }, [product])

  useEffect(() => {
    if (!product?.id) return
    setRetryCount(0)
    fetchPricing(product.id, customer?.id)
    return () => { if (abortRef.current) abortRef.current() }
  }, [product?.id, customer?.id, fetchPricing])

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

  function resolvePriceFromSuggestions(mode, suggestions, defaultPrice) {
    const map = {
      recommended:   suggestions.recommended_price,
      last_customer: suggestions.last_customer_price,
      last_global:   suggestions.last_global_price,
      avg_customer:  suggestions.avg_customer_price,
      avg_global:    suggestions.avg_global_price,
      most_used:     suggestions.most_used_price,
      mrp:           pricing?.mrp,
      default:       defaultPrice,
    }
    return map[mode] || defaultPrice || 0
  }

  function applyMode(mode, suggestions, defaultPrice) {
    const price = resolvePriceFromSuggestions(mode, suggestions || pricing?.suggestions || {}, defaultPrice || pricing?.selling_price)
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

  const handlePriceKey = (e) => {
    if (e.key === 'Enter') validateAndConfirm()
  }

  // ── Compute smart insights from customer history ───────────────────────────
  const getCustomerInsights = () => {
    const history = pricing?.customer_history || []
    if (!history.length) return null

    const rates    = history.map(h => h.rate).filter(r => r > 0)
    const qtys     = history.map(h => h.quantity).filter(q => q > 0)
    const lastSale = history[0]
    const firstSale = history[history.length - 1]

    const avgQty   = qtys.length ? (qtys.reduce((a, b) => a + b, 0) / qtys.length).toFixed(1) : null
    const highest  = rates.length ? Math.max(...rates) : null
    const lowest   = rates.length ? Math.min(...rates) : null

    // Price trend: compare last vs second-to-last sale
    let trend = null
    if (history.length >= 2) {
      const diff = history[0].rate - history[1].rate
      trend = diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable'
    }

    return {
      totalPurchases: history.length,
      lastDaysAgo:    lastSale.days_ago,
      avgQty,
      highest,
      lowest,
      trend,
      lastDiscount:   lastSale.discount_percent > 0 ? lastSale.discount_percent : null,
    }
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const price     = parseFloat(sellingPrice) || 0
  const purchase  = pricing?.purchase_price || 0
  const mrp       = pricing?.mrp || 0
  const stock     = pricing?.current_stock ?? product?.current_stock ?? 0
  const { profit, margin } = calcProfit(price, purchase)
  const tier      = marginColor(margin)
  const suggestions    = pricing?.suggestions || {}
  const lastCustPrice  = suggestions.last_customer_price
  const aboveMrp       = mrp > 0 && price > mrp
  const belowPurchase  = purchase > 0 && price > 0 && price < purchase
  const insights       = getCustomerInsights()

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

          {/* ── Selling Price field ── */}
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
            {!loading && belowPurchase && (
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

            {/* Server wake-up error (non-blocking) */}
            {fetchError && (
              <div className="flex items-start gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-xl px-3 py-2">
                <Info size={12} className="flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p>{fetchError}</p>
                  <button
                    type="button"
                    onClick={() => fetchPricing(product.id, customer?.id)}
                    className="mt-1 flex items-center gap-1 text-blue-700 dark:text-blue-300 font-semibold hover:underline"
                  >
                    <RefreshCw size={10} /> Retry
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Quick Suggestion Buttons ── */}
          {!loading && pricing && (
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
                  price={pricing?.selling_price}
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
                ) : !pricing ? (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                    {fetchError ? 'History unavailable – server starting up' : 'Loading…'}
                  </p>
                ) : pricing.customer_history?.length === 0 ? (
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
                          {h.discount_percent > 0 ? ` · ${h.discount_percent}% off` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Smart Insights (only shown when customer history exists) ── */}
          {!loading && pricing && insights && customer && (
            <div className="rounded-xl border border-violet-200/60 dark:border-violet-800/30 bg-violet-50/40 dark:bg-violet-950/10 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-400 mb-2">📊 Smart Insights</p>
              <div className="space-y-0.5">
                <InsightRow icon={ShoppingCart} label="Total Purchases" value={`${insights.totalPurchases} time${insights.totalPurchases > 1 ? 's' : ''}`} />
                <InsightRow icon={Clock} label="Last Purchased" value={insights.lastDaysAgo != null ? (insights.lastDaysAgo === 0 ? 'Today' : `${insights.lastDaysAgo} days ago`) : null} />
                <InsightRow icon={Activity} label="Avg Qty / Order" value={insights.avgQty ? `${insights.avgQty} units` : null} />
                <InsightRow icon={TrendingUp} label="Highest Price" value={insights.highest != null ? `₹${insights.highest.toFixed(2)}` : null} />
                <InsightRow icon={TrendingDown} label="Lowest Price" value={insights.lowest != null ? `₹${insights.lowest.toFixed(2)}` : null} />
                {insights.lastDiscount && (
                  <InsightRow icon={Award} label="Last Discount" value={`${insights.lastDiscount}%`} valueClass="text-emerald-600 dark:text-emerald-400" />
                )}
                {insights.trend && insights.trend !== 'stable' && (
                  <InsightRow
                    icon={insights.trend === 'up' ? TrendingUp : TrendingDown}
                    label="Price Trend"
                    value={insights.trend === 'up' ? 'Increasing ↑' : 'Decreasing ↓'}
                    valueClass={insights.trend === 'up' ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}
                  />
                )}
              </div>
            </div>
          )}

          {/* ── Expandable global avg row ── */}
          {!loading && pricing && (suggestions.avg_global_price || suggestions.avg_customer_price) && (
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

          {/* ── Loading overlay ── */}
          {loading && (
            <div className="absolute inset-0 bg-white/50 dark:bg-black/30 backdrop-blur-sm rounded-2xl flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-xs text-gray-500">
                <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                <span>{loadingMsg}</span>
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
