import { useEffect, useRef, useState, useCallback } from 'react'
import { 
  Copy, Check, FileText, Sparkles, AlertCircle, 
  AlertTriangle, X, ChevronRight, ChevronLeft, Search, Plus, Trash2, ArrowRight,
  UploadCloud, FileUp, Zap, ShieldCheck, CheckCircle2, RefreshCw, ChevronDown, ChevronUp, Bot,
  FileSpreadsheet
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supplierAPI, aiImportAPI, productAPI } from '../../services/api'
import { extractInvoiceWithGemini } from '../../services/geminiVision'
import { Modal, SearchAutocomplete, DatePicker, GlassSelect, Spinner } from '../ui'

const AI_IMPORT_PROMPT = `You are an expert Document & Invoice Parsing AI. Your task is to analyze the provided invoice, bill, receipt, challan, purchase order, or document image/PDF and extract all invoice metadata and line-item products into clean, structured JSON.

CRITICAL INSTRUCTIONS:
1. IMAGE ORIENTATION & READING DIRECTION:
   - The document image may be rotated (90° clockwise, 90° counter-clockwise, 180° upside-down, skewed, or taken from an angle).
   - FIRST detect the orientation of the text, mentally rotate it upright, and read all characters in standard reading order (left-to-right, top-to-bottom).
   - Do NOT fail or skip text because an image is sideways or upside down.

2. UNIVERSAL DOCUMENT & TABLE COMPREHENSION:
   - Works for ANY wholesale, distributor, manufacturing, or retail document across all trades (Pharma, Medical/Surgical, FMCG, Groceries, Hardware, Electronics, Textiles, General Trade).
   - Formats can vary:
     * Standard multi-column tables.
     * Sub-row indented tables: where Product Name is on line 1, and Batch No, Expiry, HSN, or MRP are on a sub-line indented directly beneath it. ALWAYS merge sub-lines into the parent product!
     * Dual-column / dense split tables.
     * Invoices without explicit headers or with non-standard column names (e.g. Particulars, Description, Dawa, Item).
     * Multi-page invoices: extract ALL products across all pages.

3. FIELD EXTRACTION & MAPPING RULES:
   - invoice_number: The bill or invoice reference number (e.g., "INV-2024-001", "B004336", "RBH26-0713", "1245"). Look near the top right or top left.
   - invoice_date: Date of the invoice formatted as "YYYY-MM-DD" or "DD-MM-YYYY".
   - supplier_name: The company, distributor, hospital, or vendor issuing the invoice (found at top header/letterhead). Do NOT put the customer/buyer name here.
   - For each item in "items":
     * product_name: Full clean product name or description. Strip serial numbers (like "1.", "2.").
     * pack: Packaging size if mentioned (e.g., "10x10", "1*24", "100ML", "1 UNIT", "10T"). If not found, use null or "1 PCS".
     * cases: Number of cartons/cases/boxes if mentioned, otherwise null.
     * quantity: Billed / invoiced quantity as a number. If there is a free/bonus quantity (e.g., "10 + 1 free"), add them together or record the total received quantity.
     * purchase_rate: The unit purchase rate / price per item before or after discount. If only total amount is given, calculate purchase_rate = amount / quantity.
     * selling_price: MRP (Maximum Retail Price) or wholesale selling price. If not printed, set to purchase_rate * 1.15.
     * amount: Total line amount (quantity * purchase_rate).
     * gst: GST or Tax percentage rate (e.g., 0, 5, 12, 18, 28). If CGST 2.5% + SGST 2.5%, total is 5.0.
     * hsn_code: HSN or SAC code (e.g., "30049091", "9018").
     * batch_number: Batch number, lot number, or B.No (e.g., "CDADS036", "G26D010419").
     * expiry_date: Format as "MM/YYYY" or "DD-MM-YYYY" (e.g., "04/2028"). If printed as "4/28", format as "04/2028".
     * manufacturer: Brand, manufacturer, or distributor name written on the bill (e.g., "Cipla", "Abbott", "Emcure", "Nirlife", "Aculife", or the supplier).

4. MATHEMATICAL VERIFICATION:
   - Verify that quantity * purchase_rate ≈ amount. If OCR has missing decimal points (e.g. rate read as 1600 instead of 16.00 for amount 11520.00 and qty 720), automatically correct the decimal point to 16.00.

5. OUTPUT PURITY:
   - Return ONLY raw, valid JSON.
   - Do NOT wrap in markdown fences like \`\`\`json ... \`\`\`.
   - Do NOT include any introductory or concluding comments.
   - Escape any internal double-quotes inside strings (e.g., 5\\" CANNULA).

JSON Structure:
{
  "invoice_number": "INV-12345",
  "invoice_date": "2026-06-12",
  "supplier_name": "SUPPLIER NAME",
  "items": [
    {
      "product_name": "Product Name",
      "pack": "1*24",
      "cases": 30,
      "quantity": 720,
      "purchase_rate": 16.00,
      "selling_price": 40.57,
      "amount": 11520.00,
      "gst": 5.0,
      "hsn_code": "30049099",
      "batch_number": "CDADS036",
      "expiry_date": "04/2028",
      "manufacturer": "Brand Name"
    }
  ]
}`;

const getFriendlyJsonError = (msg, input) => {
  if (!msg) return "Unknown formatting issue. Please check the text."
  
  const lowerMsg = msg.toLowerCase()
  const trimmedInput = (input || '').trim()
  
  // 1. Check for single quotes instead of double quotes
  if (trimmedInput.includes("'") && !trimmedInput.includes('"')) {
    return "The pasted text uses single quotes (') instead of double quotes (\"). JSON format requires double quotes for all labels and text values."
  }
  
  // 2. Unescaped quotes inside values (e.g., product names like PRIME CAST 5" or EXTEENA TRIO)
  if (lowerMsg.includes("unexpected string") || lowerMsg.includes("unexpected token") || lowerMsg.includes("expected ','")) {
    if (/"[^"]*"[^"]*"/.test(trimmedInput) || /"\s*\w+\s+\d+"/.test(trimmedInput) || (trimmedInput.includes('"') && !trimmedInput.includes('\\"'))) {
      return "There is a formatting error in the text. This usually happens when a product name contains double quotes (like 5\" or 3\"X9M) that are not properly written as \\\" (escaped quotes). Please check and edit those values."
    }
  }

  // 3. Unexpected token / character
  if (lowerMsg.includes("unexpected token") || lowerMsg.includes("unexpected character")) {
    if (lowerMsg.includes("token '")) {
      return "Single quotes (') are not allowed in JSON. Please make sure all text values are wrapped in double quotes (\")."
    }
    return "There is an unexpected character or symbol in the pasted text. Please verify that all items are separated by commas, and that there are no missing colons between labels and values."
  }
  
  // 4. Unexpected end of input
  if (lowerMsg.includes("unexpected end") || lowerMsg.includes("unterminated string") || lowerMsg.includes("end of data")) {
    return "The pasted text is incomplete or cut off. Please make sure you copied the entire text, including the starting '[' or '{' and the ending ']' or '}'."
  }
  
  // 5. Expected double-quoted property name
  if (lowerMsg.includes("double-quoted property") || lowerMsg.includes("expected property name")) {
    return "All labels (like product_name, quantity, etc.) must be wrapped in double quotes (\"). Make sure you didn't leave out any quotes around them."
  }
  
  // 6. Expected comma or closing bracket/brace
  if (lowerMsg.includes("expected ','") || lowerMsg.includes("expected colon")) {
    return "A comma, colon, or closing bracket/brace seems to be missing. Please verify that each item in the list is separated by a comma."
  }
  
  return `The text has a formatting issue. Technical detail: ${msg}. Please check for missing commas, brackets, or unescaped quotes.`
}

const getFriendlyBackendError = (err) => {
  if (!err) return "An unknown error occurred. Please try again."
  
  const detail = err.response?.data?.detail
  if (detail) {
    if (typeof detail === 'string') {
      const lowerDetail = detail.toLowerCase()
      if (lowerDetail.includes("duplicate key") || lowerDetail.includes("e11000")) {
        return "This invoice number has already been imported. Please edit the Invoice Reference No. to make it unique and try again."
      }
      return detail
    }
    if (Array.isArray(detail)) {
      const errors = detail.map(d => {
        const field = d.loc ? d.loc[d.loc.length - 1] : "field"
        const msg = d.msg || "invalid value"
        let friendlyMsg = msg
        if (msg.includes("value is not a valid float") || msg.includes("value is not a valid integer")) {
          friendlyMsg = "must be a valid number"
        }
        return `"${field}" ${friendlyMsg}`
      })
      return `Please check the following fields: ${errors.join(', ')}.`
    }
  }
  
  const status = err.response?.status
  if (status === 400) {
    return "The request was invalid. Please check the invoice details and try again."
  }
  if (status === 401 || status === 403) {
    return "You do not have permission to perform this action. Please contact your administrator."
  }
  if (status === 404) {
    return "The requested information could not be found on the server."
  }
  if (status === 422) {
    return "Some invoice details are invalid or missing. Please correct the fields in the preview table."
  }
  if (status >= 500) {
    return "The server encountered a problem processing your invoice. Please try again later."
  }
  
  if (err.message && err.message.toLowerCase().includes("network error")) {
    return "Could not connect to the server. Please check your internet connection and try again."
  }
  
  return err.message || "An unexpected error occurred."
}

