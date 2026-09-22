import React from "react"
import { Navigate, useLocation } from "react-router-dom"
import { useAuth, StaffRole } from "./AuthContext"
import { Skeleton } from "@/components/ui/skeleton"

export const StaffRouteGuard: React.FC<{
  allowedRoles?: StaffRole[]
  children: React.ReactNode
}> = ({ allowedRoles, children }) => {
  const { user, identity, isLoading, isAuthenticated } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-8">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    )
  }

  if (!isAuthenticated || identity !== "staff" || !user) {
    return <Navigate to="/staff/login" state={{ from: location }} replace />
  }

  const staffUser = user as { role: StaffRole }
  if (allowedRoles && !allowedRoles.includes(staffUser.role) && staffUser.role !== "Super Admin") {
    return (
      <div className="flex h-screen flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold text-destructive">Access Denied</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have the required permissions ({allowedRoles.join(", ")}) to access this page.
        </p>
      </div>
    )
  }

  return <>{children}</>
}

export const CustomerRouteGuard: React.FC<{
  children: React.ReactNode
}> = ({ children }) => {
  const { identity, isLoading, isAuthenticated } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center p-8">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    )
  }

  if (!isAuthenticated || identity !== "customer") {
    return <Navigate to="/customer/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
