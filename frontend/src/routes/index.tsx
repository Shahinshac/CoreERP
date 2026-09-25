import React, { Suspense } from "react"
import { createBrowserRouter } from "react-router-dom"
import { StaffRouteGuard, CustomerRouteGuard } from "@/features/auth/RouteGuards"
import { StaffShell } from "@/components/layout/StaffShell"
import { CustomerShell } from "@/components/layout/CustomerShell"

// Lazy loaded page chunks for modular code splitting
const StaffLoginPage = React.lazy(() =>
  import("./auth/StaffLogin").then((m) => ({ default: m.StaffLoginPage }))
)
const CustomerLoginPage = React.lazy(() =>
  import("./auth/CustomerLogin").then((m) => ({ default: m.CustomerLoginPage }))
)
const CustomerRegisterPage = React.lazy(() =>
  import("./auth/CustomerRegister").then((m) => ({ default: m.CustomerRegisterPage }))
)
const StaffDashboard = React.lazy(() =>
  import("./StaffDashboard").then((m) => ({ default: m.StaffDashboard }))
)
const CustomerDashboard = React.lazy(() =>
  import("./CustomerDashboard").then((m) => ({ default: m.CustomerDashboard }))
)

// Real Functional Modules
const ProductsPage = React.lazy(() => import("./staff/ProductsPage"))
const InventoryPage = React.lazy(() => import("./staff/InventoryPage"))
const POSPage = React.lazy(() => import("./staff/POSPage"))
const CustomersPage = React.lazy(() => import("./staff/CustomersPage"))
const ReturnsPage = React.lazy(() => import("./staff/ReturnsPage"))
const InvoicesPage = React.lazy(() => import("./staff/InvoicesPage"))
const InvoiceDetailPage = React.lazy(() => import("./staff/InvoiceDetailPage"))
const PaymentsPage = React.lazy(() => import("./staff/PaymentsPage"))
const EmiPage = React.lazy(() => import("./staff/EmiPage"))
const EmiDetailPage = React.lazy(() => import("./staff/EmiDetailPage"))
const StaffManagementPage = React.lazy(() => import("./staff/StaffManagementPage"))
const SalaryRecordsPage = React.lazy(() => import("./staff/SalaryRecordsPage"))
const ExpensesPage = React.lazy(() => import("./staff/ExpensesPage"))
const ReportsPage = React.lazy(() => import("./staff/ReportsPage"))
const WarrantiesPage = React.lazy(() => import("./staff/WarrantiesPage"))
const TicketsPage = React.lazy(() => import("./staff/TicketsPage"))
const AuditLogsPage = React.lazy(() => import("./staff/AuditLogsPage"))

// Customer Portal Modules
const CustomerPurchasesPage = React.lazy(() => import("./portal/CustomerPurchasesPage"))
const CustomerInvoicesPage = React.lazy(() => import("./portal/CustomerInvoicesPage"))
const CustomerInvoiceDetailPage = React.lazy(() => import("./portal/CustomerInvoiceDetailPage"))
const CustomerPaymentsPage = React.lazy(() => import("./portal/CustomerPaymentsPage"))
const CustomerEmiPage = React.lazy(() => import("./portal/CustomerEmiPage"))
const CustomerProfilePage = React.lazy(() => import("./portal/CustomerProfilePage"))
const CustomerWarrantyPage = React.lazy(() => import("./portal/CustomerWarrantyPage"))
const CustomerSupportPage = React.lazy(() => import("./portal/CustomerSupportPage"))

// Fallback spinner / skeleton
const PageLoadingFallback = () => (
  <div className="p-8 space-y-4 max-w-6xl mx-auto animate-pulse">
    <div className="h-8 bg-slate-200 rounded w-1/4"></div>
    <div className="h-4 bg-slate-100 rounded w-1/2"></div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
      <div className="h-24 bg-slate-100 rounded-xl"></div>
      <div className="h-24 bg-slate-100 rounded-xl"></div>
      <div className="h-24 bg-slate-100 rounded-xl"></div>
    </div>
    <div className="h-64 bg-slate-100 rounded-xl mt-6"></div>
  </div>
)

