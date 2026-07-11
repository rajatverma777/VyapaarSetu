import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, Plus, Search, Filter, Calendar, User,
  Hash, MoreHorizontal, Copy, Trash2, Eye, Printer,
  Download, ChevronLeft, ChevronRight, Archive
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { documentsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'

const STATUS_CONFIG = {
  draft:    { label: 'Draft',    className: 'badge-amber' },
  final:    { label: 'Final',    className: 'badge-green' },
  archived: { label: 'Archived', className: 'badge-gray' },
}

function DocumentSkeleton() {
  return (
    <tr>
      {[...Array(8)].map((_, i) => (
        <td key={i}><div className="skeleton h-4 rounded w-full" /></td>
      ))}
    </tr>
  )
}

export default function DocumentsListPage() {
  const navigate = useNavigate()
  const { isAdmin } = useAuth()

  const [docs, setDocs]       = useState([])
  const [total, setTotal]     = useState(0)
  const [pages, setPages]     = useState(1)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [status, setStatus]   = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, limit: 25 }
      if (debouncedSearch) params.search = debouncedSearch
      if (status) params.status = status
      const { data } = await documentsAPI.list(params)
      setDocs(data.items || [])
      setTotal(data.total || 0)
      setPages(data.pages || 1)
    } catch {
      toast.error('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, status])

  useEffect(() => { loadDocs() }, [loadDocs])
  useEffect(() => { setPage(1) }, [debouncedSearch, status])

  const handleDuplicate = async (e, id) => {
    e.stopPropagation()
    try {
      const { data } = await documentsAPI.duplicate(id)
      toast.success(`Duplicated → ${data.reference}`)
      loadDocs()
    } catch {
      toast.error('Duplicate failed')
    }
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!window.confirm('Archive this document? It will no longer appear in the main list.')) return
    try {
      await documentsAPI.delete(id)
      toast.success('Document archived')
      loadDocs()
    } catch {
      toast.error('Failed to archive')
    }
  }

  const handleDownloadPdf = async (e, id, ref) => {
    e.stopPropagation()
    const tid = toast.loading('Generating PDF…')
    try {
      const url = await documentsAPI.getPdfBlob(id)
      const a = document.createElement('a')
      a.href = url
      a.download = `Letter-${ref}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF downloaded', { id: tid })
    } catch {
      toast.error('PDF generation failed', { id: tid })
    }
  }

  const formatDate = (d) => {
    if (!d) return '—'
    try { return format(parseISO(d), 'dd MMM yyyy') } catch { return d }
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="page-title">Documents</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Company letterheads, formal letters &amp; official communications
          </p>
        </div>
        <button
          onClick={() => navigate('/documents/new')}
          className="btn-primary"
          id="btn-new-letter"
        >
          <Plus size={15} />
          New Letterhead
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9 w-full"
            placeholder="Search by reference, title, customer, subject…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            id="doc-search-input"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-gray-400" />
          <select
            className="select"
            value={status}
            onChange={e => setStatus(e.target.value)}
            id="doc-status-filter"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="final">Final</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <p className="text-xs text-gray-400 ml-auto">
          {total} document{total !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th><Hash size={12} className="inline mr-1" />Reference</th>
                <th>Title</th>
                <th><User size={12} className="inline mr-1" />Customer / To</th>
                <th>Subject</th>
                <th><Calendar size={12} className="inline mr-1" />Date</th>
                <th>Status</th>
                <th>Prints</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? [...Array(8)].map((_, i) => <DocumentSkeleton key={i} />)
                : docs.length === 0
                  ? (
                    <tr>
                      <td colSpan={8} className="text-center py-14 text-gray-400">
                        <FileText size={36} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium">No documents found</p>
                        <button
                          onClick={() => navigate('/documents/new')}
                          className="btn-primary mt-4 mx-auto"
                        >
                          Create your first letterhead
                        </button>
                      </td>
                    </tr>
                  )
                  : docs.map(doc => {
                    const statusCfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.draft
                    return (
                      <tr
                        key={doc.id}
                        onClick={() => navigate(`/documents/${doc.id}`)}
                        className="cursor-pointer hover:bg-indigo-50/30 dark:hover:bg-white/[0.02] transition-colors"
                      >
                        <td>
                          <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-300">
                            {doc.reference}
                          </span>
                        </td>
                        <td className="font-medium max-w-[200px] truncate">{doc.title}</td>
                        <td className="text-sm text-gray-500">{doc.customer_name || '—'}</td>
                        <td className="text-sm max-w-[180px] truncate text-gray-600 dark:text-gray-400">
                          {doc.subject}
                        </td>
                        <td className="text-sm text-gray-500">{formatDate(doc.date)}</td>
                        <td>
                          <span className={`badge text-[10px] font-bold uppercase tracking-wide ${statusCfg.className}`}>
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="text-sm text-gray-400 text-center">{doc.print_count || 0}</td>
                        <td>
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => navigate(`/documents/${doc.id}`)}
                              className="icon-btn"
                              title="Edit"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={e => handleDownloadPdf(e, doc.id, doc.reference)}
                              className="icon-btn"
                              title="Download PDF"
                            >
                              <Download size={14} />
                            </button>
                            <button
                              onClick={e => handleDuplicate(e, doc.id)}
                              className="icon-btn"
                              title="Duplicate"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              onClick={e => handleDelete(e, doc.id)}
                              className="icon-btn text-red-500 hover:text-red-700 hover:bg-red-500/10 dark:hover:bg-red-500/20"
                              title="Delete Document"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="icon-btn"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="icon-btn"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
