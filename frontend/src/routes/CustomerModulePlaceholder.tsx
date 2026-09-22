import React from "react"
import { LucideIcon, Package } from "lucide-react"
import { EmptyState } from "@/components/common/EmptyState"

interface CustomerModulePlaceholderProps {
  name: string
  description: string
  icon?: LucideIcon
}

export const CustomerModulePlaceholder: React.FC<CustomerModulePlaceholderProps> = ({
  name,
  description,
  icon = Package,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{name}</h1>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      <div className="bg-white border rounded-xl p-12 shadow-sm">
        <EmptyState
          icon={icon}
          title={`No ${name.toLowerCase()} found`}
          description={`Your ${name.toLowerCase()} history will appear here once records are generated in future phases.`}
        />
      </div>
    </div>
  )
}
