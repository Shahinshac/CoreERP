import React from "react"
import { LucideIcon, Package } from "lucide-react"
import { EmptyState } from "@/components/common/EmptyState"

interface ModulePlaceholderProps {
  name: string
  description: string
  icon?: LucideIcon
}

export const ModulePlaceholder: React.FC<ModulePlaceholderProps> = ({
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
          title={`${name} Module Placeholder`}
          description={`The ${name.toLowerCase()} backend models and schema are defined. Business workflow features and UI forms will be implemented in subsequent phases.`}
        />
      </div>
    </div>
  )
}
