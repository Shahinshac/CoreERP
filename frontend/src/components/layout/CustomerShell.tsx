import React from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  CreditCard,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  User,
} from "lucide-react"
import { useAuth } from "@/features/auth/AuthContext"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const CUSTOMER_NAV_ITEMS = [
  { title: "Dashboard", href: "/portal", icon: LayoutDashboard },
  { title: "Purchases", href: "/portal/purchases", icon: ShoppingBag },
  { title: "Invoices", href: "/portal/invoices", icon: FileText },
  { title: "Payments", href: "/portal/payments", icon: CreditCard },
  { title: "EMI", href: "/portal/emi", icon: RotateCcw },
  { title: "Warranty", href: "/portal/warranty", icon: ShieldCheck },
  { title: "Support", href: "/portal/support", icon: HelpCircle },
  { title: "Profile", href: "/portal/profile", icon: User },
]

export const CustomerShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const customerUser = user as { name: string; email: string } | null

  const handleLogout = async () => {
    await logout()
    navigate("/customer/login")
  }

  return (
    <div className="min-h-screen w-full bg-slate-50 text-foreground flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link to="/portal" className="flex items-center gap-2 font-bold text-base tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white font-black text-xs">
                C
              </span>
              <span>Client Portal</span>
            </Link>

            {/* Nav Items */}
            <nav className="hidden lg:flex items-center gap-1">
              {CUSTOMER_NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const isActive = location.pathname === item.href
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{item.title}</span>
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-muted">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-semibold text-xs border border-emerald-200">
                    {customerUser?.name?.charAt(0).toUpperCase() || "C"}
                  </div>
                  <span className="hidden sm:inline-block text-xs font-medium text-foreground">
                    {customerUser?.name || "Customer"}
                  </span>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <div className="text-xs font-normal text-muted-foreground">Account</div>
                  <div className="text-sm font-semibold truncate">{customerUser?.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{customerUser?.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile Horizontal Scroll Nav */}
        <div className="lg:hidden border-t overflow-x-auto px-4 py-2 flex items-center gap-2">
          {CUSTOMER_NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.title}</span>
              </Link>
            )
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 container mx-auto p-4 md:p-6">
        {children}
      </main>
    </div>
  )
}
