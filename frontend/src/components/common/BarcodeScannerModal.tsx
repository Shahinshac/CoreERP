import React, { useEffect, useId, useRef, useState } from "react"
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode"
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Flashlight,
  FlashlightOff,
  Keyboard,
  RefreshCw,
  ScanBarcode,
  SwitchCamera,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  normalizeBarcode,
  playScanBeep,
  triggerHapticFeedback,
} from "@/services/barcodeService"

export interface BarcodeScannerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onScan: (barcode: string) => void | Promise<void>
  title?: string
  description?: string
  /**
   * If true, keeps scanner active after scan for rapid successive scans (e.g. POS cart items).
   * Defaults to false (closes or stops upon scan).
   */
  continuousMode?: boolean
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  open,
  onOpenChange,
  onScan,
  title = "Scan Barcode",
  description = "Align barcode within the target frame",
  continuousMode = false,
}) => {
  const rawId = useId()
  const readerElementId = `barcode-scanner-viewport-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const isProcessingRef = useRef(false)
  const isStoppingRef = useRef(false)

  const [permissionState, setPermissionState] = useState<"idle" | "requesting" | "granted" | "denied" | "unsupported">("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [detectedCode, setDetectedCode] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([])
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(0)

  // Manual fallback state
  const [showManualInput, setShowManualInput] = useState(false)
  const [manualCode, setManualCode] = useState("")

  const stopScanner = async () => {
    if (isStoppingRef.current) return
    isStoppingRef.current = true
    const scanner = scannerRef.current
    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop()
        }
        scanner.clear()
      } catch {
        // Ignore stop errors if DOM already unmounted
      } finally {
        scannerRef.current = null
        isStoppingRef.current = false
      }
    }
  }

  const startScanner = async (cameraIdOrFacing?: string | { facingMode: string }) => {
    await stopScanner()
    setErrorMessage(null)
    setDetectedCode(null)
    isProcessingRef.current = false

    // Check mediaDevices support
    if (!navigator?.mediaDevices?.getUserMedia) {
      setPermissionState("unsupported")
      setErrorMessage("Camera access is not supported by your browser or connection.")
      setShowManualInput(true)
      return
    }

    setPermissionState("requesting")

    try {
      // Discover available cameras
      try {
        const devices = await Html5Qrcode.getCameras()
        if (devices && devices.length > 0) {
          setAvailableCameras(devices.map((d) => ({ id: d.id, label: d.label || `Camera ${d.id}` })))
        }
      } catch {
        // Continue even if getCameras enumeration is restricted
      }

      const formatsToSupport = [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.QR_CODE,
      ]

      const html5QrCode = new Html5Qrcode(readerElementId, {
        formatsToSupport,
        verbose: false,
      })
      scannerRef.current = html5QrCode

      const cameraConfig = cameraIdOrFacing || { facingMode: "environment" }

      await html5QrCode.start(
        cameraConfig,
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            // Horizontal rectangular viewport optimized for 1D barcodes
            const width = Math.min(Math.floor(viewfinderWidth * 0.88), 340)
            const height = Math.min(Math.floor(viewfinderHeight * 0.52), 170)
            return { width, height }
          },
          aspectRatio: 1.333333,
        },
        async (decodedText: string) => {
          // Prevent multiple executions for the same detection
          if (isProcessingRef.current) return
          isProcessingRef.current = true

          const clean = normalizeBarcode(decodedText)
          if (!clean) {
            isProcessingRef.current = false
            return
          }

          // Visual + Audio + Haptic feedback
          playScanBeep()
          triggerHapticFeedback()
          setDetectedCode(clean)

          if (!continuousMode) {
            // Stop camera on successful scan
            await stopScanner()
            setTimeout(async () => {
              try {
                await onScan(clean)
              } finally {
                onOpenChange(false)
              }
            }, 300)
          } else {
            // Continuous scanning for rapid POS entry
            try {
              await onScan(clean)
            } finally {
              // Pause 1 second before permitting the next scan to avoid accidental bursts
              setTimeout(() => {
                isProcessingRef.current = false
                setDetectedCode(null)
              }, 1000)
            }
          }
        },
        () => {
          // Frame not detected (normal in continuous video loop)
        }
      )

      setPermissionState("granted")

      // Check if torch/flashlight capability is available
      try {
        const capabilities = html5QrCode.getRunningTrackCapabilities() as { torch?: boolean } | null
        if (capabilities && "torch" in capabilities) {
          setHasTorch(Boolean(capabilities.torch))
        }
      } catch {
        setHasTorch(false)
      }
    } catch (err: unknown) {
      console.warn("Barcode scanner start error:", err)
      const errStr = String(err).toLowerCase()
      if (errStr.includes("permission") || errStr.includes("denied") || errStr.includes("notallowed")) {
        setPermissionState("denied")
        setErrorMessage("Camera permission was denied. Please grant camera access in browser settings.")
      } else if (errStr.includes("notfound") || errStr.includes("device")) {
        setPermissionState("unsupported")
        setErrorMessage("No functional camera device was found on this system.")
      } else {
        setPermissionState("denied")
        setErrorMessage("Unable to access camera. Please verify device camera settings.")
      }
      setShowManualInput(true)
    }
  }

  // Lifecycle control when modal opens/closes
  useEffect(() => {
    if (open) {
      setShowManualInput(false)
      setManualCode("")
      setDetectedCode(null)
      // Small timeout to allow Dialog DOM rendering before mounting Html5Qrcode
      const timer = setTimeout(() => {
        startScanner()
      }, 150)
      return () => {
        clearTimeout(timer)
        stopScanner()
      }
    } else {
      stopScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Toggle Torch/Flashlight
  const handleToggleTorch = async () => {
    const scanner = scannerRef.current
    if (!scanner || !scanner.isScanning) return
    try {
      const nextState = !torchOn
      await scanner.applyVideoConstraints({
        advanced: [{ torch: nextState } as unknown as MediaTrackConstraintSet],
      })
      setTorchOn(nextState)
    } catch {
      // Torch toggle not supported on this track
    }
  }

  // Switch between available cameras
  const handleSwitchCamera = async () => {
    if (availableCameras.length <= 1) return
    const nextIndex = (selectedCameraIndex + 1) % availableCameras.length
    setSelectedCameraIndex(nextIndex)
    await startScanner(availableCameras[nextIndex].id)
  }

  // Manual fallback submission
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = normalizeBarcode(manualCode)
    if (!clean) return

    playScanBeep()
    triggerHapticFeedback()
    setDetectedCode(clean)

    await stopScanner()
    try {
      await onScan(clean)
    } finally {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-[#0A0A0C] border-white/[0.14] text-white">
        {/* Header */}
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-primary border border-primary/30">
              <ScanBarcode className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-white tracking-tight">
                {title}
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-400">
                {description}
              </DialogDescription>
            </div>
          </div>
          {continuousMode && (
            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
              Continuous
            </Badge>
          )}
        </div>

        {/* Viewport Area */}
        <div className="relative bg-black min-h-[300px] flex flex-col items-center justify-center overflow-hidden">
          {/* HTML5 QR Code Container */}
          <div
            id={readerElementId}
            className={`w-full max-w-[420px] aspect-[4/3] ${showManualInput ? "hidden" : "block"}`}
          />

          {/* Custom Overlay Scanning HUD (when camera active) */}
          {permissionState === "granted" && !showManualInput && !detectedCode && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6">
              {/* Target Frame with Animated Scanning Line */}
              <div className="relative w-64 h-32 rounded-lg border-2 border-primary/80 shadow-[0_0_20px_rgba(99,102,241,0.25)] flex items-center justify-center overflow-hidden">
                {/* Corner Accents */}
                <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-white" />
                <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-white" />
                <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-white" />
                <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-white" />

                {/* Animated Horizontal Laser Scan Beam */}
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-rose-500 to-transparent animate-pulse shadow-[0_0_8px_#f43f5e]" />

                <span className="text-[11px] font-mono tracking-wider text-white/70 uppercase">
                  Align Barcode
                </span>
              </div>
              <p className="mt-3 text-xs text-zinc-400 bg-black/60 px-3 py-1 rounded-full border border-white/10 backdrop-blur-sm">
                Point camera steadily at product barcode
              </p>
            </div>
          )}

          {/* Success Detected Overlay */}
          {detectedCode && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
              <div className="h-14 w-14 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mb-3">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <span className="text-xs uppercase font-bold tracking-widest text-emerald-400">
                Barcode Detected
              </span>
              <p className="text-xl font-mono font-bold text-white mt-1 select-all bg-white/[0.06] px-4 py-1.5 rounded-lg border border-white/[0.12] mt-2">
                {detectedCode}
              </p>
              <p className="text-xs text-zinc-400 mt-2">
                {continuousMode ? "Ready for next scan..." : "Processing product lookup..."}
              </p>
            </div>
          )}

          {/* Requesting Camera Loading Spinner */}
          {permissionState === "requesting" && !showManualInput && (
            <div className="absolute inset-0 bg-[#0A0A0C] flex flex-col items-center justify-center p-6 text-center">
              <RefreshCw className="h-8 w-8 text-primary animate-spin mb-3" />
              <p className="text-sm font-semibold text-zinc-200">Starting Camera...</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                Please allow camera permissions if prompted by your browser.
              </p>
            </div>
          )}

          {/* Permission Denied or Unsupported Screen */}
          {(permissionState === "denied" || permissionState === "unsupported") && !showManualInput && (
            <div className="absolute inset-0 bg-[#0A0A0C] flex flex-col items-center justify-center p-6 text-center">
              <div className="h-12 w-12 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center mb-3">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-zinc-200">Camera Not Available</p>
              <p className="text-xs text-zinc-400 mt-1 max-w-xs mb-4">
                {errorMessage || "Unable to access camera on this device."}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startScanner()}
                  className="border-white/[0.14] text-xs gap-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Try Again
                </Button>
                <Button
                  size="sm"
                  onClick={() => setShowManualInput(true)}
                  className="text-xs gap-1.5 bg-primary"
                >
                  <Keyboard className="h-3.5 w-3.5" /> Enter Manually
                </Button>
              </div>
            </div>
          )}

          {/* Manual Input Fallback Form */}
          {showManualInput && (
            <div className="w-full p-6 space-y-4 bg-[#0A0A0C]">
              <div className="text-center space-y-1">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] border border-white/[0.1] text-zinc-300 mb-1">
                  <Keyboard className="h-5 w-5" />
                </div>
                <h4 className="text-sm font-bold text-white">Enter Barcode Manually</h4>
                <p className="text-xs text-zinc-400">
                  Type or paste the barcode or SKU printed on the item label.
                </p>
              </div>

              <form onSubmit={handleManualSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-300">Barcode / SKU</label>
                  <Input
                    autoFocus
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="e.g. 8901234567890 or SKU-000001"
                    className="font-mono text-sm h-11 bg-black/50 border-white/[0.14] text-white focus-visible:ring-primary"
                  />
                  <p className="text-[10px] text-zinc-500">
                    Leading zeros and exact characters are preserved.
                  </p>
                </div>

                <div className="flex gap-2 pt-2">
                  {permissionState === "granted" && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowManualInput(false)
                        startScanner()
                      }}
                      className="flex-1 border-white/[0.14] text-xs h-10"
                    >
                      <Camera className="h-3.5 w-3.5 mr-1" /> Use Camera
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={!manualCode.trim()}
                    className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold h-10"
                  >
                    Submit Barcode
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="p-3 bg-[#0E0E12] border-t border-white/[0.08] flex items-center justify-between gap-2">
          {/* Left tools: Torch & Camera Switch */}
          <div className="flex items-center gap-1.5">
            {hasTorch && permissionState === "granted" && !showManualInput && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleToggleTorch}
                className="h-8 px-2.5 text-xs border-white/[0.12] text-zinc-300 hover:text-white"
                title={torchOn ? "Turn off torch" : "Turn on torch"}
              >
                {torchOn ? <FlashlightOff className="h-3.5 w-3.5 text-amber-400" /> : <Flashlight className="h-3.5 w-3.5" />}
              </Button>
            )}

            {availableCameras.length > 1 && permissionState === "granted" && !showManualInput && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleSwitchCamera}
                className="h-8 px-2.5 text-xs border-white/[0.12] text-zinc-300 hover:text-white gap-1"
                title="Switch Camera (Front/Back)"
              >
                <SwitchCamera className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Flip</span>
              </Button>
            )}

            {!showManualInput && permissionState === "granted" && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowManualInput(true)}
                className="h-8 px-2.5 text-xs text-zinc-400 hover:text-zinc-200 gap-1.5"
              >
                <Keyboard className="h-3.5 w-3.5" />
                <span>Manual Entry</span>
              </Button>
            )}
          </div>

          {/* Right: Cancel Button */}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              stopScanner()
              onOpenChange(false)
            }}
            className="h-8 px-3 text-xs text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
export default BarcodeScannerModal
