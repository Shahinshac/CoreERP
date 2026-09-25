import React from "react"
import { Sale } from "./api"
import { Invoice } from "@/features/invoicing/api"
import { POSStoreInfo } from "./api"

export interface ThermalReceiptProps {
  sale: Sale
  invoice?: Invoice | null
  storeInfo?: POSStoreInfo | null
  customerPhone?: string | null
  customerGstin?: string | null
  width: "58mm" | "80mm"
  cashTendered?: string
  className?: string
}

// Generates pseudo-barcode stripes based on invoice number characters
function BarcodeSvg({ text, width }: { text: string; width: "58mm" | "80mm" }) {
  const bars: { x: number; w: number }[] = []
  let currentX = 0

  // Start quiet zone
  currentX += 4

  // Seed bars with characters from text
  const clean = text.replace(/[^A-Za-z0-9]/g, "")
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i)
    const w1 = (code % 3) + 1
    const gap = ((code >> 2) % 2) + 1
    const w2 = ((code >> 1) % 2) + 1
    bars.push({ x: currentX, w: w1 })
    currentX += w1 + gap
    bars.push({ x: currentX, w: w2 })
    currentX += w2 + 2
  }

  // End quiet zone
  currentX += 4
  const svgWidth = Math.max(currentX, width === "58mm" ? 180 : 240)

  return (
    <div className="flex flex-col items-center my-1.5">
      <svg
        width={width === "58mm" ? "170" : "220"}
        height="30"
        viewBox={`0 0 ${svgWidth} 30`}
        preserveAspectRatio="xMidYMid meet"
        className="overflow-visible"
      >
        {bars.map((b, idx) => (
          <rect
            key={idx}
            x={b.x}
            y="0"
            width={b.w}
            height="30"
            fill="#000000"
          />
        ))}
      </svg>
      <span className="font-mono text-[9px] tracking-wider text-black mt-0.5 font-semibold">
        *{text}*
      </span>
    </div>
  )
}

