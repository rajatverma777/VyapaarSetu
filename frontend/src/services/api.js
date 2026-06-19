import axios from 'axios'

const apiURL = import.meta.env.VITE_API_URL || '/api'
const api = axios.create({
  baseURL: apiURL,
  timeout: 30000,
})

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token)
    }
  })
  failedQueue = []
}

// Handle 401 and errors globally
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config

    if (originalRequest.url === '/auth/refresh' || originalRequest.url === '/auth/token') {
      if (err.response?.status === 401) {
        localStorage.removeItem('token')
        localStorage.removeItem('refresh_token')
        localStorage.removeItem('user')
        if (originalRequest.url === '/auth/refresh') {
          window.location.href = '/login'
        }
      }
      return Promise.reject(err)
    }

    if (err.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            return api(originalRequest)
          })
          .catch((err) => {
            return Promise.reject(err)
          })
      }

      originalRequest._retry = true
      isRefreshing = true

      const refreshToken = localStorage.getItem('refresh_token')
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${apiURL}/auth/refresh`, { refresh_token: refreshToken })
          localStorage.setItem('token', data.access_token)
          localStorage.setItem('refresh_token', data.refresh_token)
          localStorage.setItem('user', JSON.stringify(data.user))

          api.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`

          processQueue(null, data.access_token)
          isRefreshing = false

          return api(originalRequest)
        } catch (refreshErr) {
          processQueue(refreshErr, null)
          isRefreshing = false

          localStorage.removeItem('token')
          localStorage.removeItem('refresh_token')
          localStorage.removeItem('user')
          window.location.href = '/login'
          return Promise.reject(refreshErr)
        }
      } else {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        window.location.href = '/login'
      }
    }

    // Normalize FastAPI/Pydantic validation errors (array of objects) to a readable string
    if (err.response?.data?.detail) {
      const detail = err.response.data.detail
      if (Array.isArray(detail)) {
        err.response.data.detail = detail.map(e => {
          const field = e.loc ? e.loc[e.loc.length - 1] : ''
          return `${field ? `'${field}': ` : ''}${e.msg}`
        }).join(', ')
      } else if (typeof detail === 'object') {
        err.response.data.detail = JSON.stringify(detail)
      }
    }

    return Promise.reject(err)
  }
)

export default api

// ── Auth ────────────────────────────────────────────────────────────────────
export const authAPI = {
  login:       (data) => api.post('/auth/token', new URLSearchParams(data), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }),
  register:    (data) => api.post('/auth/register', data),
  me:          ()     => api.get('/auth/me'),
  logout:      ()     => api.post('/auth/logout'),
  setupStatus: ()     => api.get('/auth/setup-status'),
}

// ── Products ─────────────────────────────────────────────────────────────────
export const productAPI = {
  list:       (params) => api.get('/products/', { params }),
  search:     (q, limit=20) => api.get('/products/search', { params: { q, limit } }),
  getById:    (id)     => api.get(`/products/${id}`),
  getByBarcode:(bc)    => api.get(`/products/barcode/${bc}`),
  create:     (data)   => api.post('/products/', data),
  update:     (id, d)  => api.put(`/products/${id}`, d),
  delete:     (id)     => api.delete(`/products/${id}`),
  bulkDelete: (ids)    => api.post('/products/bulk-delete', { ids }),
  bulkImport: (file)   => { const fd = new FormData(); fd.append('file', file); return api.post('/products/bulk-import', fd) },
  importImage: (file)  => { const fd = new FormData(); fd.append('file', file); return api.post('/products/import-image', fd) },
}

// ── Categories ───────────────────────────────────────────────────────────────
export const categoryAPI = {
  list:   ()       => api.get('/categories/'),
  create: (data)   => api.post('/categories/', data),
  update: (id, d)  => api.put(`/categories/${id}`, d),
  delete: (id)     => api.delete(`/categories/${id}`),
}

// ── Customers ────────────────────────────────────────────────────────────────
export const customerAPI = {
  list:         (params) => api.get('/customers/', { params }),
  outstanding:  ()       => api.get('/customers/outstanding'),
  getById:      (id)     => api.get(`/customers/${id}`),
  create:       (data)   => api.post('/customers/', data),
  update:       (id, d)  => api.put(`/customers/${id}`, d),
  delete:       (id)     => api.delete(`/customers/${id}`),
  ledger:       (id, p)  => api.get(`/customers/${id}/ledger`, { params: p }),
  transactions: (id, p)  => api.get(`/customers/${id}/transactions`, { params: p }),
}

