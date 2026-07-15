import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'

const CART_IDS = ['A', 'B', 'C']
const STORAGE_KEY = 'smart_cart_state'

// ── Calculation ───────────────────────────────────────────────────────────────
export function calcItem(item) {
  const gross = (item.rate || 0) * (item.qty || 0)
  const disc = gross * ((item.discount_pct || 0) / 100)
  const taxable = gross - disc
  const half = (item.gst_rate || 0) / 2
  const cgst = item.is_igst ? 0 : taxable * half / 100
  const sgst = item.is_igst ? 0 : taxable * half / 100
  const igst = item.is_igst ? taxable * (item.gst_rate || 0) / 100 : 0
  return { ...item, taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst }
}

export function calcTotals(items, discPct, isIgst) {
  const totalTaxable = items.reduce((s, i) => s + (i.taxable || 0), 0)
  const totalCgst    = items.reduce((s, i) => s + (i.cgst || 0), 0)
  const totalSgst    = items.reduce((s, i) => s + (i.sgst || 0), 0)
  const totalIgst    = items.reduce((s, i) => s + (i.igst || 0), 0)
  const invDisc      = totalTaxable * (discPct || 0) / 100
  const grandTotal   = totalTaxable - invDisc + totalCgst + totalSgst + totalIgst
  return { totalTaxable, totalCgst, totalSgst, totalIgst, invDisc, grandTotal }
}

// ── Default cart factory ──────────────────────────────────────────────────────
function makeDefaultCart(id) {
  return {
    id,
    name: `Cart ${id}`,
    customer: null,
    items: [],
    isIgst: false,
    discPct: 0,
    payMode: 'cash',
    payments: [],       // split payments [{mode, amount}]
    notes: '',
    savedAt: null,
  }
}

// ── Load / Save localStorage ──────────────────────────────────────────────────
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function saveState(carts, activeId) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ carts, activeId, ts: Date.now() }))
  } catch { /* quota exceeded – ignore */ }
}

// ── Context ───────────────────────────────────────────────────────────────────
const CartContext = createContext(null)