export default function AIImportModal({ open, onClose, onImportSuccess }) {
  const [step, setStep] = useState(1)
  const [promptCopied, setPromptCopied] = useState(false)
  
  // Step 2 State
  const [rawJson, setRawJson] = useState('')
  const [jsonError, setJsonError] = useState(null)
  const [parsedItems, setParsedItems] = useState([])
  
  // Step 3 State
  const [analyzing, setAnalyzing] = useState(false)
  const [enrichedItems, setEnrichedItems] = useState([])
  const [supplier, setSupplier] = useState(null)
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0])
  const [paymentMode, setPaymentMode] = useState('credit')
  const [paidAmount, setPaidAmount] = useState(0)
  const [isIgst, setIsIgst] = useState(false)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  
  // Inline search override state for item index
  const [overridingIdx, setOverridingIdx] = useState(null)

  // Direct Scan & UX States
  const [inputMode, setInputMode] = useState('scan') // 'scan' or 'prompt'
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [showPromptDetails, setShowPromptDetails] = useState(false)
  const fileInputRef = useRef(null)

  // Reset modal state on open
  useEffect(() => {
    if (open) {
      setStep(1)
      setInputMode('scan')
      setIsScanning(false)
      setScanProgress('')
      setDragActive(false)
      setShowPromptDetails(false)
      setPromptCopied(false)
      setRawJson('')
      setJsonError(null)
      setParsedItems([])
      setEnrichedItems([])
      setSupplier(null)
      setInvoiceNumber('')
      setPurchaseDate(new Date().toISOString().split('T')[0])
      setPaymentMode('credit')
      setPaidAmount(0)
      setIsIgst(false)
      setNotes('')
      setImportResult(null)
      setOverridingIdx(null)
    }
  }, [open])

  // Direct File Scanner Handler using Gemini Vision
  const handleDirectFileScan = async (file) => {
    if (!file) return
    setIsScanning(true)
    setScanProgress('Uploading and analyzing document with Gemini Vision AI...')
    const toastId = toast.loading('Reading invoice with Gemini Vision AI...')

    try {
      const extracted = await extractInvoiceWithGemini(file)
      if (!extracted || extracted.length === 0) {
        throw new Error("No items could be extracted from document.")
      }

      setScanProgress('Auto-matching items with inventory catalog...')
      toast.loading(`Extracted ${extracted.length} products! Matching with inventory...`, { id: toastId })

      // Auto-fill supplier if extracted
      const firstBrand = extracted[0]?.brand
      if (firstBrand) {
        supplierAPI.list({ search: firstBrand, limit: 5 }).then(({ data }) => {
          if (data.items?.length > 0) {
            setSupplier(data.items[0])
          }
        }).catch(() => {})
      }

      // Convert extracted items to ai-import analyze format
      const itemsForAnalyze = extracted.map(item => ({
        product_name: item.name,
        pack: item.pack || null,
        cases: item.cases || 0.0,
        quantity: item.opening_stock || 1.0,
        purchase_rate: item.purchase_price || 0.0,
        selling_price: item.selling_price || 0.0,
        amount: item.final_amount || (Number(item.opening_stock || 1) * Number(item.purchase_price || 0)),
        gst: item.gst_rate || 5.0,
        hsn_code: item.hsn_code || null,
        batch_number: item.batch || 'DEFAULT',
        expiry_date: item.expiry || 'N/A',
        manufacturer: item.brand || null
      }))

      let mapped = []
      try {
        const { data } = await aiImportAPI.analyze(itemsForAnalyze)
        mapped = data.map(item => {
          const bestSuggestion = item.suggestions && item.suggestions.length > 0 ? item.suggestions[0] : null
          const selectedProduct = item.matched_product || bestSuggestion

          return {
            ...item,
            selected_product_id: selectedProduct ? (selectedProduct.id || selectedProduct._id || selectedProduct.product_id) : null,
            selected_product_name: selectedProduct ? (selectedProduct.name || selectedProduct.product_name) : null,
            is_override: false,
            pack: item.pack || '',
            cases: item.cases ?? null,
            quantity: item.quantity ?? 1,
            purchase_rate: item.purchase_rate ?? 0,
            selling_price: item.selling_price ?? 0,
            amount: item.amount ?? (Number(item.quantity || 1) * Number(item.purchase_rate || 0)),
            gst: item.gst ?? 5.0,
            hsn_code: item.hsn_code || '',
            batch_number: item.batch_number || '',
            expiry_date: item.expiry_date || '',
            manufacturer: item.manufacturer || ''
          }
        })
      } catch (analyzeErr) {
        console.warn("Similarity matching endpoint error, using raw extracted items:", analyzeErr)
        mapped = itemsForAnalyze.map(item => ({
          ...item,
          match_type: 'none',
          confidence: 0,
          matched_product: null,
          suggestions: [],
          selected_product_id: null,
          selected_product_name: null,
          is_override: false
        }))
      }

      setEnrichedItems(mapped)
      setParsedItems(itemsForAnalyze)
      setRawJson(JSON.stringify(extracted, null, 2))
      setStep(3)
      toast.success(`Extracted & matched ${mapped.length} products!`, { id: toastId })
    } catch (err) {
      console.error("Direct scan failed:", err)
      toast.error(err.message || 'Failed to scan invoice', { id: toastId })
    } finally {
      setIsScanning(false)
      setScanProgress('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(true)
  }

  const [isExcelUploading, setIsExcelUploading] = useState(false)
  const excelInputRef = useRef(null)

  const handleExcelUpload = async (file) => {
    if (!file) return
    setIsExcelUploading(true)
    const toastId = toast.loading('Importing products from Excel spreadsheet...')
    try {
      const { data } = await productAPI.bulkImport(file)
      toast.success(`Successfully imported ${data.imported} products from Excel!`, { id: toastId })
      if (data.errors && data.errors.length > 0) {
        toast.error(`${data.errors.length} rows had errors and were skipped.`, { duration: 5000 })
      }
      if (onImportSuccess) onImportSuccess()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to import Excel file', { id: toastId })
    } finally {
      setIsExcelUploading(false)
      if (excelInputRef.current) excelInputRef.current.value = ''
    }
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      const nameLower = file.name.toLowerCase()
      if (nameLower.endsWith('.xlsx') || nameLower.endsWith('.xls') || nameLower.endsWith('.csv')) {
        handleExcelUpload(file)
      } else {
        handleDirectFileScan(file)
      }
    }
  }

  const handleLoadSample = () => {
    const sample = {
      "invoice_number": "INV-2026-9921",
      "invoice_date": new Date().toISOString().split('T')[0],
      "supplier_name": "YASH SURGICAL HOUSE",
      "items": [
        {
          "product_name": "HEMO EDTA VOIL",
          "pack": "100 PCS",
          "cases": 5,
          "quantity": 500,
          "purchase_rate": 150.00,
          "selling_price": 185.00,
          "amount": 75000.00,
          "gst": 5.0,
          "hsn_code": "90189019",
          "batch_number": "MB1224",
          "expiry_date": "12/2026",
          "manufacturer": "HEMO DIAGNOSTICS"
        },
        {
          "product_name": "HEMO PLAIN VOIL",
          "pack": "100 PCS",
          "cases": 5,
          "quantity": 500,
          "purchase_rate": 150.00,
          "selling_price": 185.00,
          "amount": 75000.00,
          "gst": 5.0,
          "hsn_code": "90189019",
          "batch_number": "MB0625BCA",
          "expiry_date": "06/2027",
          "manufacturer": "HEMO DIAGNOSTICS"
        }
      ]
    }
    const sampleStr = JSON.stringify(sample, null, 2)
    handleJsonChange(sampleStr)
    toast.success("Loaded sample invoice data!")
  }

  // Copy Prompt to Clipboard
  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(AI_IMPORT_PROMPT)
    setPromptCopied(true)
    toast.success('Prompt copied to clipboard!')
    setTimeout(() => setPromptCopied(false), 3000)
  }

  // Heal JSON with unescaped double quotes, markdown blocks, single quotes, or trailing commas
  const healJson = (str) => {
    if (!str) return str
    let trimmed = str.trim()

    // 1. Strip markdown code fences if present (e.g. ```json ... ``` or ``` ...)
    trimmed = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    // 2. Extract outermost JSON structure if wrapped in conversational text
    const firstBrace = trimmed.indexOf('{')
    const firstBracket = trimmed.indexOf('[')
    let startIdx = -1
    if (firstBrace !== -1 && firstBracket !== -1) {
      startIdx = Math.min(firstBrace, firstBracket)
    } else {
      startIdx = firstBrace !== -1 ? firstBrace : firstBracket
    }
    if (startIdx >= 0) {
      const lastBrace = trimmed.lastIndexOf('}')
      const lastBracket = trimmed.lastIndexOf(']')
      const endIdx = Math.max(lastBrace, lastBracket)
      if (endIdx > startIdx) {
        trimmed = trimmed.substring(startIdx, endIdx + 1).trim()
      }
    }

    // 3. Remove trailing commas before closing braces or brackets (e.g. [1, 2,] -> [1, 2])
    trimmed = trimmed.replace(/,\s*([\]}])/g, '$1')
    
    // 4. List of known and synonym keys to expand minified single-line JSON
    const keys = [
      "invoice_number", "invoice_date", "supplier_name", "items",
      "product_name", "pack", "cases", "quantity", "purchase_rate",
      "selling_price", "amount", "gst", "hsn_code", "batch_number",
      "expiry_date", "manufacturer",
      "qty", "rate", "price", "purchase_price", "sale_price", "wholesale_price",
      "total", "final_amount", "gst_rate", "tax", "hsn", "batch", "batch_no",
      "expiry", "exp", "brand", "manufacture", "name", "description", "packing",
      "box", "pcs"
    ]
    
    // Prepend newlines before known keys to convert single-line minified JSON into multi-line
    keys.forEach(key => {
      const regexComma = new RegExp(`,\\s*"${key}"\\s*:`, 'g')
      trimmed = trimmed.replace(regexComma, `,\n"${key}":`)
      const regexBrace = new RegExp(`{\\s*"${key}"\\s*:`, 'g')
      trimmed = trimmed.replace(regexBrace, `{\n"${key}":`)
    })
    
    // Wrap single object in list if pasted without brackets (and not an object with items)
    if (trimmed.startsWith('{') && trimmed.endsWith('}') && !trimmed.includes('"items"')) {
      trimmed = '[' + trimmed + ']'
    }

    const lines = trimmed.split('\n')
    const healedLines = lines.map(line => {
      // Matches key-value pair where the value is a string, e.g., "key": "valueContent"
      const match = line.match(/^(\s*"[^"]+"\s*:\s*")(.*)("\s*,?\s*)$/)
      if (match) {
        const prefix = match[1]
        const valueContent = match[2]
        const suffix = match[3]
        // Escape quotes that are not already escaped
        const healedValueContent = valueContent.replace(/(?<!\\)"/g, '\\"')
        return prefix + healedValueContent + suffix
      }
      return line
    })
    
    return healedLines.join('\n')
  }

  // Validate Raw JSON Input
  const handleJsonChange = (val) => {
    setRawJson(val)
    if (!val.trim()) {
      setJsonError(null)
      setParsedItems([])
      return
    }

    try {
      const healed = healJson(val)
      const parsed = JSON.parse(healed)
      
      let itemsList = []
      if (Array.isArray(parsed)) {
        itemsList = parsed
      } else if (parsed && typeof parsed === 'object') {
        itemsList = parsed.items || []
        
        // Auto-fill invoice number
        if (parsed.invoice_number) {
          setInvoiceNumber(parsed.invoice_number)
        }
        
        // Auto-fill date
        if (parsed.invoice_date) {
          let normalizedDate = String(parsed.invoice_date).trim()
          const dmyMatch = normalizedDate.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
          if (dmyMatch) {
            const d = dmyMatch[1].padStart(2, '0')
            const m = dmyMatch[2].padStart(2, '0')
            const y = dmyMatch[3]
            normalizedDate = `${y}-${m}-${d}`
          }
          if (!isNaN(Date.parse(normalizedDate))) {
            setPurchaseDate(new Date(normalizedDate).toISOString().split('T')[0])
          }
        }
        
        // Auto-select supplier
        if (parsed.supplier_name) {
          supplierAPI.list({ search: parsed.supplier_name, limit: 5 }).then(({ data }) => {
            if (data.items && data.items.length > 0) {
              const matched = data.items.find(s => 
                s.name.toLowerCase().trim() === parsed.supplier_name.toLowerCase().trim()
              ) || data.items[0]
              setSupplier(matched)
            }
          }).catch(err => console.error("Supplier lookup failed:", err))
        }
      }
      
      setJsonError(null)
      setParsedItems(itemsList)
    } catch (e) {
      setJsonError(getFriendlyJsonError(e.message, val))
      setParsedItems([])
    }
  }

  // Format pasted JSON
  const handleFormatJson = () => {
    try {
      const healed = healJson(rawJson)
      const parsed = JSON.parse(healed)
      setRawJson(JSON.stringify(parsed, null, 2))
      setJsonError(null)
    } catch (e) {
      toast.error(getFriendlyJsonError(e.message, rawJson))
    }
  }

  // Run Backend Match Analysis
  const handleAnalyze = async () => {
    if (parsedItems.length === 0) {
      toast.error('No items to analyze. Paste JSON first.')
      return
    }

    setAnalyzing(true)
    const toastId = toast.loading('Analyzing invoice items & auto-matching against Product Master...')
    try {
      const { data } = await aiImportAPI.analyze(parsedItems)
      const mapped = data.map(item => {
        const base = supplier && (!item.manufacturer || !item.manufacturer.trim())
          ? { ...item, manufacturer: supplier.name }
          : item;
        return {
          ...base,
          product_id: base.matched_product?._id || base.matched_product?.id || null
        };
      })
      const validated = validateItems(mapped)
      setEnrichedItems(validated)
      setStep(3)
      toast.success(`Analysis complete! ${data.length} items parsed.`, { id: toastId })
    } catch (err) {
      console.error(err)
      toast.error(getFriendlyBackendError(err), { id: toastId })
    } finally {
      setAnalyzing(false)
    }
  }

  // Validation logic
  const validateItems = useCallback((items) => {
    return items.map((item, idx) => {
      const errors = []
      if (!item.product_name || !item.product_name.trim()) {
        errors.push("Product name is required")
      }
      if (item.quantity === undefined || item.quantity === null || Number(item.quantity) <= 0) {
        errors.push("Quantity must be greater than 0")
      }
      if (item.purchase_rate === undefined || item.purchase_rate === null || Number(item.purchase_rate) < 0) {
        errors.push("Purchase rate must be 0 or more")
      }
      if (item.selling_price === undefined || item.selling_price === null || Number(item.selling_price) < 0) {
        errors.push("Selling price must be 0 or more")
      } else if (Number(item.selling_price) < Number(item.purchase_rate)) {
        errors.push("Selling price is less than purchase rate")
      }

      // Check duplicates in invoice list
      const isDuplicate = items.some((other, oIdx) => {
        if (oIdx === idx) return false
        if (item.product_id && other.product_id) {
          return String(item.product_id) === String(other.product_id)
        }
        return item.product_name.toLowerCase().trim() === other.product_name.toLowerCase().trim()
      })
      if (isDuplicate) {
        errors.push("Duplicate product name/ID in this invoice")
      }

      // Expiry format verification
      if (item.expiry_date && String(item.expiry_date).trim()) {
        const exp = String(item.expiry_date).trim()
        const isExpValid = 
          /^\d{1,2}[/\-]\d{2,4}$/.test(exp) || 
          /^\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}$/.test(exp) || 
          /^\d{4}[/\-]\d{1,2}[/\-]\d{1,2}$/.test(exp) || 
          /^[a-zA-Z]{3,9}[/\-\s]?\d{2,4}$/.test(exp) || 
          /^\d{1,2}[/\-\s]?[a-zA-Z]{3,9}[/\-\s]?\d{2,4}$/.test(exp) || 
          !isNaN(Date.parse(exp)) ||
          !isNaN(Date.parse(exp.replace(/-/g, '/')))
        if (!isExpValid) {
          errors.push("Expiry format invalid (Use MM/YYYY or DD-MM-YYYY)")
        }
      }

      return {
        ...item,
        validation_errors: errors
      }
    })
  }, [])

  // Auto-populate empty manufacturer fields when supplier is selected
  useEffect(() => {
    if (supplier && enrichedItems.length > 0) {
      const updated = enrichedItems.map(item => {
        if (!item.manufacturer || !item.manufacturer.trim()) {
          return {
            ...item,
            manufacturer: supplier.name
          }
        }
        return item
      })
      const hasChanged = updated.some((item, idx) => item.manufacturer !== enrichedItems[idx].manufacturer)
      if (hasChanged) {
        setEnrichedItems(validateItems(updated))
      }
    }
  }, [supplier, enrichedItems, validateItems])

  // Helper: Trigger validation when editable cell changes
  const updateEnrichedItemField = (index, field, value) => {
    const updated = [...enrichedItems]
    updated[index] = {
      ...updated[index],
      [field]: value
    }
    
    // Auto-recalculate amount
    if (field === 'quantity' || field === 'purchase_rate') {
      const qty = Number(field === 'quantity' ? value : updated[index].quantity) || 0
      const rate = Number(field === 'purchase_rate' ? value : updated[index].purchase_rate) || 0
      updated[index].amount = Number((qty * rate).toFixed(2))
    }

    setEnrichedItems(validateItems(updated))
  }

  // Helper: Select matched product suggestion override
  const handleOverrideProduct = (index, suggestion) => {
    const updated = [...enrichedItems]
    
    if (suggestion === 'new') {
      // Set to new product
      updated[index].product_id = null
      updated[index].match_type = 'none'
      updated[index].confidence = 0
      updated[index].matched_product = null
    } else {
      // Select specific suggestion
      updated[index].product_id = suggestion.product_id
      updated[index].product_name = suggestion.product_name
      updated[index].match_type = 'suggested'
      updated[index].confidence = suggestion.confidence || 100
      updated[index].matched_product = {
        _id: suggestion.product_id,
        name: suggestion.product_name
      }
    }

    setEnrichedItems(validateItems(updated))
    setOverridingIdx(null)
  }

  // Helper: Custom manual database search linking
  const handleLinkSearchedProduct = (index, product) => {
    const updated = [...enrichedItems]
    updated[index].product_id = String(product.id || product._id)
    updated[index].product_name = product.name
    updated[index].match_type = 'exact'
    updated[index].confidence = 100
    updated[index].matched_product = product
    
    // Pre-fill GST rate & pack if empty
    if (product.gst_rate !== undefined && !updated[index].gst) {
      updated[index].gst = product.gst_rate
    }
    if (product.pack && !updated[index].pack) {
      updated[index].pack = product.pack
    }

    setEnrichedItems(validateItems(updated))
    setOverridingIdx(null)
  }

  // Helper: Remove row from preview
  const handleRemoveRow = (index) => {
    const updated = enrichedItems.filter((_, i) => i !== index)
    setEnrichedItems(validateItems(updated))
  }

  // Submit AI Import to Backend
  const handleSubmitImport = async () => {
    if (!supplier) {
      toast.error('Please select a Supplier first.')
      return
    }

    // Run validation checks
    const invalidItem = enrichedItems.find(item => item.validation_errors && item.validation_errors.length > 0)
    if (invalidItem) {
      toast.error(`Please fix validation errors on: "${invalidItem.product_name}" before importing.`)
      return
    }

    setSubmitting(true)
    const toastId = toast.loading('Submitting invoice import & updating ledger...')
    try {
      const payload = {
        supplier_id: String(supplier._id || supplier.id),
        invoice_number: invoiceNumber || null,
        purchase_date: purchaseDate ? new Date(purchaseDate) : null,
        payment_mode: paymentMode,
        paid_amount: Number(paidAmount) || 0,
        is_igst: isIgst,
        notes: notes || null,
        items: enrichedItems.map(item => ({
          product_name: item.product_name,
          pack: item.pack || null,
          cases: Number(item.cases) || 0,
          quantity: Number(item.quantity) || 0,
          purchase_rate: Number(item.purchase_rate) || 0,
          selling_price: Number(item.selling_price) || 0,
          amount: Number(item.amount) || 0,
          gst: Number(item.gst) || 0,
          hsn_code: item.hsn_code || null,
          batch_number: item.batch_number || null,
          expiry_date: item.expiry_date || null,
          manufacturer: item.manufacturer || null,
          product_id: item.product_id || null
        })),
        original_json: rawJson
      }

      const { data } = await aiImportAPI.submit(payload)
      setImportResult(data)
      setStep('success')
      toast.success('Invoice imported successfully!', { id: toastId })
      if (onImportSuccess) onImportSuccess()
    } catch (err) {
      console.error(err)
      toast.error(getFriendlyBackendError(err), { id: toastId })
    } finally {
      setSubmitting(false)
    }
  }

  // Calculate totals for summary cards in Step 3
  const invoiceSubtotal = enrichedItems.reduce((acc, item) => acc + (Number(item.purchase_rate) * Number(item.quantity)), 0)
  const invoiceTax = enrichedItems.reduce((acc, item) => acc + (Number(item.purchase_rate) * Number(item.quantity) * (Number(item.gst || 0) / 100)), 0)
  const invoiceTotal = invoiceSubtotal + invoiceTax

  // Confidence color mapper
  const getConfidenceBadge = (score) => {
    if (score >= 90) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <Check size={10} /> High Match ({score}%)
        </span>
      )
    }
    if (score >= 70) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          Suggested ({score}%)
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 text-[#0071e3] dark:text-[#0a84ff] border border-[#0071e3]/20">
        New Product
      </span>
    )
  }

  return (
    <Modal 
      open={open} 
      onClose={() => {
        if (!analyzing && !submitting && !isScanning) onClose()
      }} 
      title="Smart Import" 
      size="full"
      customHeader={
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02] flex-shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#0071e3] to-[#0a84ff] flex items-center justify-center shadow-lg shadow-[#0071e3]/25 text-white">
              <Sparkles size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">
                  Smart Import
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 text-[#0071e3] dark:text-[#0a84ff] border border-[#0071e3]/20">
                  GEMINI AI + EXCEL
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Direct client-side invoice scan, wholesale spreadsheets & AI models
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            {/* Apple Stepper Capsules */}
            <div className="flex items-center gap-1 sm:gap-1.5 p-1 bg-black/[0.03] dark:bg-white/[0.05] rounded-2xl border border-black/[0.06] dark:border-white/[0.08] backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setStep(1)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  step === 1
                    ? 'bg-[#0071e3] dark:bg-[#0a84ff] text-white shadow-sm shadow-[#0071e3]/30'
                    : step > 1
                    ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
                }`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 1 ? 'bg-white/20' : step > 1 ? 'bg-emerald-500 text-white' : 'bg-gray-200 dark:bg-white/10'
                }`}>
                  {step > 1 ? '✓' : '1'}
                </span>
                <span className="hidden md:inline">1. Upload</span>
                <span className="md:hidden">Upload</span>
              </button>

              <div className="w-2.5 sm:w-3 h-px bg-gray-300 dark:bg-white/10" />

              <button
                type="button"
                onClick={() => step >= 2 && setStep(2)}
                disabled={step < 2}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  step === 2
                    ? 'bg-[#0071e3] dark:bg-[#0a84ff] text-white shadow-sm shadow-[#0071e3]/30'
                    : step > 2
                    ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
                    : 'text-gray-400 opacity-60 cursor-not-allowed'
                }`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 2 ? 'bg-white/20' : step > 2 ? 'bg-emerald-500 text-white' : 'bg-gray-200 dark:bg-white/10'
                }`}>
                  {step > 2 ? '✓' : '2'}
                </span>
                <span className="hidden md:inline">2. Verify JSON</span>
                <span className="md:hidden">Verify</span>
              </button>

              <div className="w-2.5 sm:w-3 h-px bg-gray-300 dark:bg-white/10" />

              <button
                type="button"
                onClick={() => step >= 3 && setStep(3)}
                disabled={step < 3}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  step === 3
                    ? 'bg-[#0071e3] dark:bg-[#0a84ff] text-white shadow-sm shadow-[#0071e3]/30'
                    : 'text-gray-400 opacity-60 cursor-not-allowed'
                }`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 3 ? 'bg-white/20' : 'bg-gray-200 dark:bg-white/10'
                }`}>
                  3
                </span>
                <span className="hidden md:inline">3. Match & Stock</span>
                <span className="md:hidden">Stock In</span>
              </button>
            </div>

            {/* Apple Close Button */}
            <button
              type="button"
              onClick={() => {
                if (!analyzing && !submitting && !isScanning) onClose()
              }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-900 dark:hover:text-white bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] border border-black/[0.04] dark:border-white/[0.08] transition-all shrink-0"
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      }
      footer={
        step !== 'success' && (
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <ShieldCheck size={15} className="text-emerald-500 shrink-0" />
              <span className="hidden sm:inline">Encrypted client-side processing • Zero document retention</span>
              <span className="sm:hidden">Encrypted processing</span>
            </div>

            <div className="flex gap-2.5">
              {step > 1 && (
                <button
                  type="button"
                  disabled={analyzing || submitting || isScanning}
                  onClick={() => setStep(prev => prev - 1)}
                  className="btn-secondary flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl"
                >
                  <ChevronLeft size={15} /> Back
                </button>
              )}

              {step === 1 && inputMode === 'prompt' && (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="btn-primary flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl"
                >
                  Paste JSON <ChevronRight size={15} />
                </button>
              )}

              {step === 2 && (
                <button
                  type="button"
                  disabled={parsedItems.length === 0 || !!jsonError || analyzing}
                  onClick={handleAnalyze}
                  className="btn-primary flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-xl"
                >
                  {analyzing ? (
                    <>
                      <Spinner size={15} /> Matching Catalog...
                    </>
                  ) : (
                    <>
                      Analyze & Match Inventory <Sparkles size={15} className="text-[#0a84ff]" />
                    </>
                  )}
                </button>
              )}

              {step === 3 && (
                <button
                  type="button"
                  disabled={submitting || enrichedItems.length === 0}
                  onClick={handleSubmitImport}
                  className="btn-primary flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-xl shadow-lg shadow-[#0071e3]/25"
                >
                  {submitting ? (
                    <>
                      <Spinner size={15} /> Importing Products...
                    </>
                  ) : (
                    <>
                      Import & Stock In <Check size={15} />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )
      }
    >
      <div className="h-full flex flex-col min-h-[500px]">
        {/* STEP 1: Upload / Choose Method */}
        {step === 1 && (
          <div className="space-y-6 max-w-4xl mx-auto w-full py-2">
            {/* Apple Crystal Segmented Mode Selector */}
            <div className="flex justify-center">
              <div className="p-1 bg-black/[0.04] dark:bg-white/[0.06] backdrop-blur-2xl rounded-2xl border border-black/[0.06] dark:border-white/[0.10] inline-flex shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] flex-wrap justify-center gap-1">
                <button
                  type="button"
                  onClick={() => setInputMode('scan')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
                    inputMode === 'scan'
                      ? 'bg-white dark:bg-white/[0.15] text-gray-900 dark:text-white shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.25)] border border-black/[0.04] dark:border-white/[0.15]'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <Zap size={14} className={inputMode === 'scan' ? 'text-[#0071e3] dark:text-[#0a84ff]' : 'text-gray-400'} />
                  <span>AI Invoice Scan (PDF / Photo)</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold tracking-tight ${
                    inputMode === 'scan'
                      ? 'bg-[#0071e3]/10 dark:bg-[#0a84ff]/20 text-[#0071e3] dark:text-[#0a84ff]'
                      : 'bg-black/[0.05] dark:bg-white/[0.08] text-gray-500 dark:text-gray-400'
                  }`}>
                    FAST
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setInputMode('excel')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
                    inputMode === 'excel'
                      ? 'bg-white dark:bg-white/[0.15] text-gray-900 dark:text-white shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.25)] border border-black/[0.04] dark:border-white/[0.15]'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <FileSpreadsheet size={14} className={inputMode === 'excel' ? 'text-emerald-500 dark:text-emerald-400' : 'text-gray-400'} />
                  <span>Excel / Spreadsheet Import</span>
                </button>

                <button
                  type="button"
                  onClick={() => setInputMode('prompt')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
                    inputMode === 'prompt'
                      ? 'bg-white dark:bg-white/[0.15] text-gray-900 dark:text-white shadow-[0_2px_8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_16px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.25)] border border-black/[0.04] dark:border-white/[0.15]'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <Bot size={14} className={inputMode === 'prompt' ? 'text-purple-500 dark:text-purple-400' : 'text-gray-400'} />
                  <span>Prompt & JSON Mode</span>
                </button>
              </div>
            </div>

            {/* TAB 1: Instant AI Scan Dropzone */}
            {inputMode === 'scan' && (
              <div className="space-y-6">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleDirectFileScan(e.target.files[0])
                    }
                  }}
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="hidden"
                />

                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => !isScanning && fileInputRef.current?.click()}
                  className={`relative group rounded-3xl border transition-all duration-300 p-8 sm:p-12 text-center cursor-pointer overflow-hidden ${
                    dragActive
                      ? 'border-[#0a84ff] bg-[#0a84ff]/10 scale-[1.01] shadow-[0_20px_60px_rgba(10,132,255,0.25),inset_0_1px_0_rgba(255,255,255,0.3)] ring-4 ring-[#0a84ff]/20'
                      : 'border-black/[0.08] dark:border-white/[0.12] hover:border-[#0a84ff]/50 dark:hover:border-[#0a84ff]/60 bg-gradient-to-b from-white/[0.06] via-white/[0.02] to-transparent dark:from-white/[0.05] dark:via-white/[0.015] dark:to-transparent shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.16)]'
                  }`}
                >
                  {isScanning ? (
                    <div className="py-8 space-y-4">
                      <div className="relative w-16 h-16 mx-auto">
                        <div className="absolute inset-0 rounded-2xl bg-[#0071e3]/30 animate-ping" />
                        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#0071e3] to-[#0a84ff] flex items-center justify-center text-white shadow-xl shadow-[#0071e3]/40">
                          <Spinner size={32} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <h4 className="text-base font-bold text-gray-900 dark:text-white animate-pulse tracking-tight">
                          {scanProgress || 'Analyzing invoice with Gemini Vision AI...'}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto">
                          Extracting items, batches, expiry dates, rates, and validating calculations...
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-[#0a84ff]/20 to-[#0a84ff]/5 border border-[#0a84ff]/30 mx-auto flex items-center justify-center text-[#0071e3] dark:text-[#0a84ff] group-hover:scale-110 group-hover:-translate-y-0.5 transition-all duration-300 shadow-[0_8px_20px_rgba(10,132,255,0.2),inset_0_1px_0_rgba(255,255,255,0.3)]">
                        <UploadCloud size={32} strokeWidth={1.8} />
                      </div>

                      <div className="space-y-1">
                        <h4 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
                          Drop your invoice file here, or <span className="text-[#0071e3] dark:text-[#0a84ff] underline underline-offset-4 font-semibold">browse</span>
                        </h4>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
                          Supports multi-page PDFs, camera photos, and bill scans (.pdf, .jpg, .png, .webp)
                        </p>
                      </div>

                      {/* Feature Pills */}
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 text-[#0071e3] dark:text-[#0a84ff] border border-[#0071e3]/20">
                          <Zap size={12} className="text-amber-400" /> Powered by Gemini Vision
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 size={12} /> Auto-Orientation
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                          <ShieldCheck size={12} /> Auto-Reconciled Math
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                          <Sparkles size={12} /> Universal Table Reader
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3 Step Feature Highlights as Apple Crystal Bento Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-2">
                  <div className="rounded-2xl p-4.5 bg-white/[0.04] dark:bg-white/[0.035] backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.12)] hover:border-black/[0.12] dark:hover:border-white/[0.16] hover:-translate-y-0.5 transition-all duration-200 flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 border border-[#0071e3]/20 flex items-center justify-center text-[#0071e3] dark:text-[#0a84ff] shrink-0">
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-gray-900 dark:text-white tracking-tight">Universal Layout AI</h5>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                        Accurately handles standard tables, indented sub-rows, and split columns across all trades.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl p-4.5 bg-white/[0.04] dark:bg-white/[0.035] backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.12)] hover:border-black/[0.12] dark:hover:border-white/[0.16] hover:-translate-y-0.5 transition-all duration-200 flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-gray-900 dark:text-white tracking-tight">Smart Reconciliation</h5>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                        Separates glued batches, standardizes expiry (MM/YY), and verifies Qty × Rate = Amount.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl p-4.5 bg-white/[0.04] dark:bg-white/[0.035] backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.12)] hover:border-black/[0.12] dark:hover:border-white/[0.16] hover:-translate-y-0.5 transition-all duration-200 flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-gray-900 dark:text-white tracking-tight">Catalog & Stock In</h5>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                        Fuzzy matches products against existing SKUs, updates batch tracking, and prepares purchases.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: Excel / Spreadsheet Import */}
            {inputMode === 'excel' && (
              <div className="space-y-6">
                <input
                  type="file"
                  ref={excelInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) handleExcelUpload(e.target.files[0])
                  }}
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                />

                <div
                  onClick={() => !isExcelUploading && excelInputRef.current?.click()}
                  className={`relative group rounded-3xl border transition-all duration-300 p-8 sm:p-12 text-center cursor-pointer overflow-hidden ${
                    isExcelUploading
                      ? 'border-emerald-500/50 bg-emerald-500/10'
                      : 'border-black/[0.08] dark:border-white/[0.12] hover:border-emerald-500/60 dark:hover:border-emerald-400/60 bg-gradient-to-b from-white/[0.06] via-white/[0.02] to-transparent dark:from-white/[0.05] dark:via-white/[0.015] dark:to-transparent shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.16)]'
                  }`}
                >
                  {isExcelUploading ? (
                    <div className="py-8 space-y-4">
                      <div className="relative w-16 h-16 mx-auto">
                        <div className="absolute inset-0 rounded-2xl bg-emerald-500/30 animate-ping" />
                        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-xl shadow-emerald-500/40">
                          <Spinner size={32} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <h4 className="text-base font-bold text-gray-900 dark:text-white animate-pulse tracking-tight">
                          Importing products from Excel spreadsheet...
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Mapping columns, validating SKU barcodes, and inserting catalog records...
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 mx-auto flex items-center justify-center text-emerald-500 dark:text-emerald-400 group-hover:scale-110 group-hover:-translate-y-0.5 transition-all duration-300 shadow-[0_8px_20px_rgba(16,185,129,0.2),inset_0_1px_0_rgba(255,255,255,0.3)]">
                        <FileSpreadsheet size={32} strokeWidth={1.8} />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
                          Drop your Excel catalog here, or <span className="text-emerald-500 underline underline-offset-4 font-semibold">browse</span>
                        </h4>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 max-w-lg mx-auto">
                          Upload wholesale catalog files in Microsoft Excel (.xlsx, .xls) or CSV format
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border border-emerald-500/20">
                          <CheckCircle2 size={12} /> Auto Column Mapping
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-teal-500/10 text-teal-600 dark:text-teal-300 border border-teal-500/20">
                          <ShieldCheck size={12} /> Duplicate SKU Protection
                        </span>
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-[#0071e3]/10 dark:bg-[#0a84ff]/15 text-[#0071e3] dark:text-[#0a84ff] border border-[#0071e3]/20">
                          <Zap size={12} /> Instant Catalog Update
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl p-4.5 bg-white/[0.035] dark:bg-white/[0.03] backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.08] text-xs text-gray-600 dark:text-gray-300 space-y-2">
                  <div className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Supported Column Headers
                  </div>
                  <p className="leading-relaxed text-[11px]">
                    Your spreadsheet can contain headers like: <code className="bg-black/[0.04] dark:bg-white/[0.08] px-1.5 py-0.5 rounded text-emerald-700 dark:text-emerald-300 font-mono">Product Name</code>, <code className="bg-black/[0.04] dark:bg-white/[0.08] px-1.5 py-0.5 rounded text-emerald-700 dark:text-emerald-300 font-mono">SKU / Code</code>, <code className="bg-black/[0.04] dark:bg-white/[0.08] px-1.5 py-0.5 rounded text-emerald-700 dark:text-emerald-300 font-mono">Purchase Price</code>, <code className="bg-black/[0.04] dark:bg-white/[0.08] px-1.5 py-0.5 rounded text-emerald-700 dark:text-emerald-300 font-mono">Selling Price</code>, <code className="bg-black/[0.04] dark:bg-white/[0.08] px-1.5 py-0.5 rounded text-emerald-700 dark:text-emerald-300 font-mono">MRP</code>, <code className="bg-black/[0.04] dark:bg-white/[0.08] px-1.5 py-0.5 rounded text-emerald-700 dark:text-emerald-300 font-mono">GST %</code>, <code className="bg-black/[0.04] dark:bg-white/[0.08] px-1.5 py-0.5 rounded text-emerald-700 dark:text-emerald-300 font-mono">Stock / Qty</code>.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 3: Manual Prompt Mode */}
            {inputMode === 'prompt' && (
              <div className="space-y-5">
                <div className="rounded-2xl p-5 bg-white/[0.035] dark:bg-white/[0.03] backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.06)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0">
                      <Bot size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white tracking-tight">
                        Use Your Favorite External AI Assistant
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Copy our specialized instruction prompt, feed your bill photo/PDF to ChatGPT-4o, Claude 3.5, or Gemini, then paste the output JSON.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    className="btn-primary shrink-0 flex items-center gap-2 py-2 px-4 shadow-md shadow-[#0071e3]/20 font-semibold rounded-xl text-xs"
                  >
                    {promptCopied ? <Check size={15} className="text-emerald-300" /> : <Copy size={15} />}
                    {promptCopied ? 'Prompt Copied!' : 'Copy Instruction Prompt'}
                  </button>
                </div>

                {/* Collapsible Prompt Preview */}
                <div className="rounded-2xl border border-black/[0.06] dark:border-white/[0.08] overflow-hidden bg-black/[0.02] dark:bg-white/[0.02]">
                  <button
                    type="button"
                    onClick={() => setShowPromptDetails(!showPromptDetails)}
                    className="w-full flex justify-between items-center px-4 py-3 bg-black/[0.02] dark:bg-white/[0.04] hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-left transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <FileText size={14} className="text-[#0071e3] dark:text-[#0a84ff]" />
                      View Full AI Extraction Prompt Template
                    </span>
                    <span className="text-xs text-[#0071e3] dark:text-[#0a84ff] font-medium flex items-center gap-1">
                      {showPromptDetails ? 'Collapse' : 'Expand'}
                      {showPromptDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </span>
                  </button>

                  {showPromptDetails && (
                    <pre className="p-4 text-xs font-mono overflow-auto max-h-[260px] text-gray-300 select-all leading-relaxed whitespace-pre-wrap border-t border-black/[0.06] dark:border-white/[0.06] bg-[#0c0d12]">
                      {AI_IMPORT_PROMPT}
                    </pre>
                  )}
                </div>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="btn-primary inline-flex items-center gap-2 px-7 py-2.5 rounded-xl font-bold shadow-lg shadow-[#0071e3]/25 text-xs sm:text-sm"
                  >
                    Next: Paste AI JSON Output <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}


        {/* STEP 2: Paste Output */}
        {step === 2 && (
          <div className="space-y-4 max-w-4xl mx-auto w-full py-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-gray-900 dark:text-white tracking-tight">Paste AI JSON Output</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">Review or paste the structured JSON code block below.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleLoadSample}
                  className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-xl font-medium"
                >
                  <Sparkles size={13} className="text-amber-400" />
                  Load Sample Invoice
                </button>
                {parsedItems.length > 0 && !jsonError && (
                  <button
                    type="button"
                    onClick={handleFormatJson}
                    className="btn-secondary text-xs py-1.5 px-3 rounded-xl font-medium"
                  >
                    Auto-Format
                  </button>
                )}
              </div>
            </div>

            <div className="relative rounded-2xl overflow-hidden border border-black/[0.08] dark:border-white/[0.12] shadow-inner bg-[#0c0d12]">
              <textarea
                value={rawJson}
                onChange={e => handleJsonChange(e.target.value)}
                placeholder="Paste JSON array here... e.g. [{ 'product_name': 'Paracetamol 500mg', ... }]"
                className="w-full h-[320px] p-4 font-mono text-xs text-[#7ee787] bg-transparent border-0 outline-none resize-none focus:ring-1 focus:ring-[#0a84ff]/40 selection:bg-[#0a84ff]/30 leading-relaxed"
              />
            </div>

            {/* Parsing status / errors */}
            {rawJson.trim() ? (
              jsonError ? (
                <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 flex items-start gap-3 backdrop-blur-xl">
                  <AlertCircle className="text-rose-500 shrink-0 mt-0.5" size={17} />
                  <div>
                    <h5 className="text-xs font-bold text-rose-700 dark:text-rose-300">JSON Syntax Error</h5>
                    <p className="text-xs font-mono text-rose-600 dark:text-rose-200 mt-1 leading-normal">
                      {jsonError}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 flex items-start gap-3 backdrop-blur-xl">
                  <Check size={17} className="text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-bold text-emerald-700 dark:text-emerald-300">Valid JSON Structure</h5>
                    <p className="text-xs text-emerald-600 dark:text-emerald-200 mt-0.5">
                      Successfully parsed {parsedItems.length} item records. Click &ldquo;Analyze &amp; Match Inventory&rdquo; below to proceed.
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div className="rounded-2xl p-8 border border-dashed border-black/[0.08] dark:border-white/[0.10] text-center text-gray-500 text-xs bg-black/[0.01] dark:bg-white/[0.02]">
                <FileText className="mx-auto mb-2 text-gray-400 opacity-60" size={28} />
                Awaiting invoice JSON data...
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Preview & Submit */}
        {step === 3 && (
          <div className="space-y-6 flex-1 flex flex-col h-full py-1">
            {/* Split row: Form details & Totals */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-shrink-0">
              {/* Supplier & Invoice metadata */}
              <div className="lg:col-span-2 rounded-2xl p-5 bg-white/[0.04] dark:bg-white/[0.035] backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.06)] space-y-4">
                <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider border-b border-black/[0.06] dark:border-white/[0.08] pb-2">
                  Invoice &amp; Purchase details
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="relative z-50">
                    <label className="label text-[10px] required">Supplier <span className="text-red-500">*</span></label>
                    {supplier ? (
                      <div className="flex items-center justify-between input py-[7.5px] border-[#0a84ff]/30 bg-[#0a84ff]/5">
                        <span className="font-semibold text-gray-900 dark:text-white truncate max-w-[150px]">
                          {supplier.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSupplier(null)}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <SearchAutocomplete
                        placeholder="Search supplier..."
                        onSearch={async (query) => {
                          const { data } = await supplierAPI.list({ search: query, limit: 50 })
                          return data.items
                        }}
                        onSelect={s => setSupplier(s)}
                        itemTemplate={s => (
                          <div className="px-3 py-1.5 text-left text-xs font-semibold hover:bg-black/[0.04] dark:hover:bg-white/[0.08] flex justify-between cursor-pointer w-full">
                            <span className="text-gray-900 dark:text-white">{s.name}</span>
                            {s.mobile && <span className="text-gray-400 text-[10px]">{s.mobile}</span>}
                          </div>
                        )}
                      />
                    )}
                  </div>

                  <div>
                    <label className="label text-[10px]">Invoice Reference No.</label>
                    <input
                      type="text"
                      className="input py-1.5"
                      value={invoiceNumber}
                      onChange={e => setInvoiceNumber(e.target.value)}
                      placeholder="e.g. INV-2026-09"
                    />
                  </div>

                  <div>
                    <label className="label text-[10px]">Purchase Date</label>
                    <DatePicker 
                      className="w-full" 
                      value={purchaseDate} 
                      onChange={d => setPurchaseDate(typeof d === 'string' ? d : d?.toISOString()?.split('T')[0] || '')} 
                    />
                  </div>

                  <div>
                    <label className="label text-[10px]">Payment Mode</label>
                    <select
                      className="select py-1.5"
                      value={paymentMode}
                      onChange={e => setPaymentMode(e.target.value)}
                    >
                      <option value="credit">Credit (Outstanding)</option>
                      <option value="cash">Cash</option>
                      <option value="upi">UPI (GPay/PhonePe)</option>
                      <option value="card">Debit/Credit Card</option>
                      <option value="cheque">Cheque</option>
                      <option value="neft">NEFT / NetBanking</option>
                    </select>
                  </div>

                  <div>
                    <label className="label text-[10px]">Paid Amount (₹)</label>
                    <input
                      type="number"
                      className="input py-1.5"
                      value={paidAmount}
                      onChange={e => setPaidAmount(Number(e.target.value) || 0)}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="flex items-center pt-5">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isIgst}
                        onChange={e => setIsIgst(e.target.checked)}
                        className="rounded border-gray-300 text-[#0071e3] focus:ring-[#0071e3] h-4 w-4"
                      />
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Interstate Purchase (IGST)
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Invoice Summary Totals */}
              <div className="rounded-2xl p-5 bg-white/[0.04] dark:bg-white/[0.035] backdrop-blur-xl border border-black/[0.06] dark:border-white/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.06)] flex flex-col justify-between">
                <h4 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider border-b border-black/[0.06] dark:border-white/[0.08] pb-2">
                  Total Calculations
                </h4>
                
                <div className="py-2 space-y-2">
                  <div className="flex justify-between text-xs text-gray-500 font-medium">
                    <span>Taxable Subtotal:</span>
                    <span className="text-gray-900 dark:text-white">₹{invoiceSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 font-medium">
                    <span>Tax ({isIgst ? 'IGST' : 'CGST + SGST'}):</span>
                    <span className="text-gray-900 dark:text-white">₹{invoiceTax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-gray-900 dark:text-white border-t border-black/[0.06] dark:border-white/[0.08] pt-2">
                    <span>Grand Total:</span>
                    <span className="text-[#0071e3] dark:text-[#0a84ff]">
                      ₹{invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {paymentMode !== 'credit' && (
                    <div className="flex justify-between text-xs text-gray-500 border-t border-black/[0.04] dark:border-white/[0.06] pt-1.5">
                      <span>Remaining Balance:</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">
                        ₹{Math.max(0, invoiceTotal - paidAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <input
                    type="text"
                    className="input py-1.5 text-xs"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add brief memo notes..."
                  />
                </div>
              </div>
            </div>

            {/* Editable Preview Table */}
            <div className="flex-1 flex flex-col min-h-0 bg-white/[0.02] dark:bg-white/[0.02] border border-black/[0.06] dark:border-white/[0.08] rounded-2xl overflow-hidden shadow-inner">
              <div className="px-4 py-2.5 bg-black/[0.015] dark:bg-white/[0.02] border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 tracking-wider">INVOICE ITEMS PREVIEW</span>
                <span className="text-[10px] text-gray-400">Click or edit fields directly to adjust values</span>
              </div>

              <div className="overflow-x-auto overflow-y-auto flex-1 border border-black/[0.04] dark:border-white/[0.06] rounded-xl">
                <table className="table min-w-[1590px] border-collapse">
                  <thead>
                    <tr className="bg-black/[0.02] dark:bg-white/[0.03] border-b border-black/[0.06] dark:border-white/[0.08] text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                      <th style={{ width: '320px', minWidth: '320px' }} className="py-2.5 px-3">Product Name & Match Status</th>
                      <th style={{ width: '90px', minWidth: '90px' }} className="py-2.5 px-3 text-center">Pack</th>
                      <th style={{ width: '80px', minWidth: '80px' }} className="py-2.5 px-3 text-center">Cases</th>
                      <th style={{ width: '100px', minWidth: '100px' }} className="py-2.5 px-3 text-center">Quantity</th>
                      <th style={{ width: '110px', minWidth: '110px' }} className="py-2.5 px-3 text-right">Purchase Rate (₹)</th>
                      <th style={{ width: '110px', minWidth: '110px' }} className="py-2.5 px-3 text-right font-bold text-indigo-600 dark:text-indigo-400">Selling Price (₹)</th>
                      <th style={{ width: '120px', minWidth: '120px' }} className="py-2.5 px-3 text-right">Amount (₹)</th>
                      <th style={{ width: '80px', minWidth: '80px' }} className="py-2.5 px-3 text-center">GST %</th>
                      <th style={{ width: '110px', minWidth: '110px' }} className="py-2.5 px-3 text-center">HSN</th>
                      <th style={{ width: '130px', minWidth: '130px' }} className="py-2.5 px-3 text-center">Batch</th>
                      <th style={{ width: '110px', minWidth: '110px' }} className="py-2.5 px-3 text-center">Expiry</th>
                      <th style={{ minWidth: '180px' }} className="py-2.5 px-3 text-left">Manufacturer</th>
                      <th style={{ width: '50px', minWidth: '50px' }} className="py-2.5 px-3 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                    {enrichedItems.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/40 dark:hover:bg-gray-800/10">
                        {/* Product Name & Matching Selector */}
                        <td style={{ width: '320px', minWidth: '320px' }} className="p-1.5 px-2 relative">
                          <div className="space-y-1">
                            <input
                              type="text"
                              className={`input py-1 px-2 text-xs font-semibold ${item.validation_errors?.length ? 'border-red-400/80 focus:border-red-500' : ''}`}
                              value={item.product_name}
                              onChange={e => updateEnrichedItemField(idx, 'product_name', e.target.value)}
                            />
                            
                            {/* Matching Badge Trigger */}
                            <div className="flex items-center gap-2">
                              {getConfidenceBadge(item.confidence)}
                              <button
                                type="button"
                                onClick={() => setOverridingIdx(overridingIdx === idx ? null : idx)}
                                className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
                              >
                                {item.product_id ? 'Change Link' : 'Link Database Product'}
                              </button>
                            </div>

                            {/* Overriding Mapping Popover Panel */}
                            {overridingIdx === idx && (
                              <div className="absolute left-2 right-2 top-[60px] z-[999] bg-white dark:bg-gray-900 border border-gray-250 dark:border-gray-700 rounded-xl shadow-2xl p-3 space-y-2.5 animate-modal-in">
                                <div className="flex justify-between items-center border-b pb-1 dark:border-gray-800">
                                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Product Mapping Assistant</span>
                                  <button type="button" onClick={() => setOverridingIdx(null)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
                                </div>

                                {/* Alternative Suggestions list */}
                                {item.suggestions?.length > 0 && (
                                  <div className="space-y-1">
                                    <span className="text-[9px] text-gray-400 font-bold block uppercase">AI Matches Found:</span>
                                    <div className="grid grid-cols-1 gap-1 max-h-24 overflow-y-auto">
                                      {item.suggestions.map(sugg => (
                                        <button
                                          key={sugg.product_id}
                                          type="button"
                                          onClick={() => handleOverrideProduct(idx, sugg)}
                                          className="text-left px-2 py-1 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border dark:border-gray-700 rounded text-xs flex justify-between items-center"
                                        >
                                          <span className="font-semibold text-gray-700 dark:text-gray-300 truncate max-w-[180px]">{sugg.product_name}</span>
                                          <span className="text-[9px] badge-blue px-1 py-0.2 rounded font-mono">{sugg.confidence}% match</span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Force Create New Option */}
                                <button
                                  type="button"
                                  onClick={() => handleOverrideProduct(idx, 'new')}
                                  className="w-full text-left px-2 py-1.5 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-400 rounded text-xs font-bold"
                                >
                                  🆕 Skip Database link: Force create as New Product
                                </button>

                                {/* System DB Search autocomplete linking */}
                                <div className="space-y-1">
                                  <span className="text-[9px] text-gray-400 font-bold block uppercase">Search & link other product:</span>
                                  <SearchAutocomplete
                                    placeholder="Type SKU or product name to search..."
                                    onSearch={async (query) => {
                                      const { data } = await productAPI.search(query, 30)
                                      return data
                                    }}
                                    onSelect={p => handleLinkSearchedProduct(idx, p)}
                                    itemTemplate={p => (
                                      <div className="px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/60 flex justify-between cursor-pointer w-full text-xs font-semibold">
                                        <span className="text-gray-800 dark:text-white truncate max-w-[150px]">{p.name}</span>
                                        {p.brand && <span className="text-gray-400 text-[10px]">{p.brand}</span>}
                                      </div>
                                    )}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Field Validation Warnings */}
                            {item.validation_errors?.length > 0 && (
                              <div className="text-[9px] text-red-500 space-y-0.5 font-semibold leading-none mt-1">
                                {item.validation_errors.map((err, eIdx) => (
                                  <div key={eIdx} className="flex items-center gap-0.5">
                                    <span>⚠️</span>
                                    <span>{err}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Pack */}
                        <td style={{ width: '90px', minWidth: '90px' }} className="p-1.5 px-2">
                          <input
                            type="text"
                            className="input py-1 px-1.5 text-center text-xs"
                            value={item.pack || ''}
                            onChange={e => updateEnrichedItemField(idx, 'pack', e.target.value)}
                            placeholder="e.g. 10s"
                          />
                        </td>

                        {/* Cases */}
                        <td style={{ width: '80px', minWidth: '80px' }} className="p-1.5 px-2">
                          <input
                            type="number"
                            className="input py-1 px-1 text-center text-xs"
                            value={item.cases || ''}
                            onChange={e => updateEnrichedItemField(idx, 'cases', Number(e.target.value) || 0)}
                          />
                        </td>

                        {/* Quantity */}
                        <td style={{ width: '100px', minWidth: '100px' }} className="p-1.5 px-2">
                          <input
                            type="number"
                            className="input py-1 px-1.5 text-center text-xs font-bold"
                            value={item.quantity || ''}
                            onChange={e => updateEnrichedItemField(idx, 'quantity', Number(e.target.value) || 0)}
                          />
                        </td>

                        {/* Purchase Rate */}
                        <td style={{ width: '110px', minWidth: '110px' }} className="p-1.5 px-2">
                          <input
                            type="number"
                            className="input py-1 px-1.5 text-right text-xs"
                            value={item.purchase_rate || ''}
                            onChange={e => updateEnrichedItemField(idx, 'purchase_rate', Number(e.target.value) || 0)}
                          />
                        </td>

                        {/* Selling Price */}
                        <td style={{ width: '110px', minWidth: '110px' }} className="p-1.5 px-2">
                          <input
                            type="number"
                            className="input py-1 px-1.5 text-right text-xs font-bold text-indigo-600 dark:text-indigo-300 border-indigo-400/30"
                            value={item.selling_price || ''}
                            onChange={e => updateEnrichedItemField(idx, 'selling_price', Number(e.target.value) || 0)}
                          />
                        </td>

                        {/* Calculated Amount */}
                        <td style={{ width: '120px', minWidth: '120px' }} className="p-1.5 px-2 text-right font-mono text-gray-500 font-semibold">
                          ₹{(Number(item.purchase_rate) * Number(item.quantity)).toFixed(2)}
                        </td>

                        {/* GST % */}
                        <td style={{ width: '80px', minWidth: '80px' }} className="p-1.5 px-2">
                          <select
                            className="select py-1 px-1 text-center text-xs"
                            value={item.gst || 18}
                            onChange={e => updateEnrichedItemField(idx, 'gst', Number(e.target.value) || 0)}
                          >
                            <option value={0}>0%</option>
                            <option value={3}>3%</option>
                            <option value={5}>5%</option>
                            <option value={12}>12%</option>
                            <option value={18}>18%</option>
                            <option value={28}>28%</option>
                          </select>
                        </td>

                        {/* HSN */}
                        <td style={{ width: '110px', minWidth: '110px' }} className="p-1.5 px-2">
                          <input
                            type="text"
                            className="input py-1 px-1 text-center text-xs"
                            value={item.hsn_code || ''}
                            onChange={e => updateEnrichedItemField(idx, 'hsn_code', e.target.value)}
                            placeholder="HSN"
                          />
                        </td>

                        {/* Batch */}
                        <td style={{ width: '130px', minWidth: '130px' }} className="p-1.5 px-2">
                          <input
                            type="text"
                            className="input py-1 px-1 text-center text-xs font-mono"
                            value={item.batch_number || ''}
                            onChange={e => updateEnrichedItemField(idx, 'batch_number', e.target.value)}
                            placeholder="Batch"
                          />
                        </td>

                        {/* Expiry */}
                        <td style={{ width: '110px', minWidth: '110px' }} className="p-1.5 px-2">
                          <input
                            type="text"
                            className="input py-1 px-1.5 text-center text-xs font-mono"
                            value={item.expiry_date || ''}
                            onChange={e => updateEnrichedItemField(idx, 'expiry_date', e.target.value)}
                            placeholder="MM/YYYY or DD-MM-YYYY"
                          />
                        </td>

                        {/* Manufacturer */}
                        <td style={{ minWidth: '180px' }} className="p-1.5 px-2">
                          <input
                            type="text"
                            className="input py-1 px-1.5 text-xs"
                            value={item.manufacturer || ''}
                            onChange={e => updateEnrichedItemField(idx, 'manufacturer', e.target.value)}
                            placeholder="Brand"
                          />
                        </td>

                        {/* Delete Row */}
                        <td style={{ width: '50px', minWidth: '50px' }} className="p-1.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(idx)}
                            className="text-red-500 hover:text-red-750 transition-colors p-1"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SUCCESS STATE */}
        {step === 'success' && importResult && (
          <div className="text-center py-10 max-w-lg mx-auto space-y-6">
            <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20 shadow-lg animate-backdrop-in">
              <Check size={40} className="stroke-[3]" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Import Complete!</h3>
              <p className="text-sm text-gray-500">
                Successfully processed and saved your AI invoice items.
              </p>
            </div>

            <div className="card p-5 bg-white/20 dark:bg-black/10 space-y-3.5 text-left border border-gray-250 dark:border-gray-750">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400 font-medium">Invoice reference:</span>
                <span className="font-bold text-gray-800 dark:text-white">{importResult.invoice_number}</span>
              </div>
              <div className="flex justify-between text-xs border-t pt-2 dark:border-gray-800">
                <span className="text-gray-400 font-medium">Imported items:</span>
                <span className="font-bold text-indigo-650 dark:text-indigo-400">{importResult.imported_count} Products</span>
              </div>
              <div className="flex justify-between text-xs border-t pt-2 dark:border-gray-800">
                <span className="text-gray-400 font-medium">Purchase Invoice ID:</span>
                <span className="font-mono text-gray-500 text-[10px]">{importResult.purchase_id}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="btn-primary px-8"
            >
              Close Assistant
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
