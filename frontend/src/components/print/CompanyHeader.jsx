/**
 * CompanyHeader — Reusable company letterhead header component.
 * Features a modern, balanced two-column layout.
 */
export default function CompanyHeader({ settings = {} }) {
  const {
    company_name, logo_base64, address, city, state, pincode,
    gstin, drug_license, mobile, email, website,
  } = settings

  const addressParts = [address, city, state, pincode].filter(Boolean)
  const addressLine = addressParts.join(', ')

  return (
    <div className="company-header" style={{ marginBottom: '6mm' }}>
      <div className="company-header-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {/* Left Side: Brand identity */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '6px' }}>
            {logo_base64 && (
              <img
                src={logo_base64}
                alt=""
                style={{ height: '14mm', width: 'auto', objectFit: 'contain' }}
              />
            )}
            <h1 className="company-name" style={{ fontSize: '18pt', fontWeight: '800', tracking: '-0.025em', color: '#0f172a', margin: 0 }}>
              {company_name || 'Company Name'}
            </h1>
          </div>
          {addressLine && (
            <p className="company-meta" style={{ fontSize: '8.5pt', color: '#475569', margin: '4px 0 0 0', lineHeight: 1.4 }}>
              {addressLine}
            </p>
          )}
        </div>

        {/* Right Side: Contact info & license data */}
        <div style={{ textAlign: 'right', fontSize: '7.5pt', color: '#64748b', lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '20px', flexShrink: 0 }}>
          {mobile && <div><span style={{ color: '#94a3b8', fontWeight: '500' }}>T:</span> {mobile}</div>}
          {email && <div><span style={{ color: '#94a3b8', fontWeight: '500' }}>E:</span> {email}</div>}
          {website && <div><span style={{ color: '#94a3b8', fontWeight: '500' }}>W:</span> {website}</div>}
          {(gstin || drug_license) && (
            <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '0.5px solid #e2e8f0', fontSize: '7pt', color: '#94a3b8' }}>
              {gstin && <div style={{ marginBottom: '1px' }}>GSTIN: {gstin}</div>}
              {drug_license && <div>DL No: {drug_license}</div>}
            </div>
          )}
        </div>
      </div>
      <div className="company-header-divider" style={{ height: '0.75px', background: '#cbd5e1', marginTop: '6mm' }} />
    </div>
  )
}
