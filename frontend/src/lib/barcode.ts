/**
 * CoreERP High-Precision Barcode Engine
 * Supports standard GS1 EAN-13 retail barcodes and Code-128 (Subset B) alphanumeric barcodes.
 * Pure TypeScript, zero external dependencies, renders crisp SVGs and exports high-DPI PNGs.
 */

export function sanitizeFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "product"
  )
}

// GS1 EAN-13 Parity tables
const EAN13_PARITY: Record<string, string> = {
  "0": "LLLLLL",
  "1": "LLGLGG",
  "2": "LLGGLG",
  "3": "LLGGGL",
  "4": "LGLLGG",
  "5": "LGGLLG",
  "6": "LGGGLL",
  "7": "LGLGLG",
  "8": "LGLGGL",
  "9": "LGGLGL",
}

const EAN13_L_CODES: Record<string, string> = {
  "0": "0001101",
  "1": "0011001",
  "2": "0010011",
  "3": "0111101",
  "4": "0100011",
  "5": "0110001",
  "6": "0101111",
  "7": "0111011",
  "8": "0110111",
  "9": "0001011",
}

const EAN13_G_CODES: Record<string, string> = {
  "0": "0100111",
  "1": "0110011",
  "2": "0011011",
  "3": "0100001",
  "4": "0011101",
  "5": "0111001",
  "6": "0000101",
  "7": "0010001",
  "8": "0001001",
  "9": "0010111",
}

const EAN13_R_CODES: Record<string, string> = {
  "0": "1110010",
  "1": "1100110",
  "2": "1101100",
  "3": "1000010",
  "4": "1011100",
  "5": "1001110",
  "6": "1010000",
  "7": "1000100",
  "8": "1001000",
  "9": "1110100",
}

// Code 128 Patterns (values 0-106)
const CODE128_PATTERNS = [
  "11011001100", "11001101100", "11001100110", "10010011000", "10010001100",
  "10001001100", "10011001000", "10011000100", "10001100100", "11001001000",
  "11001000100", "11000100100", "10110011100", "10011011100", "10011001110",
  "10111001100", "10011101100", "10011100110", "11001110010", "11001011100",
  "11001001110", "11011100100", "11001110100", "11101101110", "11101001100",
  "11100101100", "11100100110", "11101100100", "11100110100", "11100110010",
  "11011011000", "11011000110", "11000110110", "10100011000", "10001011000",
  "10001000110", "10110001000", "10001101000", "10001100010", "11010001000",
  "11000101000", "11000100010", "10110111000", "10110001110", "10001101110",
  "10111011000", "10111000110", "10001110110", "11101110110", "11010001110",
  "11000101110", "11011101000", "11011100010", "11011101110", "11101011000",
  "11101000110", "11100010110", "11101101000", "11101100010", "11100011010",
  "11101111010", "11001000010", "11110001010", "10100110000", "10100001100",
  "10010110000", "10010000110", "10000101100", "10000100110", "10110010000",
  "10110000100", "10011010000", "10011000010", "10000110100", "10000110010",
  "11000010010", "11001010000", "11110111010", "11000010100", "10001111010",
  "10100111100", "10010111100", "10010011110", "10111100100", "10011110100",
  "10011110010", "11110100100", "11110010100", "11110010010", "11011011110",
  "11011110110", "11110110110", "10101111000", "10100011110", "10001011110",
  "10111101000", "10111100010", "11110101000", "11110100010", "10111011110",
  "10111101110", "11101011110", "11110101110", "11010000100", "11010010000",
  "11010011100", "1100011101011" // 106 = Stop
]

export function isEan13(code: string): boolean {
  return /^\d{13}$/.test(code)
}

/**
 * Builds an SVG string representing the barcode.
 */
