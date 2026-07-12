import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
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

function App() {
  return (
    <ThemeProvider>
      <CommandPaletteProvider>
        <AuthProvider>
          <Toaster
            position="top-right"
            gutter={8}
            toastOptions={{
              duration: 3500,
              style: {
                fontFamily: "'Inter', 'Plus Jakarta Sans', system-ui, sans-serif",
                fontSize: '13px',
                fontWeight: '500',
                borderRadius: '12px',
                padding: '12px 16px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.04), 0 12px 40px rgba(0,0,0,0.12)',
                border: '1px solid rgba(229,231,235,0.7)',
                backdropFilter: 'blur(16px)',
                maxWidth: '380px',
              },
              success: {
                iconTheme: { primary: '#10b981', secondary: '#fff' },
                style: {
                  background: 'rgba(255,255,255,0.97)',
                  color: '#111827',
                  borderLeft: '3px solid #10b981',
                },
              },
              error: {
                iconTheme: { primary: '#ef4444', secondary: '#fff' },
                style: {
                  background: 'rgba(255,255,255,0.97)',
                  color: '#111827',
                  borderLeft: '3px solid #ef4444',
                },
              },
            }}
          />
          <RouterProvider router={router} />
        </AuthProvider>
      </CommandPaletteProvider>
    </ThemeProvider>
  )
}

export default App
