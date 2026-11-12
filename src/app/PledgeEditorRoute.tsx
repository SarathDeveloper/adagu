import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { PledgeEditorPage } from './lazyPages'

/**
 * Renders the Adagu editor for both `/adagu/new` and `/adagu/:id`.
 *
 * Both routes render the same component in the same place, so React keeps one
 * editor instance as the URL changes. That is needed in one case: saving a
 * new draft navigates from `new` to its id while the Generate flow is still
 * running (sanction, then the print preview), and remounting there would
 * drop the preview. In every other case (opening "New Adagu" from a loan, or
 * moving to a different loan) the old form state must not carry over:
 * otherwise "New Adagu" shows the previous loan, and saving it overwrites that
 * loan. Those changes get a new key, so the editor starts fresh.
 */
export function PledgeEditorRoute() {
  const { id } = useParams()
  const [session, setSession] = useState({ key: 0, id })
  if (session.id !== id) {
    const savedNewDraft = session.id === undefined && id !== undefined
    setSession({ key: savedNewDraft ? session.key : session.key + 1, id })
  }
  return <PledgeEditorPage key={session.key} />
}
