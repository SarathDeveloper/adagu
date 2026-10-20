import { useEffect } from 'react'
import { controlRole, entryControls, entrySaveButton, entryStep, resolveEntryRoot } from '../lib/formEntry'

function isSaveChord(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    (event.key.toLowerCase() === 's' || event.code === 'KeyS')
  )
}

/**
 * Enter moves to the next field inside `[data-entry]`. Ctrl+S (Cmd+S) clicks `[data-entry-save]`.
 * Mounted once for the application shell. Print documents do not load this.
 */
export function FormEntryKeys() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.isComposing || event.defaultPrevented) return

      if (isSaveChord(event)) {
        event.preventDefault()
        if (event.repeat) return
        entrySaveButton(resolveEntryRoot(event.target))?.click()
        return
      }

      if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey) return
      if (!(event.target instanceof HTMLElement) || event.target.isContentEditable) return
      const root = event.target.closest('[data-entry]')
      if (!(root instanceof HTMLElement)) return
      const role = controlRole(event.target)
      if (role === 'skip' || role === 'multiline') return

      const controls = entryControls(root)
      const index = controls.indexOf(event.target)
      const step = entryStep(
        controls.map((control) => controlRole(control)),
        index,
        event.shiftKey ? 'previous' : 'next',
      )
      if (step.action === 'ignore') return
      event.preventDefault()
      if (step.action === 'save') {
        if (!event.repeat) entrySaveButton(root)?.click()
        return
      }
      controls[step.index]?.focus()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return null
}
