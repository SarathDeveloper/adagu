/**
 * Fills the local database with sample shop data that covers every Adagu
 * scenario, for trying the app by hand.
 *
 *   npm run seed:sample            (data/pawndesk.db, or PAWNDESK_DATA_DIR)
 *   npm run seed:sample -- --force (seed again even if sample data exists)
 *
 * Everything goes through the real API in-process (supertest), signed in as
 * the existing admin, so KYC, LTV, interest and receipt numbers follow the
 * same rules as the app. The only direct writes move repayment due dates into
 * the past: the API always sets a due date of today or later, so overdue and
 * auction loans cannot be made any other way.
 *
 * Sample customers carry "[sample]" in their notes.
 */
import request from 'supertest'
import { createApp } from '../server/app'
import { createSession, SESSION_COOKIE } from '../server/auth/session'
import { getDatabase, initDatabase } from '../server/db/index'
import { getDbPath } from '../server/db/index'
import { addDaysIso } from '../shared/billing/pledgeMath'
import { localTodayIso } from '../shared/localDate'

const SAMPLE_TAG = '[sample]'
const force = process.argv.includes('--force')

initDatabase()
const db = getDatabase()

const existing = db
  .prepare(`SELECT COUNT(*) AS n FROM customers WHERE notes LIKE ?`)
  .get(`%${SAMPLE_TAG}%`) as { n: number }
if (existing.n > 0 && !force) {
  console.log(`Sample data is already in ${getDbPath()} (${existing.n} sample customers).`)
  console.log('Run with --force to add another set.')
  process.exit(0)
}

const admin = db
  .prepare(
    `SELECT id, username, role, must_change_password FROM users
     WHERE role = 'admin' AND active = 1 ORDER BY id LIMIT 1`,
  )
  .get() as { id: number; username: string; role: 'admin'; must_change_password: number } | undefined
if (!admin) {
  console.error('No admin user found. Start the app once so it creates one, then run this again.')
  process.exit(1)
}
if (admin.must_change_password === 1) {
  console.error(`Sign in to the app as "${admin.username}" and change the password first, then run this again.`)
  process.exit(1)
}
const session = createSession(admin)
const app = createApp()
const cookie = `${SESSION_COOKIE}=${session.id}`

const today = localTodayIso()
const ago = (days: number) => addDaysIso(today, -days)
let failures = 0

type Body = Record<string, any>

async function call(method: 'get' | 'post' | 'put', path: string, body?: unknown): Promise<Body> {
  let req = request(app)[method](path).set('Cookie', cookie)
  if (body !== undefined) req = req.send(body as object)
  const res = await req
  if (res.status >= 400) {
    throw new Error(`${method.toUpperCase()} ${path} -> ${res.status}: ${res.body?.error ?? res.text}`)
  }
  return res.body
}

