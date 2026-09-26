import React from "react"
import { Invoice } from "./api"
import { Sale } from "@/features/pos/api"
import { Customer } from "@/features/customers/api"

interface A4InvoiceProps {
  invoice?: Invoice | null
  sale?: Sale | null
  customer?: Customer | null
  sellerName?: string
  sellerPhone?: string
  sellerEmail?: string
  sellerAddress?: string
  sellerGstin?: string
  sellerState?: string
  sellerStateCode?: string
  sellerUpiId?: string
}

/**
 * Converts a monetary number to standard Indian English Currency words.
 */
function numberToIndianWords(amount: number): string {
  if (isNaN(amount) || amount === 0) return "Rupees Zero Only"

  const units = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ]
  const tens = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
  ]

  const twoDigits = (n: number): string => {
    if (n === 0) return ""
    if (n < 20) return units[n]
    return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + units[n % 10] : "")
  }

  let intPart = Math.floor(amount)
  const decPart = Math.round((amount - intPart) * 100)

  const crore = Math.floor(intPart / 10000000)
  intPart %= 10000000
  const lakh = Math.floor(intPart / 100000)
  intPart %= 100000
  const thousand = Math.floor(intPart / 1000)
  intPart %= 1000
  const hundred = Math.floor(intPart / 100)
  const rem = intPart % 100

  const parts: string[] = []
  if (crore) parts.push(twoDigits(crore) + " Crore")
  if (lakh) parts.push(twoDigits(lakh) + " Lakh")
  if (thousand) parts.push(twoDigits(thousand) + " Thousand")
  if (hundred) parts.push(twoDigits(hundred) + " Hundred")
  if (rem) parts.push(twoDigits(rem))

  const words = parts.join(" ").trim()
  const paiseStr = decPart > 0 ? ` and ${twoDigits(decPart)} Paise` : ""
  return `Rupees ${words}${paiseStr} Only`
}

