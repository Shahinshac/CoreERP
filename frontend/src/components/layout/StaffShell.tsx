import React, { useMemo, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  DollarSign,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react"
import { CommandItem, CommandPalette } from "@/components/common/CommandPalette"
import { StaffGlobalSearch } from "@/components/layout/StaffGlobalSearch"
import { NotificationBell } from "@/components/notifications/NotificationBell"
import { StaffRole, useAuth } from "@/features/auth/AuthContext"
import { StaffSecurityModal } from "@/features/auth/StaffSecurityModal"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

interface NavItem {
  title: string
  href: string
  icon: React.ElementType
  allowedRoles?: StaffRole[]
}

const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", href: "/staff", icon: LayoutDashboard },
  { title: "Products", href: "/staff/products", icon: Package, allowedRoles: ["Super Admin", "Admin", "Manager", "Staff"] },
  { title: "Inventory", href: "/staff/inventory", icon: Boxes, allowedRoles: ["Super Admin", "Admin", "Manager", "Staff"] },
  { title: "Sales", href: "/staff/sales", icon: ShoppingBag, allowedRoles: ["Super Admin", "Admin", "Manager", "Staff"] },
  { title: "Returns", href: "/staff/returns", icon: RotateCcw, allowedRoles: ["Super Admin", "Admin", "Manager", "Staff"] },
  { title: "Customers", href: "/staff/customers", icon: Users, allowedRoles: ["Super Admin", "Admin", "Manager", "Staff"] },
  { title: "Invoices", href: "/staff/invoices", icon: FileText, allowedRoles: ["Super Admin", "Admin", "Manager", "Staff", "Accountant"] },
  { title: "Payments", href: "/staff/payments", icon: CreditCard, allowedRoles: ["Super Admin", "Admin", "Manager", "Staff", "Accountant"] },
  { title: "EMI", href: "/staff/emi", icon: RotateCcw, allowedRoles: ["Super Admin", "Admin", "Manager", "Staff"] },
  { title: "Staff", href: "/staff/staff-management", icon: UserCheck, allowedRoles: ["Super Admin", "Admin", "Manager"] },
  { title: "Payroll", href: "/staff/salary", icon: DollarSign, allowedRoles: ["Super Admin", "Admin", "Accountant", "Manager", "Staff"] },
  { title: "Expenses", href: "/staff/expenses", icon: Receipt, allowedRoles: ["Super Admin", "Admin", "Manager", "Accountant"] },
  { title: "Reports", href: "/staff/reports", icon: TrendingUp, allowedRoles: ["Super Admin", "Admin", "Manager", "Accountant"] },
  { title: "Warranties", href: "/staff/warranties", icon: ShieldCheck, allowedRoles: ["Super Admin", "Admin", "Manager", "Staff"] },
  { title: "Tickets", href: "/staff/tickets", icon: HelpCircle, allowedRoles: ["Super Admin", "Admin", "Manager", "Staff"] },
  { title: "Audit Logs", href: "/staff/audit-logs", icon: ShieldAlert, allowedRoles: ["Super Admin", "Admin"] },
]

