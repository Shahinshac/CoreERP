import React, { useMemo, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  CreditCard,
  FileText,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  User,
} from "lucide-react"
import { CommandItem, CommandPalette } from "@/components/common/CommandPalette"
import { NotificationBell } from "@/components/notifications/NotificationBell"
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
  const [paletteOpen, setPaletteOpen] = useState(false)

  const customerUser = user as { name: string; email: string } | null

  const handleLogout = async () => {
    await logout()
    navigate("/customer/login")
  }

  // Customer Command Palette Items
  const customerCommands: CommandItem[] = useMemo(() => [
    {
      id: "portal-dashboard",
      title: "Portal Dashboard",
      description: "Account summary, recent activity, and quick stats",
      category: "Navigation",
      href: "/portal",
      icon: LayoutDashboard,
      keywords: ["home", "stats", "overview", "dashboard"],
    },
    {
      id: "portal-purchases",
      title: "My Purchases",
      description: "View order history, purchased products, and transaction records",
      category: "Orders & Purchases",
      href: "/portal/purchases",
      icon: ShoppingBag,
      keywords: ["orders", "products", "buy", "history", "items"],
    },
    {
      id: "portal-invoices",
      title: "Invoices & Receipts",
      description: "Download tax invoices, GST bills, and payment receipts",
      category: "Orders & Purchases",
      href: "/portal/invoices",
      icon: FileText,
      keywords: ["bills", "tax invoice", "receipts", "download", "pdf"],
    },
    {
      id: "portal-payments",
      title: "Payment History",
      description: "Completed transactions, UPI/card payments, and receipts",
      category: "Billing & Finance",
      href: "/portal/payments",
      icon: CreditCard,
      keywords: ["receipts", "transactions", "pay", "ledger", "settlements"],
    },
    {
      id: "portal-emi",
      title: "My EMI Plans",
      description: "Active installments, payment schedules, and outstanding balances",
      category: "Billing & Finance",
      href: "/portal/emi",
      icon: RotateCcw,
      keywords: ["installments", "loan", "monthly payments", "finance", "schedule"],
    },
    {
      id: "portal-warranty",
      title: "Warranty & Guarantees",
      description: "Active warranty coverage, registered products, and validity",
      category: "Services & Support",
      href: "/portal/warranty",
      icon: ShieldCheck,
      keywords: ["coverage", "claims", "guarantee", "validity", "serial"],
    },
    {
      id: "portal-support",
      title: "Support Tickets",
      description: "Create support tickets, track resolutions, and get assistance",
      category: "Services & Support",
      href: "/portal/support",
      icon: HelpCircle,
      keywords: ["help", "ticket", "issue", "contact", "complaint", "desk"],
    },
    {
      id: "portal-profile",
      title: "My Profile & Settings",
      description: "Contact details, address, and account preferences",
      category: "Account & Profile",
      href: "/portal/profile",
      icon: User,
      keywords: ["account", "settings", "contact", "details", "address", "phone"],
    },
    {
      id: "portal-logout",
      title: "Sign Out",
      description: "Securely sign out of your customer account",
      category: "Account & Profile",
      icon: LogOut,
      keywords: ["logout", "sign out", "exit"],
      action: handleLogout,
    },
  ], [])

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-white/[0.14] bg-[#0C0C0E]/90 backdrop-blur-md">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link to="/portal" className="flex items-center gap-2 font-bold text-base tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black text-xs">
                C
              </span>
              <span className="text-zinc-100 font-semibold tracking-tight">Client Portal</span>
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
                        ? "bg-primary text-primary-foreground shadow-none font-semibold"
                        : "text-zinc-300 hover:bg-[#18181C] hover:text-zinc-100"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{item.title}</span>
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* User Menu & Notifications */}
          <div className="flex items-center gap-3">
            {/* Quick Command Palette Search Trigger */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-white/[0.12] bg-[#141417] px-2.5 sm:px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:border-white/[0.22] transition-colors"
              title="Open Command Palette (Ctrl+K)"
            >
              <Search className="h-3.5 w-3.5 text-zinc-400" />
              <span className="hidden sm:inline">Search...</span>
              <kbd className="hidden sm:inline-flex items-center rounded border border-white/[0.12] bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                ⌘K
              </kbd>
            </button>

            <NotificationBell type="customer" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-2 cursor-pointer p-1.5 rounded-lg hover:bg-[#18181C] transition-colors">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs border border-primary/20">
                    {customerUser?.name?.charAt(0).toUpperCase() || "C"}
                  </div>
                  <span className="hidden sm:inline-block text-xs font-medium text-zinc-300">
                    {customerUser?.name || "Customer"}
                  </span>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <div className="text-xs font-normal text-muted-foreground">Account</div>
                  <div className="text-sm font-semibold truncate text-zinc-100">{customerUser?.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{customerUser?.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-rose-400 hover:text-rose-300">
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile Horizontal Scroll Nav */}
        <div className="lg:hidden border-t border-white/[0.14] overflow-x-auto px-4 py-2 flex items-center gap-2">
          {CUSTOMER_NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = location.pathname === item.href
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-none font-semibold"
                    : "text-zinc-300 hover:bg-[#18181C] hover:text-zinc-100"
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
      <main className="flex-1 container mx-auto p-4 md:p-6 bg-background">
        {children}
      </main>

      {/* Command Palette */}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        items={customerCommands}
        placeholder="Type a page or action to jump..."
      />
    </div>
  )
}
