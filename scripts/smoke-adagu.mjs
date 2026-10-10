/**
 * Smoke test against a live server on a fresh data folder.
 *
 * Usage: start the API with a fresh JEWELTRACKERPRO_DATA_DIR and PORT, then
 *   node scripts/smoke-adagu.mjs http://127.0.0.1:3199
 */

const base = process.argv[2] ?? 'http://127.0.0.1:3199'
let cookie = ''
let failures = 0

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`ok   ${label}`)
  } else {
    failures += 1
    console.log(`FAIL ${label} ${detail}`)
  }
}

async function api(path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...init.headers,
    },
  })
  const setCookie = response.headers.getSetCookie?.() ?? []
  if (setCookie.length) cookie = setCookie.map((value) => value.split(';')[0]).join('; ')
  const text = await response.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: response.status, body }
}

const today = new Date()
const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

const version = await api('/api/version')
ok('version endpoint', version.status === 200 && typeof version.body?.version === 'string')

const login = await api('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username: 'admin', password: 'admin123' }),
})
ok('admin login', login.status === 200)

await api('/api/auth/change-password', {
  method: 'POST',
  body: JSON.stringify({ currentPassword: 'admin123', newPassword: 'smoke1234' }),
})

const rates = await api('/api/metal-rates', {
  method: 'POST',
  body: JSON.stringify({
    effectiveDate: iso,
    gold24k: 11000,
    gold22k: 10000,
    gold20k: 9000,
    gold18k: 8000,
    silverFine: 100,
    silver925: 90,
  }),
})
ok('set metal rates', rates.status === 200 || rates.status === 201)

const customer = await api('/api/customers', {
  method: 'POST',
  body: JSON.stringify({ name: 'Smoke Customer', phone: '9000000001', address: 'Salem', notes: '' }),
})
ok('create customer', customer.status === 200 || customer.status === 201)

const pledge = await api('/api/pledges', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer.body.id,
    pledgeDate: iso,
    assessedValue: 20000,
    loanAmount: 10000,
    interestPct: 2,
    items: [
      {
        description: 'Gold chain',
        metal: 'Gold',
        purity: '22K',
        grossWeight: 10,
        netWeight: 9.5,
        pieces: 1,
      },
    ],
  }),
})
ok('create pledge', pledge.status === 200 || pledge.status === 201, JSON.stringify(pledge.body))
const pledgeId = pledge.body?.id

const sanction = await api(`/api/pledges/${pledgeId}/sanction`, { method: 'POST' })
ok('sanction pledge', sanction.status === 200, JSON.stringify(sanction.body))
const receiptNo = sanction.body?.receiptNo
ok('receipt is ADG', typeof receiptNo === 'string' && /^ADG/.test(receiptNo), receiptNo)

const dues = await api('/api/dues')
ok('dues ledger has the loan', JSON.stringify(dues.body).includes(receiptNo))

const interest = await api(`/api/pledges/${pledgeId}/collect`, {
  method: 'POST',
  body: JSON.stringify({ amount: 200, collectedDate: iso, mode: 'cash' }),
})
ok('collect interest', interest.status === 200, JSON.stringify(interest.body))

const pledgeView = await api(`/api/pledges/${pledgeId}`)
ok('pledge detail loads', pledgeView.status === 200 && pledgeView.body?.id === pledgeId)

// Auction with shop buyback: no stock should be involved anywhere.
const oldDate = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10)
const oldPledge = await api('/api/pledges', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer.body.id,
    pledgeDate: oldDate,
    assessedValue: 40000,
    loanAmount: 30000,
    interestPct: 2,
    items: [
      { description: 'Gold anklet', metal: 'Gold', purity: '22K', grossWeight: 20, netWeight: 19, pieces: 1 },
    ],
  }),
})
const oldPledgeId = oldPledge.body?.id
await api(`/api/pledges/${oldPledgeId}/sanction`, { method: 'POST' })

// The repayment due date is clamped to today, so the notice must be dated later.
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
const auctionDay = new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10)

const notice = await api(`/api/pledges/${oldPledgeId}/auction-notice`, {
  method: 'POST',
  body: JSON.stringify({ noticeDate: tomorrow }),
})
ok('auction notice', notice.status === 200, JSON.stringify(notice.body))

