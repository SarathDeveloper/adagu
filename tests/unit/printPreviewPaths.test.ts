import { describe, expect, it } from 'vitest'
import { printPreviewPaths, withEmbedFlag } from '../../src/features/print/printPreviewPaths'

describe('printPreviewPaths', () => {
  it('builds pledge, gold savings, and sample paths', () => {
    expect(printPreviewPaths.pledge(4)).toBe('/print/pledge/4')
    expect(printPreviewPaths.pledgeRelease(4)).toBe('/print/pledge-release/4')
    expect(printPreviewPaths.pledgeNotice(4)).toBe('/print/pledge-notice/4')
    expect(printPreviewPaths.gsPassbook(9)).toBe('/print/gs-passbook/9')
    expect(printPreviewPaths.gsPayout(7)).toBe('/print/gs-payout/7')
    expect(printPreviewPaths.sample('adagu')).toBe('/print/sample/adagu')
  })
})

describe('withEmbedFlag', () => {
  it('adds embed=1 without dropping existing query params', () => {
    expect(withEmbedFlag('/print/pledge/12')).toBe('/print/pledge/12?embed=1')
    expect(withEmbedFlag('/print/gs-passbook/9?mode=all')).toBe('/print/gs-passbook/9?mode=all&embed=1')
  })
})
