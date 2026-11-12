import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
  title: string
  children: ReactNode
  onClose: () => void
  footer?: ReactNode | null
  className?: string
  hideTitle?: boolean
  /** While true the dialog cannot be dismissed from the backdrop or Escape. */
  busy?: boolean
  /** Set false to require an explicit action (e.g. a button) before closing. */
  dismissible?: boolean
  /**
   * Opt out of the scrollable body wrapper. Used by dialogs that lay out their own
   * header/body/footer inside the modal (print preview, product/inward editors).
   */
  noBodyWrapper?: boolean
  /** Enter moves between fields in this dialog. Ctrl+S clicks `[data-entry-save]`. */
  entry?: boolean
}

const OVERLAY_SELECTOR = '.modal-backdrop, .drawer-backdrop'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute('hidden') && element.getClientRects().length > 0,
  )
}

function isTopOverlay(element: HTMLElement | null) {
  if (!element) return false
  const overlays = document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR)
  return overlays.length > 0 && overlays[overlays.length - 1] === element
}

export function Modal({
  title,
  children,
  onClose,
  footer,
  className,
  hideTitle,
  busy,
  dismissible = true,
  noBodyWrapper,
  entry,
}: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const canClose = dismissible && !busy

  // Move focus into the dialog when it opens and give it back when it closes.
  // Without this, focus stays on the button behind the backdrop, so Tab walks
  // the page underneath and Enter fires that button again.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // A field with autoFocus has already taken focus; otherwise start on the
    // first field, then the first control, then the dialog itself.
    if (!dialog.contains(document.activeElement)) {
      const fields = focusableIn(dialog).filter((element) =>
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName),
      )
      const target = fields[0] ?? focusableIn(dialog)[0] ?? dialog
      target.focus({ preventScroll: true })
    }
    return () => {
      if (previous && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])

  function keepFocusInside(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Tab' || !dialogRef.current) return
    // React events bubble through portals: a confirm dialog opened from this
    // one handles its own Tab, so ignore keys from outside this dialog's DOM.
    if (event.defaultPrevented || !dialogRef.current.contains(event.target as Node)) return
    const items = focusableIn(dialogRef.current)
    if (items.length === 0) {
      event.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const current = document.activeElement
    if (event.shiftKey && (current === first || current === dialogRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && current === last) {
      event.preventDefault()
      first.focus()
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (!canClose) return
      // Only the top-most overlay reacts, so a confirm dialog opened from a modal
      // (or the drawer under it) does not close both at once.
      if (!isTopOverlay(backdropRef.current)) return
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [canClose, onClose])

  const wrapBody = !noBodyWrapper && footer !== null

  return createPortal(
    <div
      ref={backdropRef}
      className="modal-backdrop"
      onClick={canClose ? onClose : undefined}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className={`modal${className ? ` ${className}` : ''}`}
        data-entry={entry ? '' : undefined}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={keepFocusInside}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {hideTitle ? null : <h2>{title}</h2>}
        {wrapBody ? <div className="modal-body">{children}</div> : children}
        {footer !== undefined ? (
          footer
        ) : (
          <div className="modal-actions">
            <button type="button" className="btn secondary" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
