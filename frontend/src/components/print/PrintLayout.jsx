import { useState, useEffect } from 'react'
import CompanyHeader from './CompanyHeader'
import CompanyWatermark from './CompanyWatermark'
import CompanySignature from './CompanySignature'
import CompanyFooter from './CompanyFooter'

/* ── Paper dimension lookup ──────────────────────────────────────────────────
   Canonical mm dimensions: [width, height] in portrait orientation.
   The `size` string matches CSS @page { size } syntax exactly.
   ─────────────────────────────────────────────────────────────────────────── */
const PAPER_CONFIG = {
  'A4':           { cssSize: 'A4 portrait',   previewClass: 'print-preview-a4-portrait',  w: 210, h: 297 },
  'A4 portrait':  { cssSize: 'A4 portrait',   previewClass: 'print-preview-a4-portrait',  w: 210, h: 297 },
  'A4 landscape': { cssSize: 'A4 landscape',  previewClass: 'print-preview-a4-landscape', w: 297, h: 210 },
  'A5':           { cssSize: 'A5 portrait',   previewClass: 'print-preview-a5-portrait',  w: 148, h: 210 },
  'A5 portrait':  { cssSize: 'A5 portrait',   previewClass: 'print-preview-a5-portrait',  w: 148, h: 210 },
  'A5 landscape': { cssSize: 'A5 landscape',  previewClass: 'print-preview-a5-landscape', w: 210, h: 148 },
}

/**
 * Inject (or update) a <style id="vyapaar-print-page-size"> into <head>.
 * This must be called before every window.print() and whenever paper size changes,
 * so the browser @page rule always matches the user's selection.
 */
export function injectPrintPageSize(paperSize) {
  const config = PAPER_CONFIG[paperSize] || PAPER_CONFIG['A4']
  const cssSize = config.cssSize
  const styleId = 'vyapaar-print-page-size'

  let el = document.getElementById(styleId)
  if (!el) {
    el = document.createElement('style')
    el.id = styleId
    document.head.appendChild(el)
  }
  // Override the @page rule in the browser's CSSOM before print
  el.textContent = `@page { size: ${cssSize}; margin: 0; }`
}

