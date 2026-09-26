import React, { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Lock, Mail, Phone, ShieldAlert, User, ShoppingBag } from "lucide-react"
import { useAuth } from "@/features/auth/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const registerSchema = z.object({
  name: z.string().min(2, "Full name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

type RegisterFormData = z.infer<typeof registerSchema>

export const CustomerRegisterPage: React.FC = () => {
  const { registerCustomer } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialEmail = searchParams.get("email") || ""

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: initialEmail,
    },
  })

  const onSubmit = async (data: RegisterFormData) => {
    setError(null)
    setLoading(true)
    try {
      await registerCustomer(data.email, data.password, data.name, data.phone)
      navigate("/portal", { replace: true })
    } catch (err: unknown) {
      const msg =
        (err as any)?.response?.data?.error?.message ||
        (err as any)?.response?.data?.detail ||
        (err instanceof Error ? err.message : "Registration failed")
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-white/[0.08] rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-1.5">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-lg mb-2 shadow-none">
            C
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Create Account</h1>
          <p className="text-xs text-muted-foreground">Sign up or activate self-service portal access</p>
        </div>

        {/* Helpful Banner for In-Store Purchase Customers */}
        <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-zinc-200 text-xs flex items-start gap-2.5">
          <ShoppingBag className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-primary block">Purchased In-Store?</span>
            <span className="text-zinc-300 leading-relaxed block text-[11px]">
              Enter the email & phone number provided at the cashier counter to activate your online account and instantly view your invoices, EMI plans, and warranties.
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span>{error}</span>
              {error.toLowerCase().includes("already registered") && (
                <div className="pt-1">
                  <Link to="/customer/login" className="font-semibold text-primary underline">
                    Click here to Sign In &rarr;
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-zinc-500" /> Full Name
            </label>
            <Input
              type="text"
              placeholder="John Doe"
              {...register("name")}
              disabled={loading}
            />
            {errors.name && (
              <span className="text-xs text-rose-400 font-medium">{errors.name.message}</span>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-zinc-500" /> Email Address
            </label>
            <Input
              type="email"
              placeholder="you@example.com"
              {...register("email")}
              disabled={loading}
            />
            {errors.email && (
              <span className="text-xs text-rose-400 font-medium">{errors.email.message}</span>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-zinc-500" /> Phone (Optional)
            </label>
            <Input
              type="tel"
              placeholder="+1 234 567 890"
              {...register("phone")}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-zinc-500" /> Password
            </label>
            <Input
              type="password"
              placeholder="••••••••"
              {...register("password")}
              disabled={loading}
            />
            {errors.password && (
              <span className="text-xs text-rose-400 font-medium">{errors.password.message}</span>
            )}
          </div>

          <Button type="submit" className="w-full mt-2" disabled={loading}>
            {loading ? "Creating Account..." : "Register"}
          </Button>
        </form>

        <div className="pt-4 border-t border-white/[0.08] text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link to="/customer/login" className="font-semibold text-primary hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  )
}
