/**
 * CompanySignature — Authorized signatory block at bottom-right.
 * Hidden completely when no signature is configured.
 * Aligns signature image, line, and label in a centered column.
 */
export default function CompanySignature({ signatureSrc, companyName }) {
  if (!signatureSrc) return null
  return (
    <div
      className="print-signature-block"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        minWidth: '160px',
      }}
    >
      <img
        src={signatureSrc}
        alt="Authorized Signatory"
        className="print-signature-img"
        style={{
          maxHeight: '60px',
          width: 'auto',
          objectFit: 'contain',
          marginBottom: '4px',
          mixBlendMode: 'multiply',
        }}
      />
      <div
        className="print-signature-line"
        style={{
          width: '100%',
          borderTop: '0.5px solid #cbd5e1',
          marginTop: '4px',
          marginBottom: '4px',
        }}
      />
      <p
        className="print-signature-label"
        style={{
          fontSize: '7pt',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#94a3b8',
          margin: 0,
        }}
      >
        Authorized Signatory
      </p>
      {companyName && (
        <p
          className="print-signature-company"
          style={{
            fontSize: '8pt',
            fontWeight: '700',
            color: '#0f172a',
            margin: '2px 0 0 0',
          }}
        >
          {companyName}
        </p>
      )}
    </div>
  )
}
