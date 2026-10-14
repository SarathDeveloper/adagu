import { Router } from 'express'
import { localTodayIso } from '@shared/localDate'
import { getDatabase } from '../db'
import { getMainDashboard, searchDashboard } from '../dashboard/dashboardService'
import { asyncHandler, queryString } from '../lib/http'

const router = Router()

router.get(
  '/search',
  asyncHandler((req, res) => {
    res.json(searchDashboard(getDatabase(), queryString(req.query, 'q')))
  }),
)

router.get(
  '/',
  asyncHandler((_req, res) => {
    res.json(getMainDashboard(getDatabase(), localTodayIso()))
  }),
)

export default router
