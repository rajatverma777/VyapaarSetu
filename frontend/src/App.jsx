import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'

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
      { path: 'settings', element: <SettingsPage /> }
    ]
  }
])

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: { fontSize: '14px' },
            success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
            error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
