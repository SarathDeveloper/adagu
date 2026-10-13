import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { RequireAuth } from '../features/auth/RequireAuth'
import { LoginPage } from '../features/auth/LoginPage'
import { AdaguLayout } from '../features/pledges/AdaguLayout'
import { ReportsLayout } from '../features/reports/ReportsLayout'
import {
  GoldSavingsIndexRedirect,
  GoldSavingsLayout,
} from '../features/goldSavings/GoldSavingsLayout'
import { RouteErrorPage } from '../components/RouteErrorPage'
import { NotFoundPage } from '../components/NotFoundPage'
import {
  AccountDetailPage,
  AccountsListPage,
  AdaguListPage,
  ChangePasswordPage,
  ShopSetupPage,
  CollectionsPage,
  CustomersPage,
  DashboardPage,
  DuesPage,
  EnrollmentPage,
  GoldSavingsDashboardPage,
  GoldSavingsReportsPage,
  MaturityPage,
  MetalRatesPage,
  OverdueAgingPage,
  PledgeEditorPage,
  ReportViewPage,
  SchemeConfigPage,
  SchemeLedgerPage,
  SettingsPage,
  UsersPage,
} from './lazyPages'

/**
 * The application's routes.
 *
 * Layouts and the auth gate are static because they wrap everything. Pages come
 * from `lazyPages.ts`. The `/print/*` routes are not here: they are served by a
 * separate `print.html` document, see `src/print/printRoutes.tsx`.
 *
 * The app is Adagu and Gold Savings only. The old `/billing/*` and inventory
 * paths still redirect so bookmarks and stale links do not 404.
 */
export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: '/login',
        element: <LoginPage />,
      },
      {
        path: '/change-password',
        element: (
          <RequireAuth>
            <ChangePasswordPage />
          </RequireAuth>
        ),
      },
      {
        path: '/setup',
        element: (
          <RequireAuth>
            <ShopSetupPage />
          </RequireAuth>
        ),
      },
      {
        path: '/',
        element: (
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        ),
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: <DashboardPage /> },
          {
            path: 'adagu',
            element: <AdaguLayout />,
            children: [
              { index: true, element: <AdaguListPage /> },
              { path: 'new', element: <PledgeEditorPage /> },
              { path: ':id', element: <PledgeEditorPage /> },
            ],
          },
          { path: 'customers', element: <CustomersPage /> },
          { path: 'dues', element: <DuesPage /> },
          {
            path: 'reports',
            element: <ReportsLayout />,
            children: [
              { index: true, element: <Navigate to="/reports/active-pledges" replace /> },
              { path: ':reportId', element: <ReportViewPage /> },
            ],
          },
          { path: 'rates', element: <MetalRatesPage /> },
          {
            path: 'gold-savings',
            element: <GoldSavingsLayout />,
            children: [
              { index: true, element: <GoldSavingsIndexRedirect /> },
              { path: 'dashboard', element: <GoldSavingsDashboardPage /> },
              { path: 'schemes', element: <SchemeConfigPage /> },
              { path: 'enroll', element: <EnrollmentPage /> },
              { path: 'accounts', element: <AccountsListPage /> },
              { path: 'accounts/:id', element: <AccountDetailPage /> },
              { path: 'collections', element: <CollectionsPage /> },
              { path: 'ledger', element: <SchemeLedgerPage /> },
              { path: 'maturity', element: <MaturityPage /> },
              { path: 'overdue', element: <OverdueAgingPage /> },
              { path: 'reports', element: <GoldSavingsReportsPage /> },
            ],
          },
          { path: 'settings', element: <SettingsPage /> },
          { path: 'users', element: <UsersPage /> },

          // Retired modules. Keep old links working.
          { path: 'billing', element: <Navigate to="/adagu" replace /> },
          { path: 'billing/*', element: <Navigate to="/adagu" replace /> },
          { path: 'invoices', element: <Navigate to="/adagu" replace /> },
          { path: 'invoices/*', element: <Navigate to="/adagu" replace /> },
          { path: 'inventory/*', element: <Navigate to="/dashboard" replace /> },
          { path: 'products', element: <Navigate to="/dashboard" replace /> },
          { path: 'stock', element: <Navigate to="/dashboard" replace /> },
          { path: 'suppliers', element: <Navigate to="/dashboard" replace /> },
          { path: 'inwards', element: <Navigate to="/dashboard" replace /> },
          { path: 'inwards/*', element: <Navigate to="/dashboard" replace /> },
        ],
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
])
