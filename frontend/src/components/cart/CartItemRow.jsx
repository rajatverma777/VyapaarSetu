import { memo, useEffect, useRef, useState } from 'react'
import { Trash2, Plus, Minus, ChevronDown, AlertTriangle, Package } from 'lucide-react'
import toast from 'react-hot-toast'
import { useCart } from './CartContext'

function getStockStatus(qty, maxStock) {
  if (maxStock === undefined || maxStock === null) return 'ok'
  const ratio = qty / maxStock
  if (ratio >= 1) return 'out'
  if (ratio >= 0.8) return 'low'
  return 'ok'
}

const CartItemRow = memo(function CartItemRow({ item, idx, isIgst }) {
  const { updateItem, updateItemStr, removeItem, clearNewFlag } = useCart()
  const [showRemove, setShowRemove] = useState(false)
  const rowRef = useRef()

  // Slide-in animation on first render
  useEffect(() => {
    if (item.is_new) {
      clearNewFlag(idx)
    }
  }, [])

  const stockStatus = getStockStatus(item.qty, item.max_stock)
  const remainingStock = (item.max_stock ?? 0) - item.qty
  const isOverStock = item.qty > (item.max_stock ?? Infinity)

  const handleQtyChange = (val) => {
    let num = parseFloat(val) || 0
    if (num < 0) return
    // Clamp to max_stock at component level (belt-and-suspenders with CartContext guard)
    if (item.max_stock != null && num > item.max_stock) {
      num = item.max_stock
      toast.error(`Stock limit: only ${item.max_stock} available`)
    }
    updateItem(idx, 'qty', num)
  }

  const increment = () => {
    if (item.max_stock != null && item.qty >= item.max_stock) {
      toast.error(`Stock limit: only ${item.max_stock} available`)
      return
    }
    updateItem(idx, 'qty', (item.qty || 0) + 1)
  }
  const decrement = () => {
    if (item.qty <= 1) return
    updateItem(idx, 'qty', item.qty - 1)
  }

  return (
    <tr
      ref={rowRef}
      className={`cart-item-row group transition-colors duration-150 ${
        item.is_new ? 'cart-item-enter' : ''
      } ${isOverStock ? 'bg-red-50/30 dark:bg-red-900/10' : ''}`}
      onMouseEnter={() => setShowRemove(true)}
      onMouseLeave={() => setShowRemove(false)}
    >
      {/* # */}
      <td className="px-3 py-2.5 text-xs text-gray-400 font-mono text-center w-8">{idx + 1}</td>

      {/* Product Info */}
      <td className="px-2 py-2.5 min-w-[180px]">
        <div className="flex items-start gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Package size={12} className="text-indigo-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight truncate max-w-[200px]">
              {item.product_name}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {item.brand && (
                <span className="text-[9px] font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">{item.brand}</span>
              )}
              {item.batch_no && (
                <span className="text-[9px] text-gray-400 font-mono bg-gray-50 dark:bg-gray-800/40 px-1 py-0.5 rounded">B:{item.batch_no}</span>
              )}
              {item.expiry_date && (
                <span className={`text-[9px] font-medium bg-gray-50 dark:bg-gray-800/40 px-1 py-0.5 rounded ${
                  new Date(item.expiry_date) < new Date() ? 'text-red-500 bg-red-500/10' :
                  (new Date(item.expiry_date) - new Date()) < 90 * 86400000 ? 'text-orange-500 bg-orange-500/10' :
                  'text-gray-400'
                }`}>
                  Exp:{typeof item.expiry_date === 'string'
                    ? item.expiry_date.slice(0, 7)
                    : new Date(item.expiry_date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
                  }
                </span>
              )}
              {item.hsn_code && (
                <span className="text-[9px] text-gray-400 bg-gray-50 dark:bg-gray-800/40 px-1 py-0.5 rounded">HSN:{item.hsn_code}</span>
              )}
              {/* Remaining stock / Over stock warning */}
              {item.max_stock !== undefined && item.max_stock !== null && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                  isOverStock || stockStatus === 'out'
                    ? 'bg-red-500/10 text-red-500 border border-red-500/20' 
                    : stockStatus === 'low' 
                      ? 'bg-orange-500/10 text-orange-500 border border-orange-500/20' 
                      : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                }`}>
                  {isOverStock ? (
                    <><AlertTriangle size={8} className="flex-shrink-0" />Over stock!</>
                  ) : (
                    `${remainingStock} left`
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Unit */}
      <td className="px-2 py-2.5 text-xs text-gray-500 w-14 text-center">{item.unit}</td>

      {/* Qty */}
      <td className="px-2 py-2.5 w-32">
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={decrement}
            disabled={item.qty <= 1}
            className="qty-btn w-7 h-7 flex items-center justify-center flex-shrink-0"
            title="Decrease quantity"
          >
            <Minus size={11} />
          </button>
          <input
            type="number"
            min="0.01"
            step="1"
            max={item.max_stock != null ? item.max_stock : undefined}
            value={item.qty}
            onChange={e => handleQtyChange(e.target.value)}
            className={`w-12 text-center text-sm font-bold table-input ${
              isOverStock ? 'border-red-400 bg-red-50/50 dark:bg-red-950/20' : ''
            }`}
            style={{ height: '28px' }}
          />
          <button
            onClick={increment}
            disabled={item.max_stock != null && item.qty >= item.max_stock}
            className="qty-btn w-7 h-7 flex items-center justify-center flex-shrink-0"
            title="Increase quantity"
          >
            <Plus size={11} />
          </button>
        </div>
      </td>

      {/* Rate */}
      <td className="px-2 py-2.5 w-28">
        <input
          type="number"
          min="0"
          step="0.01"
          value={item.rate}
          onChange={e => updateItem(idx, 'rate', e.target.value)}
          className="table-input w-full font-medium"
          style={{ height: '28px' }}
        />
      </td>

      {/* Discount % */}
      <td className="px-2 py-2.5 w-20">
        <input
          type="number"
          min="0"
          max="100"
          step="0.5"
          value={item.discount_pct}
          onChange={e => updateItem(idx, 'discount_pct', e.target.value)}
          className="table-input w-full font-medium"
          style={{ height: '28px' }}
        />
      </td>

      {/* Taxable */}
      <td className="px-2 py-2.5 text-right text-sm text-gray-700 dark:text-gray-300 w-28 whitespace-nowrap font-mono font-medium">
        ₹{(item.taxable || 0).toFixed(2)}
      </td>

      {/* GST */}
      <td className="px-2 py-2.5 text-right text-xs text-gray-500 w-32 whitespace-nowrap font-mono">
        {isIgst
          ? <span>IGST ₹{(item.igst || 0).toFixed(2)}</span>
          : <span className="inline-flex flex-col gap-0.5 leading-none">
              <span className="block text-[10px] text-gray-400 dark:text-gray-550">C: ₹{(item.cgst || 0).toFixed(2)}</span>
              <span className="block text-[10px] text-gray-400 dark:text-gray-550">S: ₹{(item.sgst || 0).toFixed(2)}</span>
            </span>
        }
      </td>

      {/* Total */}
      <td className="px-2 py-2.5 text-right font-bold text-sm text-gray-900 dark:text-white w-28 whitespace-nowrap font-mono">
        ₹{(item.total || 0).toFixed(2)}
      </td>

      {/* Remove */}
      <td className="px-2 py-2.5 w-12 text-center">
        <button
          onClick={() => removeItem(idx)}
          className={`p-1.5 rounded-lg transition-all duration-200 ${
            showRemove
              ? 'opacity-100 bg-red-50 dark:bg-red-900/20 text-red-500'
              : 'opacity-0 text-gray-300'
          }`}
          title="Remove item"
        >
          <Trash2 size={13} />
        </button>
      </td>
    </tr>
  )
})

export default CartItemRow
