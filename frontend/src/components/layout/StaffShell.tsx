import React, { useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  RotateCcw,
  ShoppingBag,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react"
import { StaffRole, useAuth } from "@/features/auth/AuthContext"
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
  { title: "Staff", href: "/staff/staff-management", icon: UserCheck, allowedRoles: ["Super Admin", "Admin"] },
  { title: "Expenses", href: "/staff/expenses", icon: Receipt, allowedRoles: ["Super Admin", "Admin", "Manager", "Accountant"] },
  { title: "Reports", href: "/staff/reports", icon: TrendingUp, allowedRoles: ["Super Admin", "Admin", "Manager", "Accountant"] },
  { title: "Support", href: "/staff/support", icon: HelpCircle },
]

export const StaffShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

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

  // Find active item for breadcrumb
  const currentNavItem = NAV_ITEMS.find((item) => item.href === location.pathname) || {
    title: "Overview",
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden md:flex flex-col border-r bg-card transition-all duration-300 relative",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between border-b px-4">
          {!collapsed && (
            <div className="flex items-center gap-2 font-bold text-base tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-xs">
                ERP
              </span>
              <span>Enterprise Hub</span>
            </div>
          )}
          {collapsed && (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-xs mx-auto">
              E
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex h-6 w-6 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground"
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
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
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
          <span>Enterprise Hub</span>
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
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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
        <header className="flex h-14 items-center justify-between border-b bg-card px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground"
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

          {/* User Menu */}
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {currentRole}
            </Badge>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-2 cursor-pointer p-1 rounded-full hover:bg-accent">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs border">
                    {staffUser?.email.charAt(0).toUpperCase() || "S"}
                  </div>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="text-xs font-normal text-muted-foreground">Signed in as</div>
                  <div className="text-sm font-semibold truncate">{staffUser?.email}</div>
                  <div className="text-xs text-primary font-medium mt-0.5">{currentRole}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50">
          {children}
        </main>
      </div>
    </div>
  )
}
