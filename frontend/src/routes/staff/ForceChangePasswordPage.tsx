import React, { useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Lock, ShieldAlert, Eye, EyeOff, Loader2 } from "lucide-react"
import { apiClient } from "@/lib/api"
import { useAuth } from "@/features/auth/AuthContext"

export const ForceChangePasswordPage: React.FC = () => {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentPassword.trim()) {
      toast.error("Please enter your temporary password.")
      return
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.")
      return
    }
    if (newPassword === currentPassword) {
      toast.error("New password must be different from the temporary password.")
      return
    }

    setIsSubmitting(true)
    try {
      await apiClient.post("/api/staff/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      })

      toast.success("Password changed successfully! Welcome to the ERP.")

      navigate("/staff/dashboard", { replace: true })
    } catch {
      // Error toasted by apiClient
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 mb-4">
            <ShieldAlert className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Password Change Required</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Your account was created with a temporary password.
            <br />
            You must set a new password before accessing the ERP.
          </p>
        </div>

        {/* Alert Banner */}
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-300">
              <p className="font-semibold mb-1">Security Requirements</p>
              <ul className="space-y-0.5 text-amber-400/80">
                <li>• Minimum 8 characters</li>
                <li>• Must differ from your temporary password</li>
                <li>• Never share your password with anyone</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-border bg-card p-6 space-y-5 shadow-xl"
        >
          {/* Current (temporary) password */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Temporary Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="currentPasswordInput"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Your temporary password from the email"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-input bg-background pl-10 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="newPasswordInput"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg border border-input bg-background pl-10 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {/* Strength indicator */}
            {newPassword.length > 0 && (
              <div className="flex gap-1 mt-1">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      newPassword.length >= (i + 1) * 3
                        ? newPassword.length >= 12
                          ? "bg-emerald-500"
                          : newPassword.length >= 8
                          ? "bg-amber-500"
                          : "bg-red-500"
                        : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Confirm new password */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="confirmPasswordInput"
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
                autoComplete="new-password"
                className={`w-full rounded-lg border bg-background pl-10 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary ${
                  confirmPassword && confirmPassword !== newPassword
                    ? "border-red-500 focus:ring-red-500"
                    : confirmPassword && confirmPassword === newPassword
                    ? "border-emerald-500 focus:ring-emerald-500"
                    : "border-input"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword && confirmPassword !== newPassword && (
              <p className="text-xs text-red-400">Passwords do not match.</p>
            )}
            {confirmPassword && confirmPassword === newPassword && (
              <p className="text-xs text-emerald-400">✓ Passwords match.</p>
            )}
          </div>

          <button
            type="submit"
            id="changePasswordBtn"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Setting New Password…
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                Set New Password & Continue
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Logged in as{" "}
          <span className="font-medium text-foreground">{user?.email}</span>
        </p>
      </div>
    </div>
  )
}

export default ForceChangePasswordPage
