import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Handshake, Plus } from 'lucide-react'

const ADAGU_TABS = [
  { to: '/adagu', label: 'Receipts', icon: Handshake },
  { to: '/adagu/new', label: 'New Adagu', icon: Plus },
]

/**
 * Compact top tabs for the Adagu module. Follows the shared module tab bar
 * (`.billing-chrome` / `.billing-chrome-tab`), same as Inventory and Gold
 * Savings used to.
 */
export function AdaguLayout() {
  const location = useLocation()

  return (
    <div className="inventory-shell">
      <div className="billing-chrome">
        <div className="billing-chrome-tabs" role="tablist" aria-label="Adagu">
          {ADAGU_TABS.map((tab) => {
            const selected = location.pathname === tab.to
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end
                role="tab"
                aria-selected={selected}
                className={() => `billing-chrome-tab${selected ? ' active' : ''}`}
              >
                <span className="billing-chrome-tab-icon" aria-hidden>
                  <tab.icon size={18} strokeWidth={1.75} />
                </span>
                <span className="billing-chrome-tab-label">{tab.label}</span>
              </NavLink>
            )
          })}
        </div>
      </div>
      <Outlet />
    </div>
  )
}
