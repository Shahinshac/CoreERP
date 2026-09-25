import React, { useState, useEffect } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { CheckCircle2, KeyRound, Lock, Mail, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/features/auth/AuthContext"
import { customerPasswordResetApi } from "@/features/portal/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const loginSchema = z.object({
  email: z.string().email("Valid email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

type LoginFormData = z.infer<typeof loginSchema>

export const CustomerLoginPage: React.FC = () => {
  const { loginCustomer, isAuthenticated, identity } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Forgot password modal state
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetStep, setResetStep] = useState<"request" | "reset">("request")
  const [resetEmail, setResetEmail] = useState("")
  const [resetToken, setResetToken] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [resetLoading, setResetLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated && identity === "customer") {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/portal"
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, identity, navigate, location])

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormData) => {
    setError(null)
    setLoading(true)
    try {
      await loginCustomer(data.email, data.password)
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/portal"
      navigate(from, { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid credentials"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail.trim() || !resetEmail.includes("@")) {
      toast.error("Please enter a valid email address.")
      return
    }

    setResetLoading(true)
    try {
      const res = await customerPasswordResetApi.forgotPassword(resetEmail.trim())
      toast.success(res.message)
      setResetStep("reset")
    } catch {
      // Timing safe fallback
      toast.success("If an account with this email exists, a password reset link has been sent.")
      setResetStep("reset")
    } finally {
      setResetLoading(false)
    }
  }

  const handlePerformReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetToken.trim()) {
      toast.error("Please enter the reset token received in your email.")
      return
    }
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.")
      return
    }

    setResetLoading(true)
    try {
      const res = await customerPasswordResetApi.resetPassword(resetToken.trim(), newPassword)
      toast.success(res.message)
      setResetModalOpen(false)
      setValue("email", resetEmail)
      setResetToken("")
      setNewPassword("")
      setConfirmPassword("")
      setResetStep("request")
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || "Invalid or expired reset token."
      toast.error(msg)
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card border border-white/[0.08] rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-1.5">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-lg mb-2 shadow-none">
            C
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Client Portal</h1>
          <p className="text-xs text-muted-foreground">Sign in to manage your purchases and orders</p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-zinc-500" /> Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setResetStep("request")
                  setResetModalOpen(true)
                }}
                className="text-xs text-primary hover:underline font-medium"
              >
                Forgot password?
              </button>
            </div>
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
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <div className="pt-4 border-t border-white/[0.08] text-center text-xs text-muted-foreground">
          Don't have an account?{" "}
          <Link to="/customer/register" className="font-semibold text-primary hover:underline">
            Register here
          </Link>
        </div>
      </div>

      {/* Forgot / Reset Password Modal */}
      <Dialog open={resetModalOpen} onOpenChange={setResetModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" />
              {resetStep === "request" ? "Reset Customer Password" : "Enter Verification Token"}
            </DialogTitle>
            <DialogDescription>
              {resetStep === "request"
                ? "Enter your registered email address and we'll send you a single-use token to reset your password."
                : "Enter the single-use token sent to your email and your new password."}
            </DialogDescription>
          </DialogHeader>

          {resetStep === "request" ? (
            <form onSubmit={handleRequestReset} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-zinc-300 font-medium">Registered Email Address</label>
                <Input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="text-zinc-400 text-[11px] bg-white/[0.03] p-2.5 rounded-lg border border-white/[0.08]">
                For security reasons, tokens expire after 15 minutes and can only be used once.
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setResetStep("reset")}
                  className="text-xs text-primary hover:underline"
                >
                  Already have a token?
                </button>

                <DialogFooter className="m-0 p-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setResetModalOpen(false)}
                    disabled={resetLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={resetLoading || !resetEmail}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {resetLoading ? "Sending..." : "Send Reset Token"}
                  </Button>
                </DialogFooter>
              </div>
            </form>
          ) : (
            <form onSubmit={handlePerformReset} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-zinc-300 font-medium">Single-Use Reset Token</label>
                <Input
                  type="text"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Paste reset token from email"
                  className="h-9 text-xs font-mono"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-zinc-300 font-medium">New Password</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-zinc-300 font-medium">Confirm New Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="h-9 text-xs"
                  required
                />
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setResetStep("request")}
                  className="text-xs text-zinc-400 hover:text-zinc-200"
                >
                  ← Request new token
                </button>

                <DialogFooter className="m-0 p-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setResetModalOpen(false)}
                    disabled={resetLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={resetLoading || !resetToken || !newPassword}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {resetLoading ? "Resetting..." : "Reset Password"}
                  </Button>
                </DialogFooter>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
export default CustomerLoginPage