export function CartProvider({ children }) {
  const saved = loadState()

  const [carts, setCarts] = useState(() => {
    if (saved?.carts) {
      // Merge saved carts with defaults for any missing cart IDs
      const merged = {}
      for (const id of CART_IDS) {
        merged[id] = saved.carts[id] || makeDefaultCart(id)
      }
      return merged
    }
    const defaults = {}
    for (const id of CART_IDS) defaults[id] = makeDefaultCart(id)
    return defaults
  })

  const [activeId, setActiveId] = useState(() => saved?.activeId || 'A')

  // Persist on every change
  const saveRef = useRef(null)
  useEffect(() => {
    clearTimeout(saveRef.current)
    saveRef.current = setTimeout(() => saveState(carts, activeId), 200)
  }, [carts, activeId])

  // ── Getters ─────────────────────────────────────────────────────────────────
  const activeCart = carts[activeId]

  const getCartItemCount = useCallback((cartId) => {
    return carts[cartId]?.items?.reduce((s, i) => s + (i.qty || 0), 0) || 0
  }, [carts])

  // ── Updater helper ───────────────────────────────────────────────────────────
  const updateCart = useCallback((id, updater) => {
    setCarts(prev => ({
      ...prev,
      [id]: { ...prev[id], ...updater(prev[id]), savedAt: Date.now() }
    }))
  }, [])

  const updateActive = useCallback((updater) => updateCart(activeId, updater), [activeId, updateCart])

  // ── Customer ─────────────────────────────────────────────────────────────────
  const setCustomer = useCallback((customer) => {
    updateActive(c => ({ customer }))
  }, [updateActive])

  // ── IGST toggle ──────────────────────────────────────────────────────────────
  const setIsIgst = useCallback((isIgst) => {
    updateActive(c => ({
      isIgst,
      items: c.items.map(it => calcItem({ ...it, is_igst: isIgst }))
    }))
  }, [updateActive])

  // ── Add Product ──────────────────────────────────────────────────────────────
  const addProduct = useCallback((product, batchInfo = null) => {
    updateActive(c => {
      const isIgst = c.isIgst
      const batchKey = batchInfo
        ? `${product.id}_${batchInfo.batch_no}`
        : product.id

      const existing = c.items.findIndex(i => i._key === batchKey)
      if (existing >= 0) {
        const updated = [...c.items]
        const newQty = updated[existing].qty + 1
        const maxStock = batchInfo ? batchInfo.current_stock : product.current_stock
        if (maxStock != null && newQty > maxStock) {
          toast.error(`Stock limit: only ${maxStock} available`)
          return { items: c.items } // no change, stock full
        }
        updated[existing] = calcItem({ ...updated[existing], qty: newQty })
        return { items: updated }
      }

      const newItem = calcItem({
        _key:         batchKey,
        product_id:   product.id,
        product_name: product.name,
        brand:        product.brand || '',
        sku:          product.sku || '',
        barcode:      product.barcode || '',
        hsn_code:     product.hsn_code || '',
        unit:         product.unit || 'PCS',
        qty:          1,
        rate:         product.selling_price || 0,
        purchase_price: product.purchase_price || 0,
        discount_pct: 0,
        gst_rate:     product.gst_rate || 0,
        max_stock:    batchInfo ? batchInfo.current_stock : (product.current_stock ?? 999999),
        batch_no:     batchInfo?.batch_no || product.batch_no || '',
        expiry_date:  batchInfo?.expiry || product.expiry_date || '',
        is_igst:      isIgst,
        is_new:       true, // for animation
      })
      return { items: [...c.items, newItem] }
    })
  }, [updateActive])

  // ── Add Product with specific price + qty (used by SmartPriceAssistant) ──────
  const addProductWithPrice = useCallback((product, price, qty, batchInfo = null) => {
    updateActive(c => {
      const isIgst = c.isIgst
      const batchKey = batchInfo
        ? `${product.id}_${batchInfo.batch_no}`
        : product.id

      const existing = c.items.findIndex(i => i._key === batchKey)
      if (existing >= 0) {
        const updated = [...c.items]
        const newQty = updated[existing].qty + qty
        const maxStock = batchInfo ? batchInfo.current_stock : product.current_stock
        if (maxStock != null && newQty > maxStock) {
          toast.error(`Stock limit: only ${maxStock} available`)
          return { items: c.items }
        }
        updated[existing] = calcItem({ ...updated[existing], qty: newQty, rate: price })
        return { items: updated }
      }

      const newItem = calcItem({
        _key:           batchKey,
        product_id:     product.id,
        product_name:   product.name,
        brand:          product.brand || '',
        sku:            product.sku || '',
        barcode:        product.barcode || '',
        hsn_code:       product.hsn_code || '',
        unit:           product.unit || 'PCS',
        qty:            qty,
        rate:           price,
        purchase_price: product.purchase_price || 0,
        discount_pct:   0,
        gst_rate:       product.gst_rate || 0,
        max_stock:      batchInfo ? batchInfo.current_stock : (product.current_stock ?? 999999),
        batch_no:       batchInfo?.batch_no || product.batch_no || '',
        expiry_date:    batchInfo?.expiry || product.expiry_date || '',
        is_igst:        isIgst,
        is_new:         true,
      })
      return { items: [...c.items, newItem] }
    })
  }, [updateActive])

  // ── Update item field ────────────────────────────────────────────────────────
  const updateItem = useCallback((idx, key, value) => {
    updateActive(c => {
      const updated = [...c.items]
      const item = { ...updated[idx], [key]: parseFloat(value) ?? 0, is_igst: c.isIgst }

      // Stock guard
      if (key === 'qty') {
        const maxStock = item.max_stock
        const requested = parseFloat(value) || 0
        if (maxStock != null && requested > maxStock) {
          toast.error(`Stock limit: only ${maxStock} available`)
          item.qty = maxStock
        } else {
          item.qty = Math.max(0, requested)
        }
      }
      updated[idx] = calcItem(item)
      return { items: updated }
    })
  }, [updateActive])

  const updateItemStr = useCallback((idx, key, value) => {
    updateActive(c => {
      const updated = [...c.items]
      updated[idx] = { ...updated[idx], [key]: value }
      return { items: updated }
    })
  }, [updateActive])

  // ── Remove item ──────────────────────────────────────────────────────────────
  const removeItem = useCallback((idx) => {
    updateActive(c => ({ items: c.items.filter((_, i) => i !== idx) }))
  }, [updateActive])

  // ── Discount ─────────────────────────────────────────────────────────────────
  const setDiscPct = useCallback((discPct) => {
    updateActive(() => ({ discPct }))
  }, [updateActive])

  // ── Payments ─────────────────────────────────────────────────────────────────
  const setPayments = useCallback((payments) => {
    updateActive(() => ({ payments }))
  }, [updateActive])

  const setPayMode = useCallback((payMode) => {
    updateActive(() => ({ payMode }))
  }, [updateActive])

  // ── Notes ────────────────────────────────────────────────────────────────────
  const setNotes = useCallback((notes) => {
    updateActive(() => ({ notes }))
  }, [updateActive])

  // ── Clear / Reset cart ───────────────────────────────────────────────────────
  const clearCart = useCallback((id) => {
    setCarts(prev => ({ ...prev, [id]: makeDefaultCart(id) }))
  }, [])

  const clearActiveCart = useCallback(() => clearCart(activeId), [activeId, clearCart])

  // ── Mark item as not new (after animation) ───────────────────────────────────
  const clearNewFlag = useCallback((idx) => {
    updateActive(c => {
      const updated = [...c.items]
      if (updated[idx]) updated[idx] = { ...updated[idx], is_new: false }
      return { items: updated }
    })
  }, [updateActive])

  // ── Sync cart item stock limits with fresh database stock ────────────────────
  const syncCartStock = useCallback((productsList) => {
    if (!productsList || productsList.length === 0) return
    setCarts(prev => {
      let changed = false
      const nextCarts = { ...prev }
      for (const id of CART_IDS) {
        const cart = nextCarts[id]
        if (cart && cart.items.length > 0) {
          const updatedItems = cart.items.map(item => {
            const match = productsList.find(p => p.id === item.product_id)
            if (match) {
              const latestTotalStock = match.current_stock ?? 0
              const newMaxStock = item.max_stock != null 
                ? Math.min(item.max_stock, latestTotalStock)
                : latestTotalStock
              const newQty = Math.min(item.qty, newMaxStock)
              if (item.max_stock !== newMaxStock || item.qty !== newQty) {
                changed = true
                return calcItem({ ...item, max_stock: newMaxStock, qty: newQty })
              }
            }
            return item
          })
          if (changed) {
            nextCarts[id] = { ...cart, items: updatedItems }
          }
        }
      }
      return changed ? nextCarts : prev
    })
  }, [])

  const value = {
    CART_IDS,
    carts,
    activeId,
    setActiveId,
    activeCart,
    getCartItemCount,
    setCustomer,
    setIsIgst,
    addProduct,
    addProductWithPrice,
    updateItem,
    updateItemStr,
    removeItem,
    setDiscPct,
    setPayments,
    setPayMode,
    setNotes,
    clearCart,
    clearActiveCart,
    clearNewFlag,
    syncCartStock,
    calcItem,
    calcTotals,
  }


  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
