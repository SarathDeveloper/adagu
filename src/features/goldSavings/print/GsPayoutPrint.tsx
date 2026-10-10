import { amountInWords } from '@shared/billing/amountInWords'
import type { GoldSavingRedemption } from '@shared/types'
import { formatDisplayDate } from '../../../lib/format'
import { defaultShopLogoUrl, EMPTY_SHOP_DISPLAY, localImageSrc, type ShopDisplayInfo } from '../../print/mapShopDisplay'
import { paperClassName } from '../../print/paperSize'
import { formatGsPaymentMode } from '../gsLabels'
import './GsReceiptPrint.css'

/** Maturity payout voucher: the customer is paid cash/UPI/bank for their gold. */
export function GsPayoutPrint({
  redemption,
  shop,
  paperSize = 'a4',
}: {
  redemption: GoldSavingRedemption
  shop?: ShopDisplayInfo
  paperSize?: 'a4' | 'a5' | 'thermal'
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const vis = shopInfo.cashVisibility
  const [phone1, phone2] = shopInfo.phones
  const phoneLine = [phone1, phone2].filter(Boolean).join(' · ')
  const totalGrams = redemption.goldWeight + redemption.bonusGoldWeight

  return (
    <div className={`gs-receipt-root ${paperClassName(paperSize)}`} data-print-root data-print-fit="page">
      <article className="gs-receipt">
        <header className="gs-receipt-header">
          <div className="gs-receipt-brand">
            {vis.showLogo ? (
              <img className="gs-receipt-logo" src={localImageSrc(shopInfo.logoImagePath, defaultShopLogoUrl)} alt="" />
            ) : null}
            <div>
              <h1>{shopInfo.name || 'Amman Jewellers'}</h1>
              {shopInfo.addressLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {phoneLine ? <p>Mobile: {phoneLine}</p> : null}
            </div>
            {vis.showBisLogo && shopInfo.bisLogoPath ? (
              <img className="gs-receipt-bis" src={localImageSrc(shopInfo.bisLogoPath, '')} alt="BIS" />
            ) : null}
          </div>
          <h2>Maturity Gold Payout · முதிர்வு தங்க பணம்</h2>
          <div className="gs-receipt-meta">
            <span>Receipt No: {redemption.receiptNo}</span>
            <span>Payout Date: {formatDisplayDate(redemption.redemptionDate)}</span>
          </div>
        </header>

        <section>
          <h3>Customer details</h3>
          <dl>
            <div><dt>Customer name</dt><dd>{redemption.customerName}</dd></div>
            <div><dt>Scheme account</dt><dd>{redemption.accountNo}</dd></div>
          </dl>
        </section>

        <section>
          <h3>Payout calculation</h3>
          <table>
            <tbody>
              <tr><th>Accumulated gold</th><td>{redemption.goldWeight.toFixed(3)} g</td></tr>
              <tr><th>Bonus gold</th><td>{redemption.bonusGoldWeight.toFixed(3)} g</td></tr>
              <tr><th>Total gold paid out</th><td>{totalGrams.toFixed(3)} g</td></tr>
              <tr><th>Gold rate applied</th><td>₹{redemption.goldRate.toFixed(2)} / g</td></tr>
              <tr><th>Payout amount</th><td><strong>₹{redemption.payoutAmount.toFixed(2)}</strong></td></tr>
              <tr><th>Payment mode</th><td>{formatGsPaymentMode(redemption.paymentMode)}</td></tr>
              <tr><th>Transaction reference</th><td>{redemption.transactionRef || '—'}</td></tr>
              <tr><th>Gold balance after payout</th><td>{redemption.remainingGold.toFixed(3)} g</td></tr>
            </tbody>
          </table>
        </section>

        <p className="gs-receipt-words">{amountInWords(redemption.payoutAmount)}</p>
        <p className="gs-receipt-note">
          The scheme gold of {totalGrams.toFixed(3)} g is settled in cash and the scheme balance is now{' '}
          {redemption.remainingGold.toFixed(3)} g. No physical gold or jewellery is handed over. The rate, amount and
          mode on this voucher are final and are not recalculated on reprint.
        </p>

        <footer className="gs-receipt-footer">
          <div>
            <span>Customer signature / வாடிக்கையாளர் கையொப்பம்</span>
          </div>
          <div>
            {shopInfo.signatureImagePath ? (
              <img
                className="gs-receipt-signature-img"
                src={localImageSrc(shopInfo.signatureImagePath, '')}
                alt=""
              />
            ) : null}
            <span>Authorized signature / அங்கீகரிக்கப்பட்ட கையொப்பம்</span>
          </div>
        </footer>
        <p className="gs-receipt-thanks">நன்றி · Thank you for saving with Amman Jewellers.</p>
        <p className="gs-receipt-tnc">
          Terms: A maturity payout values the customer's gold at the rate in force on the payout date. This voucher is
          the only valid proof of the payout.
        </p>
      </article>
    </div>
  )
}