export default function PrintLayout({
  settings = {},
  docPrefs = {},
  children,
  printDebug = false,
}) {
  const {
    show_header     = true,
    show_footer     = true,
    show_watermark  = true,
    show_signature  = true,
    show_page_numbers = true,
    is_confidential = false,
    footer_notes    = '',
    margin_top      = 25,
    margin_right    = 20,
    margin_bottom   = 25,
    margin_left     = 20,
    paper_size      = 'A4',
  } = docPrefs

  const config = PAPER_CONFIG[paper_size] || PAPER_CONFIG['A4']
  const [overflowReport, setOverflowReport] = useState([])

  /* Keep the @page style tag in sync with the current paper_size selection.
     This ensures the browser print preview already shows the correct paper
     even before the user clicks Print. */
  useEffect(() => {
    injectPrintPageSize(paper_size)
  }, [paper_size])

  /* Automatically inspect layout and report elements exceeding page limits in debug mode */
  useEffect(() => {
    if (!printDebug) {
      setOverflowReport([])
      return
    }

    const checkOverflow = () => {
      // Find both active print page instances (preview and print-only)
      const pages = document.querySelectorAll('.print-page')
      if (!pages.length) return

      const reports = []
      pages.forEach((container, pageIdx) => {
        const elements = container.querySelectorAll('*')
        const containerRect = container.getBoundingClientRect()

        elements.forEach((el, elIdx) => {
          // Skip wrappers, overlays, watermarks, and reports
          if (
            el.classList.contains('print-watermark') ||
            el.classList.contains('print-watermark-img') ||
            el.classList.contains('print-confidential-overlay') ||
            el.closest('.no-print')
          ) {
            return
          }

          const rect = el.getBoundingClientRect()
          const isOverflowX = rect.right > containerRect.right + 1.5 // sub-pixel buffer
          const isOverflowY = rect.bottom > containerRect.bottom + 1.5

          if (isOverflowX || isOverflowY) {
            // Apply orange/red highlight border in DOM
            el.style.outline = '1.5px dashed #f97316'
            el.style.outlineOffset = '1px'

            let tagDesc = el.tagName.toLowerCase()
            if (el.id) tagDesc += `#${el.id}`
            if (el.className) {
              const cls = el.className.split(' ').filter(c => typeof c === 'string' && !c.includes(':') && c.length < 25).slice(0, 2).join('.')
              if (cls) tagDesc += `.${cls}`
            }

            reports.push({
              key: `${pageIdx}-${elIdx}`,
              name: tagDesc,
              x: isOverflowX,
              y: isOverflowY,
              amountX: isOverflowX ? Math.round(rect.right - containerRect.right) : 0,
              amountY: isOverflowY ? Math.round(rect.bottom - containerRect.bottom) : 0
            })
          } else {
            // Reset style if it was previously set
            if (el.style.outline.includes('#f97316') || el.style.outline.includes('dashed')) {
              el.style.outline = ''
              el.style.outlineOffset = ''
            }
          }
        })
      })

      // Remove duplicate element descriptions
      const uniqueReports = Array.from(new Map(reports.map(item => [item.name, item])).values())
      setOverflowReport(uniqueReports)
    }

    const timer = setTimeout(checkOverflow, 400)
    return () => clearTimeout(timer)
  }, [printDebug, children, paper_size, margin_top, margin_right, margin_bottom, margin_left])

  const watermarkSrc = show_watermark
    ? (settings.watermark_base64 || settings.logo_base64 || '')
    : ''

  /* Padding comes from user-controlled margins in docPrefs (mm units) */
  const paddingStyle = {
    paddingTop:    `${margin_top}mm`,
    paddingRight:  `${margin_right}mm`,
    paddingBottom: `${margin_bottom}mm`,
    paddingLeft:   `${margin_left}mm`,
  }

  return (
    <div className={`${config.previewClass} ${printDebug ? 'print-debug-wrap' : ''}`} style={{ position: 'relative' }}>
      {/* Visual Debug Banner (On-Screen only) */}
      {printDebug && (
        <div className="no-print flex flex-col gap-1.5 p-3 mb-4 rounded-xl border bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800/40 text-orange-800 dark:text-orange-300 text-[11px] shadow-sm">
          <div className="flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              Print Diagnostics Active
            </span>
            <span className="opacity-75">Target: {config.cssSize}</span>
          </div>
          {overflowReport.length === 0 ? (
            <p className="text-emerald-700 dark:text-emerald-400 font-semibold mt-0.5">
              ✓ Excellent! All elements fit perfectly inside the printable margins.
            </p>
          ) : (
            <div className="space-y-1">
              <p className="font-semibold text-red-600 dark:text-red-400">
                ⚠️ {overflowReport.length} element(s) exceed page limits:
              </p>
              <div className="max-h-24 overflow-y-auto pl-3 border-l-2 border-orange-300 dark:border-orange-800 space-y-1 font-mono text-[10px]">
                {overflowReport.map((rep) => (
                  <div key={rep.key}>
                    <span className="font-bold text-gray-800 dark:text-gray-200">&lt;{rep.name}&gt;</span>
                    {rep.x && ` width +${rep.amountX}px`}
                    {rep.y && ` height +${rep.amountY}px`}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/*
       * .print-page fills 100% of the wrapper on screen,
       * and 100% of the @page viewport when printing.
       */}
      <div
        className={`print-page ${printDebug ? 'print-debug' : ''}`}
        style={paddingStyle}
      >
        {/* Watermark — absolutely positioned behind all content */}
        <CompanyWatermark src={watermarkSrc} />

        {/* CONFIDENTIAL overlay */}
        {is_confidential && (
          <div className="print-confidential-overlay" aria-hidden="true">
            CONFIDENTIAL
          </div>
        )}

        {/* Company Header */}
        {show_header && <CompanyHeader settings={settings} />}

        {/* Content area: flex: 1 pushes footer/signature to the bottom */}
        <div className="print-content-area">
          {children}
        </div>

        {/* Signature block */}
        {show_signature && settings.signature_base64 && (
          <div
            className="print-signature-row"
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: 'auto',
              paddingTop: '6mm',
            }}
          >
            <CompanySignature
              signatureSrc={settings.signature_base64}
              companyName={settings.company_name}
            />
          </div>
        )}

        {/* Footer */}
        {show_footer && (
          <div
            className="print-footer"
            style={{
              marginTop: show_signature && settings.signature_base64 ? '4mm' : 'auto',
              paddingTop: '3mm',
              borderTop: '0.5px solid #cbd5e1',
            }}
          >
            <CompanyFooter
              footerNotes={footer_notes}
              website={settings.website}
              showPageNumbers={show_page_numbers}
            />
          </div>
        )}
      </div>
    </div>
  )
}