export const A4Invoice: React.FC<A4InvoiceProps> = ({
  invoice,
  sale,
  customer,
  sellerName = "SHAHIN SHA",
  sellerPhone = "7594012761",
  sellerEmail = "shaahnpvt7@gmail.com",
  sellerAddress = "Malappuram, Kerala, India - 676505",
  sellerGstin = "32ABCDE1234F1Z5",
  sellerState = "Kerala",
  sellerStateCode = "32",
  sellerUpiId = "7594012761@superyes",
}) => {
  // Extract or fallback metadata
  const invNumber = invoice?.invoice_number || (sale?.invoice_number ? `INV-${sale.invoice_number}` : "INV-PENDING")
  const invDate = invoice?.invoice_date
    ? new Date(invoice.invoice_date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : sale?.sale_date
    ? new Date(sale.sale_date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })

  const buyerName = invoice?.buyer_name || customer?.name || sale?.customer_name || "Walk-in Customer"
  const buyerPhone = invoice?.buyer_phone || customer?.phone || ""
  const buyerEmail = customer?.email || ""
  const buyerAddress = invoice?.buyer_address || customer?.address || ""
  const buyerGstin = invoice?.buyer_gstin || customer?.gstin || "Unregistered"
  const buyerState = invoice?.buyer_state || customer?.state || sellerState
  const buyerStateCode = invoice?.buyer_state_code || (buyerState.toLowerCase().includes("kerala") ? "32" : "27")

  const isInterState = invoice?.is_inter_state ?? (buyerState.toLowerCase() !== sellerState.toLowerCase())
  const placeOfSupply = invoice?.place_of_supply || `${buyerState} (${buyerStateCode})`

  // Line items
  const items = invoice?.items && invoice.items.length > 0
    ? invoice.items.map((i, idx) => ({
        idx: idx + 1,
        name: i.product_name,
        sku: i.product_sku,
        hsn: i.hsn_code || "8517",
        qty: parseFloat(i.quantity),
        unitPrice: parseFloat(i.unit_price),
        taxable: parseFloat(i.taxable_value),
        cgstAmount: parseFloat(i.cgst_amount),
        sgstAmount: parseFloat(i.sgst_amount),
        igstAmount: parseFloat(i.igst_amount),
        total: parseFloat(i.total_amount),
      }))
    : sale?.items && sale.items.length > 0
    ? sale.items.map((i, idx) => {
        const qty = parseFloat(i.quantity) || 1
        const rate = parseFloat(i.unit_price) || 0
        const disc = parseFloat(i.discount_amount) || 0
        const totalAmount = parseFloat(i.total_price) || (qty * rate - disc)
        const taxable = Math.max(0, qty * rate - disc)
        const tax = Math.max(0, totalAmount - taxable)
        return {
          idx: idx + 1,
          name: i.product_name || "Item",
          sku: i.product_sku || "SKU-N/A",
          hsn: "8517",
          qty,
          unitPrice: rate,
          taxable,
          cgstAmount: isInterState ? 0 : tax / 2,
          sgstAmount: isInterState ? 0 : tax / 2,
          igstAmount: isInterState ? tax : 0,
          total: totalAmount,
        }
      })
    : []

  const subtotal = invoice
    ? parseFloat(invoice.subtotal)
    : sale
    ? parseFloat(sale.subtotal)
    : items.reduce((acc, curr) => acc + curr.taxable, 0)

  const cgstTotal = invoice
    ? parseFloat(invoice.cgst_amount)
    : isInterState
    ? 0
    : items.reduce((acc, curr) => acc + curr.cgstAmount, 0)

  const sgstTotal = invoice
    ? parseFloat(invoice.sgst_amount)
    : isInterState
    ? 0
    : items.reduce((acc, curr) => acc + curr.sgstAmount, 0)

  const igstTotal = invoice
    ? parseFloat(invoice.igst_amount)
    : isInterState
    ? items.reduce((acc, curr) => acc + curr.igstAmount, 0)
    : 0

  const grandTotal = invoice
    ? parseFloat(invoice.grand_total)
    : sale
    ? parseFloat(sale.total_amount)
    : items.reduce((acc, curr) => acc + curr.total, 0)

  const amountInWords = numberToIndianWords(grandTotal)
  const paymentMethod = (invoice?.payment_method || sale?.payment_method || "CASH").toUpperCase()
  const paymentStatus = (invoice?.payment_status || (sale?.status === "completed" ? "PAID" : "UNPAID")).toUpperCase()
  const emiPlan = invoice?.emi_plan

  return (
    <div className="a4-document bg-white text-slate-900 font-sans p-6 sm:p-8 max-w-[794px] mx-auto rounded-lg shadow-xl border border-slate-200 print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-none print:w-full">
      {/* 1. Header Banner */}
      <div className="border-b-2 border-slate-900 pb-4 mb-4">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          {/* Seller / Store Branding */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-slate-950 uppercase">
                {invoice?.seller_name || sellerName}
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                CoreERP Retail
              </span>
            </div>
            <p className="text-xs text-slate-600 font-medium">
              {invoice?.seller_address || sellerAddress}
            </p>
            <div className="text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5">
              <span>Phone: <strong className="text-slate-800">{invoice?.seller_phone || sellerPhone}</strong></span>
              <span>•</span>
              <span>Email: <strong className="text-slate-800">{sellerEmail}</strong></span>
            </div>
            <div className="text-xs text-slate-700 pt-0.5 flex flex-wrap gap-x-3">
              <span>GSTIN: <strong className="font-mono text-slate-900">{invoice?.seller_gstin || sellerGstin}</strong></span>
              <span>•</span>
              <span>State: <strong className="text-slate-900">{invoice?.seller_state || sellerState} (Code: {invoice?.seller_state_code || sellerStateCode})</strong></span>
            </div>
          </div>

          {/* Tax Invoice Identification Badge */}
          <div className="sm:text-right space-y-1 bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded border sm:border-none border-slate-200 w-full sm:w-auto">
            <div className="inline-block bg-slate-900 text-white font-bold text-xs uppercase px-3 py-1 rounded tracking-wider mb-1">
              TAX INVOICE
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              (Original for Recipient)
            </div>
            <div className="text-sm font-black font-mono text-slate-900">
              {invNumber}
            </div>
            <div className="text-xs text-slate-600">
              Date: <strong className="text-slate-900">{invDate}</strong>
            </div>
            <div className="text-xs text-slate-600">
              Place of Supply: <strong className="text-slate-800">{placeOfSupply}</strong>
            </div>
            <div className="text-xs text-slate-500">
              Reverse Charge: <strong className="text-slate-800">No</strong>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Customer & Billing Details (2-Column Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 rounded-md p-3.5 mb-4 text-xs">
        {/* Recipient Details */}
        <div className="space-y-1">
          <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] border-b border-slate-200 pb-1 flex items-center justify-between">
            <span>Billed To (Customer Details)</span>
          </div>
          <div className="font-bold text-sm text-slate-950 pt-0.5">{buyerName}</div>
          {buyerPhone && (
            <div className="text-slate-600">
              Phone: <strong className="text-slate-800 font-mono">{buyerPhone}</strong>
            </div>
          )}
          {buyerEmail && (
            <div className="text-slate-600">
              Email: <span className="text-slate-800">{buyerEmail}</span>
            </div>
          )}
          {buyerAddress && (
            <div className="text-slate-600">
              Address: <span className="text-slate-800">{buyerAddress}</span>
            </div>
          )}
          <div className="pt-0.5 flex gap-2 text-slate-600">
            <span>GSTIN: <strong className="font-mono text-slate-900">{buyerGstin}</strong></span>
          </div>
        </div>

        {/* Dispatch & Supply Details */}
        <div className="space-y-1 sm:border-l sm:border-slate-200 sm:pl-4">
          <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] border-b border-slate-200 pb-1">
            Taxation & Payment Status
          </div>
          <div className="pt-0.5 flex justify-between">
            <span className="text-slate-600">Supply Classification:</span>
            <strong className="text-slate-900 font-medium">
              {isInterState ? "Inter-State (IGST 100%)" : "Intra-State (CGST + SGST)"}
            </strong>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Payment Status:</span>
            <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
              paymentStatus === "PAID"
                ? "text-emerald-700 bg-emerald-100/80"
                : paymentStatus === "PARTIAL" || paymentStatus === "PARTIALLY_PAID"
                ? "text-amber-800 bg-amber-100"
                : "text-red-700 bg-red-100/80"
            }`}>
              {paymentStatus} ({paymentMethod})
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">UPI Instant Settlement:</span>
            <strong className="font-mono text-slate-800">{sellerUpiId}</strong>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Financial Year:</span>
            <span className="font-mono font-semibold text-slate-700">{invoice?.financial_year || "2026-27"}</span>
          </div>
        </div>
      </div>

      {/* 3. Line Items Table */}
      <div className="border border-slate-200 rounded-md overflow-hidden mb-4">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold">
              <th className="py-2.5 px-2 text-center w-8">#</th>
              <th className="py-2.5 px-2">Item Description & SKU</th>
              <th className="py-2.5 px-2 text-center w-16">HSN</th>
              <th className="py-2.5 px-2 text-center w-12">Qty</th>
              <th className="py-2.5 px-2 text-right w-20">Rate (₹)</th>
              <th className="py-2.5 px-2 text-right w-20">Taxable (₹)</th>
              {!isInterState ? (
                <>
                  <th className="py-2.5 px-2 text-right w-16">CGST (₹)</th>
                  <th className="py-2.5 px-2 text-right w-16">SGST (₹)</th>
                </>
              ) : (
                <th className="py-2.5 px-2 text-right w-20">IGST (₹)</th>
              )}
              <th className="py-2.5 px-2 text-right w-24">Total (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.length === 0 ? (
              <tr>
                <td colSpan={isInterState ? 7 : 8} className="py-8 text-center text-slate-400">
                  No items in this invoice.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.idx} className="hover:bg-slate-50/50">
                  <td className="py-2 px-2 text-center text-slate-500 font-mono">{item.idx}</td>
                  <td className="py-2 px-2">
                    <div className="font-bold text-slate-900">{item.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">SKU: {item.sku}</div>
                  </td>
                  <td className="py-2 px-2 text-center text-slate-600 font-mono text-[11px]">{item.hsn}</td>
                  <td className="py-2 px-2 text-center font-bold text-slate-900 font-mono">{item.qty}</td>
                  <td className="py-2 px-2 text-right text-slate-700 font-mono">{item.unitPrice.toFixed(2)}</td>
                  <td className="py-2 px-2 text-right text-slate-800 font-mono font-medium">{item.taxable.toFixed(2)}</td>
                  {!isInterState ? (
                    <>
                      <td className="py-2 px-2 text-right text-slate-700 font-mono text-[11px]">{item.cgstAmount.toFixed(2)}</td>
                      <td className="py-2 px-2 text-right text-slate-700 font-mono text-[11px]">{item.sgstAmount.toFixed(2)}</td>
                    </>
                  ) : (
                    <td className="py-2 px-2 text-right text-slate-700 font-mono text-[11px]">{item.igstAmount.toFixed(2)}</td>
                  )}
                  <td className="py-2 px-2 text-right font-bold text-slate-950 font-mono">{item.total.toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* EMI Financing & Repayment Schedule */}
      {emiPlan && (
        <div className="border border-sky-300 bg-sky-50/70 rounded-md p-3.5 mb-4 text-xs">
          <div className="font-bold text-sky-950 uppercase tracking-wider text-[11px] border-b border-sky-200 pb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span>EMI Financing & Repayment Terms</span>
            </span>
            <span className="font-mono text-sky-800 font-semibold">
              Tenure: {emiPlan.number_of_installments} Months • Status: {emiPlan.status.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2.5 pb-2 text-slate-700">
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-medium">Principal:</span>
              <div className="font-mono font-bold text-slate-900 text-sm">₹{parseFloat(emiPlan.principal).toFixed(2)}</div>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-medium">Down Payment:</span>
              <div className="font-mono font-bold text-emerald-700 text-sm">₹{parseFloat(emiPlan.down_payment).toFixed(2)}</div>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-medium">Total Financed:</span>
              <div className="font-mono font-bold text-slate-900 text-sm">₹{parseFloat(emiPlan.total_financed).toFixed(2)}</div>
            </div>
            <div>
              <span className="text-slate-500 text-[10px] uppercase font-medium">Monthly Installment:</span>
              <div className="font-mono font-bold text-sky-900 text-sm">₹{parseFloat(emiPlan.installment_amount).toFixed(2)}/mo</div>
            </div>
          </div>

          {emiPlan.installments && emiPlan.installments.length > 0 && (
            <div className="mt-1 border border-sky-200 rounded overflow-hidden">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-sky-100 text-sky-900 font-semibold">
                  <tr>
                    <th className="py-1 px-2 text-center w-8">#</th>
                    <th className="py-1 px-2">Due Date</th>
                    <th className="py-1 px-2 text-right">Amount Due</th>
                    <th className="py-1 px-2 text-right">Amount Paid</th>
                    <th className="py-1 px-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sky-100 bg-white">
                  {emiPlan.installments.map((inst) => (
                    <tr key={inst.installment_number} className="hover:bg-sky-50/50">
                      <td className="py-1 px-2 text-center font-mono font-medium">{inst.installment_number}</td>
                      <td className="py-1 px-2 font-mono">{inst.due_date}</td>
                      <td className="py-1 px-2 text-right font-mono font-medium">₹{parseFloat(inst.amount_due).toFixed(2)}</td>
                      <td className="py-1 px-2 text-right font-mono text-emerald-700 font-medium">₹{parseFloat(inst.amount_paid).toFixed(2)}</td>
                      <td className="py-1 px-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          inst.status === "paid"
                            ? "bg-emerald-100 text-emerald-800"
                            : inst.status === "overdue"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          {inst.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. Summary & Amount in Words Block */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 mb-4">
        {/* Words & Bank/UPI */}
        <div className="sm:col-span-7 bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-2 text-xs">
          <div>
            <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Amount Chargeable in Words:
            </div>
            <div className="text-xs font-bold text-slate-950 italic mt-0.5 leading-snug">
              {amountInWords}
            </div>
          </div>

          <div className="border-t border-slate-200 pt-2 text-[11px] text-slate-600 space-y-1">
            <div>
              UPI Payment Settlement: <strong className="font-mono text-slate-900">{sellerUpiId}</strong>
            </div>
            <div>
              Account Beneficiary: <strong className="text-slate-900">{invoice?.seller_name || sellerName}</strong>
            </div>
            <div className="text-slate-500 italic">
              Payment mode: {paymentMethod} • Instant Clearance
            </div>
          </div>
        </div>

        {/* Totals Table */}
        <div className="sm:col-span-5 border border-slate-200 rounded-md overflow-hidden text-xs">
          <div className="divide-y divide-slate-200">
            <div className="flex justify-between py-1.5 px-3 bg-white">
              <span className="text-slate-600">Taxable Subtotal:</span>
              <span className="font-mono font-semibold text-slate-900">₹{subtotal.toFixed(2)}</span>
            </div>

            {!isInterState ? (
              <>
                <div className="flex justify-between py-1.5 px-3 bg-white">
                  <span className="text-slate-600">Central GST (CGST):</span>
                  <span className="font-mono font-semibold text-slate-900">₹{cgstTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1.5 px-3 bg-white">
                  <span className="text-slate-600">State GST (SGST):</span>
                  <span className="font-mono font-semibold text-slate-900">₹{sgstTotal.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between py-1.5 px-3 bg-white">
                <span className="text-slate-600">Integrated GST (IGST):</span>
                <span className="font-mono font-semibold text-slate-900">₹{igstTotal.toFixed(2)}</span>
              </div>
            )}

            <div className="flex justify-between py-1.5 px-3 bg-white">
              <span className="text-slate-600">Total Tax Amount:</span>
              <span className="font-mono font-semibold text-slate-900">₹{(cgstTotal + sgstTotal + igstTotal).toFixed(2)}</span>
            </div>

            <div className="flex justify-between py-2.5 px-3 bg-slate-900 text-white font-bold text-sm">
              <span>GRAND TOTAL:</span>
              <span className="font-mono">₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Statutory Terms, Notes & Authorized Signatory */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 border border-slate-200 rounded-md p-3.5 bg-slate-50 text-[11px] leading-relaxed">
        <div className="sm:col-span-8 space-y-1 text-slate-600">
          <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
            Declaration & Terms:
          </div>
          <ol className="list-decimal list-inside space-y-0.5 text-slate-600">
            <li>Goods once sold will be accepted under store replacement/credit note policy only.</li>
            <li>We declare that this invoice shows actual price of the goods described and all particulars are true and correct.</li>
            <li>Subject to Malappuram jurisdiction only.</li>
            <li>Electronic Tax Invoice generated automatically via CoreERP.</li>
          </ol>
        </div>

        <div className="sm:col-span-4 flex flex-col justify-between items-center sm:items-end text-right pt-4 sm:pt-0">
          <div className="text-[11px] font-bold text-slate-800">
            For {invoice?.seller_name || sellerName}
          </div>
          <div className="mt-8 border-t border-slate-400 pt-1 text-[11px] font-semibold text-slate-700 text-center sm:text-right w-36">
            Authorized Signatory
          </div>
        </div>
      </div>

      {/* Bottom Subtle Note */}
      <div className="text-center text-[10px] text-slate-400 mt-3 print:mt-2">
        Thank you for your business! • CoreERP Billing & Accounting Suite
      </div>
    </div>
  )
}
export default A4Invoice
