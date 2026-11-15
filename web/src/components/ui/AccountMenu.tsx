import { useEffect, useId, useRef, useState } from 'react'
import type { Me } from '../../api/types'
import { SessionButton } from './SessionButton'

export function AccountMenu({ account }: { account: Me }) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const name = account.displayName || account.email

  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div ref={container} className="access-account relative">
      <button
        ref={trigger}
        type="button"
        className="access-avatar"
        aria-label={`Account options for ${name}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(current => !current)}
      >
        {name.slice(0, 1).toUpperCase()}
      </button>
      <div className="min-w-0">
        <p className="break-words font-semibold">{name}</p>
        <p className="text-xs text-muted capitalize">{account.role}</p>
      </div>
      <div id={panelId} hidden={!open} className="absolute start-0 top-full z-20 mt-2 min-w-32 rounded-lg border border-border bg-surface p-2 shadow-lg sm:start-auto sm:end-0">
        {open && <SessionButton role={account.role} />}
      </div>
    </div>
  )
}
