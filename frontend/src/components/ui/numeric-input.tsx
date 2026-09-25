import React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface NumericInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string
  onChange: (value: string) => void
  precisionType?: "money" | "quantity"
  maxDecimals?: number
  allowNegative?: boolean
  prefix?: string
  suffix?: string
}

export const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  (
    {
      value,
      onChange,
      precisionType = "money",
      maxDecimals,
      allowNegative = false,
      prefix,
      suffix,
      className,
      ...props
    },
    ref
  ) => {
    const decimals = maxDecimals !== undefined ? maxDecimals : precisionType === "money" ? 2 : 3

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value.trim()

      if (val === "" || (allowNegative && val === "-")) {
        onChange(val)
        return
      }

      // Regex strictly matching: optional minus (if allowed), digits, optional dot, at most `decimals` digits
      const regex = allowNegative
        ? new RegExp(`^-?\\d*(\\.\\d{0,${decimals}})?$`)
        : new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`)

      if (regex.test(val)) {
        onChange(val)
      }
    }

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      const pasteData = e.clipboardData.getData("text").trim()
      const regex = allowNegative
        ? new RegExp(`^-?\\d*(\\.\\d{0,${decimals}})?$`)
        : new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`)

      if (!regex.test(pasteData)) {
        e.preventDefault()
      }
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      let val = e.target.value.trim()
      if (val !== "" && val !== "-" && !isNaN(Number(val))) {
        if (/^0+\d/.test(val)) {
          val = val.replace(/^0+/, "")
          if (val === "" || val.startsWith(".")) {
            val = "0" + val
          }
          onChange(val)
        }
      }
      props.onBlur?.(e)
    }

    return (
      <div className="relative flex items-center w-full">
        {prefix && (
          <span className="absolute left-3 text-zinc-500 text-sm font-medium select-none pointer-events-none">
            {prefix}
          </span>
        )}
        <Input
          ref={ref}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={handleChange}
          onPaste={handlePaste}
          onBlur={handleBlur}
          className={cn(
            prefix && "pl-8",
            suffix && "pr-12",
            "font-mono text-zinc-100",
            className
          )}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 text-zinc-500 text-xs font-medium select-none pointer-events-none uppercase">
            {suffix}
          </span>
        )}
      </div>
    )
  }
)

NumericInput.displayName = "NumericInput"
