export interface HsnSacItem {
  code: string
  description: string
  category: string
}

export const COMMON_HSN_SAC_CODES: HsnSacItem[] = [
  // Computers & IT Hardware
  { code: "8471", description: "Automatic data processing machines, computers, laptops, tablets, storage units", category: "IT Hardware" },
  { code: "84713010", description: "Personal computers, microcomputers, laptops, notebooks", category: "IT Hardware" },
  { code: "8473", description: "Parts and accessories for computers, printers, and office machinery", category: "IT Hardware" },
  { code: "8528", description: "Monitors, projectors, and display panels", category: "IT Hardware" },
  { code: "8523", description: "Discs, solid-state non-volatile storage devices (SSDs, USB flash drives)", category: "IT Hardware" },
  { code: "8443", description: "Printers, copying machines, facsimile machines and parts", category: "IT Hardware" },

  // Telecommunications & Networking
  { code: "8517", description: "Smartphones, telephone sets, routers, network switches, modems", category: "Electronics" },
  { code: "8518", description: "Microphones, loudspeakers, headphones, earphones, amplifiers", category: "Electronics" },
  { code: "8504", description: "Electrical transformers, static converters (power adapters, UPS, chargers)", category: "Electronics" },
  { code: "8544", description: "Insulated cables, network Ethernet cables, optical fibre cables", category: "Electronics" },

  // Furniture & Office Fixtures
  { code: "9403", description: "Office furniture, desks, metal/wooden cabinets, storage racks", category: "Furniture" },
  { code: "9401", description: "Seats, ergonomic office chairs, revolving chairs with wheels", category: "Furniture" },
  { code: "9405", description: "Lamps, lighting fixtures, LED desk lights", category: "Furniture" },

  // Office Supplies, Paper & Stationery
  { code: "4802", description: "Uncoated paper and paperboard for printing, copying or writing", category: "Stationery" },
  { code: "4820", description: "Registers, notebooks, receipt books, invoice books, folders, file covers", category: "Stationery" },
  { code: "9608", description: "Ballpoint pens, felt-tipped pens, markers, pen refills", category: "Stationery" },
  { code: "8205", description: "Hand tools, staplers, paper cutters, hole punchers", category: "Stationery" },

  // Electrical & Household Appliances
  { code: "8415", description: "Air conditioning machines and units", category: "Appliances" },
  { code: "8418", description: "Refrigerators, freezers, water dispensers", category: "Appliances" },
  { code: "8450", description: "Household or laundry-type washing machines", category: "Appliances" },
  { code: "8516", description: "Electric water heaters, electric irons, kitchen appliances", category: "Appliances" },

  // Services (SAC Codes)
  { code: "998311", description: "Information technology (IT) consulting and support services", category: "Services (SAC)" },
  { code: "998312", description: "Business process management & web services", category: "Services (SAC)" },
  { code: "998313", description: "Information technology (IT) design and development services", category: "Services (SAC)" },
  { code: "998314", description: "Internet telecommunications, hosting and network management services", category: "Services (SAC)" },
  { code: "998712", description: "Maintenance and repair services of commercial & electrical machinery", category: "Services (SAC)" },
  { code: "998713", description: "Maintenance and repair services of computers and office equipment", category: "Services (SAC)" },
  { code: "998315", description: "IT infrastructure and cloud hosting services", category: "Services (SAC)" },
]

export function validateHsnCode(code: string): boolean {
  if (!code) return true
  const cleaned = code.trim()
  return /^\d{2,8}$/.test(cleaned)
}

export function searchHsnCodes(query: string): HsnSacItem[] {
  if (!query || !query.trim()) return COMMON_HSN_SAC_CODES.slice(0, 15)
  const q = query.trim().toLowerCase()
  return COMMON_HSN_SAC_CODES.filter(
    (item) =>
      item.code.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
  )
}