export const ThermalReceipt: React.FC<ThermalReceiptProps> = ({
  sale,
  invoice,
  storeInfo,
  customerPhone,
  customerGstin,
  width,
  cashTendered,
  className = "",
}) => {
  const is58 = width === "58mm"

  // Formatting helpers
  const fmt = (numStr: string | number | undefined) => {
    const n = typeof numStr === "string" ? parseFloat(numStr) : Number(numStr || 0)
    return isNaN(n) ? "0.00" : n.toFixed(2)
  }

  // Store information with standard fallback defaults
  const storeName = invoice?.seller_name || storeInfo?.store_name || "MY RETAIL STORE PVT LTD"
  const storeAddress = invoice?.seller_address || storeInfo?.address || "123 Commercial Hub, MG Road, Mumbai, Maharashtra 400001"
  const storePhone = invoice?.seller_phone || storeInfo?.phone || "+91 9876543210"
  const storeEmail = storeInfo?.email || "billing@myretailstore.com"
  const storeGstin = invoice?.seller_gstin || storeInfo?.gstin || "27ABCDE1234F1Z5"
  const storeState = invoice?.seller_state || storeInfo?.state || "Maharashtra"

  // Invoice / Sale metadata
  const docNumber = invoice?.invoice_number || sale.invoice_number
  const isStatutoryInvoice = !!invoice
  const saleDate = new Date(sale.sale_date || Date.now())
  const formattedDate = saleDate.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const formattedTime = saleDate.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  })

  // Customer information
  const customerName = invoice?.buyer_name || sale.customer_name || "Walk-in Customer"
  const custPhone = invoice?.buyer_phone || customerPhone
  const custGstin = invoice?.buyer_gstin || customerGstin

  // Cash payment calculation
  const totalAmountNum = parseFloat(sale.total_amount) || 0
  const tenderedNum = cashTendered ? parseFloat(cashTendered) : null
  const changeDue = tenderedNum && tenderedNum >= totalAmountNum ? tenderedNum - totalAmountNum : null

  // Total quantity calculation
  const totalUnits = sale.items.reduce((acc, it) => acc + (parseFloat(it.quantity) || 0), 0)

  return (
    <div
      className={`font-mono text-black bg-white select-none ${
        is58
          ? "w-[58mm] max-w-[58mm] p-[2.5mm] text-[10.5px] leading-tight"
          : "w-[80mm] max-w-[80mm] p-[3.5mm] text-[11.5px] leading-normal"
      } ${className}`}
      style={{
        boxSizing: "border-box",
        wordBreak: "break-word",
        color: "#000000",
        backgroundColor: "#ffffff",
      }}
    >
      {/* 1. STORE HEADER */}
      <div className="text-center pb-1">
        <h1
          className={`font-bold tracking-tight uppercase ${
            is58 ? "text-xs mb-0.5 leading-snug" : "text-sm mb-1"
          }`}
          style={{ color: "#000000" }}
        >
          {storeName}
        </h1>
        <p className="text-[9.5px] leading-snug text-neutral-800">{storeAddress}</p>
        <p className="text-[9.5px] text-neutral-800">
          Tel: {storePhone} {storeEmail && !is58 ? `| ${storeEmail}` : ""}
        </p>
        <div className="mt-0.5 font-bold text-[10px] text-black">
          GSTIN: {storeGstin}
        </div>
        {!is58 && storeState && (
          <p className="text-[9px] text-neutral-700">State: {storeState}</p>
        )}
      </div>

      {/* RECEIPT TYPE BADGE */}
      <div className="border-t border-b border-dashed border-black py-1 my-1 text-center font-bold uppercase text-[10px]">
        {isStatutoryInvoice ? "TAX INVOICE (GST)" : "RETAIL SALE CASH RECEIPT"}
      </div>

      {/* 2. TRANSACTION / INVOICE METADATA */}
      <div className={`space-y-0.5 text-[9.5px] pb-1 ${is58 ? "text-[9px]" : ""}`}>
        <div className="flex justify-between font-bold">
          <span>{isStatutoryInvoice ? "Invoice #:" : "Receipt #:"}</span>
          <span className="font-mono">{docNumber}</span>
        </div>
        <div className="flex justify-between text-neutral-800">
          <span>Date & Time:</span>
          <span>
            {formattedDate} {formattedTime}
          </span>
        </div>
        <div className="flex justify-between text-neutral-800">
          <span>Cashier:</span>
          <span>{sale.staff_email.split("@")[0]}</span>
        </div>
        <div className="flex justify-between text-neutral-800">
          <span>Customer:</span>
          <span className="font-semibold">{customerName}</span>
        </div>
        {custPhone && (
          <div className="flex justify-between text-neutral-800">
            <span>Customer Phone:</span>
            <span>{custPhone}</span>
          </div>
        )}
        {custGstin && (
          <div className="flex justify-between text-neutral-800">
            <span>Customer GSTIN:</span>
            <span className="font-bold">{custGstin}</span>
          </div>
        )}
      </div>

      {/* 3. LINE ITEMS SECTION */}
      <div className="border-t border-dashed border-black pt-1 mt-1">
        {/* Table Header */}
        {is58 ? (
          <div className="flex justify-between text-[9px] font-bold pb-1 border-b border-dashed border-black uppercase">
            <span>Item Details</span>
            <span>Total (₹)</span>
          </div>
        ) : (
          <div className="flex justify-between text-[9.5px] font-bold pb-1 border-b border-dashed border-black uppercase">
            <span className="flex-1">Item</span>
            <span className="w-12 text-right">Qty</span>
            <span className="w-16 text-right">Rate</span>
            <span className="w-18 text-right">Total (₹)</span>
          </div>
        )}

        {/* Items List */}
        <div className="divide-y divide-dashed divide-neutral-300 py-1 space-y-1">
          {sale.items.map((item) => {
            const qty = parseFloat(item.quantity)
            const unitPrice = parseFloat(item.unit_price)
            const lineDisc = parseFloat(item.discount_amount || "0")
            const lineTotal = parseFloat(item.total_price)

            if (is58) {
              // 58mm compact stacked row
              return (
                <div key={item.id} className="pt-1 first:pt-0">
                  <div className="font-semibold text-black leading-tight text-[10px]">
                    {item.product_name}
                  </div>
                  <div className="flex justify-between text-[9px] text-neutral-800 mt-0.5">
                    <span>
                      {qty.toFixed(item.quantity.includes(".") && !item.quantity.endsWith(".000") ? 2 : 0)} x ₹
                      {unitPrice.toFixed(2)}
                      {lineDisc > 0 && (
                        <span className="text-black ml-1 font-medium">
                          (-₹{lineDisc.toFixed(2)})
                        </span>
                      )}
                    </span>
                    <span className="font-bold text-black font-mono">
                      ₹{lineTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              )
            }

            // 80mm tabular row
            return (
              <div key={item.id} className="pt-1 first:pt-0">
                <div className="flex justify-between items-start text-[10.5px]">
                  <div className="flex-1 pr-1 font-semibold text-black">
                    {item.product_name}
                    {lineDisc > 0 && (
                      <span className="block text-[8.5px] text-neutral-700 font-normal">
                        Disc: -₹{lineDisc.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <span className="w-12 text-right font-mono">
                    {qty.toFixed(item.quantity.includes(".") && !item.quantity.endsWith(".000") ? 2 : 0)}
                  </span>
                  <span className="w-16 text-right font-mono">
                    ₹{unitPrice.toFixed(2)}
                  </span>
                  <span className="w-18 text-right font-bold font-mono">
                    ₹{lineTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* 4. TOTALS & TAX BREAKDOWN */}
      <div className="border-t border-dashed border-black pt-1 space-y-0.5 text-[9.5px]">
        <div className="flex justify-between">
          <span>Items Subtotal:</span>
          <span className="font-mono">₹{fmt(sale.subtotal)}</span>
        </div>

        {parseFloat(sale.discount_amount) > 0 && (
          <div className="flex justify-between text-black font-semibold">
            <span>Order Discount:</span>
            <span className="font-mono">-₹{fmt(sale.discount_amount)}</span>
          </div>
        )}

        {/* GST / TAX BREAKDOWN */}
        {isStatutoryInvoice && invoice ? (
          <div className="pt-0.5 space-y-0.5 text-[9px] text-neutral-800 border-t border-dotted border-neutral-400">
            {parseFloat(invoice.cgst_amount) > 0 && (
              <div className="flex justify-between">
                <span>CGST:</span>
                <span className="font-mono">₹{fmt(invoice.cgst_amount)}</span>
              </div>
            )}
            {parseFloat(invoice.sgst_amount) > 0 && (
              <div className="flex justify-between">
                <span>SGST:</span>
                <span className="font-mono">₹{fmt(invoice.sgst_amount)}</span>
              </div>
            )}
            {parseFloat(invoice.igst_amount) > 0 && (
              <div className="flex justify-between">
                <span>IGST:</span>
                <span className="font-mono">₹{fmt(invoice.igst_amount)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-black">
              <span>Total GST:</span>
              <span className="font-mono">₹{fmt(invoice.total_tax)}</span>
            </div>
          </div>
        ) : (
          parseFloat(sale.tax_amount) > 0 && (
            <div className="flex justify-between">
              <span>Tax / GST:</span>
              <span className="font-mono">₹{fmt(sale.tax_amount)}</span>
            </div>
          )
        )}

        {/* GRAND TOTAL */}
        <div className="border-t-2 border-b-2 border-black py-1 my-1 flex justify-between items-center font-bold">
          <span className={is58 ? "text-xs uppercase" : "text-sm uppercase"}>
            GRAND TOTAL:
          </span>
          <span className={is58 ? "text-sm font-mono" : "text-base font-mono"}>
            ₹{fmt(sale.total_amount)}
          </span>
        </div>
      </div>

      {/* 5. PAYMENT SETTLEMENT DETAILS */}
      <div className="space-y-0.5 text-[9.5px] pb-1 border-b border-dashed border-black">
        <div className="flex justify-between font-semibold">
          <span>Payment Mode:</span>
          <span className="uppercase font-mono">
            {sale.payment_method === "split" || sale.payment_method === "mixed"
              ? "SPLIT PAYMENT"
              : sale.payment_method}
          </span>
        </div>
        {sale.payment_method === "cash" && tenderedNum !== null && (
          <>
            <div className="flex justify-between text-neutral-800">
              <span>Cash Tendered:</span>
              <span className="font-mono">₹{tenderedNum.toFixed(2)}</span>
            </div>
            {changeDue !== null && (
              <div className="flex justify-between font-bold text-black">
                <span>Change Returned:</span>
                <span className="font-mono">₹{changeDue.toFixed(2)}</span>
              </div>
            )}
          </>
        )}
        {(sale.payment_method === "split" || sale.payment_method === "mixed") &&
          sale.payment_details &&
          sale.payment_details.length > 0 && (
            <div className="pt-0.5 space-y-0.5 text-[9px] text-neutral-800">
              {sale.payment_details.map((portion, idx) => (
                <div key={idx} className="flex justify-between">
                  <span className="uppercase font-mono">
                    {portion.method === "cash" ? "Cash" : portion.method === "card" ? "Card" : "UPI"}:
                  </span>
                  <span className="font-mono font-semibold">₹{fmt(portion.amount)}</span>
                </div>
              ))}
            </div>
          )}
        {sale.payment_method !== "cash" && (
          <div className="flex justify-between text-neutral-800">
            <span>Payment Status:</span>
            <span className="font-bold">PAID IN FULL</span>
          </div>
        )}
        {sale.notes && (
          <div className="text-[9px] italic text-neutral-700 pt-0.5">
            Note: {sale.notes}
          </div>
        )}
      </div>

      {/* 6. SUMMARY & BARCODE FOOTER */}
      <div className="text-center pt-1.5 space-y-1">
        <div className="text-[9px] text-neutral-700">
          Total Items: <span className="font-bold">{sale.items.length}</span> | Units:{" "}
          <span className="font-bold">{totalUnits.toFixed(0)}</span>
        </div>

        {/* Pseudo-Barcode for fast thermal scanner recognition */}
        <BarcodeSvg text={docNumber} width={width} />

        <div className="text-[8.5px] leading-tight text-neutral-700 pt-0.5">
          <p>Goods once sold can be exchanged within 14 days with original receipt.</p>
          <p className="font-bold uppercase tracking-wider text-black mt-1">
            *** THANK YOU FOR YOUR VISIT ***
          </p>
        </div>
      </div>
    </div>
  )
}
export default ThermalReceipt
