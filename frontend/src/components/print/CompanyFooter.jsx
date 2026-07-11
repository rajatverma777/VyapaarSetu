/**
 * CompanyFooter — Print footer with page numbers, footer notes, and QR code.
 * All sections are optional and controlled by props.
 */
import { useEffect, useRef } from 'react'

export default function CompanyFooter({ footerNotes, website, showPageNumbers, currentPage, totalPages }) {
  const qrRef = useRef(null)

  useEffect(() => {
    if (!website || !qrRef.current) return
    // Generate QR code using a data URL approach via an img element
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${encodeURIComponent(website)}&format=png&margin=1`
    qrRef.current.src = url
  }, [website])

  return (
    <div className="print-footer">
      <div className="print-footer-inner">
        {website && (
          <img
            ref={qrRef}
            alt="QR Code"
            className="print-footer-qr"
          />
        )}
        {footerNotes && (
          <p className="print-footer-notes">{footerNotes}</p>
        )}
        {showPageNumbers && (
          <p className="print-footer-pages">
            {currentPage && totalPages
              ? `Page ${currentPage} of ${totalPages}`
              : 'Page 1'}
          </p>
        )}
      </div>
    </div>
  )
}
