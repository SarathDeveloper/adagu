import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import type { PledgePaymentReceipt } from '@shared/types'
import { useToast } from '../../components/toastContext'
import { api } from '../../lib/api'
import { formatCurrency } from '../../lib/format'
import { renderPrintPdfBytes } from '../print/downloadPrintPdf'
import { PrintPreviewModal } from '../print/PrintPreviewModal'
import { printPreviewPaths } from '../print/printPreviewPaths'

/**
 * Opens after every Adagu interest collection: the half-page (A5) interest
 * receipt, ready to print, save as PDF or send on WhatsApp. Sending renders the
 * PDF, copies it to the clipboard, opens the customer's chat in WhatsApp
 * Desktop and (on Windows) pastes the PDF in; staff check it and press Enter.
 */
export function PaymentReceiptModal({ paymentId, onClose }: { paymentId: number; onClose: () => void }) {
  const { showToast } = useToast()
  const [receipt, setReceipt] = useState<PledgePaymentReceipt | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<{ copied: boolean; autoPasted: boolean; filePath: string } | null>(null)

  useEffect(() => {
    let active = true
    api
      .getPledgePaymentReceipt(paymentId)
      .then((data) => {
        if (active) setReceipt(data)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [paymentId])

  async function sendOnWhatsApp() {
    try {
      setSending(true)
      const pdf = await renderPrintPdfBytes(printPreviewPaths.pledgePayment(paymentId))
      const result = await api.sendWhatsAppReceipt(paymentId, pdf)
      setSent({ copied: result.copied, autoPasted: result.autoPasted, filePath: result.filePath })
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send the receipt', 'error')
    } finally {
      setSending(false)
    }
  }

  const hasPhone = Boolean(receipt?.customerPhone.trim())
  const title = receipt
    ? `Interest receipt · ${receipt.receiptNo} · ${formatCurrency(receipt.payment.amount)}`
    : 'Interest receipt'

  const notice = sent ? (
    <div className="payment-receipt-next">
      <strong>WhatsApp is open with the message.</strong>
      {sent.autoPasted ? (
        <ol>
          <li>The receipt PDF attaches to the chat by itself in a few seconds. Don&apos;t click other windows meanwhile.</li>
          <li>
            Check the PDF and message, then press <kbd>Enter</kbd> in WhatsApp to send.
          </li>
          <li>
            No PDF after 10 seconds? Click in the chat and press <kbd>Ctrl</kbd> + <kbd>V</kbd>.
          </li>
        </ol>
      ) : sent.copied ? (
        <ol>
          <li>
            Click in the chat and press <kbd>Ctrl</kbd> + <kbd>V</kbd> to attach the receipt PDF.
          </li>
          <li>
            Press <kbd>Enter</kbd> to send.
          </li>
        </ol>
      ) : (
        <>
          <p>The PDF could not be copied. Attach it from:</p>
          <code>{sent.filePath}</code>
        </>
      )}
    </div>
  ) : null

  return (
    <PrintPreviewModal
      title={title}
      path={printPreviewPaths.pledgePayment(paymentId)}
      pdfFilename={`${receipt?.receiptNo ?? 'adagu'}-interest-${paymentId}.pdf`}
      onClose={onClose}
      closeLabel="Done"
      notice={notice}
      extraActions={
        <button
          type="button"
          className="btn secondary"
          onClick={() => void sendOnWhatsApp()}
          disabled={sending || !receipt || !hasPhone}
          title={hasPhone ? 'Copy the PDF and open the WhatsApp chat' : 'Add a mobile number to send on WhatsApp'}
        >
          <MessageCircle size={16} strokeWidth={1.75} aria-hidden />
          {sending ? 'Preparing PDF…' : sent ? 'Send again' : 'Send on WhatsApp'}
        </button>
      }
    />
  )
}
