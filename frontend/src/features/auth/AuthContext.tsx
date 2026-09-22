import React, { createContext, useContext, useEffect, useState } from "react"
import { apiClient, setAccessToken } from "@/lib/api"

export type StaffRole = "Super Admin" | "Admin" | "Manager" | "Staff" | "Accountant"

export interface StaffUser {
  id: string
  email: string
  role: StaffRole
  is_active: boolean
  created_at: string
}

export interface CustomerUser {
  id: string
  email: string
  name: string
  phone?: string
  is_active: boolean
  created_at: string
}

interface AuthContextType {
  user: StaffUser | CustomerUser | null
  identity: "staff" | "customer" | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  loginStaff: (email: string, password: string) => Promise<StaffUser>
  loginCustomer: (email: string, password: string) => Promise<CustomerUser>
  registerCustomer: (email: string, password: string, name: string, phone?: string) => Promise<CustomerUser>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<StaffUser | CustomerUser | null>(null)
  const [identity, setIdentity] = useState<"staff" | "customer" | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Silent refresh on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        // Try staff refresh first
        const staffRes = await fetch(
          `${(import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "")}/api/staff/auth/refresh`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }
        )

        if (staffRes.ok) {
          const data = await staffRes.json()
          setToken(data.access_token)
          setUser(data.user)
          setIdentity("staff")
          setAccessToken(data.access_token, "staff")
          setIsLoading(false)
          return
        }

        // Try customer refresh next
        const custRes = await fetch(
          `${(import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "")}/api/customers/auth/refresh`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }
        )

        if (custRes.ok) {
          const data = await custRes.json()
          setToken(data.access_token)
          setUser(data.user)
          setIdentity("customer")
          setAccessToken(data.access_token, "customer")
          setIsLoading(false)
          return
        }
      } catch {
        // Not authenticated
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [])

  const loginStaff = async (email: string, password: string): Promise<StaffUser> => {
    const data = await apiClient.post<{ access_token: string; user: StaffUser }>(
      "/api/staff/auth/login",
      { email, password }
    )
    setToken(data.access_token)
    setUser(data.user)
    setIdentity("staff")
    setAccessToken(data.access_token, "staff")
    return data.user
  }

  const loginCustomer = async (email: string, password: string): Promise<CustomerUser> => {
    const data = await apiClient.post<{ access_token: string; user: CustomerUser }>(
      "/api/customers/auth/login",
      { email, password }
    )
    setToken(data.access_token)
    setUser(data.user)
    setIdentity("customer")
    setAccessToken(data.access_token, "customer")
    return data.user
  }

  const registerCustomer = async (
    email: string,
    password: string,
    name: string,
    phone?: string
  ): Promise<CustomerUser> => {
    const data = await apiClient.post<{ access_token: string; user: CustomerUser }>(
      "/api/customers/auth/register",
      { email, password, name, phone }
    )
    setToken(data.access_token)
    setUser(data.user)
    setIdentity("customer")
    setAccessToken(data.access_token, "customer")
    return data.user
  }

  const logout = async () => {
    try {
      if (identity === "staff") {
        await apiClient.post("/api/staff/auth/logout")
      } else if (identity === "customer") {
        await apiClient.post("/api/customers/auth/logout")
      }
    } finally {
      setUser(null)
      setIdentity(null)
      setToken(null)
      setAccessToken(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        identity,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        loginStaff,
        loginCustomer,
        registerCustomer,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
