import type { Pledge } from '@shared/types'

/** Drawn stand-ins for jewel photos, so the test print shows the photo panel. */
function sampleJewelPhoto(drawing: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><rect width="200" height="150" fill="#f7f1e3"/>${drawing}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const SAMPLE_CHAIN_PHOTO = sampleJewelPhoto(
  '<path d="M40 30 Q100 160 160 30" fill="none" stroke="#b08433" stroke-width="7" stroke-dasharray="12 6"/><circle cx="100" cy="98" r="13" fill="none" stroke="#b08433" stroke-width="7"/>',
)
const SAMPLE_RING_PHOTO = sampleJewelPhoto(
  '<circle cx="100" cy="88" r="34" fill="none" stroke="#b08433" stroke-width="10"/><path d="M88 46 L100 30 L112 46 L100 58 Z" fill="#b4232f" stroke="#7f1d1d" stroke-width="2"/>',
)

/** Sample Adagu receipt used by Settings > Invoice Settings > Test Print. */
export const SAMPLE_ADAGU_PLEDGE: Pledge = {
  id: 1,
  customerId: 1,
  customerName: 'Ravi Kumar',
  customerPhone: '9876543210',
  customerAddress: 'Salem, Tamil Nadu',
  guardianName: 'Kumar',
  receiptNo: 'ADG0001',
  pledgeDate: '2026-09-25',
  pledgeType: 'GOLD JEWELLERY',
  assessedValue: 50000,
  loanAmount: 35000,
  charges: 250,
  interestPct: 1.5,
  repaymentDueDate: '2026-10-25',
  status: 'active',
  redeemedDate: null,
  amountCollected: 0,
  notes: '',
  renewedFromId: null,
  renewedToId: null,
  createdAt: '2026-09-25T10:30:00.000Z',
  items: [
    {
      id: 1,
      pledgeId: 1,
      description: 'Gold Chain',
      identification: 'Hallmark 916',
      metal: 'gold',
      purity: '22K',
      grossWeight: 8.25,
      stoneWeight: 0.1,
      netWeight: 8.15,
      pieces: 1,
      ratePerGram: 6000,
      itemValue: 48900,
      releasedAt: null,
      releasedPaymentId: null,
    },
    {
      id: 2,
      pledgeId: 1,
      description: 'Gold Ring',
      identification: 'Stone set',
      metal: 'gold',
      purity: '22K',
      grossWeight: 2.1,
      stoneWeight: 0.05,
      netWeight: 2.05,
      pieces: 1,
      ratePerGram: 6000,
      itemValue: 12300,
      releasedAt: null,
      releasedPaymentId: null,
    },
  ],
  topups: [],
  payments: [],
  photos: [
    { id: 1, pledgeId: 1, kind: 'item', path: SAMPLE_CHAIN_PHOTO, createdAt: '2026-09-25T10:30:00.000Z' },
    { id: 2, pledgeId: 1, kind: 'item', path: SAMPLE_RING_PHOTO, createdAt: '2026-09-25T10:30:00.000Z' },
  ],
}
