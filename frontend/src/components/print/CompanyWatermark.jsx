/**
 * CompanyWatermark — Centered logo watermark at ~6% opacity.
 * Sits absolutely behind all content; never blocks readability.
 * Renders correctly both on screen and during @media print.
 */
export default function CompanyWatermark({ src }) {
  if (!src) return null
  return (
    <div className="print-watermark" aria-hidden="true">
      <img src={src} alt="" className="print-watermark-img" />
    </div>
  )
}
