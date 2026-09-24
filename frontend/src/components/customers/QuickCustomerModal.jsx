import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, User, Phone, MessageCircle, CreditCard,
  Plus, ArrowRight, Check, X, BookOpen, AlertCircle,
  CheckCircle2, IndianRupee, ExternalLink, RefreshCw,
  Wallet, ChevronRight, Sparkles, Building2, MapPin
} from 'lucide-react'
import toast from 'react-hot-toast'
import { customerAPI, paymentAPI } from '../../services/api'
import { Modal, Spinner, Amount } from '../ui'

// Color gradients for avatars
const AVATAR_GRADIENTS = [
  ['#0071e3', '#409cff'],
  ['#34c759', '#30d158'],
  ['#5856d6', '#7d7aff'],
  ['#ff9500', '#ffaa33'],
  ['#ff2d55', '#ff6482'],
  ['#30b0c7', '#66d4cf'],
  ['#af52de', '#c77dff'],
]

function getAvatarColors(name = '') {
  const code = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0)
  return AVATAR_GRADIENTS[code % AVATAR_GRADIENTS.length]
}

function getInitials(name = '') {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

export default function QuickCustomerModal({ open, onClose }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('search') // 'search' | 'add'
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [duesOnly, setDuesOnly] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  // Ledger state
  const [ledger, setLedger] = useState(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [showLedger, setShowLedger] = useState(false)

  // Quick Payment state
  const [showPayment, setShowPayment] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMode, setPayMode] = useState('cash')
  const [payNotes, setPayNotes] = useState('')
  const [paying, setPaying] = useState(false)

  // New Customer Form state
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    mobile: '',
    city: '',
    opening_balance: 0,
    credit_limit: 0,
    price_level: 'retail'
  })
  const [savingCustomer, setSavingCustomer] = useState(false)

  const searchInputRef = useRef(null)

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 150)
      loadCustomers('')
    } else {
      setSelectedCustomer(null)
      setShowLedger(false)
      setShowPayment(false)
      setSearch('')
    }
  }, [open])

  // Debounced search
  const loadCustomers = useCallback(async (query) => {
    setLoading(true)
    try {
      const { data } = await customerAPI.list({
        search: query.trim() || undefined,
        limit: 25
      })
      setCustomers(data.items || [])
    } catch {
      // silent fallback
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (open) loadCustomers(search)
    }, 200)
    return () => clearTimeout(timer)
  }, [search, open, loadCustomers])

  // Fetch ledger for selected customer
  const handleSelectCustomer = async (c) => {
    setSelectedCustomer(c)
    setShowLedger(false)
    setShowPayment(false)
    setPayAmount(c.current_balance > 0 ? String(c.current_balance) : '')
  }

  const handleOpenLedger = async () => {
    if (!selectedCustomer) return
    setShowLedger(true)
    setLedgerLoading(true)
    try {
      const { data } = await customerAPI.ledger(selectedCustomer.id)
      setLedger(data)
    } catch {
      toast.error('Failed to load ledger')
    } finally {
      setLedgerLoading(false)
    }
  }

  // 1-Click: Create New Bill for Customer
  const handleCreateSale = (cust = selectedCustomer) => {
    if (!cust) return
    try {
      sessionStorage.setItem('pending_sale_customer', JSON.stringify(cust))
    } catch {}
    onClose()
    navigate('/sales/new')
  }

  // 1-Click: WhatsApp Reminder
  const handleWhatsApp = (cust = selectedCustomer) => {
    if (!cust) return
    const rawMobile = cust.mobile?.replace(/\D/g, '') || ''
    if (!rawMobile) {
      toast.error('No mobile number registered for this customer')
      return
    }
    const phoneWithCountry = rawMobile.length === 10 ? `91${rawMobile}` : rawMobile
    const balance = cust.current_balance || 0
    const msg = balance > 0
      ? `Namaste ${cust.name}, aapka humare yahan ₹${balance.toLocaleString('en-IN')} ka hisaab/due pending hai. Kripya check karke clear karein. Dhanyawad!`
      : `Namaste ${cust.name}, aapka account completely clear hai. Shukriya!`
    
    window.open(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // 1-Click: Quick Payment Collection
  const handleSubmitPayment = async (e) => {
    e?.preventDefault()
    if (!selectedCustomer) return
    const amt = parseFloat(payAmount)
    if (!amt || amt <= 0) {
      toast.error('Please enter a valid payment amount')
      return
    }
    setPaying(true)
    try {
      await paymentAPI.create({
        party_type: 'customer',
        party_id: selectedCustomer.id,
        amount: amt,
        payment_mode: payMode,
        notes: payNotes || 'Quick Payment Collection via Customer Modal'
      })
      toast.success(`Payment of ₹${amt.toLocaleString('en-IN')} received!`)
      setShowPayment(false)
      // Refresh current customer
      const { data } = await customerAPI.getById(selectedCustomer.id)
      setSelectedCustomer(data)
      loadCustomers(search)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to record payment')
    } finally {
      setPaying(false)
    }
  }

  // Handle Quick Add Customer
  const handleSaveCustomer = async (e) => {
    e.preventDefault()
    if (!newCustomer.name.trim()) {
      toast.error('Customer name is required')
      return
    }
    setSavingCustomer(true)
    try {
      const payload = {
        name: newCustomer.name.trim(),
        mobile: newCustomer.mobile.trim() || undefined,
        address: { city: newCustomer.city.trim() || '' },
        credit_limit: parseFloat(newCustomer.credit_limit) || 0,
        opening_balance: parseFloat(newCustomer.opening_balance) || 0,
        price_level: newCustomer.price_level || 'retail',
        is_active: true
      }
      const { data } = await customerAPI.create(payload)
      toast.success(`Customer "${data.name}" created!`)
      setNewCustomer({
        name: '', mobile: '', city: '',
        opening_balance: 0, credit_limit: 0, price_level: 'retail'
      })
      setTab('search')
      setSelectedCustomer(data)
      loadCustomers('')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create customer')
    } finally {
      setSavingCustomer(false)
    }
  }

  const displayedList = duesOnly
    ? customers.filter(c => (c.current_balance || 0) > 0)
    : customers

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customer Hub"
      size="xl"
      hideHeader
    >
      <div className="flex flex-col h-[600px] -m-6 overflow-hidden">
        {/* Apple Crystal Modal Header */}
        <div className="px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#5856d6] to-[#7d7aff] flex items-center justify-center text-white shadow-lg shadow-[#5856d6]/25">
              <User size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">
                  Customer Hub & Khata
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#5856d6]/10 text-[#5856d6] dark:text-[#7d7aff] border border-[#5856d6]/20">
                  INSTANT ACTIONS
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Search dues, 1-click billing, WhatsApp balance reminder & payments
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab switch */}
            <div className="p-1 bg-black/[0.04] dark:bg-white/[0.06] rounded-xl border border-black/[0.05] dark:border-white/[0.08] inline-flex">
              <button
                type="button"
                onClick={() => setTab('search')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === 'search'
                    ? 'bg-white dark:bg-white/15 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Search & Khata
              </button>
              <button
                type="button"
                onClick={() => setTab('add')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                  tab === 'add'
                    ? 'bg-white dark:bg-white/15 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <Plus size={13} /> Add New
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-900 dark:hover:text-white bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] border border-black/[0.04] dark:border-white/[0.08] transition-all ml-2"
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        {tab === 'search' ? (
          <div className="flex-1 flex overflow-hidden">
            {/* LEFT PANE: Search & List */}
            <div className="w-full sm:w-[320px] md:w-[350px] border-r border-black/[0.06] dark:border-white/[0.08] flex flex-col shrink-0 bg-black/[0.01] dark:bg-white/[0.01]">
              {/* Search Bar & Filter */}
              <div className="p-3 border-b border-black/[0.06] dark:border-white/[0.08] space-y-2">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    ref={searchInputRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, phone, city…"
                    className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-white dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.12] text-gray-900 dark:text-white focus:outline-none focus:border-[#5856d6] focus:ring-2 focus:ring-[#5856d6]/20 transition-all placeholder:text-gray-400"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    {displayedList.length} accounts found
                  </span>
                  <button
                    type="button"
                    onClick={() => setDuesOnly(prev => !prev)}
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full transition-all border ${
                      duesOnly
                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
                        : 'bg-black/[0.03] dark:bg-white/[0.04] border-black/[0.04] dark:border-white/[0.06] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {duesOnly ? '✓ Dues Only' : 'Filter Dues'}
                  </button>
                </div>
              </div>

              {/* Customer List */}
              <div className="flex-1 overflow-y-auto divide-y divide-black/[0.04] dark:divide-white/[0.04] p-1.5 space-y-1">
                {loading && customers.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
                    <Spinner size={20} />
                    <span className="text-xs">Searching accounts...</span>
                  </div>
                ) : displayedList.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 space-y-3 px-4">
                    <User size={32} className="mx-auto text-gray-300 dark:text-gray-600" />
                    <p className="text-xs">No matching customer accounts</p>
                    <button
                      type="button"
                      onClick={() => setTab('add')}
                      className="btn-primary text-xs py-1.5 px-3 mx-auto flex items-center gap-1.5"
                    >
                      <Plus size={13} /> Add "{search}"
                    </button>
                  </div>
                ) : (
                  displayedList.map((c) => {
                    const isSelected = selectedCustomer?.id === c.id
                    const [c1, c2] = getAvatarColors(c.name)
                    const hasDues = (c.current_balance || 0) > 0

                    return (
                      <div
                        key={c.id}
                        onClick={() => handleSelectCustomer(c)}
                        className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 group border ${
                          isSelected
                            ? 'bg-[#5856d6]/10 dark:bg-[#5856d6]/20 border-[#5856d6]/40 shadow-sm'
                            : 'hover:bg-black/[0.03] dark:hover:bg-white/[0.04] border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Mini Avatar */}
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm"
                            style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
                          >
                            {getInitials(c.name)}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">
                              {c.name}
                            </h4>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                              {c.mobile || c.address?.city || 'No contact'}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <p className={`text-xs font-bold font-mono ${
                            hasDues
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}>
                            ₹{Math.abs(c.current_balance || 0).toLocaleString('en-IN')}
                          </p>
                          <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded-md ${
                            hasDues
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {hasDues ? 'DUE' : 'CLEAR'}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* RIGHT PANE: Customer Detail & Instant Actions */}
            <div className="flex-1 flex flex-col overflow-y-auto bg-white/40 dark:bg-black/20 p-5">
              {selectedCustomer ? (
                <div className="space-y-5 max-w-xl mx-auto w-full">
                  {/* Customer Card */}
                  <div className="card p-5 relative overflow-hidden bg-gradient-to-br from-white/80 via-white/40 to-transparent dark:from-white/[0.06] dark:via-white/[0.02] dark:to-transparent border border-black/[0.08] dark:border-white/[0.10] rounded-2xl shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5">
                        {/* Dynamic Avatar */}
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-extrabold text-xl shadow-lg shrink-0"
                          style={{
                            background: `linear-gradient(135deg, ${getAvatarColors(selectedCustomer.name)[0]}, ${getAvatarColors(selectedCustomer.name)[1]})`
                          }}
                        >
                          {getInitials(selectedCustomer.name)}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
                              {selectedCustomer.name}
                            </h3>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0071e3]/10 text-[#0071e3] dark:text-[#0a84ff] border border-[#0071e3]/20 uppercase">
                              {selectedCustomer.price_level || 'Retail'}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500 dark:text-gray-400 font-medium">
                            {selectedCustomer.mobile && (
                              <span className="flex items-center gap-1">
                                <Phone size={12} className="text-gray-400" />
                                {selectedCustomer.mobile}
                              </span>
                            )}
                            {selectedCustomer.address?.city && (
                              <span className="flex items-center gap-1">
                                <MapPin size={12} className="text-gray-400" />
                                {selectedCustomer.address.city}
                              </span>
                            )}
                            {selectedCustomer.gstin && (
                              <span className="flex items-center gap-1 text-[11px] font-mono">
                                GST: {selectedCustomer.gstin}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Outstanding Dues Pill */}
                      <div className="sm:text-right bg-black/[0.02] dark:bg-white/[0.03] p-3 rounded-xl border border-black/[0.04] dark:border-white/[0.06] shrink-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          Pending Balance
                        </span>
                        <div className={`text-xl font-extrabold font-mono mt-0.5 ${
                          (selectedCustomer.current_balance || 0) > 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          ₹{(selectedCustomer.current_balance || 0).toLocaleString('en-IN')}
                        </div>
                        <p className="text-[10px] text-gray-400 font-medium">
                          Credit limit: ₹{(selectedCustomer.credit_limit || 0).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Primary 1-Click Action Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {/* Action 1: Create Bill */}
                    <button
                      type="button"
                      onClick={() => handleCreateSale(selectedCustomer)}
                      className="p-3 rounded-2xl bg-[#0071e3] hover:bg-[#0077ed] text-white flex flex-col items-center justify-center gap-1.5 shadow-md shadow-[#0071e3]/25 transition-transform active:scale-[0.98] group cursor-pointer text-center"
                    >
                      <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <ArrowRight size={16} />
                      </div>
                      <span className="text-xs font-bold leading-tight">Create Bill</span>
                      <span className="text-[9px] text-blue-100 font-medium">New invoice</span>
                    </button>

                    {/* Action 2: WhatsApp Reminder */}
                    <button
                      type="button"
                      onClick={() => handleWhatsApp(selectedCustomer)}
                      className="p-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white flex flex-col items-center justify-center gap-1.5 shadow-md shadow-emerald-600/25 transition-transform active:scale-[0.98] group cursor-pointer text-center"
                    >
                      <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <MessageCircle size={16} />
                      </div>
                      <span className="text-xs font-bold leading-tight">WhatsApp</span>
                      <span className="text-[9px] text-emerald-100 font-medium">Send balance</span>
                    </button>

                    {/* Action 3: Quick Payment */}
                    <button
                      type="button"
                      onClick={() => setShowPayment(prev => !prev)}
                      className={`p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-transform active:scale-[0.98] group cursor-pointer text-center border ${
                        showPayment
                          ? 'bg-amber-500 text-white border-amber-600 shadow-md shadow-amber-500/25'
                          : 'bg-white dark:bg-white/[0.05] border-black/[0.08] dark:border-white/[0.10] text-gray-800 dark:text-gray-200 hover:border-amber-500/40'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${
                        showPayment ? 'bg-white/20 text-white' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}>
                        <Wallet size={16} />
                      </div>
                      <span className="text-xs font-bold leading-tight">Collect ₹</span>
                      <span className="text-[9px] text-gray-400 font-medium">Record payment</span>
                    </button>

                    {/* Action 4: Ledger / Statement */}
                    <button
                      type="button"
                      onClick={handleOpenLedger}
                      className={`p-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-transform active:scale-[0.98] group cursor-pointer text-center border ${
                        showLedger
                          ? 'bg-purple-600 text-white border-purple-700 shadow-md shadow-purple-600/25'
                          : 'bg-white dark:bg-white/[0.05] border-black/[0.08] dark:border-white/[0.10] text-gray-800 dark:text-gray-200 hover:border-purple-500/40'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${
                        showLedger ? 'bg-white/20 text-white' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                      }`}>
                        <BookOpen size={16} />
                      </div>
                      <span className="text-xs font-bold leading-tight">Ledger</span>
                      <span className="text-[9px] text-gray-400 font-medium">View Khata</span>
                    </button>
                  </div>

                  {/* Inline Quick Payment Box */}
                  {showPayment && (
                    <form onSubmit={handleSubmitPayment} className="p-4 rounded-2xl bg-amber-500/[0.06] border border-amber-500/30 space-y-3 animate-modal-in">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                          <Wallet size={14} /> Record Payment Received
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowPayment(false)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">
                            Amount (₹)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={payAmount}
                            onChange={(e) => setPayAmount(e.target.value)}
                            placeholder="0.00"
                            className="input w-full font-bold text-sm py-1.5 px-3 mt-1"
                            required
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">
                            Payment Mode
                          </label>
                          <select
                            value={payMode}
                            onChange={(e) => setPayMode(e.target.value)}
                            className="input w-full text-xs py-2 px-3 mt-1 font-medium capitalize"
                          >
                            <option value="cash">Cash</option>
                            <option value="upi">UPI / QR</option>
                            <option value="neft">Bank / NEFT</option>
                            <option value="cheque">Cheque</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase">
                            Notes / Reference
                          </label>
                          <input
                            type="text"
                            value={payNotes}
                            onChange={(e) => setPayNotes(e.target.value)}
                            placeholder="UTR or bill ref…"
                            className="input w-full text-xs py-1.5 px-3 mt-1"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="submit"
                          disabled={paying}
                          className="btn-primary text-xs py-1.5 px-4 rounded-xl flex items-center gap-1.5 font-bold shadow-md shadow-[#0071e3]/20"
                        >
                          {paying ? <Spinner size={14} /> : <Check size={14} />}
                          Save Receipt & Clear Due
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Inline Ledger Summary */}
                  {showLedger && (
                    <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] space-y-3 animate-modal-in">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                          <BookOpen size={14} className="text-purple-500" /> Recent Ledger Entries
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowLedger(false)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      {ledgerLoading ? (
                        <div className="py-8 flex justify-center">
                          <Spinner size={20} />
                        </div>
                      ) : !ledger?.entries?.length ? (
                        <p className="text-xs text-gray-400 text-center py-4">No ledger transactions found</p>
                      ) : (
                        <div className="overflow-x-auto max-h-48 overflow-y-auto divide-y divide-black/[0.04] dark:divide-white/[0.04] text-xs">
                          {ledger.entries.slice(0, 10).map((row, i) => (
                            <div key={i} className="py-2 flex items-center justify-between gap-2">
                              <div>
                                <p className="font-semibold text-gray-900 dark:text-white">
                                  {row.description || row.voucher_type}
                                </p>
                                <span className="text-[10px] text-gray-400">{row.date}</span>
                              </div>
                              <div className="text-right font-mono font-medium">
                                {row.debit > 0 && <span className="text-rose-500 font-bold">+₹{row.debit.toLocaleString('en-IN')}</span>}
                                {row.credit > 0 && <span className="text-emerald-500 font-bold">-₹{row.credit.toLocaleString('en-IN')}</span>}
                                <div className="text-[10px] text-gray-400">Bal: ₹{row.balance?.toLocaleString('en-IN')}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400 space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.05] dark:border-white/[0.08] flex items-center justify-center text-gray-400">
                    <User size={28} />
                  </div>
                  <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300">
                    Select a Customer from the List
                  </h4>
                  <p className="text-xs max-w-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    Click any customer to view their dues, shoot WhatsApp statements, create a bill, or record payment.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* TAB: Quick Add New Customer Form */
          <form onSubmit={handleSaveCustomer} className="flex-1 p-6 overflow-y-auto space-y-4 max-w-lg mx-auto w-full">
            <div className="space-y-1 text-center pb-2">
              <h4 className="text-base font-bold text-gray-900 dark:text-white">Quick Add New Customer</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Register a new customer account in seconds without navigating away.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Customer / Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Sharma Medical Stores"
                  className="input w-full mt-1 text-xs py-2 px-3"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Mobile Number (WhatsApp)
                  </label>
                  <input
                    type="tel"
                    value={newCustomer.mobile}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, mobile: e.target.value }))}
                    placeholder="9876543210"
                    className="input w-full mt-1 text-xs py-2 px-3"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    City / Town
                  </label>
                  <input
                    type="text"
                    value={newCustomer.city}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, city: e.target.value }))}
                    placeholder="e.g. Kanpur"
                    className="input w-full mt-1 text-xs py-2 px-3"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Opening Balance (Dues) ₹
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newCustomer.opening_balance}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, opening_balance: e.target.value }))}
                    placeholder="0"
                    className="input w-full mt-1 text-xs py-2 px-3"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Credit Limit ₹
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newCustomer.credit_limit}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, credit_limit: e.target.value }))}
                    placeholder="50000"
                    className="input w-full mt-1 text-xs py-2 px-3"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Price Tier
                </label>
                <div className="flex gap-2 mt-1">
                  {['retail', 'wholesale', 'distributor'].map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setNewCustomer(prev => ({ ...prev, price_level: tier }))}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-semibold capitalize border transition-all ${
                        newCustomer.price_level === tier
                          ? 'bg-[#0071e3] text-white border-[#0071e3] shadow-sm'
                          : 'bg-black/[0.02] dark:bg-white/[0.04] border-black/[0.08] dark:border-white/[0.08] text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTab('search')}
                className="btn-secondary text-xs py-2 px-4 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingCustomer}
                className="btn-primary text-xs py-2 px-5 rounded-xl font-bold flex items-center gap-1.5"
              >
                {savingCustomer ? <Spinner size={14} /> : <Check size={14} />}
                Create & Select Customer
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
