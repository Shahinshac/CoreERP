import React, { useState, useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { ArrowLeft, KeyRound, Lock, Mail, ShieldAlert } from "lucide-react"
import { useAuth } from "@/features/auth/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const loginSchema = z.object({
  email: z.string().email("Valid work email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
})

type LoginFormData = z.infer<typeof loginSchema>

export const StaffLoginPage: React.FC = () => {
  const { loginStaff, loginStaff2FA, isAuthenticated, identity } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [twoFactorPending, setTwoFactorPending] = useState(false)
  const [tempToken, setTempToken] = useState<string | null>(null)
  const [totpCode, setTotpCode] = useState("")

  useEffect(() => {
    if (isAuthenticated && identity === "staff") {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/staff"
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, identity, navigate, location])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginFormData) => {
    setError(null)
    setLoading(true)
    try {
      const res = await loginStaff(data.email, data.password)
      if (res.requires2FA && res.tempToken) {
        setTempToken(res.tempToken)
        setTwoFactorPending(true)
        return
      }
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/staff"
      navigate(from, { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid credentials"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tempToken || !totpCode.trim()) return
    setError(null)
    setLoading(true)
    try {
      await loginStaff2FA(tempToken, totpCode.trim())
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/staff"
      navigate(from, { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid verification code"
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
            ERP
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            {twoFactorPending ? "Two-Factor Authentication" : "Staff Portal"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {twoFactorPending
              ? "Enter the 6-digit TOTP code from your authenticator app or an 8-character backup code"
              : "Sign in with your organizational credentials"}
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {twoFactorPending ? (
          <form onSubmit={handle2FASubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-zinc-500" /> Security Code / Backup Code
              </label>
              <Input
                type="text"
                placeholder="123456 or BACKUP12"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                autoFocus
                disabled={loading}
                className="font-mono text-center tracking-widest text-lg"
              />
            </div>

            <Button type="submit" className="w-full mt-2" disabled={loading || !totpCode.trim()}>
              {loading ? "Verifying Code..." : "Verify & Sign In"}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full text-xs text-muted-foreground hover:text-zinc-200"
              onClick={() => {
                setTwoFactorPending(false)
                setTempToken(null)
                setTotpCode("")
                setError(null)
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to Password Login
            </Button>
          </form>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-zinc-500" /> Work Email
              </label>
              <Input
                type="email"
                placeholder="name@company.com"
                {...register("email")}
                disabled={loading}
              />
              {errors.email && (
                <span className="text-xs text-rose-400 font-medium">{errors.email.message}</span>
              )}
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
              {loading ? "Verifying..." : "Sign In to Staff Portal"}
            </Button>
          </form>
        )}

        <div className="pt-4 border-t border-white/[0.08] text-center">
          <span className="text-xs text-zinc-500">
            RBAC Protected • Argon2id Hashing • TOTP 2FA Supported
          </span>
        </div>
      </div>
    </div>
  )
}
