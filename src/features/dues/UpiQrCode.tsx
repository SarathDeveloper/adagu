import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { buildUpiPayUrl } from '@shared/adagu/reminders'
import { formatCurrency } from '../../lib/format'

/**
 * Exact-amount UPI QR shown on the counter screen. The customer scans it with
 * any UPI app; the amount and note are filled in for them.
 */
export function UpiQrCode({
  upiId,
  payeeName,
  amount,
  note,
}: {
  upiId: string
  payeeName: string
  amount: number
  note: string
}) {
  const payUrl = buildUpiPayUrl({ upiId, payeeName, amount, note })
  const [rendered, setRendered] = useState<{ url: string; image: string } | null>(null)

  useEffect(() => {
    if (!payUrl) return
    let active = true
    QRCode.toDataURL(payUrl, { errorCorrectionLevel: 'M', margin: 1, width: 240 })
      .then((image) => {
        if (active) setRendered({ url: payUrl, image })
      })
      .catch(() => {
        if (active) setRendered(null)
      })
    return () => {
      active = false
    }
  }, [payUrl])

  if (!payUrl) {
    return <p className="upi-qr-hint">Enter an amount to show the UPI QR.</p>
  }
  const image = rendered?.url === payUrl ? rendered.image : null

  return (
    <div className="upi-qr">
      <div className="upi-qr-image">
        {image ? <img src={image} alt={`UPI QR for ${formatCurrency(amount)}`} /> : null}
      </div>
      <div className="upi-qr-text">
        <strong>{formatCurrency(amount)}</strong>
        <span>Scan with any UPI app</span>
        <span className="upi-qr-id">{upiId}</span>
      </div>
    </div>
  )
}
