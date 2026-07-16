import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authAPI } from '../services/api'
import toast from 'react-hot-toast'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null') } catch { return null }
  })
  const [token, setToken]     = useState(() => localStorage.getItem('token'))
  const [loading, setLoading] = useState(false)

  const login = useCallback(async (username, password) => {
    setLoading(true)
    try {
      const { data } = await authAPI.login({ username, password })
      localStorage.setItem('token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      setToken(data.access_token)
      setUser(data.user)
      toast.success(`Welcome back, ${data.user.full_name}!`)
      return true
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Login failed')
      return false
    } finally {
      setLoading(false)
    }
  }, [])

  const logout = useCallback(() => {
    // ── Auth tokens ──────────────────────────────────────────────────────────
    localStorage.removeItem('token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')

    // ── Business data (SECURITY: must be wiped on every logout) ──────────────
    // Cart state — contains customer, products, draft invoices
    localStorage.removeItem('smart_cart_state')
    // Customer panel — favorites and recently-viewed customers
    localStorage.removeItem('cpc_favorites')
    localStorage.removeItem('cpc_recent')
    // Wipe any tenant-namespaced keys that might have been written
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (
        key.startsWith('smart_cart_state_') ||
        key.startsWith('cpc_favorites_') ||
        key.startsWith('cpc_recent_')
      )) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k))

    setToken(null)
    setUser(null)
    toast.success('Logged out')
  }, [])

  const updateUser = useCallback((updatedUser) => {
    localStorage.setItem('user', JSON.stringify(updatedUser))
    setUser(updatedUser)
  }, [])

  useEffect(() => {
    const syncUser = async () => {
      if (token) {
        try {
          const { data } = await authAPI.me()
          localStorage.setItem('user', JSON.stringify(data))
          setUser(data)
        } catch (err) {
          console.error('Failed to sync user profile:', err)
          if (err.response?.status === 401) {
            logout()
          }
        }
      }
    }
    syncUser()
  }, [token, logout])

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin'


  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAdmin, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
