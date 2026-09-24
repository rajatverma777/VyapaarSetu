/**
 * Direct Client-Side Gemini Vision Invoice Parser
 * Enables instantaneous client-side extraction on Vercel without relying on backend OCR worker.
 */

const FALLBACK_TOKEN = "QVEuQWI4Uk42TEc4M1JRWnBBVTh5WFJIVU8tOGNCbk9EX1o2UE1RckRwbjJRNXVTNWtWTXc="

const getResolvedKey = () => {
  if (typeof window !== 'undefined') {
    const local = localStorage.getItem('gemini_api_key')
    if (local) return local
  }
  if (import.meta.env?.VITE_GEMINI_API_KEY) {
    return import.meta.env.VITE_GEMINI_API_KEY
  }
  try {
    return atob(FALLBACK_TOKEN)
  } catch {
    return ""
  }
}

const GEMINI_MODELS = [
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.8-flash"
]

export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result
      const base64 = typeof dataUrl === 'string' ? dataUrl.split(',')[1] : ''
      resolve(base64)
    }
    reader.onerror = (err) => reject(err)
    reader.readAsDataURL(file)
  })
}

export const extractInvoiceWithGemini = async (file, customKey = null) => {
  const apiKey = customKey || getResolvedKey()
  if (!apiKey) {
    throw new Error("No Gemini API key configured")
  }

  const base64Data = await fileToBase64(file)
  if (!base64Data) {
    throw new Error("Failed to encode file to base64")
  }

  let mimeType = file.type || ''
  const filename = (file.name || '').toLowerCase()
  if (!mimeType || mimeType === 'application/octet-stream') {
    if (filename.endsWith('.pdf')) {
      mimeType = 'application/pdf'
    } else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) {
      mimeType = 'image/jpeg'
    } else {
      mimeType = 'image/png'
    }
  }

  const prompt = `You are an expert Document & Invoice AI assistant for a wholesale & retail ERP.
Analyze this invoice image or PDF and extract all purchased products/items accurately.

CRITICAL INSTRUCTIONS:
1. ORIENTATION & READING DIRECTION:
   - Detect orientation of the text, rotate upright, and read in standard reading order.
2. UNIVERSAL DOCUMENT & TABLE EXTRACTION:
   - Works for ANY trade (Pharma, Surgical, FMCG, Grocery, Hardware, Electronics, Textiles, General Wholesale).
   - Extract ALL line items. Extract supplier name from top header for 'brand'.
3. JSON FORMAT:
   - Return ONLY a JSON array of objects with the following fields:
     - name: Clean product name
     - brand: Supplier or Brand name from header
     - unit: Unit of measurement (PCS, BOX, BTL, STRIP, UNIT, etc.)
     - hsn_code: HSN code (e.g. 9018, 3004)
     - gst_rate: Total GST percent as a number (e.g. 5.0, 12.0, 18.0)
     - purchase_price: Net rate per unit (number)
     - selling_price: MRP or wholesale price (number)
     - mrp: Maximum retail price (number)
     - wholesale_price: Wholesale price (number)
     - opening_stock: Total quantity purchased (number)
     - min_stock_alert: 10.0
     - pack: Packaging size (e.g. 1*24, 100ML, 1 UNIT)
     - cases: Number of cases/boxes if mentioned, else null
     - final_amount: Total line amount (opening_stock * purchase_price)
     - batch: Batch number or lot number
     - expiry: Expiry date formatted as MM/YY or MM/YYYY
     - description: "Batch: {batch}, Exp: {expiry}"
     - is_active: true
4. Return ONLY valid raw JSON array, without markdown fences or additional commentary.`

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json"
    }
  }

  let lastError = null
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        const respJson = await response.json()
        const candidates = respJson?.candidates || []
        if (!candidates.length) {
          throw new Error(`Empty response from ${model}`)
        }

        let rawText = candidates[0]?.content?.parts?.[0]?.text || ''
        rawText = rawText.trim()
        if (rawText.startsWith('```json')) rawText = rawText.slice(7)
        else if (rawText.startsWith('```')) rawText = rawText.slice(3)
        if (rawText.endsWith('```')) rawText = rawText.slice(0, -3)
        rawText = rawText.trim()

        const parsed = JSON.parse(rawText)
        let items = Array.isArray(parsed) ? parsed : (parsed.items || parsed.products || [parsed])

        return items.map(item => ({
          name: item.name || 'Unnamed Product',
          raw_name: item.name || '',
          brand: item.brand || null,
          unit: item.unit || 'PCS',
          hsn_code: item.hsn_code ? String(item.hsn_code) : null,
          gst_rate: parseFloat(item.gst_rate) || 5.0,
          purchase_price: parseFloat(item.purchase_price) || 0.0,
          selling_price: parseFloat(item.selling_price) || parseFloat(item.purchase_price) || 0.0,
          mrp: item.mrp ? parseFloat(item.mrp) : parseFloat(item.purchase_price) * 1.25,
          wholesale_price: item.wholesale_price ? parseFloat(item.wholesale_price) : parseFloat(item.purchase_price) * 1.1,
          opening_stock: parseFloat(item.opening_stock) || 1.0,
          min_stock_alert: 10.0,
          pack: item.pack || null,
          cases: item.cases ? parseFloat(item.cases) : null,
          final_amount: item.final_amount ? parseFloat(item.final_amount) : (parseFloat(item.opening_stock) || 1.0) * (parseFloat(item.purchase_price) || 0.0),
          batch: item.batch || 'DEFAULT',
          expiry: item.expiry || 'N/A',
          description: item.description || `Batch: ${item.batch || 'DEFAULT'}, Exp: ${item.expiry || 'N/A'}`,
          is_active: true
        }))
      } else {
        const errData = await response.json().catch(() => ({}))
        const errMsg = errData?.error?.message || response.statusText
        console.warn(`[Gemini Vision] Model ${model} returned ${response.status}: ${errMsg}`)
        lastError = `${model}: ${errMsg}`
      }
    } catch (err) {
      console.warn(`[Gemini Vision] Model ${model} error:`, err)
      lastError = err.message
    }
  }

  throw new Error(lastError || "All Gemini models failed")
}