const withSuspense = (component: React.ReactNode) => (
  <Suspense fallback={<PageLoadingFallback />}>{component}</Suspense>
)

export const router = createBrowserRouter([
  // Public Routes
  {
    path: "/",
    element: withSuspense(<CustomerLoginPage />),
  },
  {
    path: "/staff/login",
    element: withSuspense(<StaffLoginPage />),
  },
  {
    path: "/customer/login",
    element: withSuspense(<CustomerLoginPage />),
  },
  {
    path: "/customer/register",
    element: withSuspense(<CustomerRegisterPage />),
  },

  // Staff Portal Routes
  {
    path: "/staff",
    element: (
      <StaffRouteGuard>
        <StaffShell>{withSuspense(<StaffDashboard />)}</StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/products",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff"]}>
        <StaffShell>{withSuspense(<ProductsPage />)}</StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/inventory",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff"]}>
        <StaffShell>{withSuspense(<InventoryPage />)}</StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/sales",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff"]}>
        <StaffShell>{withSuspense(<POSPage />)}</StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/returns",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff"]}>
        <StaffShell>{withSuspense(<ReturnsPage />)}</StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/customers",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff"]}>
        <StaffShell>{withSuspense(<CustomersPage />)}</StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/invoices",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff", "Accountant"]}>
        <StaffShell>{withSuspense(<InvoicesPage />)}</StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/invoices/:id",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff", "Accountant"]}>
        <StaffShell>{withSuspense(<InvoiceDetailPage />)}</StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/payments",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff", "Accountant"]}>
        <StaffShell>
          {withSuspense(<PaymentsPage />)}
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/emi",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff", "Accountant"]}>
        <StaffShell>
          {withSuspense(<EmiPage />)}
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/emi/:id",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff", "Accountant"]}>
        <StaffShell>
          {withSuspense(<EmiDetailPage />)}
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/staff-management",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager"]}>
        <StaffShell>
          {withSuspense(<StaffManagementPage />)}
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/salary",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Accountant", "Staff"]}>
        <StaffShell>
          {withSuspense(<SalaryRecordsPage />)}
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/expenses",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Accountant"]}>
        <StaffShell>
          {withSuspense(<ExpensesPage />)}
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/reports",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Accountant"]}>
        <StaffShell>
          {withSuspense(<ReportsPage />)}
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/warranties",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff"]}>
        <StaffShell>{withSuspense(<WarrantiesPage />)}</StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/tickets",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff"]}>
        <StaffShell>{withSuspense(<TicketsPage />)}</StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/audit-logs",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin"]}>
        <StaffShell>{withSuspense(<AuditLogsPage />)}</StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/support",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff"]}>
        <StaffShell>{withSuspense(<TicketsPage />)}</StaffShell>
      </StaffRouteGuard>
    ),
  },

  // Customer Portal Routes
  {
    path: "/portal",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>{withSuspense(<CustomerDashboard />)}</CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/purchases",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>{withSuspense(<CustomerPurchasesPage />)}</CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/invoices",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>{withSuspense(<CustomerInvoicesPage />)}</CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/invoices/:id",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>{withSuspense(<CustomerInvoiceDetailPage />)}</CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/payments",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>{withSuspense(<CustomerPaymentsPage />)}</CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/emi",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>{withSuspense(<CustomerEmiPage />)}</CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/warranty",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>{withSuspense(<CustomerWarrantyPage />)}</CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/support",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>{withSuspense(<CustomerSupportPage />)}</CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/profile",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>{withSuspense(<CustomerProfilePage />)}</CustomerShell>
      </CustomerRouteGuard>
    ),
  },
])
