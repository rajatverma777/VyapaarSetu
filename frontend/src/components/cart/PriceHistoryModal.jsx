import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, History } from 'lucide-react'

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
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop with higher z-index than SmartPriceAssistant (z-[100]) */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={onClose} />

      {/* Apple Liquid Glass Modal Card */}
      <div className="relative w-full max-w-3xl max-h-[88vh] flex flex-col rounded-3xl overflow-hidden card shadow-2xl animate-modal-in border border-black/[0.08] dark:border-white/[0.12] backdrop-blur-3xl z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-black/[0.02] dark:bg-white/[0.02] border-b border-black/[0.06] dark:border-white/[0.08] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 flex items-center justify-center text-[#0071e3] dark:text-[#0a84ff] border border-[#0071e3]/20 dark:border-[#0a84ff]/25 shadow-xs">
              <History size={15} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-none">Complete Price History</h3>
              <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-1 leading-none truncate max-w-[320px]">{productName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/[0.04] dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Filters Toolbar */}
        <div className="px-5 py-3 border-b border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.01] flex-shrink-0 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[170px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search customer / invoice…"
              className="input w-full pl-8 py-1 text-xs h-8"
            />
          </div>
          <input
            type="number"
            placeholder="Min ₹"
            value={minPrice}
            onChange={e => setMinPrice(e.target.value)}
            className="input w-20 py-1 text-xs h-8 text-center"
          />
          <input
            type="number"
            placeholder="Max ₹"
            value={maxPrice}
            onChange={e => setMaxPrice(e.target.value)}
            className="input w-20 py-1 text-xs h-8 text-center"
          />
          <input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="input w-32 py-1 text-xs h-8"
          />
          <input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="input w-32 py-1 text-xs h-8"
          />
          {(search || minPrice || maxPrice || fromDate || toDate) && (
            <button
              type="button"
              onClick={() => { setSearch(''); setMinPrice(''); setMaxPrice(''); setFromDate(''); setToDate('') }}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-black/[0.04] dark:bg-white/[0.08] text-gray-600 dark:text-gray-300 hover:bg-black/[0.08] dark:hover:bg-white/15 transition-all cursor-pointer h-8"
            >
              Clear
            </button>
          )}
        </div>

        {/* Table Content */}
        <div className="overflow-y-auto flex-1 min-h-[220px]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <History size={36} className="text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">No records match the filter criteria</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white/95 dark:bg-[#121316]/95 backdrop-blur border-b border-black/[0.06] dark:border-white/[0.08] z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left font-bold text-gray-500 uppercase tracking-wider text-[10px]">Date</th>
                  <th className="px-4 py-2.5 text-left font-bold text-gray-500 uppercase tracking-wider text-[10px]">Invoice</th>
                  <th className="px-4 py-2.5 text-left font-bold text-gray-500 uppercase tracking-wider text-[10px]">Customer</th>
                  <th className="px-4 py-2.5 text-right font-bold text-gray-500 uppercase tracking-wider text-[10px]">Qty</th>
                  <th className="px-4 py-2.5 text-right font-bold text-gray-500 uppercase tracking-wider text-[10px]">Disc%</th>
                  <th className="px-4 py-2.5 text-right font-bold text-gray-500 uppercase tracking-wider text-[10px]">Price</th>
                  <th className="px-4 py-2.5 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
                {filtered.map((r, i) => (
                  <tr key={r.id || i} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.04] transition-colors">
                    <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {formatDate(r.sale_date)}
                      {r.days_ago !== null && r.days_ago !== undefined && (
                        <span className="text-gray-400 ml-1 text-[10px]">({r.days_ago}d ago)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-medium text-[#0071e3] dark:text-[#0a84ff]">{r.invoice_number}</td>
                    <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200 font-medium">{r.customer_name || 'Walk-in'}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300 font-semibold">{r.quantity}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{r.discount_percent > 0 ? `${r.discount_percent}%` : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-bold font-mono text-gray-900 dark:text-white">₹{(r.rate || 0).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => { onApplyPrice(r.rate); onClose(); }}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 text-[#0071e3] dark:text-[#0a84ff] border border-[#0071e3]/20 dark:border-[#0a84ff]/25 hover:bg-[#0071e3]/20 transition-all cursor-pointer whitespace-nowrap"
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
        <div className="px-5 py-3 border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.02] flex-shrink-0 flex justify-between items-center">
          <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{filtered.length} record{filtered.length !== 1 ? 's' : ''} shown</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-black/[0.04] dark:bg-white/[0.08] text-gray-700 dark:text-gray-200 hover:bg-black/[0.08] dark:hover:bg-white/15 transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