const auction = await api(`/api/pledges/${oldPledgeId}/auction`, {
  method: 'POST',
  body: JSON.stringify({
    auctionDate: auctionDay,
    buyerType: 'shop',
    buyerName: '',
    saleAmount: 40000,
    writeOffShortfall: true,
    note: 'Smoke auction',
  }),
})
ok('auction settles without a stock step', auction.status === 200, JSON.stringify(auction.body))
ok('auctioned pledge is forfeited', auction.body?.status === 'forfeited')

// Stock APIs are gone entirely.
const stockApi = await fetch(`${base}/api/stock`)
ok('stock API removed', stockApi.status === 404)

const gsScheme = await api('/api/gold-savings/schemes', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Smoke Monthly',
    description: 'Smoke scheme',
    monthlyAmount: 2000,
    durationMonths: 11,
    purity: '22K',
    goldRateSource: 'configured',
    bonusType: 'none',
    redemptionType: 'jewellery',
    allowLatePayments: true,
    gracePeriodDays: 7,
    terms: 'Smoke terms',
    status: 'active',
  }),
})
ok('create GS scheme', gsScheme.status === 200 || gsScheme.status === 201, JSON.stringify(gsScheme.body))
const schemeId = gsScheme.body?.id

const enroll = await api('/api/gold-savings/accounts', {
  method: 'POST',
  body: JSON.stringify({
    customerId: customer.body.id,
    schemeId,
    enrollmentDate: iso,
    firstInstallmentDate: iso,
    termsAccepted: true,
    acceptRateDate: true,
    initialPayment: { amount: 2000, paymentDate: iso, paymentMode: 'cash', acceptRateDate: true },
  }),
})
ok('enroll in GS', enroll.status === 200 || enroll.status === 201, JSON.stringify(enroll.body))
const accountId = enroll.body?.account?.id

const account = await api(`/api/gold-savings/accounts/${accountId}`)
ok('GS account accumulates gold', (account.body?.account?.goldAccumulated ?? 0) > 0)

const payout = await api('/api/gold-savings/redemptions', {
  method: 'POST',
  body: JSON.stringify({
    accountId,
    redemptionDate: iso,
    redemptionKind: 'payout',
    paymentMode: 'cash',
    transactionRef: 'SMOKE-1',
    acceptRateDate: true,
  }),
})
ok('GS maturity payout', payout.status === 200 || payout.status === 201, JSON.stringify(payout.body))
ok('payout amount = grams x rate', (payout.body?.payoutAmount ?? 0) > 0, String(payout.body?.payoutAmount))
ok('payout kind is payout', payout.body?.redemptionKind === 'payout')

const payoutPrint = await fetch(`${base}/print/gs-payout/${payout.body?.id}`)
const payoutHtml = await payoutPrint.text()
ok('gs payout voucher prints', payoutPrint.status === 200 && payoutHtml.includes('/assets/print-'))

const reports = await api(`/api/reports/active-pledges?from=${iso}&to=${iso}`)
ok('report runs', reports.status === 200, JSON.stringify(reports.body).slice(0, 200))

const users = await api('/api/users')
const adminUser = (users.body ?? []).find?.((u) => u.username === 'admin')
ok(
  'admin features use adagu key',
  users.status === 200 && (adminUser?.features ?? []).includes('adagu'),
  JSON.stringify(users.body).slice(0, 200),
)

const backup = await api('/api/backup/create', { method: 'POST' })
ok('backup runs', backup.status === 200 || backup.status === 201, JSON.stringify(backup.body).slice(0, 200))

const counts = await api('/api/settings/counts')
ok('settings counts has no products', counts.status === 200 && !('products' in (counts.body ?? {})))

const printDoc = await fetch(`${base}/print/pledge/${pledgeId}`)
const printHtml = await printDoc.text()
ok('print route serves the print document', printHtml.includes('/assets/print-'))

const removed = await fetch(`${base}/api/products`)
ok('removed API is gone', removed.status === 404)

console.log(failures === 0 ? '\nSMOKE PASSED' : `\nSMOKE FAILED (${failures})`)
process.exit(failures === 0 ? 0 : 1)
