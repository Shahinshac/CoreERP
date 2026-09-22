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
}

export const CustomerDialog: React.FC<CustomerDialogProps> = ({
  open,
  onOpenChange,
  customer,
  onSuccess,
}) => {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [isActive, setIsActive] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (customer) {
      setName(customer.name)
      setEmail(customer.email)
      setPhone(customer.phone || "")
      setAddress(customer.address || "")
      setIsActive(customer.is_active)
    } else {
      setName("")
      setEmail("")
      setPhone("")
      setAddress("")
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
          is_active: isActive,
        })
        toast.success("Customer profile updated successfully")
      } else {
        await customersApi.createCustomer({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
        })
        toast.success("Customer registered successfully")
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
          <DialogTitle>{customer ? "Edit Customer Profile" : "Register New Customer"}</DialogTitle>
          <DialogDescription>
            {customer
              ? "Update client contact details and account status."
              : "Create a customer record for POS checkout billing and loyalty profiles."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="space-y-1">
            <label className="font-medium text-slate-700">Full Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rajesh Kumar"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="font-medium text-slate-700">Email Address *</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. rajesh@example.com"
              disabled={!!customer}
              required
            />
            {customer && (
              <p className="text-[11px] text-slate-500">Email cannot be changed after registration.</p>
            )}
          </div>

          <div className="space-y-1">
            <label className="font-medium text-slate-700">Phone Number</label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +91 98765 43210"
            />
          </div>

          <div className="space-y-1">
            <label className="font-medium text-slate-700">Billing Address / Notes</label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Flat 402, Sunrise Apts, MG Road"
            />
          </div>

          {customer && (
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="is_active_toggle"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
              />
              <label htmlFor="is_active_toggle" className="text-sm font-medium text-slate-700">
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
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : customer ? "Save Changes" : "Register Customer"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  )
}
