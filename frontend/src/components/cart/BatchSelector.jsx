import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Calendar, Package, CheckCircle2, AlertTriangle } from 'lucide-react'

function getDaysToExpiry(expiry) {
  if (!expiry) return null
  return Math.floor((new Date(expiry) - new Date()) / 86400000)
}

function getExpiryBadge(days) {
  if (days === null) return null
  if (days < 0) return { label: 'Expired', cls: 'bg-red-100 text-red-600 dark:bg-red-900/30' }
  if (days < 30) return { label: `${days}d left`, cls: 'bg-red-100 text-red-600 dark:bg-red-900/30' }
  if (days < 90) return { label: `${days}d left`, cls: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30' }
  const months = Math.floor(days / 30)
  return { label: `${months}mo left`, cls: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30' }
}

export default function BatchSelector({ product, batches, onSelect, onClose }) {
  const [selectedBatch, setSelectedBatch] = useState(batches[0] || null)

  if (!product || !batches?.length) return null

  const handleConfirm = () => {
    if (selectedBatch) onSelect(product, selectedBatch)
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg rounded-2xl shadow-2xl border border-gray-200/50 dark:border-white/10 overflow-hidden animate-modal-in bg-white/95 dark:bg-[#161720]/95 text-gray-900 dark:text-gray-100 backdrop-blur-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70 dark:border-white/10">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Select Batch</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{product.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-950/40 px-2 py-1 rounded-lg font-medium">
              FEFO recommended
            </span>
            <button onClick={onClose} className="btn-icon w-7 h-7 p-1 text-gray-400 dark:text-gray-500 hover:dark:text-gray-300">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Batch List */}
        <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
          {batches.map((batch, i) => {
            const days = getDaysToExpiry(batch.expiry)
            const badge = getExpiryBadge(days)
            const isSelected = selectedBatch?.batch_no === batch.batch_no
            const isFirst = i === 0

            return (
              <button
                key={batch.batch_no || i}
                type="button"
                onClick={() => setSelectedBatch(batch)}
                className={`w-full rounded-xl border-2 px-4 py-3 text-left transition-all duration-150 ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/40'
                    : 'border-transparent bg-gray-50/80 hover:border-gray-200 hover:bg-gray-100/60 dark:bg-white/5 dark:hover:bg-white/10'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900 dark:text-white">
                        {batch.batch_no || `Batch ${i + 1}`}
                      </span>
                      {isFirst && (
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                          ✓ FEFO First
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {batch.expiry && (
                        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Calendar size={11} />
                          {new Date(batch.expiry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <Package size={11} />
                        {batch.current_stock ?? 0} in stock
                      </span>
                      {batch.purchase_price > 0 && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          Cost ₹{(batch.purchase_price || 0).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {badge && (
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg ${badge.cls}`}>
                        {badge.label}
                      </span>
                    )}
                    {days !== null && days < 0 && (
                      <AlertTriangle size={14} className="text-red-500" />
                    )}
                    {isSelected && (
                      <CheckCircle2 size={18} className="text-indigo-600 dark:text-indigo-400" />
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200/70 dark:border-white/10 flex items-center justify-between gap-3">
          <button onClick={onClose} className="btn-secondary text-sm">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedBatch}
            className="btn-primary text-sm flex-1 justify-center"
          >
            Add {selectedBatch ? `(${selectedBatch.batch_no || 'Batch'})` : ''}
          </button>
        </div>
      </div>
    </div>
  , document.body)
}
