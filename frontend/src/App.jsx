import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { CommandPaletteProvider } from './context/CommandPaletteContext'

// Layout
import AppLayout from './components/layout/AppLayout'

// Pages
import LoginPage      from './pages/LoginPage'
import DashboardPage  from './pages/DashboardPage'
import ProductsPage   from './pages/ProductsPage'
import CustomersPage  from './pages/CustomersPage'
import SuppliersPage  from './pages/SuppliersPage'
import SalesPage      from './pages/SalesPage'
import NewSalePage    from './pages/NewSalePage'
import SmartCartPage  from './pages/SmartCartPage'
import PurchasesPage  from './pages/PurchasesPage'
import NewPurchasePage from './pages/NewPurchasePage'
import InventoryPage  from './pages/InventoryPage'
import ReportsPage    from './pages/ReportsPage'
import PaymentsPage   from './pages/PaymentsPage'
import SettingsPage   from './pages/SettingsPage'
import ReturnsPage      from './pages/ReturnsPage'
import TraceabilityPage from './pages/TraceabilityPage'
import HomePage         from './pages/HomePage'
import DocumentsListPage from './pages/documents/DocumentsListPage'
import LetterheadPage    from './pages/documents/LetterheadPage'

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />
  },
  {
    path: '/login',
    element: <LoginPage />
  },
  {
    element: <PrivateRoute><AppLayout /></PrivateRoute>,
    children: [
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'suppliers', element: <SuppliersPage /> },
      { path: 'sales', element: <SalesPage /> },
      { path: 'sales/new', element: <SmartCartPage /> },
      { path: 'purchases', element: <PurchasesPage /> },
      { path: 'purchases/new', element: <NewPurchasePage /> },
      { path: 'inventory', element: <InventoryPage /> },
      { path: 'returns', element: <ReturnsPage /> },
      { path: 'traceability', element: <TraceabilityPage /> },
      { path: 'payments', element: <PaymentsPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'documents', element: <DocumentsListPage /> },
      { path: 'documents/new', element: <LetterheadPage /> },
      { path: 'documents/:id', element: <LetterheadPage /> },
    ]
  }
])

function GlobalToaster() {
  const { dark } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || typeof document === 'undefined') return null

  return createPortal(
    <Toaster
      position="top-right"
      gutter={10}
      containerStyle={{
        zIndex: 9999999,
        pointerEvents: 'none',
      }}
      toastOptions={{
        duration: 4000,
        style: {
          pointerEvents: 'auto',
          fontFamily: "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif",
          fontSize: '13px',
          fontWeight: '500',
          borderRadius: '16px',
          padding: '12px 18px',
          maxWidth: '420px',
          background: dark ? 'rgba(20, 20, 26, 0.94)' : 'rgba(255, 255, 255, 0.96)',
          color: dark ? '#f8fafc' : '#0f172a',
          border: dark ? '1px solid rgba(255, 255, 255, 0.16)' : '1px solid rgba(0, 0, 0, 0.08)',
          boxShadow: dark
            ? '0 24px 60px rgba(0, 0, 0, 0.8), inset 0 0.5px 0 rgba(255, 255, 255, 0.4), 0 0 0 0.5px rgba(255, 255, 255, 0.08)'
            : '0 20px 50px rgba(0, 0, 0, 0.12), inset 0 0.5px 0 rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(32px) saturate(180%)',
          WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        },
        success: {
          iconTheme: { primary: '#10b981', secondary: '#ffffff' },
          style: {
            borderLeft: '4px solid #10b981',
          },
        },
        error: {
          iconTheme: { primary: '#ef4444', secondary: '#ffffff' },
          style: {
            borderLeft: '4px solid #ef4444',
          },
        },
        loading: {
          iconTheme: { primary: '#0a84ff', secondary: '#ffffff' },
          style: {
            borderLeft: '4px solid #0a84ff',
          },
        },
      }}
    />,
    document.body
  )
}

function App() {
  return (
    <ThemeProvider>
      <CommandPaletteProvider>
        <AuthProvider>
          <GlobalToaster />
          <RouterProvider router={router} />
        </AuthProvider>
      </CommandPaletteProvider>
    </ThemeProvider>
  )
}

export default App
