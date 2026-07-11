/**
 * PrintLayout — A4 paper wrapper.
 * Forces light color scheme so dark mode never bleeds into print.
 * Hides all UI chrome during @media print via CSS class targeting.
 */
import CompanyHeader from './CompanyHeader'
import CompanyWatermark from './CompanyWatermark'
import CompanySignature from './CompanySignature'
import CompanyFooter from './CompanyFooter'

export default function PrintLayout({
  settings = {},
  docPrefs = {},
  children,
  zoom = 1,
}) {
  const {
    show_header = true,
    show_footer = true,
    show_watermark = true,
    show_signature = true,
    show_page_numbers = true,
    is_confidential = false,
    footer_notes = '',
    margin_top = 25,
    margin_right = 20,
    margin_bottom = 25,
    margin_left = 20,
  } = docPrefs

  const watermarkSrc = show_watermark
    ? (settings.watermark_base64 || settings.logo_base64 || '')
    : ''

  const paddingStyle = {
    paddingTop: `${margin_top}mm`,
    paddingRight: `${margin_right}mm`,
    paddingBottom: `${margin_bottom}mm`,
    paddingLeft: `${margin_left}mm`,
  }

  return (
    <div
      className="print-page"
      style={{
        ...paddingStyle,
        transform: `scale(${zoom})`,
        transformOrigin: 'top center'
      }}
    >
      {/* Watermark — behind everything */}
      <CompanyWatermark src={watermarkSrc} />

      {/* CONFIDENTIAL overlay */}
      {is_confidential && (
        <div className="print-confidential-overlay" aria-hidden="true">
          CONFIDENTIAL
        </div>
      )}

      {/* Header */}
      {show_header && <CompanyHeader settings={settings} />}

      {/* Content area */}
      <div className="print-content-area" style={{ paddingBottom: '55mm' }}>
        {children}
      </div>

      {/* Signature */}
      {show_signature && settings.signature_base64 && (
        <div
          className="print-signature-row"
          style={{
            position: 'absolute',
            bottom: `${margin_bottom + 25}mm`,
            right: `${margin_right}mm`,
            left: `${margin_left}mm`, // allow flex alignment if needed
            display: 'flex',
            justifyContent: 'flex-end',
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
            position: 'absolute',
            bottom: `${margin_bottom}mm`,
            left: `${margin_left}mm`,
            right: `${margin_right}mm`,
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
  )
}
