import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useParams, useNavigate, useBlocker } from 'react-router-dom'
import {
  Save, Printer, Download, Copy, Trash2, X, ChevronDown,
  FileText, User, Calendar, AlignLeft, Bold, Italic, Underline,
  List, ListOrdered, AlignCenter, AlignRight, AlignJustify,
  Table, Undo, Redo, Eye, EyeOff, ZoomIn, Check, Archive,
  Strikethrough, Minus, CheckSquare, Settings2, Menu
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { useEditor, EditorContent } from '@tiptap/react'
import { Mark } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline_ from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import { Table as TiptapTable } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import { documentsAPI, settingsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import PrintLayout from '../../components/print/PrintLayout'
import { ConfirmDialog } from '../../components/ui'

const FontSizeMark = Mark.create({
  name: 'fontSize',
  addAttributes() {
    return {
      size: {
        default: null,
        parseHTML: element => element.style.fontSize || element.getAttribute('data-size'),
        renderHTML: attributes => {
          if (!attributes.size) return {}
          return { style: `font-size: ${attributes.size}`, 'data-size': attributes.size }
        },
      },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'span[style*=font-size]',
      },
    ]
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', HTMLAttributes, 0]
  },
  addCommands() {
    return {
      setFontSize: size => ({ commands }) => {
        return commands.setMark(this.name, { size })
      },
      unsetFontSize: () => ({ commands }) => {
        return commands.unsetMark(this.name)
      },
    }
  },
})

const ZOOM_OPTIONS = ['auto', 50, 75, 100, 125, 150]

const DEFAULT_DOC = {
  title: '',
  customer_name: '',
  subject: '',
  content: '',
  date: format(new Date(), 'yyyy-MM-dd'),
  status: 'draft',
  paper_size: 'A4',
  show_header: true,
  show_footer: true,
  show_watermark: true,
  show_signature: true,
  show_page_numbers: true,
  is_confidential: false,
  footer_notes: '',
  margin_top: 25,
  margin_right: 20,
  margin_bottom: 25,
  margin_left: 20,
  font_size: 10,
}

// ── Toolbar Button ─────────────────────────────────────────────────────────────
function ToolbarBtn({ onClick, active, title, children, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        flex items-center justify-center w-8 h-8 rounded-lg text-sm transition-all duration-150 flex-shrink-0
        ${active
          ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'
        }
        ${disabled ? 'opacity-30 cursor-not-allowed' : ''}
      `}
    >
      {children}
    </button>
  )
}

// ── Table Insert Modal ─────────────────────────────────────────────────────────
function TableModal({ onInsert, onClose }) {
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="card p-5 w-64 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">Insert Table</h3>
          <button onClick={onClose} className="icon-btn"><X size={14} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Rows</label>
            <input
              type="number" min={1} max={20} value={rows}
              onChange={e => setRows(+e.target.value)}
              className="input text-center"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Columns</label>
            <input
              type="number" min={1} max={10} value={cols}
              onChange={e => setCols(+e.target.value)}
              className="input text-center"
            />
          </div>
        </div>
        <button
          onClick={() => { onInsert(rows, cols); onClose() }}
          className="btn-primary w-full justify-center"
        >
          Insert Table
        </button>
      </div>
    </div>
  )
}

export default function LetterheadPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isAdmin } = useAuth()
  const isEdit = !!id

  const [doc, setDoc]             = useState(DEFAULT_DOC)
  const [reference, setReference] = useState('')
  const [settings, setSettings]   = useState({})
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
   const [hasChanges, setHasChanges] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [zoom, setZoom]           = useState(75)
  const [showTableModal, setShowTableModal] = useState(false)
  const [showDocPanel, setShowDocPanel] = useState(true)
  const [activeTab, setActiveTab] = useState('content') // 'content' | 'settings'
  const [showPrintConfirm, setShowPrintConfirm] = useState(false)
  const [autoZoom, setAutoZoom] = useState(0.5)
  const [previewWidth, setPreviewWidth] = useState(600) // default 600px width
  const previewContainerRef = useRef(null)
  const isResizingRef = useRef(false)

  const autoSaveRef = useRef(null)
  const docRef = useRef(doc)
  const isEditRef = useRef(isEdit)

  docRef.current = doc
  isEditRef.current = isEdit

  // Handles dynamic panel dragging to resize preview vs editor width
  const handleMouseMove = useCallback((e) => {
    if (!isResizingRef.current) return
    // Calculate width from the right side of the window
    const newWidth = window.innerWidth - e.clientX - 24
    if (newWidth >= 350 && newWidth <= 850) {
      setPreviewWidth(newWidth)
    }
  }, [])

  const handleMouseUp = useCallback(() => {
    isResizingRef.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove])

  const startResizing = useCallback((e) => {
    e.preventDefault()
    isResizingRef.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove, handleMouseUp])

  // Auto-adjust preview zoom to fit layout width
  useEffect(() => {
    if (!showPreview || !previewContainerRef.current) return
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const containerWidth = entry.contentRect.width
        const a4Width = 794
        // Calculate scale factor minus padding allowance
        const scale = (containerWidth - 32) / a4Width
        setAutoZoom(Math.max(Math.min(scale, 1.2), 0.35))
      }
    })
    observer.observe(previewContainerRef.current)
    return () => observer.disconnect()
  }, [showPreview])

  // ── TipTap editor ────────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline_,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TiptapTable.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      FontSizeMark,
    ],
    content: doc.content || '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[400px] p-0',
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML()
      setDoc(prev => ({ ...prev, content: html }))
      setHasChanges(true)
    },
  })

  // ── Unsaved changes blocker ───────────────────────────────────────────────────
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasChanges && currentLocation.pathname !== nextLocation.pathname
  )

  // Warn before page unload
  useEffect(() => {
    const handler = e => {
      if (hasChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasChanges])

  // ── Load settings & document ──────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      setLoading(true)
      try {
        const [settingsRes] = await Promise.all([settingsAPI.getCompany()])
        setSettings(settingsRes.data || {})

        if (isEdit) {
          const { data } = await documentsAPI.getById(id)
          const loaded = {
            title: data.title || '',
            customer_name: data.customer_name || '',
            subject: data.subject || '',
            content: data.content || '',
            date: data.date ? data.date.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
            status: data.status || 'draft',
            paper_size: data.paper_size || 'A4',
            show_header: data.show_header !== false,
            show_footer: data.show_footer !== false,
            show_watermark: data.show_watermark !== false,
            show_signature: data.show_signature !== false,
            show_page_numbers: data.show_page_numbers !== false,
            is_confidential: !!data.is_confidential,
            footer_notes: data.footer_notes || '',
            margin_top: data.margin_top || 25,
            margin_right: data.margin_right || 20,
            margin_bottom: data.margin_bottom || 25,
            margin_left: data.margin_left || 20,
            font_size: data.font_size || 10,
          }
          setDoc(loaded)
          setReference(data.reference || '')
          editor?.commands.setContent(data.content || '')
        }
      } catch {
        toast.error('Failed to load document')
      } finally {
        setLoading(false)
        setHasChanges(false)
      }
    }
    init()
  }, [id, isEdit]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save every 30 seconds ────────────────────────────────────────────────
  useEffect(() => {
    autoSaveRef.current = setInterval(async () => {
      if (!isEditRef.current || !docRef.current.title) return
      try {
        await documentsAPI.update(id, { ...docRef.current, content: editor?.getHTML() || '' })
        toast.success('Auto-saved', { duration: 1500, id: 'autosave' })
      } catch { /* silent */ }
    }, 30000)
    return () => clearInterval(autoSaveRef.current)
  }, [id, editor])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        handlePrint()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Setters ───────────────────────────────────────────────────────────────────
  const setField = useCallback((key, val) => {
    setDoc(prev => ({ ...prev, [key]: val }))
    setHasChanges(true)
  }, [])

  // ── Save ──────────────────────────────────────────────────────────────────────
  const handleSave = async (finalStatus) => {
    let titleToSave = doc.title.trim()
    if (!titleToSave) {
      if (doc.subject.trim()) {
        titleToSave = doc.subject.trim()
      } else {
        titleToSave = `Letter - ${format(new Date(), 'dd MMM yyyy')}`
      }
      setField('title', titleToSave)
    }

    if (!doc.subject.trim()) return toast.error('Subject is required')

    setSaving(true)
    const payload = {
      ...doc,
      title: titleToSave,
      content: editor?.getHTML() || '',
      status: finalStatus || doc.status,
    }

    try {
      if (isEdit) {
        await documentsAPI.update(id, payload)
        toast.success('Document saved')
      } else {
        const { data } = await documentsAPI.create(payload)
        toast.success(`Created — ${data.reference}`)
        setHasChanges(false)
        navigate(`/documents/${data.id}`, { replace: true })
        return
      }
      setHasChanges(false)
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleFinalize = () => handleSave('final')

  // ── Print ─────────────────────────────────────────────────────────────────────
  const handlePrint = async () => {
    if (isEdit) await documentsAPI.recordPrint(id).catch(() => {})
    window.print()
  }

  // ── PDF Download ──────────────────────────────────────────────────────────────
  const handleDownloadPdf = async () => {
    if (!isEdit) return toast.error('Save the document first to download PDF')
    const tid = toast.loading('Generating PDF…')
    try {
      const url = await documentsAPI.getPdfBlob(id)
      const a = document.createElement('a')
      a.href = url
      a.download = `Letter-${reference}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF downloaded', { id: tid })
    } catch {
      toast.error('PDF generation failed', { id: tid })
    }
  }

  // ── Duplicate ─────────────────────────────────────────────────────────────────
  const handleDuplicate = async () => {
    if (!isEdit) return toast.error('Save first before duplicating')
    try {
      const { data } = await documentsAPI.duplicate(id)
      toast.success(`Duplicated → ${data.reference}`)
      navigate(`/documents/${data.id}`)
    } catch {
      toast.error('Duplicate failed')
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!window.confirm('Delete this document?')) return
    try {
      await documentsAPI.delete(id)
      toast.success('Document deleted')
      setHasChanges(false)
      navigate('/documents', { replace: true })
    } catch {
      toast.error('Delete failed')
    }
  }

  // ── Insert table ──────────────────────────────────────────────────────────────
  const insertTable = (rows, cols) => {
    editor?.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
  }

  // ── Derived values ────────────────────────────────────────────────────────────
  const previewZoom = zoom === 'auto' ? autoZoom : (zoom / 100)
  const watermarkSrc = doc.show_watermark
    ? (settings.watermark_base64 || settings.logo_base64 || '')
    : ''
  const getSelectedFontSize = () => {
    if (!editor) return doc.font_size || 10
    const attr = editor.getAttributes('fontSize').size
    if (attr) {
      return parseInt(attr, 10) || doc.font_size || 10
    }
    return doc.font_size || 10
  }
  const currentSelFontSize = getSelectedFontSize()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 opacity-30" />
          <div className="text-sm text-gray-400">Loading editor…</div>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Table insert modal */}
      {showTableModal && (
        <TableModal onInsert={insertTable} onClose={() => setShowTableModal(false)} />
      )}

      {/* Unsaved changes blocker confirm modal */}
      {blocker.state === 'blocked' && (
        <ConfirmDialog
          open={true}
          onClose={() => blocker.reset()}
          onConfirm={() => blocker.proceed()}
          title="Unsaved Changes"
          message="You have unsaved changes in this document. Are you sure you want to leave? Your changes will be lost."
          danger
        />
      )}

      <div className="flex flex-col h-full min-h-screen -mt-1 no-print">
        {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap px-2 pb-3 border-b border-gray-200/40 dark:border-white/5 no-print">
          {/* Main Sidebar Toggle */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-sidebar'))}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-all duration-150 flex-shrink-0"
            title="Toggle main navigation sidebar"
          >
            <Menu size={18} />
          </button>

          {/* Back button */}
          <button
            onClick={() => navigate('/documents')}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-xl transition-all duration-150 flex-shrink-0"
            title="Back to Documents List"
          >
            <ChevronDown size={18} className="rotate-90" />
          </button>

          <div className="flex-1 min-w-0">
            <input
              className="text-base font-bold bg-transparent border-none outline-none w-full text-gray-900 dark:text-white placeholder-gray-400"
              placeholder="Document Title…"
              value={doc.title}
              onChange={e => setField('title', e.target.value)}
              id="doc-title-input"
            />
            {reference && (
              <p className="text-xs text-gray-400 font-mono mt-0.5">{reference}</p>
            )}
          </div>

          {/* Status badge */}
          <span className={`badge text-[10px] uppercase font-bold flex-shrink-0 ${
            doc.status === 'final' ? 'badge-green'
              : doc.status === 'archived' ? 'badge-gray'
              : 'badge-amber'
          }`}>
            {doc.status}
          </span>

          <div className="w-px h-5 bg-gray-200 dark:bg-white/10 mx-1 flex-shrink-0" />

          {/* Settings panel toggle */}
          <button
            onClick={() => setShowDocPanel(p => !p)}
            className={`p-2 rounded-xl transition-all duration-150 flex-shrink-0 ${
              showDocPanel
                ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-650 dark:text-indigo-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5'
            }`}
            title="Toggle settings panel"
            id="btn-toggle-options-panel"
          >
            <Settings2 size={16} />
          </button>

          {/* Preview toggle */}
          <button
            onClick={() => setShowPreview(p => !p)}
            className={`p-2 rounded-xl transition-all duration-150 flex-shrink-0 ${
              showPreview
                ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-650 dark:text-indigo-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5'
            }`}
            title="Toggle live preview"
          >
            {showPreview ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>

          {/* Zoom */}
          <select
            className="select text-xs w-28 flex-shrink-0 py-1.5"
            value={zoom}
            onChange={e => {
              const val = e.target.value
              setZoom(val === 'auto' ? 'auto' : +val)
            }}
            id="doc-zoom-select"
          >
            {ZOOM_OPTIONS.map(z => (
              <option key={z} value={z}>{z === 'auto' ? 'Auto (Fit)' : `${z}%`}</option>
            ))}
          </select>

          <div className="w-px h-5 bg-gray-200 dark:bg-white/10 mx-1 flex-shrink-0" />

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0 ml-auto">
            {hasChanges && (
              <span className="text-[10px] text-amber-500 font-semibold animate-pulse mr-1">
                Unsaved Changes
              </span>
            )}
            <button
              onClick={() => handleSave()}
              disabled={saving}
              className="btn-secondary text-xs"
              id="btn-save-draft"
            >
              <Save size={13} />
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              onClick={handleFinalize}
              disabled={saving}
              className="btn-primary text-xs"
              id="btn-finalize"
            >
              <Check size={13} />
              Finalize
            </button>
            {isEdit && (
              <button
                onClick={handleDelete}
                className="btn-secondary text-xs text-red-500 hover:text-red-600 hover:bg-red-500/5 dark:hover:bg-red-500/10 border-red-200 dark:border-white/5"
                id="btn-delete"
                title="Delete Document"
              >
                <Trash2 size={13} />
                Delete
              </button>
            )}
            <button
              onClick={handlePrint}
              className="btn-secondary text-xs"
              title="Print (Ctrl+P)"
              id="btn-print"
            >
              <Printer size={13} />
            </button>
            <button
              onClick={handleDownloadPdf}
              className="btn-secondary text-xs"
              title="Download PDF"
              id="btn-download-pdf"
            >
              <Download size={13} />
            </button>
            {isEdit && (
              <>
                <button
                  onClick={handleDuplicate}
                  className="btn-secondary text-xs"
                  title="Duplicate"
                >
                  <Copy size={13} />
                </button>
                {isAdmin && (
                  <button
                    onClick={handleDelete}
                    className="icon-btn text-red-400 hover:text-red-650"
                    title="Archive"
                  >
                    <Archive size={14} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>


        {/* ── Body ────────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 gap-4 mt-4 overflow-hidden min-h-0">
          {/* Left Panel — Document Metadata */}
          {showDocPanel && (
            <div className="w-64 flex-shrink-0 space-y-4 overflow-y-auto no-print">
              {/* Tabs */}
              <div className="glass-tab-track">
                <button
                  onClick={() => setActiveTab('content')}
                  className={`glass-tab-btn ${activeTab === 'content' ? 'active' : ''}`}
                >
                  <FileText size={12} className="relative z-10" />
                  <span className="relative z-10 text-xs">Document</span>
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  className={`glass-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
                >
                  <Settings2 size={12} className="relative z-10" />
                  <span className="relative z-10 text-xs">Options</span>
                </button>
              </div>

              {activeTab === 'content' && (
                <div className="card p-4 space-y-4">
                  <div>
                    <label className="form-label">Customer / To</label>
                    <input
                      className="input"
                      placeholder="Customer, Hospital, Doctor…"
                      value={doc.customer_name}
                      onChange={e => setField('customer_name', e.target.value)}
                      id="doc-customer-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Reference No.</label>
                    <input
                      className="input opacity-60 bg-gray-50 dark:bg-white/5 cursor-not-allowed"
                      value={reference || 'Auto-generated on save'}
                      readOnly
                      disabled
                    />
                  </div>
                  <div>
                    <label className="form-label">Date</label>
                    <input
                      type="date"
                      className="input"
                      value={doc.date}
                      onChange={e => setField('date', e.target.value)}
                      id="doc-date-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Subject <span className="text-red-400">*</span></label>
                    <input
                      className="input"
                      placeholder="Regarding…"
                      value={doc.subject}
                      onChange={e => setField('subject', e.target.value)}
                      id="doc-subject-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Status</label>
                    <select
                      className="select"
                      value={doc.status}
                      onChange={e => setField('status', e.target.value)}
                      id="doc-status-select"
                    >
                      <option value="draft">Draft</option>
                      <option value="final">Final</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Footer Notes</label>
                    <textarea
                      className="input resize-none"
                      rows={2}
                      placeholder="Optional footer text…"
                      value={doc.footer_notes}
                      onChange={e => setField('footer_notes', e.target.value)}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="card p-4 space-y-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Layout Options</p>

                  {[
                    ['show_header', 'Show Company Header'],
                    ['show_footer', 'Show Footer'],
                    ['show_watermark', 'Show Watermark'],
                    ['show_signature', 'Show Signature'],
                    ['show_page_numbers', 'Show Page Numbers'],
                    ['is_confidential', 'Confidential Overlay'],
                  ].map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                      <button
                        role="switch"
                        aria-checked={!!doc[key]}
                        onClick={() => setField(key, !doc[key])}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 border ${
                          doc[key] ? 'bg-indigo-600 border-transparent' : 'bg-gray-200 dark:bg-white/10 border-gray-200 dark:border-white/5'
                        }`}
                      >
                        <span
                          className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform duration-200 shadow"
                          style={{ transform: doc[key] ? 'translateX(18px)' : 'translateX(2px)' }}
                        />
                      </button>
                    </label>
                  ))}

                  <div className="border-t dark:border-white/5 pt-3 space-y-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Margins (mm)</p>
                    <div className="grid grid-cols-2 gap-2">
                      {[['margin_top','Top'],['margin_right','Right'],['margin_bottom','Bottom'],['margin_left','Left']].map(([k,l]) => (
                        <div key={k}>
                          <label className="text-[10px] text-gray-500">{l}</label>
                          <input
                            type="number" min={5} max={50} className="input text-center text-sm"
                            value={doc[k]} onChange={e => setField(k, +e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Center — Editor */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Editor Toolbar */}
            <div className="card px-2 py-1.5 flex flex-wrap items-center gap-0.5 mb-3 no-print">
              {/* Text style */}
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleBold().run()}
                active={editor?.isActive('bold')}
                title="Bold (Ctrl+B)"
              ><Bold size={13} /></ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleItalic().run()}
                active={editor?.isActive('italic')}
                title="Italic (Ctrl+I)"
              ><Italic size={13} /></ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleUnderline().run()}
                active={editor?.isActive('underline')}
                title="Underline (Ctrl+U)"
              ><Underline size={13} /></ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleStrike().run()}
                active={editor?.isActive('strike')}
                title="Strikethrough"
              ><Strikethrough size={13} /></ToolbarBtn>

              <div className="w-px h-5 bg-gray-200 dark:bg-white/10 mx-1" />

              {/* Alignment */}
              <ToolbarBtn
                onClick={() => editor?.chain().focus().setTextAlign('left').run()}
                active={editor?.isActive({ textAlign: 'left' })}
                title="Align Left"
              ><AlignLeft size={13} /></ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().setTextAlign('center').run()}
                active={editor?.isActive({ textAlign: 'center' })}
                title="Align Center"
              ><AlignCenter size={13} /></ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().setTextAlign('right').run()}
                active={editor?.isActive({ textAlign: 'right' })}
                title="Align Right"
              ><AlignRight size={13} /></ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
                active={editor?.isActive({ textAlign: 'justify' })}
                title="Justify"
              ><AlignJustify size={13} /></ToolbarBtn>

              <div className="w-px h-5 bg-gray-200 dark:bg-white/10 mx-1" />

              {/* Lists */}
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleBulletList().run()}
                active={editor?.isActive('bulletList')}
                title="Bullet List"
              ><List size={13} /></ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                active={editor?.isActive('orderedList')}
                title="Numbered List"
              ><ListOrdered size={13} /></ToolbarBtn>

              <div className="w-px h-5 bg-gray-200 dark:bg-white/10 mx-1" />

              {/* Table */}
              <ToolbarBtn
                onClick={() => setShowTableModal(true)}
                title="Insert Table"
              ><Table size={13} /></ToolbarBtn>

              <div className="w-px h-5 bg-gray-200 dark:bg-white/10 mx-1" />

              {/* Undo/Redo */}
              <ToolbarBtn
                onClick={() => editor?.chain().focus().undo().run()}
                disabled={!editor?.can().undo()}
                title="Undo (Ctrl+Z)"
              ><Undo size={13} /></ToolbarBtn>
              <ToolbarBtn
                onClick={() => editor?.chain().focus().redo().run()}
                disabled={!editor?.can().redo()}
                title="Redo (Ctrl+Y)"
              ><Redo size={13} /></ToolbarBtn>

              <div className="w-px h-5 bg-gray-200 dark:bg-white/10 mx-1" />

              {/* Heading */}
              <select
                className="select text-xs h-8 py-0 px-2 w-28"
                value={
                  editor?.isActive('heading', { level: 1 }) ? 'h1'
                    : editor?.isActive('heading', { level: 2 }) ? 'h2'
                    : editor?.isActive('heading', { level: 3 }) ? 'h3'
                    : 'p'
                }
                onChange={e => {
                  const v = e.target.value
                  if (v === 'p') editor?.chain().focus().setParagraph().run()
                  else editor?.chain().focus().toggleHeading({ level: +v[1] }).run()
                }}
              >
                <option value="p">Paragraph</option>
                <option value="h1">Heading 1</option>
                <option value="h2">Heading 2</option>
                <option value="h3">Heading 3</option>
              </select>

              <div className="w-px h-5 bg-gray-200 dark:bg-white/10 mx-1" />

              {/* Font Size controls */}
              <div className="flex items-center gap-1 bg-gray-50 dark:bg-white/5 border border-gray-200/50 dark:border-white/5 rounded-lg px-1.5 h-8 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const newSize = Math.max(8, currentSelFontSize - 1)
                    editor?.chain().focus().setFontSize(`${newSize}pt`).run()
                  }}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 rounded transition-all text-xs font-bold"
                  title="Decrease Font Size"
                >
                  A-
                </button>
                <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300 min-w-[28px] text-center font-mono">
                  {currentSelFontSize}pt
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const newSize = Math.min(36, currentSelFontSize + 1)
                    editor?.chain().focus().setFontSize(`${newSize}pt`).run()
                  }}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-500 rounded transition-all text-xs font-bold"
                  title="Increase Font Size"
                >
                  A+
                </button>
              </div>

              {/* Separator */}
              <ToolbarBtn
                onClick={() => editor?.chain().focus().setHorizontalRule().run()}
                title="Horizontal Rule"
              ><Minus size={13} /></ToolbarBtn>
            </div>

            {/* Editor area */}
            <div className="flex-1 card p-6 overflow-auto">
              {doc.subject && (
                <p className="text-xs font-semibold text-gray-400 mb-2 no-print">
                  Sub: {doc.subject}
                </p>
              )}
              <div style={{ fontSize: `${doc.font_size || 10}pt` }}>
                <EditorContent
                  editor={editor}
                  className="tiptap-editor"
                  id="rich-editor"
                />
              </div>
            </div>
          </div>

          {/* Draggable Divider */}
          {showPreview && (
            <div
              onMouseDown={startResizing}
              className="w-1.5 hover:w-2 bg-transparent hover:bg-indigo-500/30 cursor-col-resize active:bg-indigo-650 transition-all duration-150 no-print self-stretch flex-shrink-0"
              style={{ zIndex: 10, margin: '0 -3px' }}
            />
          )}

          {/* Right Panel — Live Preview */}
          {showPreview && (
            <div
              style={{ width: `${previewWidth}px` }}
              className="flex-shrink-0 flex flex-col overflow-hidden no-print hidden xl:flex border-l border-gray-200/40 dark:border-white/5 pl-4"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Live Preview
                </p>
                <span className="text-[10px] text-gray-400 font-mono">
                  Scale: {Math.round(previewZoom * 100)}% {zoom === 'auto' ? '(Auto)' : ''}
                </span>
              </div>
              <div
                ref={previewContainerRef}
                className="flex-1 overflow-y-auto overflow-x-hidden bg-gray-100/50 dark:bg-black/20 rounded-2xl p-4 flex justify-center items-start"
              >
                <div
                  style={{
                    width: `${210 * previewZoom}mm`,
                    height: `${297 * previewZoom}mm`,
                    overflow: 'hidden',
                    flexShrink: 0
                  }}
                  className="shadow-xl rounded-lg bg-white border border-gray-200/50 dark:border-white/5 transition-all duration-200"
                >
                  <div
                    style={{
                      transform: `scale(${previewZoom})`,
                      transformOrigin: 'top left',
                      width: '210mm',
                      height: '297mm',
                    }}
                  >
                    <PrintLayout settings={settings} docPrefs={doc} zoom={1}>
                      {/* Meta block */}
                      <div className="print-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '0.5px solid #f1f5f9', paddingBottom: '12px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          {reference && (
                            <div style={{ fontSize: '8.5pt', color: '#64748b' }}>
                              <span style={{ fontWeight: 600, color: '#475569', marginRight: '6px' }}>Ref No:</span>
                              <span style={{ fontFamily: 'monospace', color: '#0f172a' }}>{reference}</span>
                            </div>
                          )}
                          {doc.customer_name && (
                            <div style={{ fontSize: '8.5pt', color: '#64748b', marginTop: '2px' }}>
                              <span style={{ fontWeight: 600, color: '#475569', marginRight: '6px' }}>To:</span>
                              <span style={{ color: '#0f172a', fontWeight: '600' }}>{doc.customer_name}</span>
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {doc.date && (
                            <div style={{ fontSize: '8.5pt', color: '#64748b' }}>
                              <span style={{ fontWeight: 600, color: '#475569', marginRight: '6px' }}>Date:</span>
                              <span style={{ color: '#0f172a' }}>
                                {(() => {
                                  try {
                                    const dateObj = new Date(doc.date);
                                    if (isNaN(dateObj.getTime())) return doc.date;
                                    return dateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });
                                  } catch {
                                    return doc.date;
                                  }
                                })()}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Subject */}
                      {doc.subject && (
                        <div className="print-subject-block" style={{ margin: '14px 0 18px 0', paddingLeft: '8px', borderLeft: '3px solid #6366f1' }}>
                          <h2 style={{ fontSize: '10pt', fontWeight: '700', color: '#0f172a', margin: 0, textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                            Subject: {doc.subject}
                          </h2>
                        </div>
                      )}

                      {/* Content */}
                      <div
                        className="prose prose-sm max-w-none print-body"
                        style={{ fontSize: `${doc.font_size || 10}pt` }}
                        dangerouslySetInnerHTML={{ __html: doc.content || '<p class="text-gray-300">Start typing your letter…</p>' }}
                      />
                    </PrintLayout>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Print-only view ────────────────────────────────────────────────── */}
      <div className="print-only">
        <PrintLayout settings={settings} docPrefs={doc} zoom={1}>
          {/* Meta block */}
          <div className="print-meta" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '0.5px solid #f1f5f9', paddingBottom: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {reference && (
                <div style={{ fontSize: '8.5pt', color: '#64748b' }}>
                  <span style={{ fontWeight: 600, color: '#475569', marginRight: '6px' }}>Ref No:</span>
                  <span style={{ fontFamily: 'monospace', color: '#0f172a' }}>{reference}</span>
                </div>
              )}
              {doc.customer_name && (
                <div style={{ fontSize: '8.5pt', color: '#64748b', marginTop: '2px' }}>
                  <span style={{ fontWeight: 600, color: '#475569', marginRight: '6px' }}>To:</span>
                  <span style={{ color: '#0f172a', fontWeight: '600' }}>{doc.customer_name}</span>
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              {doc.date && (
                <div style={{ fontSize: '8.5pt', color: '#64748b' }}>
                  <span style={{ fontWeight: 600, color: '#475569', marginRight: '6px' }}>Date:</span>
                  <span style={{ color: '#0f172a' }}>
                    {(() => {
                      try {
                        const dateObj = new Date(doc.date);
                        if (isNaN(dateObj.getTime())) return doc.date;
                        return dateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });
                      } catch {
                        return doc.date;
                      }
                    })()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Subject */}
          {doc.subject && (
            <div className="print-subject-block" style={{ margin: '14px 0 18px 0', paddingLeft: '8px', borderLeft: '3px solid #6366f1' }}>
              <h2 style={{ fontSize: '10pt', fontWeight: '700', color: '#0f172a', margin: 0, textTransform: 'uppercase', letterSpacing: '0.025em' }}>
                Subject: {doc.subject}
              </h2>
            </div>
          )}

          {/* Body content */}
          <div
            className="prose prose-sm max-w-none print-body"
            style={{ fontSize: `${doc.font_size || 10}pt` }}
            dangerouslySetInnerHTML={{ __html: doc.content || '' }}
          />
        </PrintLayout>
      </div>
    </>
  )
}
