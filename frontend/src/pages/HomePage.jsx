import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  ArrowRight, ShieldCheck, Layers, FileText, Database, Users, Building2,
  BarChart3, Zap, Play, Check, Plus, Search, AlertTriangle,
  TrendingUp, Sparkles, Smartphone, RefreshCw, FileSpreadsheet,
  TrendingDown, Globe, Laptop, HelpCircle, ChevronDown, ChevronUp,
  Briefcase, Activity, ClipboardList, PackageCheck, AlertOctagon
} from 'lucide-react'
import './HomePage.css'

export default function HomePage() {
  const { token, user } = useAuth()
  const [activeTourTab, setActiveTourTab] = useState('dashboard')
  const [openFaqs, setOpenFaqs] = useState({ 0: true })
  
  // AI OCR Scan Simulator State
  const [ocrStatus, setOcrStatus] = useState('idle') // 'idle' | 'scanning' | 'success'
  const [ocrProgress, setOcrProgress] = useState(0)

  const toggleFaq = (index) => {
    setOpenFaqs(prev => ({
      ...prev,
      [index]: !prev[index]
    }))
  }

  // AI OCR Scanner Animation handler
  const handleOcrScan = () => {
    if (ocrStatus === 'scanning') return
    setOcrStatus('scanning')
    setOcrProgress(0)
  }

  useEffect(() => {
    let interval
    if (ocrStatus === 'scanning') {
      interval = setInterval(() => {
        setOcrProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval)
            setOcrStatus('success')
            return 100
          }
          return prev + 5
        })
      }, 150)
    }
    return () => clearInterval(interval)
  }, [ocrStatus])

  const ocrMockData = {
    invoice_no: 'INV-2026-8801',
    supplier: 'MedLife Distributors Ltd.',
    date: '20-06-2026',
    items: [
      { name: 'Paracetamol 500mg (Batch A9)', qty: 100, price: 1.20, total: 120.00 },
      { name: 'Amoxicillin 250mg (Batch B4)', qty: 50, price: 3.50, total: 175.00 },
      { name: 'Ibuprofen 400mg (Batch C1)', qty: 80, price: 2.10, total: 168.00 }
    ],
    cgst: 13.50,
    sgst: 13.50,
    total: 490.00
  }

  return (
    <div className="lp-body">
      {/* Background radial glowing effects */}
      <div className="lp-glow-container">
        <div className="lp-glow-1" />
        <div className="lp-glow-2" />
        
        {/* Floating Liquid Glass Bubbles */}
        <div className="lp-glass-bubble" style={{ width: '150px', height: '150px', top: '15%', left: '8%', animation: 'bubble-float-1 20s infinite ease-in-out alternate' }} />
        <div className="lp-glass-bubble" style={{ width: '220px', height: '220px', top: '55%', right: '5%', animation: 'bubble-float-2 25s infinite ease-in-out alternate' }} />
        <div className="lp-glass-bubble" style={{ width: '90px', height: '90px', top: '78%', left: '12%', animation: 'bubble-float-3 18s infinite ease-in-out alternate' }} />
      </div>

      {/* Navigation Header */}
      <header className="lp-header">
        <div className="lp-container lp-nav">
          <Link to="/" className="lp-logo">
            <div className="lp-logo-icon"><Building2 size={16} /></div>
            <span>Vyapaar Setu</span>
          </Link>
          
          <nav className="lp-nav-links">
            <a href="#features" className="lp-nav-link">Features</a>
            <a href="#tour" className="lp-nav-link">Product Tour</a>
            <a href="#ai-insights" className="lp-nav-link">AI Engine</a>
            <a href="#why-us" className="lp-nav-link">Comparison</a>
            <a href="#faqs" className="lp-nav-link">FAQ</a>
          </nav>

          <div className="lp-nav-actions">
            {token ? (
              <Link to="/dashboard" className="lp-btn-primary">
                Dashboard <ArrowRight size={16} className="lp-btn-icon-slide" />
              </Link>
            ) : (
              <>
                <Link to="/login" className="lp-nav-link font-semibold">Sign In</Link>
                <Link to="/login" state={{ registerMode: true }} className="lp-btn-primary">
                  Start <ArrowRight size={16} className="lp-btn-icon-slide" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="lp-hero">
        <div className="lp-container">
          <div className="lp-hero-tag">
            <Sparkles size={12} /> Version 1.0.0 Now Live
          </div>
          <h1 className="lp-hero-title">
            <span className="lp-gradient-text">India's Modern Business Operating System</span>
          </h1>
          <p className="lp-hero-subtitle">
            Manage Billing, Inventory, GST, Customers, Suppliers, Analytics, AI Automation, and Business Growth from one powerful platform.
          </p>

          <div className="lp-hero-actions">
            {token ? (
              <Link to="/dashboard" className="lp-btn-primary">
                Go to Dashboard <ArrowRight size={16} className="lp-btn-icon-slide" />
              </Link>
            ) : (
              <Link to="/login" state={{ registerMode: true }} className="lp-btn-primary">
                Start <ArrowRight size={16} className="lp-btn-icon-slide" />
              </Link>
            )}
            <a href="#tour" className="lp-btn-secondary">
              Watch Demo <Play size={14} />
            </a>
          </div>

          {/* Interactive ERP Mockup Showcase */}
          <div className="lp-hero-visual">
            <div className="lp-macbook-container">
              <div className="lp-browser-frame">
                <div className="lp-browser-header">
                  <div className="lp-browser-dots">
                    <span className="lp-browser-dot red" />
                    <span className="lp-browser-dot yellow" />
                    <span className="lp-browser-dot green" />
                  </div>
                  <div className="lp-browser-address">app.vyapaarsetu.in/dashboard</div>
                </div>
                
                {/* Main simulated dashboard frame */}
                <div className="lp-simulated-dashboard">
                  <div className="lp-sim-grid">
                    <div className="lp-sim-card">
                      <span className="lp-sim-card-title">Today's Sales</span>
                      <span className="lp-sim-card-value">₹24,850.50</span>
                      <span className="lp-sim-card-trend"><TrendingUp size={12} /> +12.3% today</span>
                    </div>
                    <div className="lp-sim-card">
                      <span className="lp-sim-card-title">Active Inventory</span>
                      <span className="lp-sim-card-value">1,482 Items</span>
                      <span className="lp-sim-card-trend"><TrendingUp size={12} /> 48 new batches</span>
                    </div>
                    <div className="lp-sim-card accent">
                      <span className="lp-sim-card-title">Low Stock Alerts</span>
                      <span className="lp-sim-card-value" style={{ color: '#ef4444' }}>5 Items</span>
                      <span className="lp-sim-card-trend down"><AlertOctagon size={12} /> Urgent restock</span>
                    </div>
                    <div className="lp-sim-card">
                      <span className="lp-sim-card-title">GST Collected</span>
                      <span className="lp-sim-card-value">₹4,230.12</span>
                      <span className="lp-sim-card-trend"><TrendingUp size={12} /> 100% compliant</span>
                    </div>
                  </div>

                  <div className="lp-sim-charts">
                    {/* Simulated Sales Bar Chart */}
                    <div className="lp-sim-chart-container">
                      <div className="flex justify-between items-center" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Monthly Sales Revenue</span>
                        <span className="text-xs text-sky-400 font-bold">Total: ₹8,42,000</span>
                      </div>
                      <div className="lp-sim-chart-bars">
                        {[
                          { month: 'Jan', height: '40px' },
                          { month: 'Feb', height: '55px' },
                          { month: 'Mar', height: '85px' },
                          { month: 'Apr', height: '70px' },
                          { month: 'May', height: '110px' },
                          { month: 'Jun', height: '125px' }
                        ].map((m, i) => (
                          <div key={i} className="lp-sim-chart-bar-wrapper">
                            <div className="lp-sim-chart-bar" style={{ '--bar-height': m.height }} />
                            <span className="lp-sim-chart-label">{m.month}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Simulated Recent Invoices list */}
                    <div className="lp-sim-chart-container">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block mb-3">Live Invoice Feed</span>
                      <div className="lp-sim-recent-list">
                        <div className="lp-sim-recent-item">
                          <div>
                            <p className="font-bold text-white m-0">INV-2606-003</p>
                            <p className="text-[10px] text-gray-400 m-0">Aman Medicals</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p className="font-bold text-white m-0">₹4,520</p>
                            <span className="lp-sim-recent-badge">Paid</span>
                          </div>
                        </div>
                        <div className="lp-sim-recent-item">
                          <div>
                            <p className="font-bold text-white m-0">INV-2606-002</p>
                            <p className="text-[10px] text-gray-400 m-0">Wellness Care</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p className="font-bold text-white m-0">₹860</p>
                            <span className="lp-sim-recent-badge">Paid</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Product Tour */}
      <section id="tour" className="lp-section" style={{ background: '#0c0f1a' }}>
        <div className="lp-container">
          <div className="lp-section-title-block">
            <span className="lp-sec-subtitle">Interactive Tour</span>
            <h2 className="lp-sec-title">Experience Vyapaar Setu</h2>
            <p className="lp-sec-desc">See how Vyapaar Setu simplifies inventory, automates GST billing, and manages cash flow.</p>
          </div>

          <div className="lp-tour-grid">
            {/* Left tab sidebar */}
            <div className="lp-tour-tabs">
              {[
                { id: 'dashboard', name: 'Smart Dashboard', icon: <Activity size={16} /> },
                { id: 'billing', name: 'GST Billing Engine', icon: <FileText size={16} /> },
                { id: 'inventory', name: 'Stock & Batches', icon: <Layers size={16} /> },
                { id: 'ledger', name: 'Customer Ledger', icon: <Users size={16} /> },
                { id: 'ocr', name: 'AI Invoice OCR Scanner', icon: <Sparkles size={16} /> },
                { id: 'returns', name: 'Return Management', icon: <RefreshCw size={16} /> }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTourTab(t.id)
                    // Reset scanner if changing tabs
                    if (t.id !== 'ocr') setOcrStatus('idle')
                  }}
                  className={`lp-tour-tab ${activeTourTab === t.id ? 'active' : ''}`}
                >
                  <span className="lp-tour-tab-icon">{t.icon}</span>
                  {t.name}
                </button>
              ))}
            </div>

            {/* Right content box */}
            <div className="lp-tour-content">
              {activeTourTab === 'dashboard' && (
                <div className="lp-tour-detail-grid">
                  <div>
                    <h3 className="text-xl font-bold mb-3">Live Enterprise Command Center</h3>
                    <p className="text-sm text-gray-400 mb-4">
                      Get full transparency on your operations. A unified view of sales, outstanding bills, low stock alerts, and profit margins.
                    </p>
                    <div className="lp-tour-bullets">
                      <div className="lp-tour-bullet">
                        <span className="lp-tour-bullet-icon"><Check size={10} /></span>
                        <span><b>Live KPI tracking:</b> Instantly see daily sales, purchases, and cash flows.</span>
                      </div>
                      <div className="lp-tour-bullet">
                        <span className="lp-tour-bullet-icon"><Check size={10} /></span>
                        <span><b>Low stock alerts:</b> Prevent sales losses with automatic reorder triggers.</span>
                      </div>
                    </div>
                  </div>
                  <div className="lp-browser-frame">
                    <div className="lp-simulated-dashboard" style={{ padding: '16px' }}>
                      <div className="lp-sim-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '16px' }}>
                        <div className="lp-sim-card" style={{ padding: '10px' }}>
                          <span className="text-[10px] text-gray-400 font-bold uppercase">Net Sales</span>
                          <span className="text-lg font-extrabold text-white">₹82,450.00</span>
                        </div>
                        <div className="lp-sim-card" style={{ padding: '10px' }}>
                          <span className="text-[10px] text-gray-400 font-bold uppercase">Credit Outstanding</span>
                          <span className="text-lg font-extrabold text-red-500">₹45,210.00</span>
                        </div>
                      </div>
                      <div className="lp-sim-recent-list">
                        <p className="text-[10px] text-gray-400 uppercase font-bold m-0 mb-1">Top Selling Brands</p>
                        <div className="lp-sim-recent-item" style={{ padding: '6px' }}>
                          <span>Yash Surgical House</span>
                          <span className="font-bold text-white">₹20,322.88</span>
                        </div>
                        <div className="lp-sim-recent-item" style={{ padding: '6px' }}>
                          <span>R B Healthcare</span>
                          <span className="font-bold text-white">₹66.42</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTourTab === 'billing' && (
                <div className="lp-tour-detail-grid">
                  <div>
                    <h3 className="text-xl font-bold mb-3">Sleek, 1-Second GST Billing</h3>
                    <p className="text-sm text-gray-400 mb-4">
                      Compile invoices at lightning speed. Supports barcode scanning, multiple batch allocations, real-time GST calculations, and printable invoices.
                    </p>
                    <div className="lp-tour-bullets">
                      <div className="lp-tour-bullet">
                        <span className="lp-tour-bullet-icon"><Check size={10} /></span>
                        <span><b>Multi-batch allocation:</b> Auto-allocate batches based on expiry (FEFO).</span>
                      </div>
                      <div className="lp-tour-bullet">
                        <span className="lp-tour-bullet-icon"><Check size={10} /></span>
                        <span><b>Instant PDF & Print:</b> Directly generate credit notes and receipts.</span>
                      </div>
                    </div>
                  </div>
                  <div className="lp-sim-billing">
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--vf-border)', paddingBottom: '8px', marginBottom: '8px' }}>
                      <span className="font-bold text-white">TAX INVOICE: #INV-2606-004</span>
                      <span className="text-gray-400">Date: 20/06/2026</span>
                    </div>
                    <table className="lp-sim-billing-table">
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>Rate</th>
                          <th>CGST</th>
                          <th>SGST</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Paracetamol 500mg</td>
                          <td>10 PCS</td>
                          <td>₹12.00</td>
                          <td>6%</td>
                          <td>6%</td>
                          <td>₹134.40</td>
                        </tr>
                        <tr>
                          <td>Amlodipine 5mg</td>
                          <td>5 PCS</td>
                          <td>₹8.50</td>
                          <td>6%</td>
                          <td>6%</td>
                          <td>₹47.60</td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="lp-sim-billing-summary">
                      <div>Subtotal: ₹162.50</div>
                      <div style={{ color: '#818cf8', fontWeight: 'bold' }}>Grand Total (incl. GST): ₹182.00</div>
                    </div>
                  </div>
                </div>
              )}

              {activeTourTab === 'inventory' && (
                <div className="lp-tour-detail-grid">
                  <div>
                    <h3 className="text-xl font-bold mb-3">Live Batch-Level Stock Audit</h3>
                    <p className="text-sm text-gray-400 mb-4">
                      No more dead stock or expired waste. Keep complete track of items by batch number, expiry date, purchase rate, and supplier source.
                    </p>
                    <div className="lp-tour-bullets">
                      <div className="lp-tour-bullet">
                        <span className="lp-tour-bullet-icon"><Check size={10} /></span>
                        <span><b>Batch tracking:</b> Complete history from supplier purchase to final customer sale.</span>
                      </div>
                      <div className="lp-tour-bullet">
                        <span className="lp-tour-bullet-icon"><Check size={10} /></span>
                        <span><b>Expiry notifications:</b> Highlights batches expiring in the next 60 days.</span>
                      </div>
                    </div>
                  </div>
                  <div className="lp-browser-frame">
                    <div className="lp-simulated-dashboard" style={{ padding: '16px' }}>
                      <p className="text-[10px] text-gray-400 uppercase font-bold m-0 mb-2">Inventory Stock View</p>
                      <table className="lp-sim-billing-table">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th>Batch No.</th>
                            <th>Stock</th>
                            <th>Expiry</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="font-semibold text-white">Paracetamol 500mg</td>
                            <td className="font-mono text-sky-400">BT-2606-01</td>
                            <td className="font-bold text-white">450 PCS</td>
                            <td className="text-gray-400">08/2028</td>
                          </tr>
                          <tr style={{ background: 'rgba(239, 68, 68, 0.05)' }}>
                            <td className="font-semibold text-white">Amoxicillin 250mg</td>
                            <td className="font-mono text-red-400">BT-2606-02</td>
                            <td className="font-bold text-red-500">12 PCS</td>
                            <td className="text-red-400">07/2026 (Expiring)</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTourTab === 'ledger' && (
                <div className="lp-tour-detail-grid">
                  <div>
                    <h3 className="text-xl font-bold mb-3">Customer Ledgers & Balances</h3>
                    <p className="text-sm text-gray-400 mb-4">
                      Keep clean tabs on credit. View every invoice, payment received, credit limits, and outstanding ledger history per customer.
                    </p>
                    <div className="lp-tour-bullets">
                      <div className="lp-tour-bullet">
                        <span className="lp-tour-bullet-icon"><Check size={10} /></span>
                        <span><b>Credit limits protection:</b> Instantly flags accounts when sales exceed safety limits.</span>
                      </div>
                      <div className="lp-tour-bullet">
                        <span className="lp-tour-bullet-icon"><Check size={10} /></span>
                        <span><b>Ledger statements:</b> Generate and share professional PDF logs in one click.</span>
                      </div>
                    </div>
                  </div>
                  <div className="lp-sim-ledger">
                    <div className="lp-sim-ledger-profile">
                      <div>
                        <h4 className="font-bold text-white m-0 text-sm">Aman Surgical Clinic</h4>
                        <p className="text-[10px] text-gray-400 m-0">GSTIN: 27AAAAA1111A1Z1</p>
                      </div>
                      <span className="text-xs font-bold text-red-500 bg-red-500/10 px-2 py-1 rounded">
                        Due: ₹12,850.00
                      </span>
                    </div>
                    <div className="lp-sim-recent-list" style={{ gap: '6px' }}>
                      <div className="lp-sim-recent-item" style={{ padding: '6px', fontSize: '0.7rem' }}>
                        <span>20/06/2026 — Sales Invoice #INV-004</span>
                        <span className="font-bold text-red-400">+₹4,520.00</span>
                      </div>
                      <div className="lp-sim-recent-item" style={{ padding: '6px', fontSize: '0.7rem' }}>
                        <span>18/06/2026 — Payment Received #PAY-992</span>
                        <span className="font-bold text-green-400">-₹5,000.00</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTourTab === 'ocr' && (
                <div className="lp-tour-detail-grid">
                  <div>
                    <h3 className="text-xl font-bold mb-3">AI Purchase Invoice Scanner</h3>
                    <p className="text-sm text-gray-400 mb-4">
                      Stop entering purchase bills manually. Drag-and-drop supplier bills, watch our AI read line items, batches, and taxes, and create stock inputs instantly.
                    </p>
                    <div className="lp-tour-bullets">
                      <div className="lp-tour-bullet">
                        <span className="lp-tour-bullet-icon"><Check size={10} /></span>
                        <span><b>OCR Extraction:</b> Parses items, taxes, batch numbers, and expiry.</span>
                      </div>
                      <div className="lp-tour-bullet">
                        <span className="lp-tour-bullet-icon"><Check size={10} /></span>
                        <span><b>Zero manual entry:</b> Autocompiles purchase invoices with 99.8% accuracy.</span>
                      </div>
                    </div>
                    {ocrStatus !== 'scanning' && (
                      <button onClick={handleOcrScan} className="lp-btn-primary text-xs mt-4">
                        <Sparkles size={12} /> Scan Sample Invoice
                      </button>
                    )}
                  </div>
                  
                  <div className="lp-sim-ai-ocr">
                    {ocrStatus === 'idle' && (
                      <div style={{ textAlign: 'center', color: 'var(--vf-text-muted)', fontSize: '0.8rem' }}>
                        <FileSpreadsheet size={32} className="mx-auto text-sky-400 mb-2" style={{ display: 'block', margin: '0 auto 10px auto' }} />
                        <p className="m-0 font-bold">Supplier PDF Invoices</p>
                        <p className="text-[10px] text-gray-500 mt-1">Upload a bill to trigger AI extraction demo</p>
                      </div>
                    )}

                    {ocrStatus === 'scanning' && (
                      <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="lp-ai-laser" />
                        <RefreshCw size={24} className="animate-spin text-cyan-500 mb-2" />
                        <p className="m-0 text-white font-bold text-xs">AI Extraction in Progress...</p>
                        <p className="text-[10px] text-gray-500 mt-1">{ocrProgress}% parsed</p>
                      </div>
                    )}

                    {ocrStatus === 'success' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '4px' }}>
                          <ShieldCheck size={16} /> Invoice parsed successfully!
                        </div>
                        <div className="lp-ai-data-field" style={{ animationDelay: '0.1s' }}>
                          <span>Supplier:</span> <b>{ocrMockData.supplier}</b>
                        </div>
                        <div className="lp-ai-data-field" style={{ animationDelay: '0.2s' }}>
                          <span>Bill Number:</span> <b>{ocrMockData.invoice_no}</b>
                        </div>
                        <div className="lp-ai-data-field" style={{ animationDelay: '0.3s' }}>
                          <span>Parsed Items:</span> <b>{ocrMockData.items.length} records</b>
                        </div>
                        <div className="lp-ai-data-field" style={{ animationDelay: '0.4s' }}>
                          <span>Total Amount:</span> <b>₹{ocrMockData.total.toFixed(2)}</b>
                        </div>
                        <button onClick={() => setOcrStatus('idle')} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.7rem', width: 'fit-content', marginTop: '4px' }}>
                          Reset Demo
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTourTab === 'returns' && (
                <div className="lp-tour-detail-grid">
                  <div>
                    <h3 className="text-xl font-bold mb-3">Return Workflows & Credit Notes</h3>
                    <p className="text-sm text-gray-400 mb-4">
                      Handle customer returns and supplier debits professionally. Tracks stock back into inventory, calculates GST adjustments, and writes credit notes automatically.
                    </p>
                    <div className="lp-tour-bullets">
                      <div className="lp-tour-bullet">
                        <span className="lp-tour-bullet-icon"><Check size={10} /></span>
                        <span><b>Direct credit/debit logs:</b> Auto-adjusts balance sheets.</span>
                      </div>
                      <div className="lp-tour-bullet">
                        <span className="lp-tour-bullet-icon"><Check size={10} /></span>
                        <span><b>Stock reinstatement:</b> Automatically increases active batch inventory count.</span>
                      </div>
                    </div>
                  </div>
                  <div className="lp-browser-frame">
                    <div className="lp-simulated-dashboard" style={{ padding: '16px' }}>
                      <p className="text-[10px] text-gray-400 uppercase font-bold m-0 mb-2">Credit Note Preview</p>
                      <div className="lp-sim-recent-item" style={{ background: 'rgba(14, 165, 233, 0.05)', borderColor: 'rgba(14, 165, 233, 0.2)' }}>
                        <div>
                          <p className="font-bold text-white m-0">CREDIT NOTE: #CRN-2026-001</p>
                          <p className="text-[10px] text-gray-400 m-0">Reference Invoice: INV-2606-002</p>
                        </div>
                        <span className="font-bold text-sky-400">-₹450.00</span>
                      </div>
                      <div className="lp-sim-recent-list" style={{ marginTop: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                          <span>Returned: Ibuprofen 400mg</span>
                          <span>Qty: 5 PCS</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                          <span>Adjusted SGST/CGST:</span>
                          <span>-₹27.00</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Bento Grid Feature List */}
      <section id="features" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-title-block">
            <span className="lp-sec-subtitle">Powerhouse Features</span>
            <h2 className="lp-sec-title">Everything your business needs</h2>
            <p className="lp-sec-desc">A complete package of modular tools to control, analyze, and scale your wholesale or retail operations.</p>
          </div>

          <div className="lp-bento-grid">
            <div className="lp-bento-card col-2">
              <div className="lp-bento-icon"><Sparkles size={20} /></div>
              <h3 className="lp-bento-title">Smart Dashboard Analytics</h3>
              <p className="lp-bento-desc">
                Get daily stats on sales, purchases, active inventory totals, credit collection alerts, and profit trackers instantly.
              </p>
              <div className="lp-bento-mockup">
                Total Revenue: ₹8,42,000 | Profit Margin: 18.5% | Stock Val: ₹24,50,000
              </div>
            </div>

            <div className="lp-bento-card">
              <div className="lp-bento-icon"><Layers size={20} /></div>
              <h3 className="lp-bento-title">Batch Traceability</h3>
              <p className="lp-bento-desc">
                Audit the complete end-to-end path of any batch from supplier to customer for safety recalls.
              </p>
              <div className="lp-bento-mockup">
                Batch: BT-2606-01 &gt; MedLife &gt; Cust: Rajat
              </div>
            </div>

            <div className="lp-bento-card">
              <div className="lp-bento-icon"><FileText size={20} /></div>
              <h3 className="lp-bento-title">GST Billing</h3>
              <p className="lp-bento-desc">
                Lightning fast bills with auto batch suggestions, instant tax percentages, and credit limits checking.
              </p>
              <div className="lp-bento-mockup">
                INV-004 - Grand Total: ₹182.00 (Incl. CGST+SGST)
              </div>
            </div>

            <div className="lp-bento-card col-2">
              <div className="lp-bento-icon"><Smartphone size={20} /></div>
              <h3 className="lp-bento-title">Product & Brand Reports</h3>
              <p className="lp-bento-desc">
                Analyze revenue breakdowns by brand and product names. See exactly who purchased what quantity.
              </p>
              <div className="lp-bento-mockup">
                Brand: YASH SURGICAL HOUSE - Revenue: ₹20,322.88 (30 PCS Sold)
              </div>
            </div>

            <div className="lp-bento-card col-2">
              <div className="lp-bento-icon"><Users size={20} /></div>
              <h3 className="lp-bento-title">Ledgers & Contacts</h3>
              <p className="lp-bento-desc">
                Separate ledgers for customers and suppliers. Track balance sheets, payments, and credit parameters.
              </p>
              <div className="lp-bento-mockup">
                Aman Surgical due balance: ₹12,850.00 | Credit Limit: ₹50,000
              </div>
            </div>

            <div className="lp-bento-card">
              <div className="lp-bento-icon"><RefreshCw size={20} /></div>
              <h3 className="lp-bento-title">Easy Returns</h3>
              <p className="lp-bento-desc">
                Accept partial returns, log credit notes, adjust tax liabilities, and restore inventory counts in seconds.
              </p>
              <div className="lp-bento-mockup">
                Returned: 5 PCS Ibuprofen | Credit Note #CRN-001 Created
              </div>
            </div>

            <div className="lp-bento-card col-3">
              <div className="lp-bento-icon"><Building2 size={20} style={{ color: '#38bdf8' }} /></div>
              <h3 className="lp-bento-title">Workspace & Staff Onboarding (Company ID)</h3>
              <p className="lp-bento-desc">
                Share your unique Company ID to securely invite and import team members. Your database, inventory, and ledger history are strictly isolated under this tenant key.
              </p>
              <div className="lp-bento-mockup">
                {token && (user?.tenant_id || user?.company_code) ? (
                  <>Your Tenant ID: <span className="text-sky-400 font-mono font-bold tracking-wider">{user?.tenant_id || user?.company_code}</span></>
                ) : (
                  <>Example Tenant ID: <span className="text-sky-400 font-mono font-bold tracking-wider">VS-8801</span></>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Futuristic AI Insights Section */}
      <section id="ai-insights" className="lp-section" style={{ background: 'radial-gradient(ellipse at bottom, rgba(14, 165, 233, 0.08) 0%, #09090b 100%)' }}>
        <div className="lp-container lp-ai-grid">
          <div>
            <span className="lp-sec-subtitle">Smart Business Engine</span>
            <h2 className="lp-sec-title">Supercharge operations with AI Insights</h2>
            <p className="lp-sec-desc mb-4" style={{ color: 'var(--vf-text-muted)', marginBottom: '24px' }}>
              Vyapaar Setu includes advanced AI models built specifically for wholesale. Speed up processing and make smart planning decisions.
            </p>
            <div className="lp-tour-bullets">
              <div className="lp-tour-bullet">
                <span className="lp-tour-bullet-icon"><Zap size={10} style={{ color: '#ec4899' }} /></span>
                <span><b>Intelligent OCR parser:</b> Extracts lines, batches, and prices from photo or PDF bills.</span>
              </div>
              <div className="lp-tour-bullet">
                <span className="lp-tour-bullet-icon"><Zap size={10} style={{ color: '#ec4899' }} /></span>
                <span><b>Reorder recommendations:</b> Predictive restock alerts based on weekly velocity.</span>
              </div>
              <div className="lp-tour-bullet">
                <span className="lp-tour-bullet-icon"><Zap size={10} style={{ color: '#ec4899' }} /></span>
                <span><b>Smart searching:</b> Autocomplete search that scans SKUs, barcodes, and HSN codes instantly.</span>
              </div>
            </div>
          </div>

          <div className="lp-ai-showcase-visual">
            <div className="lp-sim-billing" style={{ border: '1px solid rgba(236, 72, 153, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ec4899', fontWeight: 'bold', fontSize: '0.8rem', marginBottom: '12px' }}>
                <Sparkles size={16} /> AI Invoice Scan Simulator
              </div>
              <p className="text-[10px] text-gray-400 mb-2">Simulating OCR parsing of raw distributor bill:</p>
              <div style={{ background: '#09090b', padding: '12px', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.65rem', border: '1px solid var(--vf-border)', color: '#a1a1aa' }}>
                <p className="m-0 text-white"># MEDLIFE DISTRIBUTORS LTD. - BILL 8801</p>
                <p className="m-0">PARACETAMOL 500MG ... 100 PCS ... RATE 1.20 ... CGST 6%</p>
                <p className="m-0">AMOXICILLIN 250MG ... 50 PCS ... RATE 3.50 ... CGST 6%</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
                <span className="text-[10px] text-gray-400">Match Accuracy: 99.8%</span>
                <button onClick={() => { setActiveTourTab('ocr'); window.location.href='#tour'; }} className="lp-btn-primary" style={{ padding: '6px 14px', fontSize: '0.7rem' }}>
                  Test Scanner <ArrowRight size={10} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Timeline */}
      <section className="lp-section" style={{ background: '#0c0f1a' }}>
        <div className="lp-container">
          <div className="lp-section-title-block">
            <span className="lp-sec-subtitle">Onboarding Flow</span>
            <h2 className="lp-sec-title">Simple 4-Step Setup</h2>
            <p className="lp-sec-desc">Start billing and managing stock in less than 5 minutes.</p>
          </div>

          <div className="lp-timeline">
            <div className="lp-timeline-step">
              <div className="lp-timeline-dot">1</div>
              <h4 className="lp-timeline-title">Add Products</h4>
              <p className="lp-timeline-desc">Enter products, SKU parameters, tax slabs, and categories.</p>
            </div>
            <div className="lp-timeline-step">
              <div className="lp-timeline-dot">2</div>
              <h4 className="lp-timeline-title">Manage Inventory</h4>
              <p className="lp-timeline-desc">Import batches with expiry details, purchase rates, and supplier data.</p>
            </div>
            <div className="lp-timeline-step">
              <div className="lp-timeline-dot">3</div>
              <h4 className="lp-timeline-title">Create Bills</h4>
              <p className="lp-timeline-desc">Lightning fast billing checkout with barcode scanner and auto tax totals.</p>
            </div>
            <div className="lp-timeline-step">
              <div className="lp-timeline-dot">4</div>
              <h4 className="lp-timeline-title">Track Growth</h4>
              <p className="lp-timeline-desc">Monitor monthly sales graphs, collect credits, and view profit reports.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section id="why-us" className="lp-section">
        <div className="lp-container">
          <div className="lp-section-title-block">
            <span className="lp-sec-subtitle">Comparison</span>
            <h2 className="lp-sec-title">Vyapaar Setu vs Traditional ERP</h2>
            <p className="lp-sec-desc">Why modern pharmacies and distributors are upgrading to Vyapaar Setu.</p>
          </div>

          <div className="lp-compare-table-container">
            <table className="lp-compare-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Vyapaar Setu ERP</th>
                  <th>Traditional Desktop ERP</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-semibold text-white">Modern UI & Aesthetics</td>
                  <td><span className="lp-compare-check">✔</span> Sleek, fluid, 60fps design</td>
                  <td><span className="lp-compare-cross">✘</span> Cluttered legacy Windows XP style</td>
                </tr>
                <tr>
                  <td className="font-semibold text-white">Setup Speed</td>
                  <td><span className="lp-compare-check">✔</span> Under 5 minutes on the cloud</td>
                  <td><span className="lp-compare-cross">✘</span> Requires manual local server installation</td>
                </tr>
                <tr>
                  <td className="font-semibold text-white">AI Automation</td>
                  <td><span className="lp-compare-check">✔</span> OCR Purchase Import & Reorder suggestions</td>
                  <td><span className="lp-compare-cross">✘</span> 100% manual invoice input</td>
                </tr>
                <tr>
                  <td className="font-semibold text-white">Multitenancy & Safety</td>
                  <td><span className="lp-compare-check">✔</span> Scoped tenant data & audit logs</td>
                  <td><span className="lp-compare-cross">✘</span> Single database without robust access controls</td>
                </tr>
                <tr>
                  <td className="font-semibold text-white">Mobile Support</td>
                  <td><span className="lp-compare-check">✔</span> Yes, responsive mobile layout</td>
                  <td><span className="lp-compare-cross">✘</span> Desktop only</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQs Section */}
      <section id="faqs" className="lp-section" style={{ background: '#0c0f1a' }}>
        <div className="lp-container">
          <div className="lp-section-title-block">
            <span className="lp-sec-subtitle">FAQS</span>
            <h2 className="lp-sec-title">Frequently Asked Questions</h2>
            <p className="lp-sec-desc">Have questions? We've got answers.</p>
          </div>

          <div className="lp-faq-list">
            {[
              { q: 'Is Vyapaar Setu GST compliant?', a: 'Yes! Vyapaar Setu calculates CGST, SGST, IGST, and HSN-based tax percentages automatically during invoice generation.' },
              { q: 'What is the AI Purchase Scanner?', a: 'Our AI engine lets you upload photos or PDFs of bills received from suppliers. The system reads the items, quantities, batches, and taxes automatically, saving you hours of data entry.' },
              { q: 'Is my business data secure?', a: 'Absolutely. Vyapaar Setu uses strict multitenancy isolation, meaning your ledger, stock, and supplier histories are cryptographically scoped to your company ID and completely hidden from other users.' },
              { q: 'Can I track product expiries?', a: 'Yes, Vyapaar Setu lets you log batch details, including manufacturing and expiry parameters. The dashboard automatically flags products nearing expiry so you can clear or return them.' }
            ].map((faq, i) => (
              <div key={i} className="lp-faq-item">
                <button onClick={() => toggleFaq(i)} className="lp-faq-question">
                  <span>{faq.q}</span>
                  {openFaqs[i] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                {openFaqs[i] && (
                  <div className="lp-faq-answer">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA section */}
      <section className="lp-cta">
        <div className="lp-cta-glow" />
        <div className="lp-container" style={{ position: 'relative', zIndex: 10 }}>
          <h2 className="lp-cta-title">Ready to Transform Your Business?</h2>
          <p className="lp-cta-desc">
            Join modern wholesalers and retail owners using Vyapaar Setu to streamline billing and optimize stock controls.
          </p>
          <div className="lp-hero-actions" style={{ marginBottom: 0 }}>
            {token ? (
              <Link to="/dashboard" className="lp-btn-primary">
                Go to Dashboard <ArrowRight size={16} className="lp-btn-icon-slide" />
              </Link>
            ) : (
              <>
                <Link to="/login" state={{ registerMode: true }} className="lp-btn-primary">
                  Start <ArrowRight size={16} className="lp-btn-icon-slide" />
                </Link>
                <Link to="/login" className="lp-btn-secondary">
                  Sign In <Users size={14} />
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand">
              <Link to="/" className="lp-logo">
                <div className="lp-logo-icon"><Building2 size={16} /></div>
                <span>Vyapaar Setu</span>
              </Link>
              <p className="lp-footer-brand-desc">
                India's modern ERP system for pharmacies, distributors, and retailers. Built on FastAPI, React, and MongoDB.
              </p>
            </div>
            <div className="lp-footer-col">
              <h4>Product</h4>
              <ul className="lp-footer-links">
                <li className="lp-footer-link"><a href="#tour">Dashboard</a></li>
                <li className="lp-footer-link"><a href="#tour">Billing Engine</a></li>
                <li className="lp-footer-link"><a href="#tour">AI Scanning</a></li>
              </ul>
            </div>
            <div className="lp-footer-col">
              <h4>Resources</h4>
              <ul className="lp-footer-links">
                <li className="lp-footer-link"><a href="#faqs">Documentation</a></li>
                <li className="lp-footer-link"><a href="#why-us">Comparison</a></li>
                <li className="lp-footer-link"><a href="#faqs">GST Rates</a></li>
              </ul>
            </div>
            <div className="lp-footer-col">
              <h4>Company</h4>
              <ul className="lp-footer-links">
                <li className="lp-footer-link"><a href="#tour">About Us</a></li>
                <li className="lp-footer-link"><a href="#tour">Careers</a></li>
                <li className="lp-footer-link"><a href="#tour">Privacy Policy</a></li>
              </ul>
            </div>
            <div className="lp-footer-col">
              <h4>Connect</h4>
              <ul className="lp-footer-links">
                <li className="lp-footer-link"><a href="#tour">Contact Sales</a></li>
                <li className="lp-footer-link"><a href="#tour">Support</a></li>
                <li className="lp-footer-link"><a href="#tour">LinkedIn</a></li>
              </ul>
            </div>
          </div>
          
          <div className="lp-footer-bottom">
            <span>&copy; 2026 Vyapaar Setu ERP. All rights reserved.</span>
            <span>Made with ❤️ for Indian Businesses.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