async function scenario(label: string, run: () => Promise<string | void>): Promise<void> {
  try {
    const detail = await run()
    console.log(`ok    ${label}${detail ? `  (${detail})` : ''}`)
  } catch (error) {
    failures += 1
    console.log(`FAIL  ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ---------------------------------------------------------------- helpers

let phoneSeq = 0
async function customer(
  name: string,
  address: string,
  kyc: { aadhaar?: string; pan?: string } = { aadhaar: randomAadhaar() },
  guardianName = '',
): Promise<number> {
  phoneSeq += 1
  const body = await call('post', '/api/customers', {
    name,
    phone: `90001${String(phoneSeq).padStart(5, '0')}`,
    address,
    guardianName,
    notes: `${SAMPLE_TAG} test customer`,
    aadhaar: kyc.aadhaar ?? '',
    pan: kyc.pan ?? '',
    idProofType: kyc.aadhaar ? 'Aadhaar' : kyc.pan ? 'PAN' : '',
  })
  return body.id
}

function randomAadhaar(): string {
  let digits = String(2 + Math.floor(Math.random() * 7))
  while (digits.length < 12) digits += String(Math.floor(Math.random() * 10))
  return digits
}

type Item = {
  description: string
  metal?: 'Gold' | 'Silver'
  purity?: string
  gross: number
  stone?: number
  rate?: number
}

function items(list: Item[]) {
  return list.map((item) => {
    const net = Math.round((item.gross - (item.stone ?? 0)) * 1000) / 1000
    const rate = item.rate ?? (item.metal === 'Silver' ? 95 : 6800)
    return {
      description: item.description,
      metal: item.metal ?? 'Gold',
      purity: item.purity ?? (item.metal === 'Silver' ? '925' : '22K'),
      grossWeight: item.gross,
      stoneWeight: item.stone ?? 0,
      netWeight: net,
      pieces: 1,
      ratePerGram: rate,
      itemValue: Math.round(net * rate),
    }
  })
}

function assessed(list: ReturnType<typeof items>): number {
  return list.reduce((sum, item) => sum + item.itemValue, 0)
}

/** Creates a loan and, unless `draft`, sanctions it. Returns the pledge. */
async function loan(opts: {
  customerId: number
  daysAgo: number
  items: Item[]
  ltv?: number
  interestPct?: number
  notes?: string
  draft?: boolean
  allowAboveLtv?: boolean
}): Promise<Body> {
  const list = items(opts.items)
  const value = assessed(list)
  const pledge = await call('post', '/api/pledges', {
    customerId: opts.customerId,
    pledgeDate: ago(opts.daysAgo),
    assessedValue: value,
    loanAmount: Math.round((value * (opts.ltv ?? 0.6)) / 100) * 100,
    interestPct: opts.interestPct ?? 2,
    notes: opts.notes ?? '',
    items: list,
    allowAboveLtv: opts.allowAboveLtv,
  })
  if (opts.draft) return pledge
  return call('post', `/api/pledges/${pledge.id}/sanction`, { allowAboveLtv: opts.allowAboveLtv })
}

async function payoff(id: number, date = today): Promise<Body> {
  return call('get', `/api/pledges/${id}/payoff?date=${date}`)
}

/** Collects one month's interest on each given day. */
async function collectInterest(id: number, days: number[], modes = ['cash', 'upi']): Promise<void> {
  for (const [index, daysAgo] of days.entries()) {
    const quote = await payoff(id, ago(daysAgo))
    const amount = Math.max(1, Math.round(quote.interestDue))
    await call('post', `/api/pledges/${id}/collect`, {
      collectedDate: ago(daysAgo),
      amount,
      mode: modes[index % modes.length],
    })
  }
}

/** Puts the repayment due date in the past (the API never allows this). */
function setDueDate(id: number, daysAgo: number): void {
  db.prepare('UPDATE pledges SET repayment_due_date = ? WHERE id = ?').run(ago(daysAgo), id)
}

// ---------------------------------------------------------------- seed

console.log(`Seeding sample data into ${getDbPath()} as ${admin.username}\n`)

await scenario("Today's gold and silver rates", async () => {
  await call('post', '/api/metal-rates', {
    effectiveDate: today,
    gold24k: 7420,
    gold22k: 6800,
    gold20k: 6180,
    gold18k: 5560,
    silverFine: 98,
    silver925: 95,
  })
})

const meena = await customer('Meena Krishnan', '14 Gandhi Road, Salem', { aadhaar: randomAadhaar(), pan: 'ABCPK1234D' }, 'S. Krishnan')
const ravi = await customer('Ravi Kumar', '7 Bazaar Street, Erode', { pan: 'BXRPK5678M' }, 'Murugan')
const lakshmi = await customer('Lakshmi Narayanan', '22 Temple Car Street, Namakkal')
const selvam = await customer('Selvam Pillai', '3 Mill Colony, Tiruppur')
const fathima = await customer('Fathima Begum', '45 Mosque Street, Salem')
const arun = await customer('Arun Prakash', '9 Lake View, Attur')
const kavitha = await customer('Kavitha Raman', '61 North Car Street, Rasipuram')
const murugan = await customer('Murugan Sundaram', '18 Weavers Lane, Komarapalayam')
const priya = await customer('Priya Venkatesh', '5 Anna Nagar, Salem')
const gopal = await customer('Gopal Das', '30 Market Road, Omalur')
const noKyc = await customer('Saravanan (no KYC)', '2 Bus Stand Road, Mettur', {})

await scenario('Draft loan, saved but not sanctioned', async () => {
  const p = await loan({ customerId: lakshmi, daysAgo: 0, draft: true, items: [{ description: 'Gold bangle', gross: 16.2 }] })
  return `draft #${p.id}`
})

await scenario('Draft blocked: customer has no Aadhaar or PAN', async () => {
  const p = await loan({ customerId: noKyc, daysAgo: 0, draft: true, items: [{ description: 'Gold ring', gross: 4.1 }] })
  const settings = await call('get', '/api/settings')
  // Sanctioning is the check itself, so only try it when the shop requires KYC;
  // otherwise it would go through and the loan would stop being a draft.
  if (!settings.adaguRequireKyc) return `draft #${p.id}; turn on "Require KYC" in Settings to see the block`
  const res = await request(app).post(`/api/pledges/${p.id}/sanction`).set('Cookie', cookie).send({})
  if (res.status < 400) throw new Error('sanction should have been refused')
  return `sanction refused: ${res.body?.error}`
})

await scenario('New loan given today, nothing paid', async () => {
  const p = await loan({ customerId: meena, daysAgo: 0, items: [{ description: 'Gold chain 22K', gross: 24.5 }] })
  return p.receiptNo
})

await scenario('Loan 3 months old, interest paid every month', async () => {
  const p = await loan({ customerId: ravi, daysAgo: 92, items: [{ description: 'Gold necklace', gross: 32, stone: 1.5 }] })
  await collectInterest(p.id, [61, 31, 1])
  return p.receiptNo
})

await scenario('Loan 8 months old, no interest paid yet', async () => {
  const p = await loan({ customerId: selvam, daysAgo: 240, items: [{ description: 'Gold stud earrings', gross: 6.4 }, { description: 'Gold ring', gross: 5.2 }] })
  return p.receiptNo
})

await scenario('Part payment towards principal', async () => {
  const p = await loan({ customerId: fathima, daysAgo: 150, ltv: 0.65, items: [{ description: 'Gold haram', gross: 41 }] })
  const quote = await payoff(p.id, ago(20))
  await call('post', `/api/pledges/${p.id}/collect`, {
    collectedDate: ago(20),
    amount: Math.round(quote.interestDue + 25000),
    mode: 'bank_transfer',
  })
  return `${p.receiptNo}, paid interest + 25,000`
})

await scenario('One jewel released from a three-jewel loan', async () => {
  const p = await loan({
    customerId: kavitha,
    daysAgo: 75,
    items: [
      { description: 'Gold chain', gross: 18 },
      { description: 'Gold bangle pair', gross: 30 },
      { description: 'Gold ring', gross: 4.5 },
    ],
  })
  const ring = p.items.find((item: Body) => item.description === 'Gold ring')
  const path = `/api/pledges/${p.id}/items/${ring.id}/release`
  const first = await request(app).post(path).set('Cookie', cookie).send({ date: ago(5), amount: 1, mode: 'cash' })
  const needed = Number(/at least ([\d.]+)/.exec(first.body?.error ?? '')?.[1])
  if (!needed) throw new Error(first.body?.error ?? 'no release quote')
  await call('post', path, { date: ago(5), amount: Math.ceil(needed), mode: 'cash' })
  return `${p.receiptNo}, released the ring for ${Math.ceil(needed)}`
})

await scenario('Top-up: extra money given on an open loan', async () => {
  const p = await loan({ customerId: arun, daysAgo: 120, ltv: 0.45, items: [{ description: 'Gold chain with pendant', gross: 28 }] })
  await call('post', `/api/pledges/${p.id}/topup`, { topupDate: ago(30), amount: 15000, note: 'Hospital expense' })
  return `${p.receiptNo}, +15,000`
})

await scenario('Renewed loan: old ticket closed, new ticket open', async () => {
  const p = await loan({ customerId: murugan, daysAgo: 330, items: [{ description: 'Gold mangalsutra', gross: 22 }] })
  const renewed = await call('post', `/api/pledges/${p.id}/renew`, { renewDate: ago(10), mode: 'cash', note: 'Yearly renewal' })
  return `${p.receiptNo} -> ${renewed.receiptNo ?? `#${renewed.id}`}`
})

await scenario('Redeemed: customer paid in full and took the jewels', async () => {
  const p = await loan({ customerId: priya, daysAgo: 100, items: [{ description: 'Gold bracelet', gross: 12 }] })
  const quote = await payoff(p.id, ago(3))
  await call('post', `/api/pledges/${p.id}/redeem`, { redeemedDate: ago(3), amountCollected: Math.ceil(quote.payoff), mode: 'upi' })
  return p.receiptNo
})

await scenario('Redeemed with a discount given by admin', async () => {
  const p = await loan({ customerId: meena, daysAgo: 200, items: [{ description: 'Gold kammal', gross: 8 }] })
  const quote = await payoff(p.id, ago(1))
  await call('post', `/api/pledges/${p.id}/redeem`, {
    redeemedDate: ago(1),
    amountCollected: Math.ceil(quote.payoff) - 500,
    discount: 500,
    mode: 'cash',
  })
  return `${p.receiptNo}, 500 discount`
})

await scenario('Overdue: due date passed, no notice sent yet', async () => {
  const p = await loan({ customerId: gopal, daysAgo: 395, items: [{ description: 'Gold chain', gross: 15 }] })
  await collectInterest(p.id, [300, 210])
  setDueDate(p.id, 30)
  return `${p.receiptNo}, due ${ago(30)}`
})

await scenario('Auction notice sent, notice period still running', async () => {
  const p = await loan({ customerId: selvam, daysAgo: 420, items: [{ description: 'Gold bangles (2)', gross: 26 }] })
  setDueDate(p.id, 40)
  await call('post', `/api/pledges/${p.id}/auction-notice`, { noticeDate: ago(5) })
  return `${p.receiptNo}, notice ${ago(5)}`
})

await scenario('Notice period over, ready to auction', async () => {
  const p = await loan({ customerId: ravi, daysAgo: 430, items: [{ description: 'Gold chain', gross: 19 }] })
  setDueDate(p.id, 60)
  await call('post', `/api/pledges/${p.id}/auction-notice`, { noticeDate: ago(30) })
  return p.receiptNo
})

/** A loan that went to auction; the sale is `margin` above or below the payoff. */
async function auctioned(customerId: number, item: Item, buyerType: 'outside' | 'shop', margin: number, writeOff = false) {
  const p = await loan({ customerId, daysAgo: 450, ltv: 0.7, items: [item] })
  setDueDate(p.id, 70)
  await call('post', `/api/pledges/${p.id}/auction-notice`, { noticeDate: ago(40) })
  const quote = await payoff(p.id, ago(10))
  const saleAmount = Math.max(0, Math.round(quote.payoff + margin))
  await call('post', `/api/pledges/${p.id}/auction`, {
    auctionDate: ago(10),
    buyerType,
    buyerName: buyerType === 'outside' ? 'Sri Balaji Bullion' : '',
    saleAmount,
    writeOffShortfall: writeOff,
    note: 'Sample auction',
  })
  return { pledge: p, saleAmount }
}

await scenario('Auctioned with surplus, surplus paid back to customer', async () => {
  const { pledge } = await auctioned(fathima, { description: 'Gold necklace', gross: 30 }, 'outside', 6000)
  await call('post', `/api/pledges/${pledge.id}/auction-surplus-paid`, { surplusPaidDate: ago(2), mode: 'cash' })
  return pledge.receiptNo
})

await scenario('Auctioned with surplus still owed to customer', async () => {
  const { pledge } = await auctioned(kavitha, { description: 'Gold chain', gross: 20 }, 'outside', 4000)
  return pledge.receiptNo
})

await scenario('Shop bought at auction, shortfall written off', async () => {
  const { pledge } = await auctioned(murugan, { description: 'Gold ring set', gross: 9 }, 'shop', -2500, true)
  return pledge.receiptNo
})

await scenario('Auction shortfall, part collected from customer', async () => {
  const { pledge } = await auctioned(arun, { description: 'Gold anklet', gross: 14 }, 'outside', -5000)
  await call('post', `/api/pledges/${pledge.id}/collect-shortfall`, { collectedDate: ago(1), amount: 2000, mode: 'upi' })
  return `${pledge.receiptNo}, 2,000 of 5,000 collected`
})

await scenario('Forfeited by admin without an auction', async () => {
  const p = await loan({ customerId: gopal, daysAgo: 500, items: [{ description: 'Old gold coin', gross: 8 }] })
  await call('post', `/api/pledges/${p.id}/forfeit`, { forfeitedDate: ago(15) })
  return p.receiptNo
})

await scenario('Silver articles pledged', async () => {
  const p = await loan({
    customerId: lakshmi,
    daysAgo: 45,
    interestPct: 3,
    items: [
      { description: 'Silver anklets (kolusu)', metal: 'Silver', gross: 180 },
      { description: 'Silver kumkum box', metal: 'Silver', gross: 95 },
    ],
  })
  return p.receiptNo
})

await scenario('Loan above the LTV limit, approved by admin', async () => {
  const p = await loan({ customerId: priya, daysAgo: 20, ltv: 0.9, allowAboveLtv: true, items: [{ description: 'Gold choker', gross: 21 }] })
  return `${p.receiptNo}, 90% of value`
})

await scenario('Customer dues ledger: dues, part payment, settled', async () => {
  const due1 = await call('post', '/api/dues', { customerId: selvam, entryDate: ago(60), kind: 'due', amount: 4500, note: 'Old balance' })
  await call('post', `/api/dues/${due1.id}/payment`, { amount: 2000, entryDate: ago(20), note: 'Part payment', mode: 'cash' })
  const due2 = await call('post', '/api/dues', { customerId: fathima, entryDate: ago(35), kind: 'due', amount: 1200, note: 'Polishing charges' })
  await call('post', `/api/dues/${due2.id}/mark-paid`, { entryDate: ago(4) })
  await call('post', '/api/dues', { customerId: kavitha, entryDate: ago(12), kind: 'due', amount: 800, note: 'Repair charges' })
})

await scenario('Staff login with limited access', async () => {
  const res = await request(app).post('/api/users').set('Cookie', cookie).send({
    username: 'staff',
    password: 'staff123',
    role: 'staff',
    features: ['dashboard', 'adagu', 'customers'],
  })
  if (res.status >= 400 && !/exists|taken|already/i.test(res.body?.error ?? '')) {
    throw new Error(res.body?.error ?? res.text)
  }
  return res.status >= 400 ? 'already there' : 'staff / staff123'
})

console.log(failures === 0 ? '\nSample data added.' : `\nDone with ${failures} failed scenario(s).`)
process.exit(failures === 0 ? 0 : 1)
