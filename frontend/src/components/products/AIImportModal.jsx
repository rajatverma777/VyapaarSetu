import { useEffect, useRef, useState, useCallback } from 'react'
import { 
  Copy, Check, FileText, Sparkles, AlertCircle, 
  AlertTriangle, X, ChevronRight, ChevronLeft, Search, Plus, Trash2, ArrowRight
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supplierAPI, aiImportAPI, productAPI } from '../../services/api'
import { Modal, SearchAutocomplete, DatePicker, GlassSelect, Spinner } from '../ui'

const AI_IMPORT_PROMPT = `Analyze this wholesale invoice and extract the invoice metadata and all products.

Return ONLY valid JSON.

JSON Structure:
{
  "invoice_number": "Invoice / Bill Number (e.g. B004336)",
  "invoice_date": "Invoice Date (format as YYYY-MM-DD or DD-MM-YYYY)",
  "supplier_name": "Supplier / Seller name (e.g. YASH SURGICAL HOUSE)",
  "items": [
    {
      "product_name": "Product Name",
      "pack": "Packing size (e.g. 10x10, 1UNIT)",
      "cases": null,
      "quantity": 10.0,
      "purchase_rate": 247.62,
      "selling_price": 1450.0,
      "amount": 2476.19,
      "gst": 5.0,
      "hsn_code": "30049091",
      "batch_number": "Batch Number (e.g. G26D010419)",
      "expiry_date": "MM/YYYY or DD-MM-YYYY format (e.g. 03/2031 or 15-08-2027)",
      "manufacturer": "Brand, company, distributor, or seller name written on the bill (e.g. Yash Surgical House, R B Healthcare, RMS, Cipla)"
    }
  ]
}

Rules:
* Do not explain anything.
* Do not use markdown.
* Do not include comments.
* Return JSON object only.
* Keep numbers as numbers.
* Format expiry dates as MM/YYYY (e.g. "03/2031") or DD-MM-YYYY (e.g. "15-08-2027"). If the invoice has month/year format, keep it as MM/YYYY.
* For the manufacturer field, extract the brand, company, distributor, or seller name written on the bill (e.g., Yash Surgical House, R B Healthcare, RMS, Cipla, Abbott).

Example:
{
  "invoice_number": "B004336",
  "invoice_date": "2026-06-07",
  "supplier_name": "YASH SURGICAL HOUSE",
  "items": [
    {
      "product_name": "Paracetamol 500mg",
      "pack": "10x10",
      "cases": 2,
      "quantity": 30,
      "purchase_rate": 100.0,
      "selling_price": 120.0,
      "amount": 3000.0,
      "gst": 12.0,
      "hsn_code": "30049091",
      "batch_number": "G26D010419",
      "expiry_date": "03/2031",
      "manufacturer": "ABC Pharma"
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

  // Reset modal state on open
  useEffect(() => {
    if (open) {
      setStep(1)
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

  // Copy Prompt to Clipboard
  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(AI_IMPORT_PROMPT)
    setPromptCopied(true)
    toast.success('Prompt copied to clipboard!')
    setTimeout(() => setPromptCopied(false), 3000)
  }

  // Heal JSON with unescaped double quotes inside values, or array-wrap a single object
  const healJson = (str) => {
    if (!str) return str
    let trimmed = str.trim()
    
    // List of known and synonym keys to expand minified single-line JSON
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
        <span className="badge-green text-[10px] px-1.5 py-0.5 rounded border">
          High Match ({score}%)
        </span>
      )
    }
    if (score >= 70) {
      return (
        <span className="badge-yellow text-[10px] px-1.5 py-0.5 rounded border">
          Suggested ({score}%)
        </span>
      )
    }
    return (
      <span className="badge-red text-[10px] px-1.5 py-0.5 rounded border">
        New Product
      </span>
    )
  }

  return (
    <Modal 
      open={open} 
      onClose={() => {
        if (!analyzing && !submitting) onClose()
      }} 
      title="AI Import Assistant" 
      size="full"
      footer={
        step !== 'success' && (
          <div className="flex justify-between items-center w-full">
            {/* Step Indicators */}
            <div className="flex gap-2">
              <span className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${step === 1 ? 'bg-indigo-500 scale-125' : 'bg-gray-300 dark:bg-gray-600'}`} />
              <span className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${step === 2 ? 'bg-indigo-500 scale-125' : 'bg-gray-300 dark:bg-gray-600'}`} />
              <span className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${step === 3 ? 'bg-indigo-500 scale-125' : 'bg-gray-300 dark:bg-gray-600'}`} />
            </div>

            <div className="flex gap-3">
              {step > 1 && (
                <button
                  type="button"
                  disabled={analyzing || submitting}
                  onClick={() => setStep(prev => prev - 1)}
                  className="btn-secondary flex items-center gap-1.5"
                >
                  <ChevronLeft size={16} /> Back
                </button>
              )}

              {step === 1 && (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="btn-primary flex items-center gap-1.5"
                >
                  Next Step <ChevronRight size={16} />
                </button>
              )}

              {step === 2 && (
                <button
                  type="button"
                  disabled={parsedItems.length === 0 || !!jsonError || analyzing}
                  onClick={handleAnalyze}
                  className="btn-primary flex items-center gap-1.5"
                >
                  {analyzing ? (
                    <>
                      <Spinner size={16} /> Analyzing...
                    </>
                  ) : (
                    <>
                      Analyze JSON <Sparkles size={16} className="text-indigo-400 animate-pulse" />
                    </>
                  )}
                </button>
              )}

              {step === 3 && (
                <button
                  type="button"
                  disabled={submitting || enrichedItems.length === 0}
                  onClick={handleSubmitImport}
                  className="btn-primary flex items-center gap-1.5 font-bold"
                >
                  {submitting ? (
                    <>
                      <Spinner size={16} /> Importing...
                    </>
                  ) : (
                    <>
                      Import invoice <Check size={16} />
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
        {/* STEP 1: Copy Prompt */}
        {step === 1 && (
          <div className="space-y-6 max-w-3xl mx-auto py-4">
            <div className="card p-6 border-indigo-500/20 bg-indigo-500/5 flex items-start gap-4">
              <Sparkles className="text-indigo-500 shrink-0 mt-1" size={24} />
              <div>
                <h4 className="text-base font-bold text-gray-900 dark:text-white mb-1">
                  How does the AI Import Assistant work?
                </h4>
                <p className="text-sm text-gray-650 dark:text-gray-405 leading-relaxed">
                  Extract invoice products without paying for API keys. You simply feed your invoice (PDF or image) 
                  into a chat LLM (like ChatGPT, Gemini, or Claude) using our structured prompt instruction, copy the generated JSON 
                  result, and paste it here. We handle the validation, auto-matching, stock additions, and ledger accounts.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <h5 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                1. Upload your invoice / bill photo to your favorite AI assistant.
              </h5>
              <h5 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                2. Copy and paste the instructions prompt below:
              </h5>
            </div>

            <div className="relative border border-gray-250 dark:border-indigo-500/15 rounded-xl overflow-hidden bg-gray-50/50 dark:bg-indigo-500/5 backdrop-blur-md">
              <div className="flex justify-between items-center px-4 py-2 bg-gray-100/50 dark:bg-[#161720]/80 border-b border-gray-250 dark:border-indigo-500/15">
                <span className="text-xs font-semibold text-gray-500 tracking-wider">AI EXTRACTION PROMPT</span>
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="btn-secondary btn-sm flex items-center gap-1.5 py-1"
                >
                  {promptCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  {promptCopied ? 'Copied!' : 'Copy Prompt'}
                </button>
              </div>
              <pre className="p-4 text-xs font-mono overflow-auto max-h-[300px] text-gray-700 dark:text-gray-300 select-all leading-relaxed whitespace-pre-wrap">
                {AI_IMPORT_PROMPT}
              </pre>
            </div>
            
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-primary inline-flex items-center gap-2 px-6"
              >
                Let's Paste the Output <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Paste Output */}
        {step === 2 && (
          <div className="space-y-4 max-w-4xl mx-auto w-full py-2">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-lg font-bold text-gray-900 dark:text-white">Paste AI JSON Output</h4>
                <p className="text-sm text-gray-500">Paste the JSON code block generated by ChatGPT, Gemini, or Claude below.</p>
              </div>
              {parsedItems.length > 0 && !jsonError && (
                <button
                  type="button"
                  onClick={handleFormatJson}
                  className="btn-secondary btn-sm"
                >
                  Auto-Format JSON
                </button>
              )}
            </div>

            <div className="relative rounded-xl overflow-hidden border border-gray-250 dark:border-gray-700 shadow-lg">
              <textarea
                value={rawJson}
                onChange={e => handleJsonChange(e.target.value)}
                placeholder="Paste JSON array here... e.g. [{ 'product_name': 'Paracetamol 500mg', ... }]"
                className="w-full h-[320px] p-4 font-mono text-xs bg-gray-950 text-green-400 border-0 outline-none resize-none focus:ring-1 focus:ring-green-500/50"
              />
            </div>

            {/* Parsing status / errors */}
            {rawJson.trim() ? (
              jsonError ? (
                <div className="card border-red-500/20 bg-red-500/5 p-4 flex items-start gap-3">
                  <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                  <div>
                    <h5 className="text-sm font-bold text-red-700 dark:text-red-400">JSON Syntax Error</h5>
                    <p className="text-xs font-mono text-red-655 dark:text-red-300 mt-1 leading-normal">
                      {jsonError}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="card border-emerald-500/20 bg-emerald-500/5 p-4 flex items-start gap-3">
                  <Check size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Valid JSON Structure</h5>
                    <p className="text-xs text-emerald-655 dark:text-emerald-300 mt-0.5">
                      Successfully parsed **{parsedItems.length}** item records. Click "Analyze JSON" to run database checks.
                    </p>
                  </div>
                </div>
              )
            ) : (
              <div className="card p-4 border-dashed border-gray-300 dark:border-gray-750 text-center text-gray-500 text-sm py-10 bg-white/20 dark:bg-white/5">
                <FileText className="mx-auto mb-2 text-gray-400" size={32} />
                Awaiting copy-pasted invoice data...
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
              <div className="lg:col-span-2 card p-5 space-y-4">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider border-b pb-2 dark:border-gray-800">
                  Invoice & Purchase details
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="relative z-50">
                    <label className="label text-[10px] required">Supplier <span className="text-red-500">*</span></label>
                    {supplier ? (
                      <div className="flex items-center justify-between input py-[7.5px] border-indigo-400/50 dark:border-indigo-400/20 bg-indigo-50/10 dark:bg-indigo-950/20">
                        <span className="font-semibold text-indigo-750 dark:text-indigo-300 truncate max-w-[150px]">
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
                          <div className="px-3 py-1.5 text-left text-xs font-semibold hover:bg-gray-100 dark:hover:bg-gray-700/60 flex justify-between cursor-pointer w-full">
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
                        className="rounded border-gray-300 text-indigo-650 focus:ring-indigo-500 h-4 w-4"
                      />
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Interstate Purchase (IGST)
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Invoice Summary Totals */}
              <div className="card p-5 bg-gradient-to-br from-indigo-500/10 to-purple-500/5 border-indigo-500/20 flex flex-col justify-between">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider border-b pb-2 dark:border-gray-800">
                  Total Calculations
                </h4>
                
                <div className="py-2 space-y-2">
                  <div className="flex justify-between text-xs text-gray-500 font-medium">
                    <span>Taxable Subtotal:</span>
                    <span>₹{invoiceSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 font-medium">
                    <span>Tax ({isIgst ? 'IGST' : 'CGST + SGST'}):</span>
                    <span>₹{invoiceTax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-gray-800 dark:text-white border-t border-dashed pt-2 dark:border-gray-750">
                    <span>Grand Total:</span>
                    <span className="text-indigo-600 dark:text-indigo-400">
                      ₹{invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {paymentMode !== 'credit' && (
                    <div className="flex justify-between text-xs text-gray-550 border-t pt-1.5 dark:border-gray-850">
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
            <div className="flex-1 flex flex-col min-h-0 bg-white/40 dark:bg-black/20 border border-gray-250 dark:border-gray-750 rounded-2xl overflow-hidden shadow-inner">
              <div className="px-4 py-2.5 bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-250 dark:border-gray-750 flex items-center justify-between">
                <span className="text-xs font-bold text-gray-550">INVOICE ITEMS PREVIEW</span>
                <span className="text-[10px] text-gray-400 italic">Double-click or click inputs to modify fields directly</span>
              </div>

              <div className="overflow-x-auto overflow-y-auto flex-1 border dark:border-gray-800 rounded-xl">
                <table className="table min-w-[1590px] border-collapse">
                  <thead>
                    <tr className="bg-gray-100/50 dark:bg-gray-900/40 border-b border-gray-250 dark:border-gray-750 font-bold">
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
