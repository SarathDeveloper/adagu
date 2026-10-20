export type EntryRole = 'field' | 'readonly' | 'multiline' | 'skip'

export type EntryStep =
  | { action: 'ignore' }
  | { action: 'focus'; index: number }
  | { action: 'save' }

export type ControlInfo = {
  tag: 'input' | 'select' | 'textarea' | 'other'
  type?: string
  rows?: number
  disabled?: boolean
  readOnly?: boolean
  hidden?: boolean
}

const FIELD_INPUT_TYPES = new Set([
  'text',
  'search',
  'tel',
  'url',
  'email',
  'password',
  'number',
  'date',
  'time',
  'datetime-local',
  'month',
  'week',
  'checkbox',
  'radio',
])

/** Which controls Enter may land on. Multi-line textareas keep Enter as a newline. */
export function controlRoleFrom(info: ControlInfo): EntryRole {
  if (info.hidden || info.disabled) return 'skip'
  if (info.tag === 'textarea') {
    const rows = info.rows ?? 2
    if (rows > 1) return 'multiline'
    if (info.readOnly) return 'readonly'
    return 'field'
  }
  if (info.tag === 'select') return 'field'
  if (info.tag === 'input') {
    const type = (info.type || 'text').toLowerCase()
    if (!FIELD_INPUT_TYPES.has(type)) return 'skip'
    if (info.readOnly) return 'readonly'
    return 'field'
  }
  return 'skip'
}

export function controlRole(el: HTMLElement): EntryRole {
  if (el instanceof HTMLTextAreaElement) {
    return controlRoleFrom({
      tag: 'textarea',
      rows: el.rows,
      disabled: el.disabled,
      readOnly: el.readOnly,
      hidden: el.hidden,
    })
  }
  if (el instanceof HTMLSelectElement) {
    return controlRoleFrom({
      tag: 'select',
      disabled: el.disabled,
      hidden: el.hidden,
    })
  }
  if (el instanceof HTMLInputElement) {
    return controlRoleFrom({
      tag: 'input',
      type: el.type,
      disabled: el.disabled,
      readOnly: el.readOnly,
      hidden: el.hidden || el.type === 'hidden',
    })
  }
  return 'skip'
}

/**
 * Next or previous editable field. Read-only controls are skipped as destinations.
 * Enter on the last field saves. Shift+Enter on the first field does nothing.
 */
export function entryStep(
  roles: readonly EntryRole[],
  currentIndex: number,
  direction: 'next' | 'previous',
): EntryStep {
  if (currentIndex < 0 || currentIndex >= roles.length) return { action: 'ignore' }
  const current = roles[currentIndex]
  if (current === 'skip' || current === 'multiline') return { action: 'ignore' }
  if (direction === 'next') {
    for (let i = currentIndex + 1; i < roles.length; i++) {
      if (roles[i] === 'field') return { action: 'focus', index: i }
    }
    return { action: 'save' }
  }
  for (let i = currentIndex - 1; i >= 0; i--) {
    if (roles[i] === 'field') return { action: 'focus', index: i }
  }
  return { action: 'ignore' }
}

const OVERLAY_SELECTOR = '.modal-backdrop, .drawer-backdrop'

export function entryControls(root: ParentNode): HTMLElement[] {
  const controls: HTMLElement[] = []
  for (const node of root.querySelectorAll('input, select, textarea')) {
    if (!(node instanceof HTMLElement)) continue
    if (controlRole(node) === 'skip') continue
    controls.push(node)
  }
  return controls
}

export function entrySaveButton(root: ParentNode | null): HTMLButtonElement | null {
  if (!root) return null
  for (const node of root.querySelectorAll('[data-entry-save]')) {
    if (node instanceof HTMLButtonElement && !node.disabled) return node
  }
  return null
}

function entryRegionIn(overlay: Element): HTMLElement | null {
  if (overlay instanceof HTMLElement && overlay.matches('[data-entry]')) return overlay
  const nested = overlay.querySelector('[data-entry]')
  return nested instanceof HTMLElement ? nested : null
}

/** The entry region that should receive Ctrl+S. A dialog on top wins over the page behind it. */
export function resolveEntryRoot(target: EventTarget | null, doc: Document = document): HTMLElement | null {
  const overlays = doc.querySelectorAll(OVERLAY_SELECTOR)
  const top = overlays.length > 0 ? overlays[overlays.length - 1] : null
  const closest = target instanceof Element ? target.closest('[data-entry]') : null
  if (closest instanceof HTMLElement) {
    if (!top || top.contains(closest)) return closest
    return entryRegionIn(top)
  }
  if (top) return entryRegionIn(top)
  const regions = doc.querySelectorAll('[data-entry]')
  if (regions.length === 1 && regions[0] instanceof HTMLElement) return regions[0]
  return null
}
