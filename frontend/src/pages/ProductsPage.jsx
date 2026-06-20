import { useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { Plus, Upload, Download, Edit2, Trash2, Package, RefreshCw, Settings, FolderPlus, ChevronUp, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'
import { productAPI, categoryAPI, inventoryAPI } from '../services/api'
import {
  Modal, ConfirmDialog, Pagination, EmptyState,
  SearchInput, StatusBadge, LoadingScreen, TableSkeleton, Amount, FormField, Spinner, GlassSelect
} from '../components/ui'

const UNITS = ['PCS', 'KG', 'G', 'LTR', 'ML', 'MTR', 'CM', 'BOX', 'PKT', 'DOZEN', 'PAIR', 'SET']
const GST_RATES = [0, 3, 5, 12, 18, 28]

const EMPTY_PRODUCT = {
  name: '', sku: '', barcode: '', category_id: '', brand: '', unit: 'PCS',
  hsn_code: '', gst_rate: 18, purchase_price: '', selling_price: '',
  mrp: '', wholesale_price: '', min_price: '', opening_stock: 0, min_stock_alert: 10,
  description: '', is_active: true, batch: '', expiry: '', pack: '', cases: null
}

export default function ProductsPage() {
  const [products, setProducts]   = useState([])
  const [categories, setCategories] = useState([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [lowStock, setLowStock]   = useState(false)
  const [loading, setLoading]     = useState(true)
  const [selectedIds, setSelectedIds] = useState([])
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [sortBy, setSortBy]       = useState('name')
  const [sortOrder, setSortOrder] = useState(1) // 1 = asc, -1 = desc


  const [showForm, setShowForm]         = useState(false)
  const [editProduct, setEditProduct]   = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [saving, setSaving]             = useState(false)
  const [form, setForm]                 = useState(EMPTY_PRODUCT)
  const fileRef = useRef()
  const [importPreviewItems, _setImportPreviewItems] = useState([])
  const setImportPreviewItems = (val) => {
    _setImportPreviewItems(Array.isArray(val) ? val : [])
  }
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [importing, setImporting] = useState(false)

  // Category Manager States
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatDesc, setNewCatDesc] = useState('')
  const [catSaving, setCatSaving] = useState(false)

  const limit = 50

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await productAPI.list({
        search: search || undefined,
        category_id: catFilter || undefined,
        low_stock: lowStock || undefined,
        page, limit,
        sort_by: sortBy,
        sort_order: sortOrder
      })
      setProducts(data.items)
      setTotal(data.total)
      setSelectedIds([])
    } catch { toast.error('Failed to load products') }
    finally { setLoading(false) }
  }

  const loadCategories = async () => {
    const { data } = await categoryAPI.list()
    setCategories(data)
  }

  const handleAddCategory = async (e) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    setCatSaving(true)
    try {
      await categoryAPI.create({ name: newCatName.trim(), description: newCatDesc.trim() })
      toast.success('Category created')
      setNewCatName('')
      setNewCatDesc('')
      await loadCategories()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create category')
    } finally {
      setCatSaving(false)
    }
  }

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Are you sure you want to delete this category?')) return
    try {
      await categoryAPI.delete(id)
      toast.success('Category deleted')
      await loadCategories()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete category')
    }
  }

  useEffect(() => { loadCategories() }, [])
  useEffect(() => { load() }, [search, catFilter, lowStock, page, sortBy, sortOrder])

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 1 ? -1 : 1)
    } else {
      setSortBy(field)
      setSortOrder(1)
    }
    setPage(1)
  }

  const renderHeader = (label, field, isRight = false) => {
    const active = sortBy === field
    const Icon = sortOrder === 1 ? ChevronUp : ChevronDown
    return (
      <th 
        onClick={() => handleSort(field)}
        className={`group cursor-pointer select-none hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors ${isRight ? 'text-right' : ''}`}
      >
        <div className={`flex items-center gap-2 ${isRight ? 'justify-end' : ''}`}>
          <span className="group-hover:text-gray-950 dark:group-hover:text-white transition-colors">
            {label}
          </span>
          <span className={`
            inline-flex items-center justify-center 
            w-5 h-5 rounded-md 
            bg-indigo-500/10 dark:bg-indigo-400/10 
            backdrop-blur-sm 
            border border-indigo-500/20 dark:border-indigo-400/20 
            text-indigo-600 dark:text-indigo-400 
            transition-all duration-300 ease-out 
            ${active ? 'opacity-100 scale-100' : 'opacity-0 scale-75 group-hover:opacity-40 group-hover:scale-90'}
          `}>
            <Icon size={12} strokeWidth={2.5} />
          </span>
        </div>
      </th>
    )
  }


  const openAdd = () => { setForm(EMPTY_PRODUCT); setEditProduct(null); setShowForm(true) }
  const openEdit = (p) => {
    setForm({ ...EMPTY_PRODUCT, ...p, opening_stock: p.current_stock })
    setEditProduct(p)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.name) return toast.error('Product name required')
    if (!form.selling_price) return toast.error('Selling price required')
    setSaving(true)
    try {
      const payload = {
        ...form,
        purchase_price: parseFloat(form.purchase_price) || 0,
        selling_price:  parseFloat(form.selling_price)  || 0,
        mrp:            parseFloat(form.mrp)             || null,
        wholesale_price:parseFloat(form.wholesale_price)|| null,
        min_price:      parseFloat(form.min_price)       || null,
        opening_stock:  parseFloat(form.opening_stock)  || 0,
        min_stock_alert:parseFloat(form.min_stock_alert)|| 0,
        gst_rate:       parseFloat(form.gst_rate)       || 0,
        category_id:    form.category_id                 || null,
      }
      if (editProduct) {
        await productAPI.update(editProduct.id, payload)
        if (parseFloat(form.opening_stock) !== parseFloat(editProduct.current_stock)) {
          await inventoryAPI.adjust({
            product_id: editProduct.id,
            adjustment_stock: parseFloat(form.opening_stock) || 0,
            adjustment_type: 'set',
            quantity: parseFloat(form.opening_stock) || 0,
            reason: 'Updated via Product Edit'
          })
        }
        toast.success('Product updated')
      } else {
        await productAPI.create(payload)
        toast.success('Product created')
      }
      setShowForm(false)
      load()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed')
    } finally { setSaving(false) }
  }

  const handleDelete = async (id) => {
    try {
      await productAPI.delete(id)
      toast.success('Product deleted')
      load()
    } catch { toast.error('Delete failed') }
  }

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(products.map(p => p.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelectOne = (id, checked) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id])
    } else {
      setSelectedIds(prev => prev.filter(x => x !== id))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    const toastId = toast.loading('Deleting selected products...')
    try {
      await productAPI.bulkDelete(selectedIds)
      toast.success(`Deleted ${selectedIds.length} products`, { id: toastId })
      setSelectedIds([])
      load()
    } catch {
      toast.error('Delete failed', { id: toastId })
    }
  }

  const resizeImage = (file) => {
    return new Promise((resolve) => {
      if (!file.type.startsWith('image/')) {
        resolve(file); // Don't try to resize PDFs
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const maxW = 1000;
          if (img.width <= maxW) {
            resolve(file);
            return;
          }
          const scale = maxW / img.width;
          const canvas = document.createElement('canvas');
          canvas.width = maxW;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            const resizedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(resizedFile);
          }, 'image/jpeg', 0.85); // 85% JPEG quality
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleBulkImport = async (e) => {
    let file = e.target.files[0]
    if (!file) return

    const isImageOrPdf = file.type.startsWith('image/') || file.type === 'application/pdf' || /\.(png|jpe?g|webp|pdf)$/i.test(file.name)
    
    if (isImageOrPdf) {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
      const toastId = toast.loading(isPdf ? 'Uploading and preparing PDF invoice...' : 'Compressing and resizing bill image locally...')
      try {
        if (!isPdf) {
          // Downscale the image locally in the browser before upload to prevent server OOM and network timeouts
          file = await resizeImage(file)
        }
        
        toast.loading(isPdf ? 'Uploading PDF invoice...' : 'Uploading resized bill image...', { id: toastId })
        const { data } = await productAPI.importImage(file)
        const taskId = data.task_id
        
        let elapsedSeconds = 0
        const getProgressMessage = () => {
          return isPdf
            ? `Analyzing PDF layout and content (${elapsedSeconds}s)...`
            : `Analyzing bill text via background worker (${elapsedSeconds}s)...`
        }
        
        toast.loading(getProgressMessage(), { id: toastId })
        
        // Start polling status
        const pollInterval = setInterval(async () => {
          elapsedSeconds += 2
          toast.loading(getProgressMessage(), { id: toastId })
          
          try {
            const statusRes = await productAPI.getImportTaskStatus(taskId)
            const task = statusRes.data
            
            if (task.status === 'completed') {
              clearInterval(pollInterval)
              setImportPreviewItems(task.result || [])
              setShowPreviewModal(true)
              toast.success(isPdf ? 'PDF invoice analyzed successfully!' : 'Bill analyzed successfully!', { id: toastId })
            } else if (task.status === 'failed') {
              clearInterval(pollInterval)
              toast.error(task.error || (isPdf ? 'Failed to analyze PDF invoice' : 'Failed to analyze bill image'), { id: toastId })
            }
          } catch (err) {
            clearInterval(pollInterval)
            toast.error('Connection interrupted while monitoring task status', { id: toastId })
          }
        }, 2000)
        
      } catch (err) {
        toast.error(err.response?.data?.detail || (isPdf ? 'Failed to analyze PDF invoice' : 'Failed to analyze bill image'), { id: toastId })
      }
    } else {
      const toastId = toast.loading('Importing products…')
      try {
        const { data } = await productAPI.bulkImport(file)
        toast.success(`Imported ${data.imported} products`, { id: toastId })
        if (data.errors.length) toast.error(`${data.errors.length} errors`)
        load()
      } catch { toast.error('Import failed', { id: toastId }) }
    }
    e.target.value = ''
  }

  const handleSavePreviewItems = async () => {
    setImporting(true)
    const toastId = toast.loading('Saving products...')
    try {
      const { data } = await productAPI.bulkCreate(importPreviewItems)
      const successCount = data.results.length
      const failCount = data.errors.length
      
      setImporting(false)
      setShowPreviewModal(false)
      setImportPreviewItems([])
      load()
      
      if (failCount > 0) {
        toast.success(`Imported ${successCount} products. ${failCount} failed.`, { id: toastId })
        if (data.errors.length > 0) {
          console.error('Some products failed to import:', data.errors)
        }
      } else {
        toast.success(`Successfully imported all ${successCount} products!`, { id: toastId })
      }
    } catch (err) {
      setImporting(false)
      toast.error(err.response?.data?.detail || 'Failed to save products in bulk', { id: toastId })
    }
  }

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Products</h1>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <button onClick={() => setShowBulkDeleteConfirm(true)} className="btn-danger flex items-center gap-1.5 py-2 px-3.5 rounded-xl font-medium shadow-sm transition duration-150 text-sm">
              <Trash2 size={15} /> Delete Selected ({selectedIds.length})
            </button>
          )}
          <input type="file" ref={fileRef} onChange={handleBulkImport} accept=".xlsx,.xls,.png,.jpg,.jpeg,.pdf" className="hidden" />
          <button onClick={() => fileRef.current.click()} className="btn-secondary">
            <Upload size={15} /> Bulk Import
          </button>
          <button onClick={openAdd} className="btn-primary">
            <Plus size={16} /> Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-glass-bar">
        <SearchInput value={search} onChange={v => { setSearch(v); setPage(1) }} placeholder="Search name, SKU, barcode…" className="flex-1 min-w-[200px]" />
        <div className="flex gap-2 items-center flex-shrink-0">
          <GlassSelect
            value={catFilter}
            onChange={v => { setCatFilter(v); setPage(1) }}
            options={[
              { value: '', label: 'All Categories' },
              ...categories.map(c => ({ value: String(c.id), label: c.name }))
            ]}
            placeholder="All Categories"
            className="w-72"
          />
          <button onClick={() => setShowCategoryManager(true)} className="filter-icon-glass" title="Manage Categories">
            <Settings size={15} />
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer select-none">
          <input type="checkbox" checked={lowStock} onChange={e => { setLowStock(e.target.checked); setPage(1) }} className="rounded" />
          Low Stock Only
        </label>
        <button onClick={load} className="filter-icon-glass text-gray-500"><RefreshCw size={15} /></button>
      </div>

      {/* Table */}
      <div className="relative">
        <div className="table-container relative overflow-hidden">
          {loading && products.length > 0 && (
            <div className="table-loading-bar-container">
              <div className="table-loading-bar" />
            </div>
          )}
          <table className="table">
            <thead>
              <tr>
                <th className="w-10">
                  <input
                    type="checkbox"
                    checked={products.length > 0 && products.every(p => selectedIds.includes(p.id))}
                    onChange={e => handleSelectAll(e.target.checked)}
                    className="rounded cursor-pointer"
                  />
                </th>
                {renderHeader('Product', 'name')}
                <th>Pack</th>
                <th>Cases</th>
                {renderHeader('Stock (Qty)', 'stock', true)}
                {renderHeader('Purchase ₹', 'purchase', true)}
                {renderHeader('Sale ₹', 'sale', true)}
                <th>Batch</th>
                {renderHeader('Expiry', 'expiry')}
                <th>GST</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && products.length === 0 ? (
                <tr><td colSpan={12} className="p-0"><TableSkeleton rows={8} cols={10} /></td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={12}>
                  <EmptyState icon={Package} title="No products found"
                    description="Add your first product to get started"
                    action={<button onClick={openAdd} className="btn-primary">Add Product</button>}
                  />
                </td></tr>
              ) : products.map(p => (
                <tr key={p.id} className="animate-fade-in">

                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(p.id)}
                      onChange={e => handleSelectOne(p.id, e.target.checked)}
                      className="rounded cursor-pointer"
                    />
                  </td>
                  <td>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{p.name}</p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-gray-500">
                        {p.category_name && (
                          <span className="cat-glass-chip">
                            {p.category_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{p.pack || '—'}</td>
                  <td>{p.cases !== null && p.cases !== undefined ? p.cases : '—'}</td>
                  <td className="text-right">
                    <div className="text-right">
                      <span className={`font-medium ${p.current_stock <= p.min_stock_alert ? 'text-red-600 font-semibold' : 'text-gray-900 dark:text-white'}`}>
                        {p.current_stock} PCS
                      </span>
                      {p.pack && (
                        <p className="text-xs text-gray-500">
                          {(() => {
                            const match = p.pack.match(/\d+$/);
                            const packSize = match ? parseInt(match[0]) : 1;
                            const cases = Math.floor(p.current_stock / packSize);
                            const loose = p.current_stock % packSize;
                            if (cases > 0 && loose > 0) {
                              return `${cases} Case${cases > 1 ? 's' : ''} + ${loose} Pcs`;
                            } else if (cases > 0) {
                              return `${cases} Case${cases > 1 ? 's' : ''}`;
                            } else {
                              return `${p.current_stock} Pcs`;
                            }
                          })()}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="text-right"><Amount value={p.purchase_price} /></td>
                  <td className="text-right font-semibold text-primary-600"><Amount value={p.selling_price} /></td>
                  <td>{p.batch || '—'}</td>
                  <td className="font-semibold text-orange-600 dark:text-orange-400">{p.expiry || '—'}</td>
                  <td>{p.gst_rate}%</td>
                  <td><StatusBadge status={p.is_active ? 'active' : 'inactive'} /></td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(p)} className="btn-icon text-indigo-600 dark:text-indigo-400"><Edit2 size={14} /></button>
                      <button onClick={() => setDeleteTarget(p)} className="btn-icon text-red-500"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={total} limit={limit} onChange={setPage} />
      </div>

      {/* Add/Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editProduct ? 'Edit Product' : 'Add Product'}
        size="xl"
        footer={<>
          <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : (editProduct ? 'Update' : 'Create')}
          </button>
        </>}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <FormField label="Product Name" required>
              <input className="input" value={form.name} onChange={e => setF('name', e.target.value)} placeholder="e.g. Colgate Toothpaste 200g" />
            </FormField>
          </div>
          <FormField label="Batch">
            <input className="input" value={form.batch || ''} onChange={e => setF('batch', e.target.value)} placeholder="e.g. G26D010419" />
          </FormField>
          <FormField label="Expiry Date">
            <input className="input" value={form.expiry || ''} onChange={e => setF('expiry', e.target.value)} placeholder="e.g. 6/28" />
          </FormField>
          <FormField label="Pack Size">
            <input className="input" value={form.pack || ''} onChange={e => setF('pack', e.target.value)} placeholder="e.g. 1*24" />
          </FormField>
          <FormField label="Cases">
            <input type="number" className="input" value={form.cases !== null && form.cases !== undefined ? form.cases : ''} onChange={e => setF('cases', e.target.value === '' ? null : parseFloat(e.target.value))} />
          </FormField>
          <FormField label="Brand">
            <input className="input" value={form.brand} onChange={e => setF('brand', e.target.value)} />
          </FormField>
          <FormField label="Category">
            <select className="select" value={form.category_id || ''} onChange={e => setF('category_id', e.target.value || '')}>
              <option value="">No Category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Unit">
            <select className="select" value={form.unit} onChange={e => setF('unit', e.target.value)}>
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </FormField>
          <FormField label="GST Rate (%)">
            <select className="select" value={form.gst_rate} onChange={e => setF('gst_rate', e.target.value)}>
              {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
            </select>
          </FormField>
          <FormField label="HSN Code">
            <input className="input" value={form.hsn_code} onChange={e => setF('hsn_code', e.target.value)} />
          </FormField>
          <FormField label="Purchase Price ₹" required>
            <input type="number" className="input" value={form.purchase_price} onChange={e => setF('purchase_price', e.target.value)} step="0.01" min="0" />
          </FormField>
          <FormField label="Selling Price ₹" required>
            <input type="number" className="input" value={form.selling_price} onChange={e => setF('selling_price', e.target.value)} step="0.01" min="0" />
          </FormField>
          <FormField label="Wholesale Price ₹">
            <input type="number" className="input" value={form.wholesale_price} onChange={e => setF('wholesale_price', e.target.value)} step="0.01" min="0" />
          </FormField>
          <FormField label="MRP ₹">
            <input type="number" className="input" value={form.mrp} onChange={e => setF('mrp', e.target.value)} step="0.01" min="0" />
          </FormField>
          <FormField label={editProduct ? "Current Stock" : "Opening Stock"}>
            <input type="number" className="input" value={form.opening_stock} onChange={e => setF('opening_stock', e.target.value)} min="0" />
          </FormField>
          <FormField label="Min Stock Alert">
            <input type="number" className="input" value={form.min_stock_alert} onChange={e => setF('min_stock_alert', e.target.value)} min="0" />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Description">
              <textarea className="input" rows={2} value={form.description} onChange={e => setF('description', e.target.value)} />
            </FormField>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setF('is_active', e.target.checked)} className="rounded" />
            <span className="text-sm text-gray-700 dark:text-gray-300">Active</span>
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget?.id)}
        title="Delete Product"
        message={`Delete "${deleteTarget?.name}"? This action cannot be undone.`}
        danger
      />

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={handleBulkDelete}
        title="Delete Selected Products"
        message={`Delete the ${selectedIds.length} selected products? This action cannot be undone.`}
        danger
      />

      {/* AI Bulk Import Preview Modal */}
      <Modal
        open={showPreviewModal}
        onClose={() => {
          if (!importing) {
            setShowPreviewModal(false)
            setImportPreviewItems([])
          }
        }}
        title="AI Invoice Import Preview"
        size="xl"
        footer={<>
          <button 
            disabled={importing} 
            onClick={() => { setShowPreviewModal(false); setImportPreviewItems([]) }} 
            className="btn-secondary"
          >
            Cancel
          </button>
          <button 
            disabled={importing || importPreviewItems.length === 0} 
            onClick={handleSavePreviewItems} 
            className="btn-primary font-semibold"
          >
            {importing ? 'Saving...' : `Import ${importPreviewItems.length} Products`}
          </button>
        </>}
      >
        <div className="card mb-4 p-3.5 text-sm">
          💡 <strong>AI Analysis Complete!</strong> We have extracted the following products from your invoice. Please review the details below (especially <strong>Selling Price</strong>) and edit them directly in the table if needed before importing.
        </div>
        
        {importPreviewItems.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No products to import.</div>
        ) : (
          <div className="table-container max-h-[60vh] overflow-auto border rounded-xl">
            <table className="table min-w-[1400px] border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 text-xs">
                  <th className="text-left py-2 px-3 min-w-[200px]">Product Name</th>
                  <th className="text-center py-2 px-3 min-w-[80px]">Pack</th>
                  <th className="text-center py-2 px-3 min-w-[80px]">Cases</th>
                  <th className="text-center py-2 px-3 min-w-[90px]">Qty</th>
                  <th className="text-right py-2 px-3 min-w-[100px]">Purchase Rate ₹</th>
                  <th className="text-right py-2 px-3 min-w-[110px]">Final Amount ₹</th>
                  <th className="text-right py-2 px-3 min-w-[100px] font-semibold text-primary-600">Selling Price ₹</th>
                  <th className="text-right py-2 px-3 min-w-[100px]">MRP ₹</th>
                  <th className="text-left py-2 px-3 min-w-[90px]">GST</th>
                  <th className="text-center py-2 px-3 min-w-[130px]">HSN Code</th>
                  <th className="text-center py-2 px-3 min-w-[140px]">Batch</th>
                  <th className="text-center py-2 px-3 min-w-[100px]">Expiry</th>
                  <th className="w-[50px]"></th>
                </tr>
              </thead>
              <tbody>
                {importPreviewItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                    <td className="p-2">
                      <input
                        type="text"
                        className="input py-1 px-2 text-sm w-full font-medium"
                        value={item.name}
                        onChange={e => {
                          const newItems = [...importPreviewItems]
                          newItems[idx].name = e.target.value
                          setImportPreviewItems(newItems)
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        className="input py-1 px-2 text-sm w-full text-center"
                        value={item.pack || ''}
                        placeholder="1*24"
                        onChange={e => {
                          const val = e.target.value
                          const newItems = [...importPreviewItems]
                          newItems[idx].pack = val
                          // Recalculate
                          const packSizeMatch = val.match(/\d+$/)
                          const packSize = packSizeMatch ? parseInt(packSizeMatch[0]) : 1
                          const qty = Math.round((newItems[idx].cases || 0) * packSize)
                          newItems[idx].opening_stock = qty
                          newItems[idx].final_amount = parseFloat((qty * (newItems[idx].purchase_price || 0)).toFixed(2))
                          setImportPreviewItems(newItems)
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        className="input py-1 px-2 text-sm w-full text-center"
                        value={item.cases !== null && item.cases !== undefined ? item.cases : ''}
                        onChange={e => {
                          const val = e.target.value === '' ? null : (parseFloat(e.target.value) || 0)
                          const newItems = [...importPreviewItems]
                          newItems[idx].cases = val
                          // Recalculate
                          const pack = newItems[idx].pack || ''
                          const packSizeMatch = pack.match(/\d+$/)
                          const packSize = packSizeMatch ? parseInt(packSizeMatch[0]) : 1
                          const qty = Math.round(val * packSize)
                          newItems[idx].opening_stock = qty
                          newItems[idx].final_amount = parseFloat((qty * (newItems[idx].purchase_price || 0)).toFixed(2))
                          setImportPreviewItems(newItems)
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        className="input py-1 px-2 text-sm w-full text-center"
                        value={item.opening_stock || 0}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0
                          const newItems = [...importPreviewItems]
                          newItems[idx].opening_stock = val
                          // Recalculate Amount
                          newItems[idx].final_amount = parseFloat((val * (newItems[idx].purchase_price || 0)).toFixed(2))
                          setImportPreviewItems(newItems)
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        className="input py-1 px-2 text-sm w-full text-right"
                        value={item.purchase_price || 0}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0
                          const newItems = [...importPreviewItems]
                          newItems[idx].purchase_price = val
                          // Recalculate Amount
                          newItems[idx].final_amount = parseFloat(((newItems[idx].opening_stock || 0) * val).toFixed(2))
                          setImportPreviewItems(newItems)
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        className="input py-1 px-2 text-sm w-full text-right"
                        value={item.final_amount || 0}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0
                          const newItems = [...importPreviewItems]
                          newItems[idx].final_amount = val
                          setImportPreviewItems(newItems)
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        className="input py-1 px-2 text-sm w-full text-right border-primary-300 focus:border-primary-500 font-semibold text-primary-600"
                        value={item.selling_price || 0}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0
                          const newItems = [...importPreviewItems]
                          newItems[idx].selling_price = val
                          setImportPreviewItems(newItems)
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        className="input py-1 px-2 text-sm w-full text-right"
                        value={item.mrp || 0}
                        onChange={e => {
                          const val = parseFloat(e.target.value) || 0
                          const newItems = [...importPreviewItems]
                          newItems[idx].mrp = val
                          setImportPreviewItems(newItems)
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <select
                        className="select py-1 px-2 text-sm w-full"
                        value={item.gst_rate}
                        onChange={e => {
                          const newItems = [...importPreviewItems]
                          newItems[idx].gst_rate = parseFloat(e.target.value) || 0
                          setImportPreviewItems(newItems)
                        }}
                      >
                        {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        className="input py-1 px-2 text-sm w-full text-center"
                        value={item.hsn_code || ''}
                        onChange={e => {
                          const newItems = [...importPreviewItems]
                          newItems[idx].hsn_code = e.target.value
                          setImportPreviewItems(newItems)
                        }}
                      />
                    </td>
                     <td className="p-2">
                      <input
                        type="text"
                        className="input py-1 px-2 text-sm w-full text-center"
                        value={item.batch || ''}
                        onChange={e => {
                          const newItems = [...importPreviewItems]
                          newItems[idx].batch = e.target.value
                          setImportPreviewItems(newItems)
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        className="input py-1 px-2 text-sm w-full text-center"
                        value={item.expiry || ''}
                        onChange={e => {
                          const newItems = [...importPreviewItems]
                          newItems[idx].expiry = e.target.value
                          setImportPreviewItems(newItems)
                        }}
                      />
                    </td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setImportPreviewItems(importPreviewItems.filter((_, i) => i !== idx))
                        }}
                        className="btn-icon text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Category Manager Modal */}
      <Modal
        open={showCategoryManager}
        onClose={() => setShowCategoryManager(false)}
        title="Manage Categories"
        size="md"
        footer={<button onClick={() => setShowCategoryManager(false)} className="btn-secondary">Close</button>}
      >
        <div className="space-y-5">
          {/* Add Category Form */}
          <form onSubmit={handleAddCategory} className="bg-gray-50 dark:bg-gray-700/20 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
              <FolderPlus size={16} className="text-primary-500" />
              Add New Category
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <input
                className="input"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="Category Name (e.g. Injections)"
                required
              />
              <input
                className="input"
                value={newCatDesc}
                onChange={e => setNewCatDesc(e.target.value)}
                placeholder="Description (optional)"
              />
              <button type="submit" disabled={catSaving} className="btn-primary w-full justify-center">
                {catSaving ? 'Saving…' : 'Add Category'}
              </button>
            </div>
          </form>

          {/* List of Categories */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Existing Categories</h3>
            <div className="max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
              {categories.length === 0 ? (
                <p className="p-4 text-center text-sm text-gray-400">No categories found.</p>
              ) : categories.map(c => (
                <div key={c.id} className="p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <div>
                    <p className="font-medium text-sm text-gray-900 dark:text-white">{c.name}</p>
                    {c.description && <p className="text-xs text-gray-500">{c.description}</p>}
                  </div>
                  <button
                    onClick={() => handleDeleteCategory(c.id)}
                    className="btn-icon text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded p-1.5"
                    title={`Delete category: ${c.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
