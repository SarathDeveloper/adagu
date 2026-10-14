import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import type { DashboardSearchResult } from '@shared/types'
import { api } from '../../lib/api'

const EMPTY_RESULTS: DashboardSearchResult = { customers: [], pledges: [] }

export function DashboardSearch() {
  const navigate = useNavigate()
  const rootRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DashboardSearchResult | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const term = query.trim()
    if (!term) {
      setResults(null)
      setOpen(false)
      return
    }
    let active = true
    const timer = window.setTimeout(() => {
      void api
        .searchDashboard(term)
        .then((data) => {
          if (!active) return
          setResults(data)
          setOpen(true)
        })
        .catch(() => {
          if (!active) return
          setResults(EMPTY_RESULTS)
          setOpen(true)
        })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [query])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function go(to: string) {
    setOpen(false)
    setQuery('')
    navigate(to)
  }

  const customers = results?.customers ?? []
  const pledges = results?.pledges ?? []
  const hasResults = customers.length > 0 || pledges.length > 0

  return (
    <div className="main-dash-search" ref={rootRef}>
      <Search className="main-dash-search-icon" size={16} strokeWidth={1.75} aria-hidden />
      <input
        className="input main-dash-search-input"
        placeholder="Search pledges, customers..."
        aria-label="Search pledges, customers"
        aria-expanded={open}
        aria-controls="dashboard-search-results"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (results && query.trim()) setOpen(true)
        }}
      />
      {open && results ? (
        <div className="main-dash-search-menu" id="dashboard-search-results" role="listbox">
          {hasResults ? null : <p className="main-dash-search-empty">No matches</p>}
          {customers.length > 0 ? (
            <div className="main-dash-search-group">
              <p className="main-dash-search-label">Customers</p>
              {customers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  role="option"
                  className="main-dash-search-item"
                  onClick={() => go(`/customers?q=${encodeURIComponent(customer.name)}`)}
                >
                  <span>{customer.name}</span>
                  {customer.phone ? <span className="main-dash-search-meta">{customer.phone}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
          {pledges.length > 0 ? (
            <div className="main-dash-search-group">
              <p className="main-dash-search-label">Pledges</p>
              {pledges.map((pledge) => (
                <Link
                  key={pledge.id}
                  role="option"
                  className="main-dash-search-item"
                  to={`/adagu/${pledge.id}`}
                  onClick={() => {
                    setOpen(false)
                    setQuery('')
                  }}
                >
                  <span>{pledge.receiptNo}</span>
                  <span className="main-dash-search-meta">{pledge.customerName}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
