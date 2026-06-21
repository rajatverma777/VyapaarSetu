import { useState, useCallback } from 'react'
import { User, X, CreditCard, AlertTriangle, TrendingUp, Phone, Star } from 'lucide-react'
import { customerAPI } from '../../services/api'
import { useCart } from './CartContext'
import { INDIAN_STATES } from '../../services/constants'

export default function CustomerPanel({ company, onCustomerChange, inputRef: extInputRef }) {
  const { activeCart, setCustomer, setIsIgst } = useCart()
  const { customer } = activeCart

  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const debounceRef = {}

  const autoSetIgst = useCallback((cust) => {
    if (!company || !cust) return
    let customerStateCode = ''
    if (cust.gstin?.length >= 2) {
      customerStateCode = cust.gstin.slice(0, 2)
    } else if (cust.address?.state) {
      const matched = INDIAN_STATES.find(s => s.name === cust.address.state)
      if (matched) customerStateCode = matched.code
    }
    const companyStateCode = company.state_code || ''
    if (customerStateCode && companyStateCode) {
      setIsIgst(customerStateCode !== companyStateCode)
    }
  }, [company, setIsIgst])

  const handleSearch = async (q) => {
    setSearchQuery(q)
    if (!q.trim()) { setResults([]); return }
    clearTimeout(debounceRef.t)
    debounceRef.t = setTimeout(async () => {
      setSearching(true)
      try {
        const { data } = await customerAPI.list({ search: q, limit: 30 })
        setResults(data.items || [])
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 100)
  }

  const handleSelect = (cust) => {
    setCustomer(cust)
    autoSetIgst(cust)
    onCustomerChange?.(cust)
    setSearchQuery('')
    setResults([])
  }

  const handleRemove = () => {
    setCustomer(null)
    setSearchQuery('')
    setResults([])
  }

  // Credit limit check
  const cartTotal = activeCart.items.reduce((s, i) => s + (i.total || 0), 0)
  const outstanding = customer?.current_balance || 0
  const creditLimit = customer?.credit_limit || 0
  const totalExposure = outstanding + cartTotal
  const creditExceeded = creditLimit > 0 && totalExposure > creditLimit

  const getPriceLevelBadge = (level) => {
    const map = {
      retail: { label: 'Retail', cls: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30' },
      wholesale: { label: 'Wholesale', cls: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30' },
      distributor: { label: 'Distributor', cls: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30' },
    }
    return map[level] || map.retail
  }

  return (
    <div className="relative">
      {customer ? (
        /* ── Customer Selected ─────────────────────────────── */
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <span className="text-white font-bold text-sm">{customer.name?.charAt(0)?.toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-white text-sm leading-tight">{customer.name}</span>
                  {customer.price_level && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${getPriceLevelBadge(customer.price_level).cls}`}>
                      {getPriceLevelBadge(customer.price_level).label}
                    </span>
                  )}
                </div>
                {customer.mobile && (
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Phone size={10} /> {customer.mobile}
                  </p>
                )}
                {customer.gstin && (
                  <p className="text-[10px] font-mono text-gray-400 mt-0.5">GSTIN: {customer.gstin}</p>
                )}
              </div>
            </div>
            <button onClick={handleRemove} className="btn-icon text-gray-400 flex-shrink-0 w-7 h-7 p-1">
              <X size={14} />
            </button>
          </div>

          {/* Balance & Credit Limit */}
          <div className="grid grid-cols-2 gap-2 mt-1">
            {outstanding !== 0 && (
              <div className="bg-orange-50/80 dark:bg-orange-900/20 rounded-xl p-2.5">
                <p className="text-[9px] text-orange-600 font-semibold uppercase tracking-wide">Outstanding</p>
                <p className="text-sm font-bold text-orange-700 dark:text-orange-400">
                  ₹{outstanding.toFixed(2)}
                </p>
              </div>
            )}
            {creditLimit > 0 && (
              <div className={`rounded-xl p-2.5 ${creditExceeded ? 'bg-red-50 dark:bg-red-900/20' : 'bg-emerald-50/80 dark:bg-emerald-900/20'}`}>
                <p className={`text-[9px] font-semibold uppercase tracking-wide ${creditExceeded ? 'text-red-600' : 'text-emerald-600'}`}>
                  Credit Limit
                </p>
                <p className={`text-sm font-bold ${creditExceeded ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                  ₹{creditLimit.toFixed(2)}
                </p>
              </div>
            )}
          </div>

          {/* Credit Exceeded Warning */}
          {creditExceeded && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl px-3 py-2">
              <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
              <p className="text-xs font-medium text-red-700 dark:text-red-400">
                Credit limit exceeded! Total exposure ₹{totalExposure.toFixed(2)}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* ── Customer Search ───────────────────────────────── */
        <div className="relative">
          <div className="input flex items-center gap-2.5 py-0 pl-3.5 pr-2 hover:border-indigo-400/40 focus-within:border-indigo-500/50 focus-within:ring-2 focus-within:ring-indigo-500/20">
            <User size={15} className="text-indigo-400/70 dark:text-indigo-300/60 flex-shrink-0" />
            <div className="w-[1px] h-4 bg-gray-200 dark:bg-white/10 flex-shrink-0" />
            <input
              ref={extInputRef}
              type="text"
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search customer (F4) or leave as Walk-in…"
              className="flex-1 py-2.5 text-sm bg-transparent border-0 outline-none focus:ring-0 focus:outline-none text-gray-900 dark:text-white placeholder-gray-400/70 dark:placeholder-indigo-200/35"
              autoComplete="off"
            />
            {searching && (
              <div className="w-4 h-4 border-2 border-indigo-400/40 border-t-indigo-500 rounded-full animate-spin flex-shrink-0" />
            )}
          </div>

          {results.length > 0 && (
            <div
              className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-[16px] overflow-hidden shadow-2xl border border-gray-200/60 dark:border-white/10 max-h-60 overflow-y-auto bg-white/95 dark:bg-[#161720]/95 text-gray-900 dark:text-gray-100 backdrop-blur-2xl"
            >
              {results.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c)}
                  className="w-full px-4 py-2.5 text-left flex items-center gap-3 border-b border-gray-100 dark:border-white/5 last:border-0 hover:bg-indigo-50/60 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">{c.name?.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{c.mobile || c.gstin || 'No contact'}</p>
                  </div>
                  {(c.current_balance || 0) > 0 && (
                    <span className="text-[10px] font-medium text-orange-500 flex-shrink-0">
                      ₹{(c.current_balance || 0).toFixed(0)} due
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
