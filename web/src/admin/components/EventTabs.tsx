import { NavLink } from 'react-router-dom'
import { Icon } from '../../components/ui/Icon'

export function EventTabs({ eventId }: { eventId: string }) {
  const tabs = [
    { to: `/admin/events/${eventId}`, label: 'Event details' },
    { to: `/admin/events/${eventId}/interview`, label: 'Interview' },
    { to: `/admin/events/${eventId}/applications`, label: 'Applications' },
  ]
  return (
    <nav aria-label="Event sections" className="mb-6 flex flex-wrap items-center gap-x-1 border-b border-border">
      <NavLink
        to="/admin"
        end
        className="mr-3 inline-flex h-11 items-center gap-1.5 text-sm text-muted transition-colors duration-150 hover:text-text"
      >
        <Icon name="arrowLeft" />
        Overview
      </NavLink>
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) =>
            `-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm font-medium transition-colors duration-150 ${
              isActive ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'
            }`
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