export function generateBarcodeSvg(
  rawCode: string,
  options: {
    height?: number
    moduleWidth?: number
    includeText?: boolean
    textColor?: string
    barColor?: string
    backgroundColor?: string
  } = {}
): string {
  const code = (rawCode || "").trim()
  if (!code) return ""

  const moduleWidth = options.moduleWidth ?? 2
  const barHeight = options.height ?? 70
  const includeText = options.includeText ?? true
  const barColor = options.barColor ?? "#0f172a"
  const textColor = options.textColor ?? "#0f172a"
  const bg = options.backgroundColor ?? "#ffffff"

  if (isEan13(code)) {
    return generateEan13Svg(code, { moduleWidth, barHeight, includeText, barColor, textColor, bg })
  } else {
    return generateCode128Svg(code, { moduleWidth, barHeight, includeText, barColor, textColor, bg })
  }
}

function generateEan13Svg(
  code: string,
  opts: {
    moduleWidth: number
    barHeight: number
    includeText: boolean
    barColor: string
    textColor: string
    bg: string
  }
): string {
  const firstDigit = code[0]
  const parity = EAN13_PARITY[firstDigit]
  const leftDigits = code.slice(1, 7)
  const rightDigits = code.slice(7, 13)

  let leftModules = ""
  for (let i = 0; i < 6; i++) {
    const digit = leftDigits[i]
    const p = parity[i]
    leftModules += p === "L" ? EAN13_L_CODES[digit] : EAN13_G_CODES[digit]
  }

  let rightModules = ""
  for (let i = 0; i < 6; i++) {
    const digit = rightDigits[i]
    rightModules += EAN13_R_CODES[digit]
  }

  const quietModules = 10
  const totalModules = quietModules + 3 + 42 + 5 + 42 + 3 + quietModules // 115
  const mw = opts.moduleWidth
  const totalWidth = totalModules * mw
  const textHeight = opts.includeText ? 22 : 0
  const totalHeight = opts.barHeight + textHeight + 12

  // Guard bars extend slightly lower
  const guardHeight = opts.barHeight + 6

  let svgElements = ""

  let curX = quietModules * mw

  // Start Guard (101)
  for (const bit of "101") {
    if (bit === "1") {
      svgElements += `<rect x="${curX}" y="6" width="${mw}" height="${guardHeight}" fill="${opts.barColor}"/>`
    }
    curX += mw
  }

  // Left 6 digits
  for (const bit of leftModules) {
    if (bit === "1") {
      svgElements += `<rect x="${curX}" y="6" width="${mw}" height="${opts.barHeight}" fill="${opts.barColor}"/>`
    }
    curX += mw
  }

  // Center Guard (01010)
  for (const bit of "01010") {
    if (bit === "1") {
      svgElements += `<rect x="${curX}" y="6" width="${mw}" height="${guardHeight}" fill="${opts.barColor}"/>`
    }
    curX += mw
  }

  // Right 6 digits
  for (const bit of rightModules) {
    if (bit === "1") {
      svgElements += `<rect x="${curX}" y="6" width="${mw}" height="${opts.barHeight}" fill="${opts.barColor}"/>`
    }
    curX += mw
  }

  // Stop Guard (101)
  for (const bit of "101") {
    if (bit === "1") {
      svgElements += `<rect x="${curX}" y="6" width="${mw}" height="${guardHeight}" fill="${opts.barColor}"/>`
    }
    curX += mw
  }

  // Text below bars
  if (opts.includeText) {
    const textY = opts.barHeight + 20
    const firstDigitX = (quietModules - 4) * mw
    const leftTextX = (quietModules + 3 + 21) * mw
    const rightTextX = (quietModules + 3 + 42 + 5 + 21) * mw

    svgElements += `<text x="${firstDigitX}" y="${textY}" font-family="monospace, monospace" font-size="14" font-weight="bold" fill="${opts.textColor}" text-anchor="middle">${firstDigit}</text>`
    svgElements += `<text x="${leftTextX}" y="${textY}" font-family="monospace, monospace" font-size="14" font-weight="bold" letter-spacing="2" fill="${opts.textColor}" text-anchor="middle">${leftDigits}</text>`
    svgElements += `<text x="${rightTextX}" y="${textY}" font-family="monospace, monospace" font-size="14" font-weight="bold" letter-spacing="2" fill="${opts.textColor}" text-anchor="middle">${rightDigits}</text>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">
    <rect width="${totalWidth}" height="${totalHeight}" fill="${opts.bg}"/>
    ${svgElements}
  </svg>`
}

function generateCode128Svg(
  text: string,
  opts: {
    moduleWidth: number
    barHeight: number
    includeText: boolean
    barColor: string
    textColor: string
    bg: string
  }
): string {
  // Subset B encoding
  const startCode = 104 // Start B
  const codes: number[] = [startCode]

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i)
    if (charCode >= 32 && charCode <= 126) {
      codes.push(charCode - 32)
    } else {
      codes.push(0) // space fallback
    }
  }

  // Calculate Checksum
  let checksum = startCode
  for (let i = 1; i < codes.length; i++) {
    checksum += codes[i] * i
  }
  codes.push(checksum % 103)
  codes.push(106) // Stop code

  let pattern = ""
  for (const c of codes) {
    pattern += CODE128_PATTERNS[c] || ""
  }

  const quietModules = 10
  const mw = opts.moduleWidth
  const totalModules = quietModules * 2 + pattern.length
  const totalWidth = totalModules * mw
  const textHeight = opts.includeText ? 20 : 0
  const totalHeight = opts.barHeight + textHeight + 12

  let svgBars = ""
  let curX = quietModules * mw
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "1") {
      svgBars += `<rect x="${curX}" y="6" width="${mw}" height="${opts.barHeight}" fill="${opts.barColor}"/>`
    }
    curX += mw
  }

  if (opts.includeText) {
    const textY = opts.barHeight + 20
    const textX = totalWidth / 2
    svgBars += `<text x="${textX}" y="${textY}" font-family="monospace, monospace" font-size="13" font-weight="bold" letter-spacing="1" fill="${opts.textColor}" text-anchor="middle">${text}</text>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">
    <rect width="${totalWidth}" height="${totalHeight}" fill="${opts.bg}"/>
    ${svgBars}
  </svg>`
}

