import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, ExternalLink } from 'lucide-react'

/**
 * PriceHistoryModal
 * Full price history modal for a product — filterable table.
 * Props:
 *   open            – boolean
 *   onClose         – () => void
 *   productName     – string
 *   globalHistory   – array of price records from API
 *   onApplyPrice    – (rate: number) => void  — click to reuse a price
 */
export default function PriceHistoryModal({ open, onClose, productName, globalHistory = [], onApplyPrice }) {
  const [search, setSearch]     = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]     = useState('')

  const filtered = useMemo(() => {
    return globalHistory.filter(r => {
      if (search && !r.customer_name?.toLowerCase().includes(search.toLowerCase()) &&
          !r.invoice_number?.toLowerCase().includes(search.toLowerCase())) return false
      if (minPrice && r.rate < parseFloat(minPrice)) return false
      if (maxPrice && r.rate > parseFloat(maxPrice)) return false
      if (fromDate && r.sale_date && r.sale_date < fromDate) return false
      if (toDate && r.sale_date && r.sale_date > toDate + 'T23:59:59') return false
      return true
    })
  }, [globalHistory, search, minPrice, maxPrice, fromDate, toDate])

  if (!open) return null

  const formatDate = (iso) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return iso }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#151922] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Complete Price History</h3>
            <p className="text-xs text-gray-500 mt-0.5">{productName}</p>
          </div>
          <button onClick={onClose} className="btn-icon text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={18} />
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-3 border-b border-gray-100 dark:border-white/5 flex-shrink-0 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Customer / Invoice…"
              className="input w-full pl-8 py-1.5 text-xs h-8"
            />
          </div>
          <input
            type="number" placeholder="Min ₹" value={minPrice}
            onChange={e => setMinPrice(e.target.value)}
            className="input w-24 py-1.5 text-xs h-8"
          />
          <input
            type="number" placeholder="Max ₹" value={maxPrice}
            onChange={e => setMaxPrice(e.target.value)}
            className="input w-24 py-1.5 text-xs h-8"
          />
          <input
            type="date" value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="input w-36 py-1.5 text-xs h-8"
          />
          <input
            type="date" value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="input w-36 py-1.5 text-xs h-8"
          />
          {(search || minPrice || maxPrice || fromDate || toDate) && (
            <button
              onClick={() => { setSearch(''); setMinPrice(''); setMaxPrice(''); setFromDate(''); setToDate('') }}
              className="btn-secondary py-1.5 text-xs h-8"
            >
              Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <p className="text-sm">No records match the filters</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/80 backdrop-blur">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoice</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Disc%</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                  <th className="px-4 py-2.5 w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                {filtered.map((r, i) => (
                  <tr key={r.id || i} className="hover:bg-indigo-50/40 dark:hover:bg-white/5 transition-colors">
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                      {formatDate(r.sale_date)}
                      {r.days_ago !== null && r.days_ago !== undefined && (
                        <span className="text-gray-400 ml-1">({r.days_ago}d ago)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-primary-600 dark:text-primary-400">{r.invoice_number}</td>
                    <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200 text-xs">{r.customer_name || 'Walk-in'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300 text-xs">{r.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500 text-xs">{r.discount_percent > 0 ? `${r.discount_percent}%` : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-white">₹{(r.rate || 0).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => { onApplyPrice(r.rate); onClose(); }}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-medium whitespace-nowrap"
                      >
                        Use Price
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 dark:border-white/5 flex-shrink-0 flex justify-between items-center">
          <span className="text-xs text-gray-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''} shown</span>
          <button onClick={onClose} className="btn-secondary text-xs py-1.5">Close</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