// ── Suppliers ─────────────────────────────────────────────────────────────────
export const supplierAPI = {
  list:      (params) => api.get('/suppliers/', { params }),
  getById:   (id)     => api.get(`/suppliers/${id}`),
  create:    (data)   => api.post('/suppliers/', data),
  update:    (id, d)  => api.put(`/suppliers/${id}`, d),
  delete:    (id)     => api.delete(`/suppliers/${id}`),
  ledger:    (id, p)  => api.get(`/suppliers/${id}/ledger`, { params: p }),
  purchases: (id, p)  => api.get(`/suppliers/${id}/purchases`, { params: p }),
}

// ── Sales ────────────────────────────────────────────────────────────────────
export const salesAPI = {
  list:        (params) => api.get('/sales/', { params }),
  today:       ()       => api.get('/sales/today'),
  getById:     (id)     => api.get(`/sales/${id}`),
  create:      (data)   => api.post('/sales/', data),
  payment:     (id, amt, mode) => api.post(`/sales/${id}/payment`, null, { params: { amount: amt, payment_mode: mode } }),
  // Fetch PDF as blob (authenticated) and return a local blob URL
  getPdfBlob: async (id) => {
    const token = localStorage.getItem('token')
    const resp = await fetch(`${apiURL}/sales/${id}/pdf`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!resp.ok) throw new Error('Failed to fetch invoice PDF')
    const blob = await resp.blob()
    return URL.createObjectURL(blob)
  }
}

// ── Purchases ────────────────────────────────────────────────────────────────
export const purchaseAPI = {
  list:    (params) => api.get('/purchases/', { params }),
  today:   ()       => api.get('/purchases/today'),
  getById: (id)     => api.get(`/purchases/${id}`),
  create:  (data)   => api.post('/purchases/', data),
}

// ── Payments ─────────────────────────────────────────────────────────────────
export const paymentAPI = {
  list:   (params) => api.get('/payments/', { params }),
  create: (data)   => api.post('/payments/', data),
}

// ── Inventory ────────────────────────────────────────────────────────────────
export const inventoryAPI = {
  status:   ()     => api.get('/inventory/stock-status'),
  lowStock: (p)    => api.get('/inventory/low-stock', { params: p }),
  logs:     (p)    => api.get('/inventory/stock-logs', { params: p }),
  batches:  (p)    => api.get('/inventory/batches', { params: p }),
  adjust:   (data) => api.post('/inventory/adjust', data),
}

// ── Reports ──────────────────────────────────────────────────────────────────
export const reportAPI = {
  dashboard:        ()  => api.get('/reports/dashboard'),
  sales:            (p) => api.get('/reports/sales', { params: p }),
  purchases:        (p) => api.get('/reports/purchases', { params: p }),
  gstSummary:       (p) => api.get('/reports/gst-summary', { params: p }),
  profitLoss:       (p) => api.get('/reports/profit-loss', { params: p }),
  stock:            (p) => api.get('/reports/stock', { params: p }),
  outstanding:      (p) => api.get('/reports/outstanding', { params: p }),
  productWiseSales: (p) => api.get('/reports/product-wise-sales', { params: p }),
}

// ── Settings ─────────────────────────────────────────────────────────────────
export const settingsAPI = {
  getCompany:    ()     => api.get('/settings/company'),
  updateCompany: (data) => api.put('/settings/company', data),
  getUnits:      ()     => api.get('/settings/units'),
}

// ── Backup ───────────────────────────────────────────────────────────────────
export const backupAPI = {
  create:   ()         => api.post('/backup/create'),
  list:     ()         => api.get('/backup/list'),
  download: (filename) => `${api.defaults.baseURL}/backup/download/${filename}`,
  restore:  (filename) => api.post(`/backup/restore/${filename}`),
}

// ── Users ────────────────────────────────────────────────────────────────────
export const userAPI = {
  list:           ()     => api.get('/users/'),
  create:         (data) => api.post('/users/', data),
  update:         (id,d) => api.put(`/users/${id}`, d),
  delete:         (id)   => api.delete(`/users/${id}`),
  changePassword: (data) => api.post('/users/change-password', data),
  updateProfile:  (data) => api.put('/users/profile', data),
}

// ── Health Check ─────────────────────────────────────────────────────────────
export const healthAPI = {
  check: () => api.get('/health', { timeout: 5000 }),
}