/**
 * Download SVG file directly in browser.
 */
export function downloadSvg(svgString: string, filename: string): void {
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".svg") ? filename : `${filename}.svg`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Exports barcode to high-resolution PNG (300 DPI equivalent) with optional product title.
 */
export async function downloadBarcodePng(
  barcodeValue: string,
  filename: string,
  options: {
    productName?: string
    sku?: string
    hsn?: string
    price?: string
  } = {}
): Promise<void> {
  const svgString = generateBarcodeSvg(barcodeValue, {
    height: 90,
    moduleWidth: 3,
    includeText: true,
  })

  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const extraHeader = options.productName ? 40 : 10
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(img.width + 40, 360)
      canvas.height = img.height + extraHeader + 20
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        URL.revokeObjectURL(url)
        reject(new Error("Cannot get canvas context"))
        return
      }

      // Background
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      let currentY = 24
      if (options.productName) {
        ctx.fillStyle = "#0f172a"
        ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        ctx.textAlign = "center"
        ctx.fillText(options.productName.slice(0, 36), canvas.width / 2, currentY)
        currentY += 18
      }

      // Draw barcode image centered
      const barcodeX = (canvas.width - img.width) / 2
      ctx.drawImage(img, barcodeX, currentY)

      canvas.toBlob((pngBlob) => {
        URL.revokeObjectURL(url)
        if (!pngBlob) {
          reject(new Error("Failed to generate PNG blob"))
          return
        }
        const pngUrl = URL.createObjectURL(pngBlob)
        const a = document.createElement("a")
        a.href = pngUrl
        a.download = filename.endsWith(".png") ? filename : `${filename}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(pngUrl)
        resolve()
      }, "image/png")
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Failed to load barcode SVG into Image"))
    }

    img.src = url
  })
}
