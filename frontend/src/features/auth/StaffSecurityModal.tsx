import React, { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Key,
  Copy,
  Check,
  Laptop,
  Trash2,
  RefreshCw,
  LogOut,
  AlertTriangle,
} from "lucide-react"
import { apiClient } from "@/lib/api"
import { StaffUser, useAuth } from "@/features/auth/AuthContext"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"

interface StaffSession {
  id: string
  user_agent: string | null
  ip_address: string | null
  created_at: string
  last_active_at: string
  expires_at: string
  is_current: boolean
}

interface TwoFactorSetupData {
  secret: string
  otpauth_url: string
  backup_codes: string[]
}

interface StaffSecurityModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const StaffSecurityModal: React.FC<StaffSecurityModalProps> = ({
  open,
  onOpenChange,
}) => {
  const { user } = useAuth()
  const staffUser = user as StaffUser | null
  const [activeTab, setActiveTab] = useState<"2fa" | "sessions">("2fa")

  // 2FA state
  const [setupData, setSetupData] = useState<TwoFactorSetupData | null>(null)
  const [verifyCode, setVerifyCode] = useState("")
  const [verifying, setVerifying] = useState(false)
  const [disablePassword, setDisablePassword] = useState("")
  const [disabling, setDisabling] = useState(false)
  const [showDisableForm, setShowDisableForm] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedCodes, setCopiedCodes] = useState(false)

  // Fetch active sessions
  const {
    data: sessionsData,
    isLoading: sessionsLoading,
    refetch: refetchSessions,
  } = useQuery({
    queryKey: ["staff", "sessions"],
    queryFn: () => apiClient.get<{ sessions: StaffSession[] }>("/api/staff/sessions"),
    enabled: open && activeTab === "sessions",
  })

  // Start 2FA Setup
  const handleStartSetup = async () => {
    try {
      const data = await apiClient.post<TwoFactorSetupData>("/api/staff/auth/2fa/setup")
      setSetupData(data)
      setVerifyCode("")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initiate 2FA setup"
      toast.error(msg)
    }
  }

  // Verify and Enable 2FA
  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!verifyCode.trim()) return
    setVerifying(true)
    try {
      await apiClient.post("/api/staff/auth/2fa/verify", { code: verifyCode.trim() })
      toast.success("Two-Factor Authentication successfully enabled!")
      setSetupData(null)
      setVerifyCode("")
      if (staffUser) {
        staffUser.is_totp_enabled = true
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid code. Please try again."
      toast.error(msg)
    } finally {
      setVerifying(false)
    }
  }

  // Disable 2FA
  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!disablePassword) return
    setDisabling(true)
    try {
      await apiClient.post("/api/staff/auth/2fa/disable", { password: disablePassword })
      toast.success("Two-Factor Authentication disabled.")
      setShowDisableForm(false)
      setDisablePassword("")
      if (staffUser) {
        staffUser.is_totp_enabled = false
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to disable 2FA"
      toast.error(msg)
    } finally {
      setDisabling(false)
    }
  }

  // Revoke single session
  const handleRevokeSession = async (sessionId: string) => {
    try {
      await apiClient.delete(`/api/staff/sessions/${sessionId}`)
      toast.success("Session revoked.")
      refetchSessions()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to revoke session"
      toast.error(msg)
    }
  }

  // Revoke all other sessions
  const handleRevokeOtherSessions = async () => {
    try {
      const res = await apiClient.post<{ message: string }>("/api/staff/sessions/revoke-others")
      toast.success(res.message || "All other sessions revoked.")
      refetchSessions()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to revoke other sessions"
      toast.error(msg)
    }
  }

  const is2FAEnabled = Boolean(staffUser?.is_totp_enabled)

  const copyToClipboard = (text: string, type: "key" | "codes") => {
    navigator.clipboard.writeText(text)
    if (type === "key") {
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
    } else {
      setCopiedCodes(true)
      setTimeout(() => setCopiedCodes(false), 2000)
    }
    toast.success("Copied to clipboard")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[#0F0F12] border-white/[0.12] text-zinc-100 p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-2 border-b border-white/[0.08]">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Security & Authentication
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-xs">
            Manage your account security, two-factor authentication, and active logged-in sessions.
          </DialogDescription>

          {/* Navigation Tabs */}
          <div className="flex gap-2 pt-4">
            <button
              onClick={() => setActiveTab("2fa")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "2fa"
                  ? "bg-white/[0.12] text-zinc-100 border border-white/[0.16]"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Two-Factor Authentication
            </button>
            <button
              onClick={() => setActiveTab("sessions")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === "sessions"
                  ? "bg-white/[0.12] text-zinc-100 border border-white/[0.16]"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Active Sessions
            </button>
          </div>
        </DialogHeader>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {activeTab === "2fa" ? (
            <div className="space-y-6">
              {/* Current Status Box */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-surface-elevated/40 border border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                      is2FAEnabled
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}
                  >
                    {is2FAEnabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">Two-Factor Authentication (TOTP)</span>
                      <Badge variant={is2FAEnabled ? "success" : "warning"}>
                        {is2FAEnabled ? "ENABLED" : "DISABLED"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {is2FAEnabled
                        ? "Your account requires an authenticator verification code or backup code to sign in."
                        : "Add an extra layer of security by requiring an authenticator code on login."}
                    </p>
                  </div>
                </div>

                {!is2FAEnabled && !setupData && (
                  <Button onClick={handleStartSetup} size="sm" className="bg-primary hover:bg-primary/90">
                    Enable 2FA
                  </Button>
                )}
                {is2FAEnabled && !showDisableForm && (
                  <Button
                    onClick={() => setShowDisableForm(true)}
                    variant="outline"
                    size="sm"
                    className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10"
                  >
                    Disable 2FA
                  </Button>
                )}
              </div>

              {/* Disable 2FA Form */}
              {showDisableForm && (
                <form
                  onSubmit={handleDisable2FA}
                  className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 space-y-3"
                >
                  <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs">
                    <AlertTriangle className="h-4 w-4" />
                    Confirm Disabling Two-Factor Authentication
                  </div>
                  <p className="text-xs text-zinc-400">
                    Enter your account password to confirm removal of 2FA protection.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      placeholder="Account Password"
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      disabled={disabling}
                      className="bg-black/30 text-xs"
                    />
                    <Button
                      type="submit"
                      variant="destructive"
                      size="sm"
                      disabled={disabling || !disablePassword}
                    >
                      {disabling ? "Disabling..." : "Confirm Disable"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowDisableForm(false)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}

              {/* Setup Flow */}
              {setupData && !is2FAEnabled && (
                <div className="space-y-5 border border-white/[0.08] rounded-xl p-5 bg-[#141417]">
                  <div className="space-y-1">
                    <h3 className="font-semibold text-sm text-zinc-100 flex items-center gap-1.5">
                      <Smartphone className="h-4 w-4 text-primary" /> Step 1: Add to Authenticator App
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Use Google Authenticator, Authy, or 1Password. Enter this secret key into your app:
                    </p>
                  </div>

                  {/* Secret Key Display */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-white/[0.08]">
                    <div className="font-mono text-sm tracking-wider text-primary font-bold">
                      {setupData.secret}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(setupData.secret, "key")}
                      className="text-xs h-8"
                    >
                      {copiedKey ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                      {copiedKey ? "Copied" : "Copy Key"}
                    </Button>
                  </div>

                  {/* Backup Codes */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-xs text-zinc-300 flex items-center gap-1.5">
                        <Key className="h-3.5 w-3.5 text-amber-400" /> Backup Codes (Save these securely)
                      </h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(setupData.backup_codes.join("\n"), "codes")}
                        className="text-xs h-7 text-muted-foreground hover:text-zinc-200"
                      >
                        {copiedCodes ? <Check className="h-3 w-3 mr-1 text-emerald-400" /> : <Copy className="h-3 w-3 mr-1" />}
                        {copiedCodes ? "Copied All" : "Copy All Codes"}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Each backup code can be used once if you lose access to your authenticator app.
                    </p>
                    <div className="grid grid-cols-4 gap-2 bg-black/30 p-3 rounded-lg border border-white/[0.06] font-mono text-xs text-center text-zinc-300">
                      {setupData.backup_codes.map((code, idx) => (
                        <div key={idx} className="bg-white/[0.04] py-1 rounded">
                          {code}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Step 2: Verification */}
                  <form onSubmit={handleVerify2FA} className="space-y-3 pt-2 border-t border-white/[0.08]">
                    <h3 className="font-semibold text-sm text-zinc-100">
                      Step 2: Enter 6-digit Code to Confirm
                    </h3>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        placeholder="123456"
                        value={verifyCode}
                        onChange={(e) => setVerifyCode(e.target.value)}
                        className="font-mono text-base tracking-widest text-center max-w-xs"
                        maxLength={8}
                        disabled={verifying}
                      />
                      <Button type="submit" disabled={verifying || !verifyCode.trim()} className="bg-primary">
                        {verifying ? "Verifying..." : "Verify & Activate"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setSetupData(null)}
                        className="text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          ) : (
            /* Active Sessions Tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm text-zinc-100">Logged-in Sessions</h3>
                  <p className="text-xs text-muted-foreground">
                    Devices and locations that currently hold an active refresh session.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchSessions()}
                    className="text-xs"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRevokeOtherSessions}
                    className="text-xs"
                  >
                    <LogOut className="h-3.5 w-3.5 mr-1" /> Revoke Others
                  </Button>
                </div>
              </div>

              {sessionsLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-white/[0.04] animate-pulse" />
                  ))}
                </div>
              ) : sessionsData?.sessions && sessionsData.sessions.length > 0 ? (
                <div className="divide-y divide-white/[0.06] border border-white/[0.08] rounded-xl overflow-hidden bg-[#141417]">
                  {sessionsData.sessions.map((sess) => (
                    <div key={sess.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02]">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-white/[0.06] flex items-center justify-center text-zinc-300">
                          <Laptop className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-zinc-200">
                              {sess.ip_address || "Unknown IP"}
                            </span>
                            {sess.is_current && (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                                THIS DEVICE
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate max-w-sm mt-0.5">
                            {sess.user_agent || "Web Browser"}
                          </p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">
                            Last active: {new Date(sess.last_active_at).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {!sess.is_current && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevokeSession(sess.id)}
                          className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 h-8"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Revoke
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-xs text-muted-foreground">
                  No active sessions found.
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
