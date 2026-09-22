import { createBrowserRouter } from "react-router-dom"
import { HomePage } from "./Home"
import { StaffLoginPage } from "./auth/StaffLogin"
import { CustomerLoginPage } from "./auth/CustomerLogin"
import { CustomerRegisterPage } from "./auth/CustomerRegister"
import { StaffDashboard } from "./StaffDashboard"
import { ModulePlaceholder } from "./ModulePlaceholder"
import { CustomerDashboard } from "./CustomerDashboard"
import { CustomerModulePlaceholder } from "./CustomerModulePlaceholder"
import { StaffRouteGuard, CustomerRouteGuard } from "@/features/auth/RouteGuards"
import { StaffShell } from "@/components/layout/StaffShell"
import { CustomerShell } from "@/components/layout/CustomerShell"
import {
  Boxes,
  CreditCard,
  FileText,
  HelpCircle,
  Package,
  Receipt,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react"

export const router = createBrowserRouter([
  // Public
  {
    path: "/",
    element: <HomePage />,
  },
  {
    path: "/staff/login",
    element: <StaffLoginPage />,
  },
  {
    path: "/customer/login",
    element: <CustomerLoginPage />,
  },
  {
    path: "/customer/register",
    element: <CustomerRegisterPage />,
  },

  // Staff Portal Routes
  {
    path: "/staff",
    element: (
      <StaffRouteGuard>
        <StaffShell>
          <StaffDashboard />
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/products",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff"]}>
        <StaffShell>
          <ModulePlaceholder name="Products" description="Manage product catalog, SKUs, and pricing" icon={Package} />
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/inventory",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff"]}>
        <StaffShell>
          <ModulePlaceholder name="Inventory" description="Stock ledger and stock movement auditing" icon={Boxes} />
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/sales",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff"]}>
        <StaffShell>
          <ModulePlaceholder name="Sales" description="Sales orders, POS, and supplier purchases" icon={ShoppingBag} />
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/customers",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff"]}>
        <StaffShell>
          <ModulePlaceholder name="Customers" description="Customer directory and relationship profiles" icon={Users} />
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/invoices",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff", "Accountant"]}>
        <StaffShell>
          <ModulePlaceholder name="Invoices" description="Customer billing and tax invoice generation" icon={FileText} />
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/payments",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff", "Accountant"]}>
        <StaffShell>
          <ModulePlaceholder name="Payments" description="Payment transactions and settlement records" icon={CreditCard} />
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/emi",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Staff"]}>
        <StaffShell>
          <ModulePlaceholder name="EMI" description="Installment financing and repayment tracking" icon={RotateCcw} />
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/staff-management",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin"]}>
        <StaffShell>
          <ModulePlaceholder name="Staff" description="Staff user directory and RBAC permissions" icon={UserCheck} />
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/expenses",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Accountant"]}>
        <StaffShell>
          <ModulePlaceholder name="Expenses" description="Operational business overheads and expenditures" icon={Receipt} />
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/reports",
    element: (
      <StaffRouteGuard allowedRoles={["Super Admin", "Admin", "Manager", "Accountant"]}>
        <StaffShell>
          <ModulePlaceholder name="Reports" description="Financial analytics and operational auditing" icon={TrendingUp} />
        </StaffShell>
      </StaffRouteGuard>
    ),
  },
  {
    path: "/staff/support",
    element: (
      <StaffRouteGuard>
        <StaffShell>
          <ModulePlaceholder name="Support" description="Customer issue tickets and escalations" icon={HelpCircle} />
        </StaffShell>
      </StaffRouteGuard>
    ),
  },

  // Customer Portal Routes
  {
    path: "/portal",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>
          <CustomerDashboard />
        </CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/purchases",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>
          <CustomerModulePlaceholder name="Purchases" description="View orders and purchase history" icon={ShoppingBag} />
        </CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/invoices",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>
          <CustomerModulePlaceholder name="Invoices" description="Download VAT/GST invoices and receipts" icon={FileText} />
        </CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/payments",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>
          <CustomerModulePlaceholder name="Payments" description="Payment history and receipts" icon={CreditCard} />
        </CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/emi",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>
          <CustomerModulePlaceholder name="EMI" description="EMI schedule and upcoming installments" icon={RotateCcw} />
        </CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/warranty",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>
          <CustomerModulePlaceholder name="Warranty" description="Product warranty registration and coverage" icon={ShieldCheck} />
        </CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/support",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>
          <CustomerModulePlaceholder name="Support" description="Customer support requests and inquiries" icon={HelpCircle} />
        </CustomerShell>
      </CustomerRouteGuard>
    ),
  },
  {
    path: "/portal/profile",
    element: (
      <CustomerRouteGuard>
        <CustomerShell>
          <CustomerModulePlaceholder name="Profile" description="Account preferences and contact details" />
        </CustomerShell>
      </CustomerRouteGuard>
    ),
  },
])
