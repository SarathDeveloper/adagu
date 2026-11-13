import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ADAGU_RECEIPT_TEMPLATE,
  DEFAULT_ADAGU_REMINDER_TEMPLATE,
  buildAdaguWhatsAppUrl,
  buildUpiPayUrl,
  buildWhatsAppTextUrl,
  encodeWhatsAppText,
  isSafeWhatsAppUrl,
  isValidUpiId,
  messageDate,
  normalizeWhatsAppPhone,
  reminderBucket,
  renderAdaguReceiptMessage,
  renderAdaguReminder,
  toWhatsAppDesktopUrl,
  whatsAppUrlPhone,
  whatsAppUrlText,
  withUpiLine,
} from '../../shared/adagu/reminders'

describe('adagu reminder helpers', () => {
  it('fills the template placeholders', () => {
    const text = renderAdaguReminder('Hi {name}, {receiptNo} due {dueDate} interest {interestDue}', {
      name: 'Ravi',
      receiptNo: 'ADG0007',
      interestDue: 420.5,
      dueDate: '10 Oct 2026',
    })
    expect(text).toBe('Hi Ravi, ADG0007 due 10 Oct 2026 interest 420.50')
  })

  it('leaves unknown placeholders untouched', () => {
    expect(
      renderAdaguReminder('{name} {missing}', {
        name: 'Ravi',
        receiptNo: 'ADG0007',
        interestDue: 0,
        dueDate: '',
      }),
    ).toBe('Ravi {missing}')
  })

  it('normalises Indian mobile numbers', () => {
    expect(normalizeWhatsAppPhone('9876543210')).toBe('919876543210')
    expect(normalizeWhatsAppPhone('+91 98765 43210')).toBe('919876543210')
    expect(normalizeWhatsAppPhone('0044 7911 123456')).toBeNull()
    expect(normalizeWhatsAppPhone('12345')).toBeNull()
  })

  it('builds a safe wa.me link with an encoded message', () => {
    const url = buildAdaguWhatsAppUrl('9876543210', DEFAULT_ADAGU_REMINDER_TEMPLATE, {
      name: 'Ravi & Sons',
      receiptNo: 'ADG0007',
      interestDue: 100,
      dueDate: '10 Oct 2026',
    })
    expect(url).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/)
    expect(url).not.toContain('&')
    expect(url).not.toContain('(')
    expect(isSafeWhatsAppUrl(url ?? '')).toBe(true)
  })

  it('returns null when the phone or message is unusable', () => {
    expect(buildAdaguWhatsAppUrl('', DEFAULT_ADAGU_REMINDER_TEMPLATE, {
      name: 'Ravi',
      receiptNo: 'ADG0007',
      interestDue: 0,
      dueDate: '',
    })).toBeNull()
    expect(buildAdaguWhatsAppUrl('9876543210', '   ', {
      name: 'Ravi',
      receiptNo: 'ADG0007',
      interestDue: 0,
      dueDate: '',
    })).toBeNull()
  })

  it('rejects links that are not WhatsApp reminders', () => {
    expect(isSafeWhatsAppUrl('https://wa.me/919876543210?text=Hello')).toBe(true)
    expect(isSafeWhatsAppUrl('https://example.com/evil')).toBe(false)
    expect(isSafeWhatsAppUrl('https://wa.me/919876543210')).toBe(false)
    expect(isSafeWhatsAppUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeWhatsAppUrl('https://wa.me/919876543210?text=a&b=c')).toBe(false)
  })

  it('keeps command-hostile characters out of the encoded text', () => {
    const encoded = encodeWhatsAppText('100% & "quoted" <tag> `x` | pipe')
    expect(encoded).not.toMatch(/[&"<>`|()!*' ]/)
    expect(encodeWhatsAppText('%')).toBe('%25')
  })

  it('adds a UPI line only when a UPI ID is set and the template lacks one', () => {
    expect(withUpiLine('Hi {name}', '')).toBe('Hi {name}')
    expect(withUpiLine('Hi {name}', 'shop@okaxis')).toBe('Hi {name}\nPay by UPI: {upiId}')
    expect(withUpiLine('Pay {upiId}', 'shop@okaxis')).toBe('Pay {upiId}')
    const text = renderAdaguReminder(withUpiLine('Total {totalDue}', 'shop@okaxis'), {
      name: 'Ravi',
      receiptNo: 'ADG0007',
      interestDue: 0,
      dueDate: '',
      totalDue: 1500,
      upiId: 'shop@okaxis',
    })
    expect(text).toBe('Total 1500.00\nPay by UPI: shop@okaxis')
  })

  it('converts a safe wa.me link to the WhatsApp Desktop form and reads it back', () => {
    const url = buildWhatsAppTextUrl('9876543210', 'Paid Rs.500 & thanks')
    expect(url).not.toBeNull()
    expect(isSafeWhatsAppUrl(url ?? '')).toBe(true)
    expect(whatsAppUrlPhone(url ?? '')).toBe('919876543210')
    expect(whatsAppUrlText(url ?? '')).toBe('Paid Rs.500 & thanks')
    expect(toWhatsAppDesktopUrl(url ?? '')).toBe(
      `whatsapp://send?phone=919876543210&text=${encodeWhatsAppText('Paid Rs.500 & thanks')}`,
    )
    expect(toWhatsAppDesktopUrl('https://example.com/?text=x')).toBeNull()
    expect(buildWhatsAppTextUrl('123', 'hi')).toBeNull()
  })

  it('builds an exact-amount UPI intent and validates UPI IDs', () => {
    expect(isValidUpiId('shop.name@okaxis')).toBe(true)
    expect(isValidUpiId('9876543210@ybl')).toBe(true)
    expect(isValidUpiId('no-at-sign')).toBe(false)
    expect(isValidUpiId('a@b c')).toBe(false)
    expect(
      buildUpiPayUrl({ upiId: 'shop@okaxis', payeeName: 'Sri Jewels & Co', amount: 2000, note: 'ADG0003 interest' }),
    ).toBe('upi://pay?pa=shop%40okaxis&pn=Sri%20Jewels%20%26%20Co&am=2000.00&cu=INR&tn=ADG0003%20interest')
    expect(buildUpiPayUrl({ upiId: 'shop@okaxis', payeeName: '', amount: 0 })).toBeNull()
    expect(buildUpiPayUrl({ upiId: 'bad', payeeName: '', amount: 10 })).toBeNull()
  })

  it('groups reminders into overdue, today, this week and later', () => {
    expect(reminderBucket(-3)).toBe('overdue')
    expect(reminderBucket(0)).toBe('today')
    expect(reminderBucket(1)).toBe('week')
    expect(reminderBucket(7)).toBe('week')
    expect(reminderBucket(8)).toBe('later')
  })

  it('renders the receipt message and customer-facing dates', () => {
    expect(messageDate('2026-11-13')).toBe('13 Nov 2026')
    expect(messageDate('soon')).toBe('soon')
    const text = renderAdaguReceiptMessage(DEFAULT_ADAGU_RECEIPT_TEMPLATE, {
      name: 'Meena',
      receiptNo: 'ADG0003',
      amount: 2000,
      date: '13 Nov 2026',
      paidUpto: '13 Dec 2026',
      principal: 100000,
      shopName: 'Sri Jewels',
      reference: '',
    })
    expect(text).toContain('Rs.2000.00')
    expect(text).toContain('ADG0003')
    expect(text).toContain('13 Dec 2026')
    expect(text).toContain('Sri Jewels')
  })
})
