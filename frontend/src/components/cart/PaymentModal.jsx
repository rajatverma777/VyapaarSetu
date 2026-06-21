import { useState, useEffect } from 'react'
import { Plus, Trash2, CreditCard, Banknote, Smartphone, Building, X, CheckCircle } from 'lucide-react'

const PAYMENT_OPTIONS = [
  { value: 'cash',     label: 'Cash',          icon: Banknote },
  { value: 'upi',      label: 'UPI',           icon: Smartphone },
  { value: 'card',     label: 'Card',          icon: CreditCard },
  { value: 'neft',     label: 'Bank/NEFT',     icon: Building },
  { value: 'cheque',   label: 'Cheque',        icon: CreditCard },
  { value: 'credit',   label: 'Credit',        icon: CreditCard },
]

export default function PaymentModal({ grandTotal, initialPayments = [], onConfirm, onClose }) {
  const [rows, setRows] = useState(() => {
    if (initialPayments?.length) return initialPayments.map(p => ({ ...p }))
    return [{ mode: 'cash', amount: grandTotal > 0 ? parseFloat(grandTotal.toFixed(2)) : 0 }]
  })

  const totalPaid = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const balance = grandTotal - totalPaid
  const isFullyPaid = Math.abs(balance) < 0.01

  const addRow = () => {
    const usedModes = rows.map(r => r.mode)
    const next = PAYMENT_OPTIONS.find(o => !usedModes.includes(o.value))
    setRows(prev => [...prev, { mode: next?.value || 'upi', amount: Math.max(0, parseFloat(balance.toFixed(2))) }])
  }

  const removeRow = (i) => setRows(prev => prev.filter((_, idx) => idx !== i))

  const updateRow = (i, key, val) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: key === 'amount' ? parseFloat(val) || 0 : val } : r))
  }

  const fillBalance = (i) => {
    const othersPaid = rows.reduce((s, r, idx) => idx !== i ? s + (parseFloat(r.amount) || 0) : s, 0)
    const fill = Math.max(0, grandTotal - othersPaid)
    updateRow(i, 'amount', fill.toFixed(2))
  }

  const handleConfirm = () => {
    const validRows = rows.filter(r => parseFloat(r.amount) > 0)
    onConfirm(validRows, totalPaid)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden animate-modal-in"
        style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(40px)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/70">
          <div>
            <h3 className="text-base font-bold text-gray-900">Payment</h3>
            <p className="text-xs text-gray-500">Grand Total: <span className="font-bold text-gray-800">₹{grandTotal.toFixed(2)}</span></p>
          </div>
          <button onClick={onClose} className="btn-icon w-7 h-7 p-1 text-gray-400"><X size={16} /></button>
        </div>

        {/* Payment rows */}
        <div className="p-5 space-y-3">
          {rows.map((row, i) => {
            const opt = PAYMENT_OPTIONS.find(o => o.value === row.mode)
            const Icon = opt?.icon || CreditCard
            return (
              <div key={i} className="flex items-center gap-2">
                {/* Mode selector */}
                <div className="relative">
                  <select
                    value={row.mode}
                    onChange={e => updateRow(i, 'mode', e.target.value)}
                    className="select pr-8 pl-9 py-2.5 text-sm w-36"
                  >
                    {PAYMENT_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <Icon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>

                {/* Amount */}
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.amount}
                    onChange={e => updateRow(i, 'amount', e.target.value)}
                    className="input pl-7 py-2.5 text-sm font-semibold"
                  />
                </div>

                {/* Fill balance button */}
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => fillBalance(i)}
                    className="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors flex-shrink-0"
                    title="Fill remaining balance"
                  >
                    Fill
                  </button>
                )}

                {/* Remove row */}
                {rows.length > 1 && (
                  <button
                    onClick={() => removeRow(i)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            )
          })}

          {/* Add payment method */}
          {rows.length < PAYMENT_OPTIONS.length && (
            <button
              onClick={addRow}
              className="flex items-center gap-2 text-xs text-indigo-600 hover:text-indigo-800 font-semibold py-1 transition-colors"
            >
              <Plus size={14} />
              Add payment method (split)
            </button>
          )}

          {/* Balance summary */}
          <div className={`rounded-xl px-4 py-3 flex items-center justify-between mt-4 ${
            isFullyPaid
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40'
              : balance > 0
              ? 'bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/40'
              : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40'
          }`}>
            <div>
              <p className="text-xs font-semibold text-gray-600">Total Paid</p>
              <p className="text-xl font-bold text-gray-900">₹{totalPaid.toFixed(2)}</p>
            </div>
            <div className="text-right">
              {isFullyPaid ? (
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle size={18} />
                  <span className="text-sm font-bold">Fully Paid</span>
                </div>
              ) : balance > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-orange-600">Balance Due</p>
                  <p className="text-lg font-bold text-orange-700">₹{balance.toFixed(2)}</p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-blue-600">Change</p>
                  <p className="text-lg font-bold text-blue-700">₹{Math.abs(balance).toFixed(2)}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={rows.every(r => !(parseFloat(r.amount) > 0))}
            className="btn-success flex-1 text-sm font-bold"
          >
            {isFullyPaid ? '✓ Confirm Payment' : `Collect ₹${totalPaid.toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  )
}
