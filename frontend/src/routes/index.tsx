import React, { Suspense } from "react"
import { createBrowserRouter } from "react-router-dom"
import { StaffRouteGuard, CustomerRouteGuard } from "@/features/auth/RouteGuards"
import { StaffShell } from "@/components/layout/StaffShell"
import { CustomerShell } from "@/components/layout/CustomerShell"
import {
  CreditCard,
  FileText,
  HelpCircle,
  Receipt,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
} from "lucide-react"

// Lazy loaded page chunks for modular code splitting
const HomePage = React.lazy(() => import("./Home").then((m) => ({ default: m.HomePage })))
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
const ModulePlaceholder = React.lazy(() =>
  import("./ModulePlaceholder").then((m) => ({ default: m.ModulePlaceholder }))
)
const CustomerModulePlaceholder = React.lazy(() =>
  import("./CustomerModulePlaceholder").then((m) => ({ default: m.CustomerModulePlaceholder }))
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
    element: withSuspense(<HomePage />),
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
          {withSuspense(
            <ModulePlaceholder
              name="Expenses"
              description="Operational business overheads and expenditures"
              icon={Receipt}
            />
          )}
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/reports",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Accountant"]}>
        <StaffShell>
          {withSuspense(
            <ModulePlaceholder
              name="Reports"
              description="Financial analytics and operational auditing"
              icon={TrendingUp}
            />
          )}
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/support",
    element: (
      <StaffRouteGuard>
        <StaffShell>
          {withSuspense(
            <ModulePlaceholder
              name="Support"
              description="Customer issue tickets and escalations"
              icon={HelpCircle}
            />
          )}
        </StaffShell>
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
        <CustomerShell>
          {withSuspense(
            <CustomerModulePlaceholder
              name="Purchases"
              description="View orders and purchase history"
              icon={ShoppingBag}
            />
          )}
        </CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/invoices",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>
          {withSuspense(
            <CustomerModulePlaceholder
              name="Invoices"
              description="Download VAT/GST invoices and receipts"
              icon={FileText}
            />
          )}
        </CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/payments",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>
          {withSuspense(
            <CustomerModulePlaceholder
              name="Payments"
              description="Payment history and receipts"
              icon={CreditCard}
            />
          )}
        </CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/emi",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>
          {withSuspense(
            <CustomerModulePlaceholder
              name="EMI"
              description="EMI schedule and upcoming installments"
              icon={RotateCcw}
            />
          )}
        </CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/warranty",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>
          {withSuspense(
            <CustomerModulePlaceholder
              name="Warranty"
              description="Product warranty registration and coverage"
              icon={ShieldCheck}
            />
          )}
        </CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/support",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>
          {withSuspense(
            <CustomerModulePlaceholder
              name="Support"
              description="Customer support requests and inquiries"
              icon={HelpCircle}
            />
          )}
        </CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/profile",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>
          {withSuspense(
            <CustomerModulePlaceholder
              name="Profile"
              description="Account preferences and contact details"
            />
          )}
        </CustomerShell>
      </CustomerRouteGuard>
    ),
  },
])
