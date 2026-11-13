import { amountInWords } from '@shared/billing/amountInWords'
import type { PledgePaymentReceipt } from '@shared/types'
import { formatDisplayDate, formatInr } from '../../lib/format'
import { pledgePaymentModeLabel } from '../dues/pledgePaymentModes'
import { EMPTY_SHOP_DISPLAY, localImageSrc, type ShopDisplayInfo } from '../print/mapShopDisplay'
import './AdaguReceipt.css'

/** Rupee amounts with Indian grouping: `₹2,000.00`. */
function rupees(value: number): string {
  return `₹${formatInr(value, 2)}`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

const KIND_TITLES: Record<string, string> = {
  interest: 'Interest Paid Receipt',
  part: 'Payment Receipt',
  redeem: 'Settlement Receipt',
}

/**
 * Half-page (A5) receipt for one collection on an Adagu loan, printed every
 * time interest is collected. Matches the Adagu loan receipt's look.
 */
export function PledgePaymentReceiptPrint({
  receipt,
  shop,
}: {
  receipt: PledgePaymentReceipt
  shop?: ShopDisplayInfo
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const vis = shopInfo.taxVisibility
  const { payment } = receipt
  const title = KIND_TITLES[payment.kind] ?? 'Payment Receipt'
  const logoSrc = localImageSrc(shopInfo.logoImagePath, '')
  const phoneLine = shopInfo.phones.filter(Boolean).join(' · ')
  const license = shopInfo.pawnbrokerLicenseNo.trim()
  const closed = receipt.status !== 'active'

  return (
    <div className="tax-invoice-root paper-a5 adr-root adr-root--a5" data-print-root data-print-fit="page">
      <article className="tax-invoice adr-sheet">
        {logoSrc ? <img className="print-watermark" src={logoSrc} alt="" aria-hidden /> : null}

        <header className="adr-header">
          <div className="adr-brand">
            {vis.showLogo && logoSrc ? (
              <img className="adr-logo" src={logoSrc} alt="" />
            ) : (
              <span className="adr-logo adr-logo--mark" aria-hidden>
                {initials(shopInfo.name || 'Adagu')}
              </span>
            )}
            <div className="adr-shop">
              {shopInfo.name ? <h1>{shopInfo.name}</h1> : null}
              {shopInfo.addressLines.length > 0 ? <p>{shopInfo.addressLines.join(', ')}</p> : null}
              {phoneLine ? <p>Ph: {phoneLine}</p> : null}
              {license ? <p>Pawnbroker Lic. {license}</p> : null}
            </div>
          </div>
        </header>

        <div className="adr-pay-title">
          <span>{title}</span>
          <span className="adr-pay-no">No. {payment.id}</span>
        </div>

        <div className="adr-meta adr-meta--3">
          <div>
            <span>Date</span>
            <strong>{formatDisplayDate(payment.paymentDate)}</strong>
          </div>
          <div>
            <span>Adagu No</span>
            <strong>{receipt.receiptNo}</strong>
          </div>
          <div>
            <span>Paid by</span>
            <strong>{pledgePaymentModeLabel(payment.mode)}</strong>
          </div>
        </div>

        <section className="adr-pay-party">
          <span className="adr-label">Received from</span>
          <strong className="adr-pay-name">{receipt.customerName}</strong>
          <span className="adr-pay-contact">
            {[receipt.guardianName && `S/o · D/o · W/o ${receipt.guardianName}`, receipt.customerPhone]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </section>

        <section className="adr-pay-amount">
          <div className="adr-pay-amount-main">
            <span className="adr-label">Amount received</span>
            <strong>{rupees(payment.amount)}</strong>
            <span className="adr-pay-words">{amountInWords(payment.amount)}</span>
          </div>
          <dl className="adr-loan-rows adr-pay-split">
            <div>
              <dt>Towards interest</dt>
              <dd>{rupees(payment.interestPart)}</dd>
            </div>
            <div>
              <dt>Towards principal</dt>
              <dd>{rupees(payment.principalPart)}</dd>
            </div>
            {payment.discount > 0 ? (
              <div>
                <dt>Discount</dt>
                <dd>{rupees(payment.discount)}</dd>
              </div>
            ) : null}
            {payment.reference ? (
              <div>
                <dt>Reference</dt>
                <dd>{payment.reference}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <div className="adr-pay-status">
          <div>
            <span>Loan amount</span>
            <strong>{rupees(receipt.loanAmount)}</strong>
          </div>
          <div>
            <span>Interest rate</span>
            <strong>{receipt.interestPct}% / month</strong>
          </div>
          <div>
            <span>Balance principal</span>
            <strong>{rupees(receipt.principalAfter)}</strong>
          </div>
          {closed ? (
            <div className="adr-pay-status-wide">
              <span>Loan status</span>
              <strong>Closed — jewellery ready for release</strong>
            </div>
          ) : (
            <>
              <div>
                <span>Interest paid up to</span>
                <strong>{formatDisplayDate(receipt.interestPaidUpto)}</strong>
              </div>
              <div>
                <span>Next interest due</span>
                <strong>{formatDisplayDate(receipt.nextInterestDue)}</strong>
              </div>
              <div>
                <span>Loan date</span>
                <strong>{formatDisplayDate(receipt.pledgeDate)}</strong>
              </div>
            </>
          )}
        </div>

        <footer className="adr-signatures adr-signatures--2">
          <div>
            <span className="adr-sign-line" />
            Customer signature
          </div>
          <div>
            {shopInfo.signatureImagePath ? (
              <img className="adr-sign-img" src={localImageSrc(shopInfo.signatureImagePath, '')} alt="" />
            ) : null}
            <span className="adr-sign-line" />
            {shopInfo.name ? `For ${shopInfo.name}` : 'Authorised signatory'}
          </div>
        </footer>

        <p className="adr-footnote">Bring your Adagu receipt {receipt.receiptNo} for every payment. Thank you.</p>
      </article>
    </div>
  )
}