export const StaffShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [securityModalOpen, setSecurityModalOpen] = useState(false)

  const staffUser = user as { email: string; role: StaffRole } | null
  const currentRole = staffUser?.role || "Staff"

  // Filter nav items by RBAC permissions
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (!item.allowedRoles) return true
    if (currentRole === "Super Admin") return true
    return item.allowedRoles.includes(currentRole)
  })

  const handleLogout = async () => {
    await logout()
    navigate("/staff/login")
  }

  // Define full command palette items for staff with strict RBAC filtering
  const staffCommands: CommandItem[] = useMemo(() => {
    const rawCommands: (CommandItem & { allowedRoles?: StaffRole[] })[] = [
      // Quick Actions
      {
        id: "quick-new-sale",
        title: "New Sale (POS)",
        description: "Open Point of Sale register to start a new transaction",
        category: "Quick Actions",
        href: "/staff/sales",
        icon: ShoppingBag,
        keywords: ["new sale", "checkout", "pos", "sell", "billing"],
        allowedRoles: ["Super Admin", "Admin", "Manager", "Staff"],
      },
      {
        id: "quick-new-product",
        title: "New Product",
        description: "Add a new product to the catalog with pricing and stock",
        category: "Quick Actions",
        href: "/staff/products?action=new",
        icon: Plus,
        keywords: ["new product", "add item", "create product", "stock item"],
        allowedRoles: ["Super Admin", "Admin", "Manager"],
      },
      {
        id: "quick-new-expense",
        title: "New Expense",
        description: "Record a new operational expense, bill, or payout",
        category: "Quick Actions",
        href: "/staff/expenses?action=new",
        icon: Receipt,
        keywords: ["new expense", "add expense", "spending", "record cost"],
        allowedRoles: ["Super Admin", "Admin", "Manager", "Accountant"],
      },
      {
        id: "staff-dashboard",
        title: "Staff Dashboard",
        description: "Overview metrics, KPIs, and operational summary",
        category: "Navigation",
        href: "/staff",
        icon: LayoutDashboard,
        keywords: ["overview", "kpi", "home", "stats", "summary"],
      },
      {
        id: "staff-pos",
        title: "Point of Sale (POS)",
        description: "Rapid checkout terminal, barcode scanning, split payments & receipts",
        category: "Sales & Orders",
        href: "/staff/sales",
        icon: ShoppingBag,
        keywords: ["pos", "checkout", "barcode", "billing", "counter", "register", "cart", "cash drawer"],
        allowedRoles: ["Super Admin", "Admin", "Manager", "Staff"],
      },
      {
        id: "staff-returns",
        title: "Sales Returns & Refunds",
        description: "Process product returns, refunds, and restore inventory stock",
        category: "Sales & Orders",
        href: "/staff/returns",
        icon: RotateCcw,
        keywords: ["return", "refund", "exchange", "credit note"],
        allowedRoles: ["Super Admin", "Admin", "Manager", "Staff"],
      },
      {
        id: "staff-customers",
        title: "Customers Directory",
        description: "Manage customer profiles, contact info, and purchase histories",
        category: "Sales & Orders",
        href: "/staff/customers",
        icon: Users,
        keywords: ["clients", "buyers", "directory", "contacts", "phone"],
        allowedRoles: ["Super Admin", "Admin", "Manager", "Staff"],
      },
      {
        id: "staff-invoices",
        title: "Invoices & Billing",
        description: "Generate and download GST-compliant tax invoices and receipts",
        category: "Sales & Orders",
        href: "/staff/invoices",
        icon: FileText,
        keywords: ["invoices", "bills", "gst", "tax invoice", "receipts"],
        allowedRoles: ["Super Admin", "Admin", "Manager", "Staff", "Accountant"],
      },
      {
        id: "staff-products",
        title: "Products Catalog",
        description: "Catalog management, pricing, SKU/barcode lookup, and categories",
        category: "Inventory & Products",
        href: "/staff/products",
        icon: Package,
        keywords: ["products", "items", "catalog", "sku", "barcode", "pricing", "mrp"],
        allowedRoles: ["Super Admin", "Admin", "Manager", "Staff"],
      },
      {
        id: "staff-inventory",
        title: "Stock & Inventory",
        description: "Real-time stock tracking, restock adjustments, and minimum stock alerts",
        category: "Inventory & Products",
        href: "/staff/inventory",
        icon: Boxes,
        keywords: ["inventory", "stock", "warehouse", "adjustment", "reorder", "quantity"],
        allowedRoles: ["Super Admin", "Admin", "Manager", "Staff"],
      },
      {
        id: "staff-payments",
        title: "Payments Ledger",
        description: "Record and track UPI, Card, Cash, and Cheque payment settlements",
        category: "Finance & Accounting",
        href: "/staff/payments",
        icon: CreditCard,
        keywords: ["payments", "transactions", "settlement", "upi", "card", "cash"],
        allowedRoles: ["Super Admin", "Admin", "Manager", "Staff", "Accountant"],
      },
      {
        id: "staff-emi",
        title: "EMI Financing Plans",
        description: "Customer installment plans, down payments, schedules, and collections",
        category: "Finance & Accounting",
        href: "/staff/emi",
        icon: RotateCcw,
        keywords: ["emi", "installments", "financing", "loans", "down payment", "schedules"],
        allowedRoles: ["Super Admin", "Admin", "Manager", "Staff", "Accountant"],
      },
      {
        id: "staff-expenses",
        title: "Expense Management",
        description: "Track operational expenses, petty cash, vendor payments, and receipts",
        category: "Finance & Accounting",
        href: "/staff/expenses",
        icon: Receipt,
        keywords: ["expenses", "spending", "petty cash", "costs", "vouchers", "bills"],
        allowedRoles: ["Super Admin", "Admin", "Manager", "Accountant"],
      },
      {
        id: "staff-reports",
        title: "Financial & Tax Reports",
        description: "Sales analytics, GST summary, profit & loss, and audit exports",
        category: "Finance & Accounting",
        href: "/staff/reports",
        icon: TrendingUp,
        keywords: ["reports", "analytics", "gst", "audit", "p&l", "export", "csv", "summary"],
        allowedRoles: ["Super Admin", "Admin", "Manager", "Accountant"],
      },
      {
        id: "staff-management",
        title: "Staff & User Roles",
        description: "Manage employee accounts, assign RBAC roles, and access permissions",
        category: "HR & Administration",
        href: "/staff/staff-management",
        icon: UserCheck,
        keywords: ["staff", "users", "roles", "employees", "permissions", "rbac"],
        allowedRoles: ["Super Admin", "Admin", "Manager"],
      },
      {
        id: "staff-salary",
        title: "Payroll & Salaries",
        description: "Generate salary records, record staff payouts, and track payroll",
        category: "HR & Administration",
        href: "/staff/salary",
        icon: DollarSign,
        keywords: ["payroll", "salary", "wages", "payslip", "compensation", "payouts"],
        allowedRoles: ["Super Admin", "Admin", "Manager", "Accountant", "Staff"],
      },
      {
        id: "staff-warranties",
        title: "Warranties & Guarantees",
        description: "Product warranty registrations, serial tracking, and validity verification",
        category: "Services & Support",
        href: "/staff/warranties",
        icon: ShieldCheck,
        keywords: ["warranty", "guarantee", "coverage", "serials", "claims"],
        allowedRoles: ["Super Admin", "Admin", "Manager", "Staff"],
      },
      {
        id: "staff-tickets",
        title: "Support Tickets",
        description: "Customer service desk, issue resolution, and support tickets",
        category: "Services & Support",
        href: "/staff/tickets",
        icon: HelpCircle,
        keywords: ["tickets", "support", "helpdesk", "issues", "complaints", "service"],
        allowedRoles: ["Super Admin", "Admin", "Manager", "Staff"],
      },
      {
        id: "staff-audit-logs",
        title: "Audit Logs & System Trail",
        description: "Review append-only compliance and security logs",
        category: "HR & Administration",
        href: "/staff/audit-logs",
        icon: ShieldAlert,
        keywords: ["audit", "logs", "security", "trail", "compliance", "events"],
        allowedRoles: ["Super Admin", "Admin"],
      },
      {
        id: "staff-logout",
        title: "Sign Out",
        description: "Securely terminate your staff session and return to login",
        category: "Account & Session",
        icon: LogOut,
        keywords: ["logout", "sign out", "exit", "leave"],
        action: handleLogout,
      },
    ]

    return rawCommands.filter((item) => {
      if (!item.allowedRoles) return true
      if (currentRole === "Super Admin") return true
      return item.allowedRoles.includes(currentRole)
    })
  }, [currentRole])

  // Find active item for breadcrumb
  const currentNavItem = NAV_ITEMS.find((item) => item.href === location.pathname) || {
    title: "Overview",
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-white/[0.14] bg-[#0C0C0E] transition-all duration-300 relative",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between border-b border-white/[0.14] px-4">
          {!collapsed && (
            <div className="flex items-center gap-2 font-bold text-base tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-xs">
                ERP
              </span>
              <span className="text-zinc-100 font-semibold tracking-tight">Enterprise Hub</span>
            </div>
          )}
          {collapsed && (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-xs mx-auto">
              E
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex h-6 w-6 items-center justify-center rounded-md border border-white/[0.16] text-muted-foreground hover:text-foreground hover:bg-[#18181C] transition-colors"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-none font-semibold"
                    : "text-zinc-300 hover:bg-[#18181C] hover:text-zinc-100",
                  collapsed && "justify-center px-2"
                )}
                title={collapsed ? item.title : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.title}</span>}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Mobile Drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <div className="flex items-center gap-2 font-bold text-base tracking-tight mb-6">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-xs">
            ERP
          </span>
          <span className="text-zinc-100 font-semibold tracking-tight">Enterprise Hub</span>
        </div>
        <nav className="flex-1 overflow-y-auto space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-none font-semibold"
                    : "text-zinc-300 hover:bg-[#18181C] hover:text-zinc-100"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.title}</span>
              </Link>
            )
          })}
        </nav>
      </Sheet>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="flex h-14 items-center justify-between border-b border-white/[0.14] bg-[#0C0C0E]/90 backdrop-blur-md px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-md border border-white/[0.16] text-muted-foreground hover:bg-[#18181C]"
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* Breadcrumb slot */}
            <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-muted-foreground">
              <span>Staff Portal</span>
              <span>/</span>
              <span className="text-foreground font-semibold">{currentNavItem.title}</span>
            </div>
          </div>

          {/* Center Global Search Dropdown */}
          <div className="hidden md:flex flex-1 max-w-xs lg:max-w-sm mx-4">
            <StaffGlobalSearch />
          </div>

          {/* Quick Command Palette Search Trigger */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2 rounded-lg border border-white/[0.12] bg-[#141417] px-2.5 sm:px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:border-white/[0.22] transition-colors"
            title="Open Command Palette (Ctrl+K)"
          >
            <Search className="h-3.5 w-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Commands</span>
            <kbd className="hidden sm:inline-flex items-center rounded border border-white/[0.12] bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
              ⌘K
            </kbd>
          </button>

          {/* User Menu & Notifications */}
          <div className="flex items-center gap-3">
            <NotificationBell type="staff" />

            <Badge variant="secondary" className="hidden sm:inline-flex">
              {currentRole}
            </Badge>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-2 cursor-pointer p-1 rounded-full hover:bg-white/5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs border border-primary/20">
                    {staffUser?.email.charAt(0).toUpperCase() || "S"}
                  </div>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-xs font-normal text-muted-foreground">Signed in as</div>
                  <div className="text-sm font-semibold truncate text-zinc-100">{staffUser?.email}</div>
                  <div className="text-xs text-primary font-medium mt-0.5">{currentRole}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setSecurityModalOpen(true)}
                  className="cursor-pointer text-zinc-200 hover:text-white"
                >
                  <ShieldCheck className="h-4 w-4 mr-2 text-primary" /> Security & 2FA
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout} className="text-rose-400 hover:text-rose-300 cursor-pointer">
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-background pb-20 md:pb-6">
          {children}
        </main>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="md:hidden flex items-center justify-around h-14 border-t border-white/[0.14] bg-[#0C0C0E]/95 backdrop-blur-md px-2 z-20 shrink-0">
          <Link
            to="/staff"
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors",
              location.pathname === "/staff"
                ? "text-primary font-bold"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <LayoutDashboard className="h-4 w-4 mb-0.5" />
            <span>Home</span>
          </Link>

          <Link
            to="/staff/sales"
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors",
              location.pathname.startsWith("/staff/sales")
                ? "text-primary font-bold"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <ShoppingBag className="h-4 w-4 mb-0.5" />
            <span>POS</span>
          </Link>

          <Link
            to="/staff/products"
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors",
              location.pathname.startsWith("/staff/products")
                ? "text-primary font-bold"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Package className="h-4 w-4 mb-0.5" />
            <span>Catalog</span>
          </Link>

          <Link
            to="/staff/invoices"
            className={cn(
              "flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium transition-colors",
              location.pathname.startsWith("/staff/invoices")
                ? "text-primary font-bold"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <FileText className="h-4 w-4 mb-0.5" />
            <span>Billing</span>
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center justify-center flex-1 py-1 text-[10px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <Menu className="h-4 w-4 mb-0.5" />
            <span>More</span>
          </button>
        </nav>
      </div>

      {/* Command Palette */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        items={staffCommands}
        placeholder="Type a page, module, action or search query..."
        enableGlobalSearch={true}
      />

      {/* Security & 2FA Modal */}
      <StaffSecurityModal
        open={securityModalOpen}
        onOpenChange={setSecurityModalOpen}
      />
    </div>
  )
}
