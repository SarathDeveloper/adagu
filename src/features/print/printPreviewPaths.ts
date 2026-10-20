export type SamplePrintKind = 'adagu'

export function withEmbedFlag(path: string): string {
  const url = new URL(path, 'http://print.local')
  url.searchParams.set('embed', '1')
  return `${url.pathname}${url.search}${url.hash}`
}

export const printPreviewPaths = {
  pledge: (pledgeId: number) => `/print/pledge/${pledgeId}`,
  pledgeRelease: (pledgeId: number) => `/print/pledge-release/${pledgeId}`,
  pledgeItemRelease: (pledgeId: number, itemId: number) =>
    `/print/pledge-release-item/${pledgeId}/${itemId}`,
  pledgeNotice: (pledgeId: number) => `/print/pledge-notice/${pledgeId}`,
  sample: (kind: SamplePrintKind) => `/print/sample/${kind}`,
  gsPassbook: (accountId: number) => `/print/gs-passbook/${accountId}`,
  gsPayout: (redemptionId: number) => `/print/gs-payout/${redemptionId}`,
}
