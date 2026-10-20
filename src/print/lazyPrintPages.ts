import { lazy } from 'react'

/**
 * The print templates, loaded on demand by the print document.
 *
 * Kept apart from `printRoutes.tsx` so that file only exports the router, which
 * React Fast Refresh requires. Anything imported here ends up in the print
 * bundle, so these must stay free of auth and app-shell imports.
 */
export const PledgePrintPage = lazy(() =>
  import('../features/pledges/PledgePrintPage').then((module) => ({
    default: module.PledgePrintPage,
  })),
)
export const PledgeReleasePrintPage = lazy(() =>
  import('../features/pledges/PledgeReleasePrintPage').then((module) => ({
    default: module.PledgeReleasePrintPage,
  })),
)
export const PledgeItemReleasePrintPage = lazy(() =>
  import('../features/pledges/PledgeItemReleasePrintPage').then((module) => ({
    default: module.PledgeItemReleasePrintPage,
  })),
)
export const PledgeNoticePrintPage = lazy(() =>
  import('../features/pledges/PledgeNoticePrintPage').then((module) => ({
    default: module.PledgeNoticePrintPage,
  })),
)
export const SampleAdaguPrintPage = lazy(() =>
  import('../features/print/SampleAdaguPrintPage').then((module) => ({
    default: module.SampleAdaguPrintPage,
  })),
)
export const GsReceiptPrintPage = lazy(() =>
  import('../features/goldSavings/print/GsReceiptPrintPage').then((module) => ({
    default: module.GsReceiptPrintPage,
  })),
)
export const GsPassbookPrintPage = lazy(() =>
  import('../features/goldSavings/print/GsPassbookPrintPage').then((module) => ({
    default: module.GsPassbookPrintPage,
  })),
)
export const GsRefundPrintPage = lazy(() =>
  import('../features/goldSavings/print/GsRefundPrintPage').then((module) => ({
    default: module.GsRefundPrintPage,
  })),
)
export const GsCallListPrintPage = lazy(() =>
  import('../features/goldSavings/print/GsCallListPrintPage').then((module) => ({
    default: module.GsCallListPrintPage,
  })),
)
export const GsBatchReceiptPrintPage = lazy(() =>
  import('../features/goldSavings/print/GsBatchReceiptPrintPage').then((module) => ({
    default: module.GsBatchReceiptPrintPage,
  })),
)
export const GsPayoutPrintPage = lazy(() =>
  import('../features/goldSavings/print/GsPayoutPrintPage').then((module) => ({
    default: module.GsPayoutPrintPage,
  })),
)
