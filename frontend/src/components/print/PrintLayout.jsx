/**
 * PrintLayout — Multi-Paper-Size Engine  v2
 *
 * Supports: A4 Portrait · A4 Landscape · A5 Portrait · A5 Landscape
 *
 * Architecture:
 *  1. On screen: the outer .print-preview-{size} wrapper fixes paper dimensions.
 *     The .print-page fills 100%×100% of that wrapper. No transform:scale here —
 *     zoom for screen preview is handled by the parent LetterheadPage container.
 *
 *  2. At @media print: the JS-injected <style id="vyapaar-print-page-size"> sets
 *     @page { size: ... } before window.print() fires. The .print-page is 100%
 *     of the physical @page — paper-size-agnostic. No fixed 210mm width.
 *
 *  3. Footer & Signature are FLEX in-flow (margin-top: auto) — NOT position:absolute.
 *     This guarantees they stay inside the printable area on any paper size.
 */
import { useEffect } from 'react'
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
  // zoom is REMOVED from PrintLayout — screen-level scaling is done by the
  // parent container (LetterheadPage preview wrapper), not by transform here.
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

  /* Keep the @page style tag in sync with the current paper_size selection.
     This ensures the browser print preview already shows the correct paper
     even before the user clicks Print. */
  useEffect(() => {
    injectPrintPageSize(paper_size)
  }, [paper_size])

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
    /*
     * Outer wrapper: sets the paper size on screen.
     * On screen  → dimensions fixed by .print-preview-{size} CSS class.
     * On print   → stripped to width:100% by @media print rule #15.
     */
    <div className={config.previewClass}>
      {/*
       * .print-page fills 100% of the wrapper on screen,
       * and 100% of the @page viewport when printing.
       *
       * KEY CHANGE: NO transform:scale() here.
       * Screen zoom is applied by the LetterheadPage preview scaler wrapper.
       * Print zoom is controlled exclusively by @page { size }.
       */}
      <div
        className="print-page"
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

        {/*
         * Content area: flex: 1 pushes footer/signature to the bottom.
         * paddingBottom is removed from here — it's in the outer .print-page padding.
         */}
        <div className="print-content-area">
          {children}
        </div>

        {/*
         * Signature block — in-flow, margin-top: auto pushes it to bottom.
         *
         * ROOT FIX: was position:absolute with bottom: Xmm — that caused
         * clipping on A5 because the page is shorter. Flex flow + margin-top:auto
         * anchors it correctly on every paper size without knowing the page height.
         */}
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

        {/*
         * Footer — in-flow, after signature.
         *
         * ROOT FIX: was position:absolute with bottom: Xmm — same problem as
         * signature above. Now it sits below the signature in the flex column.
         */}
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
