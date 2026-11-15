/*
 * Shared building blocks for fan and staff pages. Keep them presentational:
 * no data fetching and no admin-only assumptions in this folder.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { ApiError } from '../../api/client'
import { Icon, type IconName } from './Icon'

export type BadgeTone = 'neutral' | 'gray' | 'ok' | 'warn' | 'danger' | 'info' | 'accent'

const dotClasses: Record<BadgeTone, string> = {
  neutral: 'border border-subtle',
  gray: 'bg-neutral-500',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  info: 'bg-info',
  accent: 'bg-accent',
}

/**
 * A status: a small colored dot plus a written label. The label always carries
 * the meaning; the dot is a secondary cue. Use `Tag` for plain keywords.
 */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium whitespace-nowrap">
      <span aria-hidden="true" className={`size-2 rounded-full ${dotClasses[tone]}`} />
      {children}
    </span>
  )
}

/** A neutral keyword chip, e.g. a stated interest. */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[0.8125rem]">
      {children}
    </span>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'md' | 'sm'
  /** Leading icon. For an icon-only button pass `aria-label` and no children. */
  icon?: IconName
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const variants = {
    primary: 'border-transparent bg-accent text-white hover:bg-accent-hover active:bg-accent',
    secondary: 'border-border bg-surface-2 text-text hover:border-border-strong active:bg-surface',
    ghost: 'border-transparent bg-transparent text-muted hover:bg-surface-2 hover:text-text',
  }
  const iconOnly = icon && !children
  const sizes = {
    md: iconOnly ? 'size-10' : 'h-10 px-4',
    sm: iconOnly ? 'size-9' : 'h-9 px-3',
  }
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-md border text-sm font-medium whitespace-nowrap transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}

/** Class for a router <Link> that should look like a secondary button. */
export const linkButtonClass =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface-2 px-4 text-sm font-medium whitespace-nowrap transition-colors duration-150 hover:border-border-strong'

/** Class for an inline text link. */
export const linkClass =
  'font-medium underline decoration-border-strong transition-colors duration-150 hover:decoration-text'

/** A raised panel. Use for self-contained tools (forms, the decision panel). Never nest. */
export function Card({
  title,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-5 sm:p-6 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {title && <h2 className="heading-section">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}

/** A flat page section: heading over a hairline. Use for reading content and lists. */
export function Section({
  title,
  meta,
  actions,
  children,
  className = '',
}: {
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-border pb-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="heading-section">{title}</h2>
          {meta && <span className="text-sm text-muted">{meta}</span>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  )
}

export const inputClass =
  'w-full min-h-10 rounded-md border border-border bg-bg px-3 py-2 text-sm text-text transition-colors duration-150 placeholder:text-subtle hover:border-border-strong focus-visible:border-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-text aria-[invalid=true]:border-danger'

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-[0.8125rem] text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-[0.8125rem] text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'danger' | 'ok'; children: ReactNode }) {
  const tones = {
    info: { box: 'border-info/30 bg-info/8', icon: 'text-info', name: 'info' },
    warn: { box: 'border-warn/30 bg-warn/8', icon: 'text-warn', name: 'alert' },
    danger: { box: 'border-danger/35 bg-danger/10', icon: 'text-danger', name: 'alert' },
    ok: { box: 'border-ok/30 bg-ok/8', icon: 'text-ok', name: 'check' },
  } as const
  const style = tones[tone]
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${style.box}`}
    >
      <Icon name={style.name} className={`mt-0.5 size-4 ${style.icon}`} />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Skeleton rows instead of a spinner; the label is read by screen readers. */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col gap-3 py-2">
      <span className="sr-only">{label}</span>
      <div className="skeleton h-7 w-2/5" />
      <div className="skeleton h-4 w-4/5" />
      <div className="skeleton h-4 w-3/5" />
      <div className="skeleton h-24 w-full" />
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-[60ch] text-sm text-muted">{children}</div>}
    </div>
  )
}

export function describeError(error: unknown): { title: string; detail: string } {
  if (error instanceof ApiError) {
    if (error.status === 401) return { title: 'Sign-in required', detail: error.message }
    if (error.status === 403) return { title: 'Access denied', detail: error.message }
    if (error.status === 404) return { title: 'Not found', detail: error.message }
    if (error.status === 409) return { title: 'Conflict', detail: error.message }
    return { title: 'Request failed', detail: `${error.message} (${error.code})` }
  }
  return { title: 'Something went wrong', detail: error instanceof Error ? error.message : 'Unknown error.' }
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { title, detail } = describeError(error)
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-danger/35 bg-danger/10 p-5">
      <Icon name="alert" className="mt-0.5 size-5 text-danger" />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{detail}</p>
        {onRetry && (
          <Button size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  )
}
