import { amountInWords } from '@shared/billing/amountInWords'
import { monthlyPledgeInterestAmount, netPaidAmount } from '@shared/billing/pledgeMath'
import { payableAfterOneYear } from '@shared/billing/pledgeLedger'
import type { Pledge } from '@shared/types'
import { formatDisplayDate, formatInr } from '../../lib/format'
import { EMPTY_SHOP_DISPLAY, localImageSrc, type ShopDisplayInfo } from '../print/mapShopDisplay'
import './AdaguReceipt.css'

/** Most article photos that fit beside the item table. */
const MAX_ITEM_PHOTOS = 4

function weight(value: number): string {
  return value.toFixed(3)
}

/** Rupee amounts with Indian grouping: `₹35,000.00`. */
function rupees(value: number): string {
  return `₹${formatInr(value, 2)}`
}

/** KYC numbers are only ever printed masked: `XXXX XXXX 1234`. */
function maskAadhaar(value: string | undefined): string {
  const digits = (value ?? '').replace(/\D/g, '')
  if (digits.length < 4) return ''
  return `XXXX XXXX ${digits.slice(-4)}`
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

/**
 * The Adagu (gold loan) receipt handed to the borrower at sanction: shop
 * header, borrower with photo, loan figures, the pledged articles with their
 * photos, repayment terms and signatures, on one A4 page.
 */
export function PledgePrint({
  pledge,
  shop,
  customerPhotoPath,
}: {
  pledge: Pledge
  shop?: ShopDisplayInfo
  /** Customer profile photo, used when the loan has no borrower photo of its own. */
  customerPhotoPath?: string
}) {
  const shopInfo = shop ?? EMPTY_SHOP_DISPLAY
  const vis = shopInfo.taxVisibility
  const charges = pledge.charges ?? 0
  const netPaid = netPaidAmount(pledge.loanAmount, charges)
  const monthlyInterest = monthlyPledgeInterestAmount(pledge.loanAmount, pledge.interestPct)
  const payableOneYear = payableAfterOneYear(pledge.loanAmount, pledge.interestPct, pledge.pledgeDate)
  const heldItems = pledge.items.filter((item) => !item.releasedAt)
  const releasedItems = pledge.items.filter((item) => item.releasedAt)
  const totalQty = heldItems.reduce((sum, item) => sum + item.pieces, 0)
  const totalGross = heldItems.reduce((sum, item) => sum + item.grossWeight, 0)
  const totalStone = heldItems.reduce((sum, item) => sum + (item.stoneWeight ?? 0), 0)
  const totalNet = heldItems.reduce((sum, item) => sum + item.netWeight, 0)
  const maskedAadhaar = maskAadhaar(pledge.customerAadhaar)
  const pan = (pledge.customerPan ?? '').trim()
  const itemPhotos = (pledge.photos ?? []).filter((photo) => photo.kind === 'item').slice(0, MAX_ITEM_PHOTOS)
  const borrowerPhoto =
    (pledge.photos ?? []).find((photo) => photo.kind === 'customer')?.path || customerPhotoPath || ''
  const note = pledge.notes?.trim()
  const logoSrc = localImageSrc(shopInfo.logoImagePath, '')
  const license = shopInfo.pawnbrokerLicenseNo.trim()
  const phoneLine = shopInfo.phones.filter(Boolean).join(' · ')
  const dense = heldItems.length > 8

  return (
    <div
      className={`tax-invoice-root paper-a4 adr-root${dense ? ' adr-root--dense' : ''}`}
      data-print-root
      data-print-fit="page"
    >
      <article className="tax-invoice adr-sheet">
        {logoSrc ? <img className="print-watermark" src={logoSrc} alt="" aria-hidden /> : null}
        {pledge.status === 'draft' ? (
          <div className="bill-status-watermark" aria-hidden>
            <span>DRAFT</span>
          </div>
        ) : null}

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
              {vis.showTagline && shopInfo.tagline ? <p className="adr-tagline">{shopInfo.tagline}</p> : null}
              {shopInfo.addressLines.length > 0 ? <p>{shopInfo.addressLines.join(', ')}</p> : null}
              {phoneLine ? <p>Ph: {phoneLine}</p> : null}
              {shopInfo.proprietorLines.length > 0 ? <p>{shopInfo.proprietorLines.join(' · ')}</p> : null}
            </div>
          </div>
          <div className="adr-doc">
            <span className="adr-doc-title">Gold Loan Receipt</span>
            <span className="adr-doc-sub">Adagu · Borrower copy</span>
            <span className="adr-doc-no">{pledge.receiptNo}</span>
          </div>
        </header>

        <div className="adr-meta">
          <div>
            <span>Loan date</span>
            <strong>{formatDisplayDate(pledge.pledgeDate)}</strong>
          </div>
          <div>
            <span>Due date</span>
            <strong>{pledge.repaymentDueDate ? formatDisplayDate(pledge.repaymentDueDate) : '—'}</strong>
          </div>
          <div>
            <span>Interest</span>
            <strong>{pledge.interestPct}% per month</strong>
          </div>
          <div>
            <span>{license ? 'Pawnbroker licence' : shopInfo.gstin ? 'GSTIN' : 'Loan type'}</span>
            <strong>{license || shopInfo.gstin || pledge.pledgeType || 'Gold jewellery'}</strong>
          </div>
        </div>

        <div className="adr-parties">
          <section className="adr-card adr-borrower">
            <h2 className="adr-label">Borrower</h2>
            <div className="adr-borrower-body">
              <div className="adr-borrower-photo">
                {borrowerPhoto ? (
                  <img src={localImageSrc(borrowerPhoto, '')} alt="" />
                ) : (
                  <span aria-hidden>{initials(pledge.customerName)}</span>
                )}
              </div>
              <dl className="adr-borrower-fields">
                <div className="adr-borrower-name">
                  <dt className="adr-sr">Name</dt>
                  <dd>{pledge.customerName}</dd>
                </div>
                <div>
                  <dt>S/o · D/o · W/o</dt>
                  <dd>{pledge.guardianName?.trim() || '—'}</dd>
                </div>
                <div>
                  <dt>Mobile</dt>
                  <dd>{pledge.customerPhone?.trim() || '—'}</dd>
                </div>
                <div className="adr-wide">
                  <dt>Address</dt>
                  <dd>{pledge.customerAddress?.trim() || '—'}</dd>
                </div>
                <div>
                  <dt>Aadhaar</dt>
                  <dd>{maskedAadhaar || '—'}</dd>
                </div>
                <div>
                  <dt>PAN</dt>
                  <dd>{pan || '—'}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="adr-card adr-loan">
            <h2 className="adr-label">Loan sanctioned</h2>
            <strong className="adr-loan-amount">{rupees(pledge.loanAmount)}</strong>
            <dl className="adr-loan-rows">
              {pledge.assessedValue > 0 ? (
                <div>
                  <dt>Appraised value</dt>
                  <dd>{rupees(pledge.assessedValue)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Monthly interest</dt>
                <dd>{rupees(monthlyInterest)}</dd>
              </div>
              {charges > 0 ? (
                <div>
                  <dt>Charges deducted</dt>
                  <dd>− {rupees(charges)}</dd>
                </div>
              ) : null}
              <div className="adr-loan-net">
                <dt>Net paid to borrower</dt>
                <dd>{rupees(netPaid)}</dd>
              </div>
              <div>
                <dt>Payable after 1 year</dt>
                <dd>{rupees(payableOneYear)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="adr-articles">
          <h2 className="adr-section-title">
            Pledged articles
            <span>
              {totalQty} {totalQty === 1 ? 'piece' : 'pieces'} · net {weight(totalNet)} g
            </span>
          </h2>
          <div className={`adr-articles-body${itemPhotos.length > 0 ? ' has-photos' : ''}`}>
            <table className="adr-table">
              <thead>
                <tr>
                  <th className="adr-c">#</th>
                  <th>Description</th>
                  <th className="adr-c">Purity</th>
                  <th className="adr-n">Qty</th>
                  <th className="adr-n">Gross (g)</th>
                  <th className="adr-n">Stone (g)</th>
                  <th className="adr-n">Net (g)</th>
                </tr>
              </thead>
              <tbody>
                {heldItems.map((item, index) => (
                  <tr key={item.id}>
                    <td className="adr-c">{index + 1}</td>
                    <td>
                      <span className="adr-item-name">{item.description || 'Gold jewel'}</span>
                      {item.identification ? <span className="adr-item-sub">{item.identification}</span> : null}
                    </td>
                    <td className="adr-c">{item.purity}</td>
                    <td className="adr-n">{item.pieces}</td>
                    <td className="adr-n">{weight(item.grossWeight)}</td>
                    <td className="adr-n">{weight(item.stoneWeight ?? 0)}</td>
                    <td className="adr-n adr-strong">{weight(item.netWeight)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  <td>Total</td>
                  <td />
                  <td className="adr-n">{totalQty}</td>
                  <td className="adr-n">{weight(totalGross)}</td>
                  <td className="adr-n">{weight(totalStone)}</td>
                  <td className="adr-n">{weight(totalNet)}</td>
                </tr>
              </tfoot>
            </table>

            {itemPhotos.length > 0 ? (
              <div className={`adr-photos adr-photos--${itemPhotos.length}`}>
                {itemPhotos.map((photo, index) => (
                  <figure key={photo.id}>
                    <img src={localImageSrc(photo.path, '')} alt={`Pledged article photo ${index + 1}`} />
                  </figure>
                ))}
                <span className="adr-photos-caption">Photo of articles taken at pledge</span>
              </div>
            ) : null}
          </div>

          {releasedItems.length > 0 ? (
            <p className="adr-released">
              <strong>Already released:</strong>{' '}
              {releasedItems
                .map(
                  (item) =>
                    `${item.description || 'Jewel'} (${item.purity}, net ${weight(item.netWeight)} g${
                      item.releasedAt ? `, ${formatDisplayDate(item.releasedAt)}` : ''
                    })`,
                )
                .join('; ')}
            </p>
          ) : null}
        </section>

        <div className="adr-words">
          <span>Amount paid in words</span>
          <strong>{amountInWords(netPaid)}</strong>
        </div>

        <section className="adr-terms">
          <h2 className="adr-section-title">Terms &amp; conditions</h2>
          <ol>
            <li>Bring this original receipt to pay interest or to get the jewellery released.</li>
            <li>Interest is {pledge.interestPct}% per month; a part month is charged as a full month.</li>
            <li>Interest is payable every month. Unpaid interest is added when the loan is closed.</li>
            <li>If the jewellery is not released by the due date, it may be auctioned after written notice.</li>
            <li>The weights above were checked in the borrower&apos;s presence and accepted as correct.</li>
            <li>I declare that the pledged articles are my own property and free of any claim.</li>
          </ol>
          {note ? <p className="adr-note">Note: {note}</p> : null}
        </section>

        <footer className="adr-signatures">
          <div>
            <span className="adr-sign-line" />
            Borrower signature / LTI
          </div>
          <div>
            <span className="adr-sign-line" />
            Appraiser
          </div>
          <div>
            {shopInfo.signatureImagePath ? (
              <img className="adr-sign-img" src={localImageSrc(shopInfo.signatureImagePath, '')} alt="" />
            ) : null}
            <span className="adr-sign-line" />
            {shopInfo.name ? `For ${shopInfo.name}` : 'Authorised signatory'}
          </div>
        </footer>

        <p className="adr-footnote">
          Keep this receipt safe. Loss of the receipt must be reported to the shop at once.
        </p>
      </article>
    </div>
  )
}
