import { useState, useEffect } from 'react'
import { Navigate, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { authAPI, healthAPI } from '../services/api'
import { Building2, Eye, EyeOff, Loader2, Sun, Moon, User, Lock, Mail, Phone, Home } from 'lucide-react'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const { login, token, loading } = useAuth()
  const { dark, toggle } = useTheme()
  const location = useLocation()
  const [form, setForm] = useState({ username: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [needSetup, setNeedSetup] = useState(false)
  const [registerMode, setRegisterMode] = useState(location.state?.registerMode || false)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [newCompanyCode, setNewCompanyCode] = useState('')
  const [regForm, setRegForm] = useState({
    username: '',
    password: '',
    full_name: '',
    email: '',
    mobile: '',
    company_name: '',
    company_code: ''
  })
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('checking') // 'checking' | 'connected' | 'offline'

  const checkConnection = async () => {
    setConnectionStatus('checking')
    try {
      await healthAPI.check()
      setConnectionStatus('connected')
    } catch (err) {
      console.error('Connection health check failed:', err)
      setConnectionStatus('offline')
    }
  }

  useEffect(() => {
    checkConnection()
  }, [])

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const { data } = await authAPI.setupStatus()
        if (data.need_setup) {
          setNeedSetup(true)
          setRegisterMode(true)
        }
      } catch (err) {
        console.error('Failed to fetch setup status:', err)
      }
    }
    checkSetup()
  }, [])

  if (token) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const success = await login(form.username, form.password)
    if (!success) {
      setError('Incorrect username or password')
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setRegistering(true)
    setError('')
    try {
      const payload = {
        username: regForm.username,
        password: regForm.password,
        full_name: regForm.full_name,
        email: regForm.email || undefined,
        mobile: regForm.mobile || undefined,
        company_code: regForm.company_code || undefined
      }

      const { data } = await authAPI.register(payload)
      
      if (data.role === 'admin') {
        setNewCompanyCode(data.company_code)
        setShowCodeModal(true)
        toast.success('Admin account & business created successfully!')
      } else {
        toast.success('Staff account registered! Please contact your administrator to activate it.')
        setRegisterMode(false)
        setRegForm({
          username: '',
          password: '',
          full_name: '',
          email: '',
          mobile: '',
          company_name: '',
          company_code: ''
        })
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed')
    } finally {
      setRegistering(false)
    }
  }

  const handleCloseCodeModal = async () => {
    setShowCodeModal(false)
    await login(regForm.username, regForm.password)
  }


  return (
    <div className="min-h-screen flex items-center justify-center ambient-bg p-4 overflow-hidden relative">
      {/* Top right theme toggle & Home button */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-3">
        <Link
          to="/"
          className="btn-secondary p-2.5 rounded-full shadow-lg transition-transform duration-200 active:scale-95 flex items-center justify-center"
          title="Back to Home"
        >
          <Home size={18} />
        </Link>
        <button
          type="button"
          onClick={toggle}
          className="btn-secondary p-2.5 rounded-full shadow-lg transition-transform duration-200 active:scale-95"
          title="Toggle Theme"
        >
          {dark ? <Sun size={18} className="text-amber-500 animate-spin-slow" /> : <Moon size={18} className="text-indigo-650" />}
        </button>
      </div>

      <div className="w-full max-w-md relative z-10 animate-modal-in">
        {/* Logo Header */}
        <Link to="/" className="flex items-center justify-center gap-3.5 mb-8 px-2 hover:opacity-85 transition-opacity select-none cursor-pointer group">
          <div className="w-12 h-12 glass-icon-container text-gray-800 dark:text-white shadow-md flex-shrink-0 rounded-2xl">
            <Building2 size={22} className="text-indigo-600 dark:text-indigo-300 animate-pulse group-hover:scale-105 transition-transform" />
          </div>
          <div className="text-left">
            <h1 className="text-2xl font-black leading-tight tracking-tight text-gray-950 dark:text-white" style={{ fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}>Vyapaar Setu</h1>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold tracking-wide leading-tight mt-0.5">
              {registerMode ? (needSetup ? 'First-time Setup: Create Admin Account' : 'Create Account') : 'Sign in to your account'}
            </p>
          </div>
        </Link>

        {/* Card */}
        <div className="card shadow-2xl p-8">
          {showCodeModal ? (
            <div className="space-y-6 text-center animate-modal-in">
              <div className="w-16 h-16 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2 border border-emerald-500/20">
                <Building2 size={32} />
              </div>
              
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Business Registered!</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Your business has been successfully registered. Share the code below with your staff so they can connect.
                </p>
              </div>

              <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl p-6 select-all cursor-pointer group hover:border-indigo-400/40 transition-all duration-300">
                <span className="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wider block mb-1">
                  Your Company Code
                </span>
                <span className="text-3xl font-black font-mono tracking-widest text-indigo-600 dark:text-indigo-300">
                  {newCompanyCode}
                </span>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(newCompanyCode)
                    toast.success('Company code copied to clipboard!')
                  }}
                  className="btn-secondary w-full py-2.5 justify-center"
                >
                  Copy Company Code
                </button>
                <button
                  type="button"
                  onClick={handleCloseCodeModal}
                  className="btn-primary w-full py-2.5 justify-center"
                >
                  Continue to Application
                </button>
              </div>
            </div>
          ) : registerMode ? (
            <form onSubmit={handleRegister} className="space-y-4">
              {/* Optional Company Code Field */}
              <div>
                <label className="label flex justify-between items-center">
                  <span>Company Code (Optional)</span>
                  <span className="text-[10px] font-normal text-gray-500 lowercase">leave blank if you are a business owner</span>
                </label>
                <input
                  type="text"
                  value={regForm.company_code}
                  onChange={e => setRegForm(f => ({ ...f, company_code: e.target.value.toUpperCase() }))}
                  placeholder="Enter code to join as staff (e.g. X8J2K9)"
                  className="input font-mono uppercase tracking-wider text-xs"
                />
              </div>

              <div>
                <label className="label">Full Name</label>
                <input
                  type="text"
                  value={regForm.full_name}
                  onChange={e => setRegForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="e.g. John Doe"
                  required
                  className="input"
                />
              </div>

              <div>
                <label className="label">Username</label>
                <input
                  type="text"
                  value={regForm.username}
                  onChange={e => setRegForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="e.g. johndoe"
                  required
                  className="input"
                />
              </div>

              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={regForm.password}
                    onChange={e => setRegForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Enter password"
                    required
                    className="input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="label">Email (Optional)</label>
                <input
                  type="email"
                  value={regForm.email}
                  onChange={e => setRegForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="name@example.com"
                  className="input"
                />
              </div>

              <div>
                <label className="label">Mobile (Optional)</label>
                <input
                  type="text"
                  value={regForm.mobile}
                  onChange={e => setRegForm(f => ({ ...f, mobile: e.target.value }))}
                  placeholder="10-digit mobile number"
                  className="input"
                />
              </div>

              <button type="submit" disabled={registering || loading} className="btn-primary w-full justify-center py-2.5 mt-2">
                {registering || loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {registering || loading ? 'Creating account…' : (needSetup ? 'Create Admin & Log In' : 'Sign Up')}
              </button>

              {!needSetup && (
                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    setRegisterMode(false)
                  }}
                  className="text-xs text-indigo-650 dark:text-indigo-400 font-bold hover:underline block text-center w-full mt-2"
                >
                  Back to Sign In
                </button>
              )}
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="label">Username</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => {
                    setError('')
                    setForm(f => ({ ...f, username: e.target.value }))
                  }}
                  placeholder="Enter username"
                  required
                  autoFocus
                  className={`input ${error ? 'input-error' : ''}`}
                />
              </div>

              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => {
                      setError('')
                      setForm(f => ({ ...f, password: e.target.value }))
                    }}
                    placeholder="Enter password"
                    required
                    className={`input pr-10 ${error ? 'input-error' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {error && (
                  <p className="text-xs text-red-500 mt-1.5 font-semibold flex items-center gap-1.5 animate-pulse">
                    <span>⚠️</span> Incorrect username or password
                  </p>
                )}
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
                {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                {loading ? 'Signing in…' : 'Sign In'}
              </button>

              {!needSetup && (
                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    setRegForm({ username: '', password: '', full_name: '', email: '', mobile: '', company_name: '', company_code: '' })
                    setRegisterMode(true)
                  }}
                  className="text-xs text-indigo-650 dark:text-indigo-400 font-bold hover:underline block text-center w-full mt-3"
                >
                  Don't have an account? Sign Up
                </button>
              )}

              {needSetup && (
                <button
                  type="button"
                  onClick={() => setRegisterMode(true)}
                  className="text-xs text-indigo-650 dark:text-indigo-400 font-bold hover:underline block text-center w-full mt-2"
                >
                  First-time Setup: Create Admin Account
                </button>
              )}
            </form>
          )}

          {needSetup && (
            <div className="card mt-6 p-4">
              <p className="text-xs text-indigo-650 dark:text-indigo-400 font-bold mb-1">First time setup?</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Create your first admin account directly using the form above.
              </p>
            </div>
          )}

          {/* Backend Connection Status Badge */}
          <div className="mt-6 flex justify-center items-center gap-2 border-t border-gray-200/20 pt-4">
            <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">Server Status:</span>
            <button
              type="button"
              onClick={checkConnection}
              disabled={connectionStatus === 'checking'}
              className={`badge cursor-pointer transition-all duration-200 hover:scale-105 active:scale-95 flex items-center ${
                connectionStatus === 'connected' ? 'badge-green' :
                connectionStatus === 'checking' ? 'badge-yellow' :
                'badge-red'
              }`}
              title="Click to re-check connection"
            >
              <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                connectionStatus === 'connected' ? 'bg-green-500 animate-pulse' :
                connectionStatus === 'checking' ? 'bg-yellow-500' :
                'bg-red-500'
              }`} />
              {connectionStatus === 'connected' ? 'Online' :
               connectionStatus === 'checking' ? 'Connecting...' :
               'Offline - Retry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

