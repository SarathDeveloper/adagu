import { describe, expect, it } from 'vitest'
import { controlRoleFrom, entryStep, type EntryRole } from '../../src/lib/formEntry'

const form: EntryRole[] = ['field', 'field', 'readonly', 'multiline', 'field']

describe('entryStep', () => {
  it('moves to the next field', () => {
    expect(entryStep(form, 0, 'next')).toEqual({ action: 'focus', index: 1 })
  })

  it('skips read-only fields', () => {
    expect(entryStep(form, 1, 'next')).toEqual({ action: 'focus', index: 4 })
  })

  it('leaves a read-only field toward the next editable field', () => {
    expect(entryStep(form, 2, 'next')).toEqual({ action: 'focus', index: 4 })
  })

  it('moves to the previous field and skips read-only', () => {
    expect(entryStep(form, 4, 'previous')).toEqual({ action: 'focus', index: 1 })
  })

  it('saves on the last field', () => {
    expect(entryStep(form, 4, 'next')).toEqual({ action: 'save' })
  })

  it('does not save when shift+enter is on the first field', () => {
    expect(entryStep(form, 0, 'previous')).toEqual({ action: 'ignore' })
  })

  it('ignores multi-line textareas', () => {
    expect(entryStep(form, 3, 'next')).toEqual({ action: 'ignore' })
    expect(entryStep(form, 3, 'previous')).toEqual({ action: 'ignore' })
  })

  it('ignores buttons and other skipped controls', () => {
    expect(entryStep(['field', 'skip', 'field'], 1, 'next')).toEqual({ action: 'ignore' })
  })
})

describe('controlRoleFrom', () => {
  it('treats text, select, checkbox, and single-line textarea as fields', () => {
    expect(controlRoleFrom({ tag: 'input', type: 'text' })).toBe('field')
    expect(controlRoleFrom({ tag: 'input', type: 'number' })).toBe('field')
    expect(controlRoleFrom({ tag: 'input', type: 'checkbox' })).toBe('field')
    expect(controlRoleFrom({ tag: 'select' })).toBe('field')
    expect(controlRoleFrom({ tag: 'textarea', rows: 1 })).toBe('field')
  })

  it('skips disabled, read-only, file, and button controls', () => {
    expect(controlRoleFrom({ tag: 'input', type: 'text', disabled: true })).toBe('skip')
    expect(controlRoleFrom({ tag: 'input', type: 'text', readOnly: true })).toBe('readonly')
    expect(controlRoleFrom({ tag: 'input', type: 'file' })).toBe('skip')
    expect(controlRoleFrom({ tag: 'input', type: 'hidden' })).toBe('skip')
    expect(controlRoleFrom({ tag: 'other' })).toBe('skip')
  })

  it('keeps enter inside multi-line textareas', () => {
    expect(controlRoleFrom({ tag: 'textarea', rows: 2 })).toBe('multiline')
    expect(controlRoleFrom({ tag: 'textarea' })).toBe('multiline')
  })
})
