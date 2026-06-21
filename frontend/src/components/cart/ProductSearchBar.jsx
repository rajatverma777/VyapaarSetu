import { useRef, useState, useEffect, useCallback } from 'react'
import { Search, Barcode, X, Package, AlertCircle } from 'lucide-react'
import { productAPI, inventoryAPI } from '../../services/api'

const BARCODE_REGEX = /^\d{6,14}$/

export default function ProductSearchBar({ onSelect, onBatchSelect, autoFocus = true, inputRef: extRef }) {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState([])
  const [loading, setLoading]     = useState(false)
  const [focused, setFocused]     = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [barcodeMode, setBarcodeMode] = useState(false)
  const internalRef = useRef()
  const inputRef = extRef || internalRef
  const dropdownRef = useRef()
  const debounceRef = useRef()
  const listRefs = useRef([])

  // Auto-focus
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const runSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); setLoading(false); return }
    setLoading(true)
    try {
      // Barcode detection — pure digits 6-14 chars
      if (BARCODE_REGEX.test(q.trim())) {
        setBarcodeMode(true)
        const { data } = await productAPI.getByBarcode(q.trim())
        if (data) {
          // Direct add on barcode match
          handleSelect(data)
          setQuery('')
          return
        }
      } else {
        setBarcodeMode(false)
      }
      const { data } = await productAPI.search(q.trim(), 30)
      setResults(data || [])
      setActiveIdx(-1)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)
    setBarcodeMode(false)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(() => runSearch(val), 80)
  }

  const handleSelect = useCallback(async (product) => {
    setQuery('')
    setResults([])
    setActiveIdx(-1)
    inputRef.current?.focus()

    // Check if product has multiple batches → show batch picker
    try {
      const { data } = await inventoryAPI.batches({ product_id: product.id, limit: 50 })
      const batches = (data?.items || []).filter(b => (b.current_stock || 0) > 0)
      if (batches.length > 1) {
        onBatchSelect?.(product, batches)
        return
      }
      if (batches.length === 1) {
        onSelect(product, batches[0])
        return
      }
    } catch { /* no batches — proceed */ }

    onSelect(product, null)
  }, [onSelect, onBatchSelect])

  const handleKeyDown = (e) => {
    if (!focused || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = Math.min(activeIdx + 1, results.length - 1)
      setActiveIdx(next)
      listRefs.current[next]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = Math.max(activeIdx - 1, 0)
      setActiveIdx(prev)
      listRefs.current[prev]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault()
      handleSelect(results[activeIdx])
    } else if (e.key === 'Escape') {
      setResults([])
      setActiveIdx(-1)
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (!dropdownRef.current?.contains(e.target) && !inputRef.current?.contains(e.target)) {
        setResults([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const getStockColor = (stock) => {
    if (stock <= 0) return 'text-red-500'
    if (stock <= 5) return 'text-orange-500'
    return 'text-emerald-600 dark:text-emerald-400'
  }

  const getExpiryColor = (expiry) => {
    if (!expiry) return ''
    const months = (new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24 * 30)
    if (months < 0) return 'text-red-600'
    if (months < 3) return 'text-orange-500'
    return 'text-gray-400'
  }

  return (
    <div className="relative w-full">
      {/* Search Input */}
      <div className={`relative flex items-center transition-all duration-200 ${focused ? 'ring-2 ring-indigo-500/30 rounded-[13px]' : ''}`}>
        <div className="absolute left-3.5 text-gray-400 pointer-events-none">
          {loading
            ? <div className="w-4 h-4 border-2 border-indigo-400/40 border-t-indigo-500 rounded-full animate-spin" />
            : barcodeMode
            ? <Barcode size={16} className="text-indigo-500" />
            : <Search size={16} />
          }
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Search product by name, SKU, barcode… (F2)"
          className="input pl-10 pr-10 py-3 text-sm font-medium"
          autoComplete="off"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); inputRef.current?.focus() }}
            className="absolute right-3 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-[16px] overflow-hidden shadow-2xl border border-white/30 dark:border-white/10 max-h-80 overflow-y-auto"
          style={{
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(30px) saturate(180%)',
          }}
        >
          {results.map((p, i) => (
            <button
              key={p.id}
              ref={el => listRefs.current[i] = el}
              type="button"
              onClick={() => handleSelect(p)}
              className={`w-full px-4 py-2.5 text-left flex items-center gap-3 border-b border-gray-100/80 last:border-0 transition-colors duration-100 ${
                i === activeIdx ? 'bg-indigo-50/90 dark:bg-indigo-900/30' : 'hover:bg-gray-50/80'
              }`}
            >
              {/* Product icon */}
              <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                p.current_stock <= 0
                  ? 'bg-red-100 text-red-500'
                  : 'bg-indigo-100 text-indigo-600'
              }`}>
                {p.current_stock <= 0 ? <AlertCircle size={14} /> : <Package size={14} />}
              </div>

              {/* Main info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                  {p.brand && (
                    <span className="text-[10px] text-indigo-500 font-medium bg-indigo-50 px-1.5 py-0.5 rounded-md flex-shrink-0">{p.brand}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {p.sku && <span className="text-[10px] text-gray-400 font-mono">SKU: {p.sku}</span>}
                  {p.batch_no && <span className="text-[10px] text-gray-400">Batch: {p.batch_no}</span>}
                  {p.expiry_date && (
                    <span className={`text-[10px] font-medium ${getExpiryColor(p.expiry_date)}`}>
                      Exp: {new Date(p.expiry_date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400">GST {p.gst_rate || 0}%</span>
                </div>
              </div>

              {/* Prices + stock */}
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-indigo-600">₹{(p.selling_price || 0).toFixed(2)}</p>
                <p className={`text-[11px] font-medium ${getStockColor(p.current_stock)}`}>
                  Stock: {p.current_stock ?? 0} {p.unit || ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Empty state when typing but no results */}
      {focused && query.length >= 2 && results.length === 0 && !loading && (
        <div
          className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-[16px] overflow-hidden shadow-xl border border-white/30 dark:border-white/10"
          style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(30px)' }}
        >
          <div className="px-4 py-6 text-center">
            <Package size={24} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No products found for <strong>"{query}"</strong></p>
            <p className="text-xs text-gray-400 mt-1">Try a different name, SKU, or barcode</p>
          </div>
        </div>
      )}
    </div>
  )
}
