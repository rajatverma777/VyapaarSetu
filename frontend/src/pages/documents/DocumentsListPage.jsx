import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, Plus, Search, Filter, Calendar, User,
  Hash, Copy, Trash2, Eye, Download, ChevronLeft, ChevronRight,
  Archive, CheckCircle2, Clock, X, ArrowUpRight
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { documentsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { EmptyState } from '../../components/ui'

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

  const summaryMetrics = useMemo(() => {
    let finalCount = 0
    let draftCount = 0
    let archivedCount = 0
    docs.forEach(d => {
      if (d.status === 'final') finalCount++
      else if (d.status === 'archived') archivedCount++
      else draftCount++
    })
    return {
      total: total || docs.length,
      finalCount,
      draftCount,
      archivedCount
    }
  }, [docs, total])

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
    if (!window.confirm('Delete this document permanently? This action cannot be undone.')) return
    try {
      await documentsAPI.delete(id)
      toast.success('Document deleted')
      loadDocs()
    } catch {
      toast.error('Failed to delete')
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
          <h1 className="page-title text-2xl font-bold tracking-tight text-gray-900 dark:text-white flex items-center gap-2">
            Documents & Letterheads
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Company letterheads, formal letters, and official communications
          </p>
        </div>
        <button
          onClick={() => navigate('/documents/new')}
          className="btn-primary gap-2 cursor-pointer shadow-lg shadow-blue-500/20"
          id="btn-new-letter"
        >
          <Plus size={16} /> New Letterhead
        </button>
      </div>

      {/* 4 Executive KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Documents */}
        <div
          onClick={() => setStatus('')}
          className={`card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group ${
            status === '' ? 'ring-2 ring-blue-500/40 border-blue-500/50 bg-blue-500/[0.04]' : ''
          }`}
          title="Click to view all documents"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Total Letters</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 dark:border-blue-400/25 group-hover:scale-105 transition-transform">
              <FileText size={16} className="text-[#0071e3] dark:text-[#0a84ff]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              {summaryMetrics.total}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium flex items-center gap-1 group-hover:text-[#0071e3] dark:group-hover:text-[#0a84ff] transition-colors">
              All official documents <ArrowUpRight size={12} />
            </p>
          </div>
        </div>

        {/* Final Documents */}
        <div
          onClick={() => setStatus(status === 'final' ? '' : 'final')}
          className={`card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group ${
            status === 'final' ? 'ring-2 ring-emerald-500/40 border-emerald-500/50 bg-emerald-500/[0.04]' : ''
          }`}
          title="Click to filter final approved documents"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Final / Approved</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-emerald-500/10 dark:bg-emerald-400/15 border border-emerald-500/20 dark:border-emerald-400/25 group-hover:scale-105 transition-transform">
              <CheckCircle2 size={16} className="text-[#34c759] dark:text-[#30d158]" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-650 dark:text-emerald-400">
              {summaryMetrics.finalCount}
            </div>
            <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-1 font-medium">
              Issued & signed documents
            </p>
          </div>
        </div>

        {/* Drafts */}
        <div
          onClick={() => setStatus(status === 'draft' ? '' : 'draft')}
          className={`card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group ${
            status === 'draft' ? 'ring-2 ring-amber-500/40 border-amber-500/50 bg-amber-500/[0.04]' : ''
          }`}
          title="Click to filter draft documents"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Drafts Pending</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-amber-500/10 dark:bg-amber-400/15 border border-amber-500/20 dark:border-amber-400/25 group-hover:scale-105 transition-transform">
              <Clock size={16} className="text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {summaryMetrics.draftCount}
            </div>
            <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-1 font-medium">
              Work in progress
            </p>
          </div>
        </div>

        {/* Archived */}
        <div
          onClick={() => setStatus(status === 'archived' ? '' : 'archived')}
          className={`card p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 cursor-pointer group ${
            status === 'archived' ? 'ring-2 ring-gray-400/40 border-gray-400/50 bg-gray-500/[0.04]' : ''
          }`}
          title="Click to filter archived documents"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Archived</span>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 group-hover:scale-105 transition-transform">
              <Archive size={16} className="text-gray-500 dark:text-gray-400" />
            </div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-gray-700 dark:text-gray-300">
              {summaryMetrics.archivedCount}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-medium">
              Archived letters
            </p>
          </div>
        </div>
      </div>

      {/* Filter Glass Bar */}
      <div className="filter-glass-bar flex items-center justify-between flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-8 py-1.5 text-xs w-full"
            placeholder="Search by reference, title, customer, or subject…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            id="doc-search-input"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            className="select text-xs py-1.5"
            value={status}
            onChange={e => setStatus(e.target.value)}
            id="doc-status-filter"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="final">Final</option>
            <option value="archived">Archived</option>
          </select>
          {(status || search) && (
            <button
              onClick={() => { setStatus(''); setSearch('') }}
              className="btn-secondary text-xs px-2.5 py-1.5"
            >
              Clear
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 ml-auto font-medium">
          Showing {docs.length} of {total} document{total !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Single-Surface Liquid Glass Table */}
      <div className="card overflow-hidden">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Title</th>
                <th>Recipient / Customer</th>
                <th>Subject</th>
                <th>Date</th>
                <th>Status</th>
                <th className="text-center">Prints</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? [...Array(6)].map((_, i) => <DocumentSkeleton key={i} />)
                : docs.length === 0
                  ? (
                    <tr>
                      <td colSpan={8}>
                        <EmptyState
                          icon={FileText}
                          title="No documents found"
                          description="Create formal letterheads, business agreements, or certificates."
                          action={
                            <button
                              onClick={() => navigate('/documents/new')}
                              className="btn-primary"
                            >
                              Create your first letterhead
                            </button>
                          }
                        />
                      </td>
                    </tr>
                  )
                  : docs.map(doc => {
                    const statusCfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.draft
                    return (
                      <tr
                        key={doc.id}
                        onClick={() => navigate(`/documents/${doc.id}`)}
                        className="cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
                      >
                        <td>
                          <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-lg bg-blue-500/10 dark:bg-blue-400/15 border border-blue-500/20 text-[#0071e3] dark:text-[#0a84ff]">
                            {doc.reference}
                          </span>
                        </td>
                        <td className="font-semibold text-gray-900 dark:text-white max-w-[200px] truncate">{doc.title}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-xs font-bold text-gray-700 dark:text-gray-300">
                              {(doc.customer_name || 'C')[0]?.toUpperCase()}
                            </div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{doc.customer_name || '—'}</span>
                          </div>
                        </td>
                        <td className="text-sm max-w-[180px] truncate text-gray-500 dark:text-gray-400">
                          {doc.subject || '—'}
                        </td>
                        <td className="text-xs text-gray-500">{formatDate(doc.date)}</td>
                        <td>
                          <span className={`badge text-[10px] font-bold uppercase tracking-wide ${statusCfg.className}`}>
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="text-xs text-gray-400 text-center font-mono">{doc.print_count || 0}</td>
                        <td className="text-right">
                          <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => navigate(`/documents/${doc.id}`)}
                              className="btn-icon p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-white"
                              title="Edit / View"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={e => handleDownloadPdf(e, doc.id, doc.reference)}
                              className="btn-icon p-1.5 text-blue-600 hover:bg-blue-500/10"
                              title="Download PDF"
                            >
                              <Download size={14} />
                            </button>
                            <button
                              onClick={e => handleDuplicate(e, doc.id)}
                              className="btn-icon p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-white"
                              title="Duplicate"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              onClick={e => handleDelete(e, doc.id)}
                              className="btn-icon p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-500/10"
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
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary text-xs p-2 disabled:opacity-40"
          >
            <ChevronLeft size={15} />
          </button>
          <span className="text-xs text-gray-500 font-medium">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="btn-secondary text-xs p-2 disabled:opacity-40"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </div>
  )
}

