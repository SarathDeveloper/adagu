import type { Pledge, PledgeItem } from '@shared/types'
import { formatCurrency, formatDisplayDate, formatWeight } from '../../lib/format'
import { pledgePaymentModeLabel } from '../dues/pledgePaymentModes'
import { EMPTY_SHOP_DISPLAY, type ShopDisplayInfo } from '../print/mapShopDisplay'
import { AdaguPrintSheet, AdaguSignatures } from './AdaguPrintHeader'

function heldItems(pledge: Pledge): PledgeItem[] {
  return pledge.items.filter((item) => !item.releasedAt)
}

export function PledgeItemReleasePrint({
  pledge,
  item,
  shop,
}: {
  pledge: Pledge
  item: PledgeItem
  shop?: ShopDisplayInfo
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const payment = pledge.payments.find((row) => row.id === item.releasedPaymentId)
  const remaining = heldItems(pledge)

  return (
    <AdaguPrintSheet shop={shopInfo} dense>
      <h2 className="adagu-receipt-title">Item release</h2>
      <p className="muted">
        {pledge.receiptNo}
        {item.releasedAt ? ` · ${formatDisplayDate(item.releasedAt)}` : ''}
      </p>
      <p>
        <strong>{pledge.customerName}</strong>
        {pledge.customerPhone ? ` · ${pledge.customerPhone}` : ''}
      </p>
      <h3>Released</h3>
      <p>
        {item.description || 'Jewel'} · {item.metal} {item.purity} · net {formatWeight(item.netWeight, 3)} · value{' '}
        {formatCurrency(item.itemValue)}
      </p>
      <p>
        Amount taken {payment ? formatCurrency(payment.amount) : '—'}
        {payment ? ` · ${pledgePaymentModeLabel(payment.mode)}` : ''}
      </p>
      <h3>Still pledged</h3>
      {remaining.length === 0 ? (
        <p>None</p>
      ) : (
        <ul>
          {remaining.map((row) => (
            <li key={row.id}>
              {row.description || 'Jewel'} · {row.metal} {row.purity} · net {formatWeight(row.netWeight, 3)}
            </li>
          ))}
        </ul>
      )}
      <p>Assessed value remaining {formatCurrency(pledge.assessedValue)}</p>
      <AdaguSignatures left="Customer Signature / LTI" center="Witness" shop={shopInfo} />
    </AdaguPrintSheet>
  )
}
