import React, { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Customer, customersApi } from "./api"

interface CustomerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer?: Customer | null
  onSuccess: () => void
  onCustomerCreated?: (customer: Customer) => void
}

export const CustomerDialog: React.FC<CustomerDialogProps> = ({
  open,
  onOpenChange,
  customer,
  onSuccess,
  onCustomerCreated,
}) => {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [gstin, setGstin] = useState("")
  const [state, setState] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (customer) {
      setName(customer.name)
      setEmail(customer.email)
      setPhone(customer.phone || "")
      setAddress(customer.address || "")
      setGstin(customer.gstin || "")
      setState(customer.state || "")
      setIsActive(customer.is_active)
    } else {
      setName("")
      setEmail("")
      setPhone("")
      setAddress("")
      setGstin("")
      setState("")
      setIsActive(true)
    }
  }, [customer, open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) return toast.error("Customer name is required.")
    if (!customer && !email.trim()) return toast.error("Customer email is required.")

    setIsSubmitting(true)
    try {
      if (customer) {
        await customersApi.updateCustomer(customer.id, {
          name: name.trim(),
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          gstin: gstin.trim().toUpperCase() || undefined,
          state: state.trim() || undefined,
          is_active: isActive,
        })
        toast.success("Customer profile updated successfully")
      } else {
        const newCustomer = await customersApi.createCustomer({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          gstin: gstin.trim().toUpperCase() || undefined,
          state: state.trim() || undefined,
        })
        toast.success("Customer registered successfully")
        onCustomerCreated?.(newCustomer)
      }
      onSuccess()
      onOpenChange(false)
    } catch {
      // Error toasted by apiClient
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <DialogHeader>
          <DialogTitle className="text-[#F5F5F7]">{customer ? "Edit Customer Profile" : "Register New Customer"}</DialogTitle>
          <DialogDescription className="text-[#94949C]">
            {customer
              ? "Update client contact details and account status."
              : "Create a customer record for POS checkout billing, tax invoicing, and instant email dispatch."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-medium text-[#C4C4C8]">Full Name *</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-[#C4C4C8]">Email Address *</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. rahul@example.com"
                disabled={!!customer}
                required
              />
              {customer && (
                <p className="text-[11px] text-[#94949C]">Email cannot be changed after registration.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-medium text-[#C4C4C8]">Phone Number</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +91 98765 43210"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-[#C4C4C8]">State (for GST Supply)</label>
              <Input
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="e.g. Kerala, Maharashtra"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-medium text-[#C4C4C8]">GSTIN (Optional, for B2B ITC)</label>
              <Input
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                placeholder="e.g. 32AAAAA0000A1Z5"
                className="uppercase font-mono text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-[#C4C4C8]">Billing Address</label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Calicut Road, Malappuram"
              />
            </div>
          </div>

          {customer && (
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="is_active_toggle"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-white/[0.16] bg-[#0A0A0C] text-primary focus:ring-primary h-4 w-4"
              />
              <label htmlFor="is_active_toggle" className="text-sm font-medium text-[#C4C4C8]">
                Customer Account Active
              </label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90 text-white font-medium">
            {isSubmitting ? "Saving..." : customer ? "Save Changes" : "Register Customer"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
