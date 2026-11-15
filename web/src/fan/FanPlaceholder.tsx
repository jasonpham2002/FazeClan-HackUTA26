import { Link } from 'react-router-dom'

/** Placeholder only. Minh owns the fan routes; replace this component freely. */
export function FanPlaceholder() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Event applications</h1>
      <p className="mt-2 text-sm text-muted">
        An independent concept for FaZe Clan. Fan pages are not built yet.
      </p>
      <Link to="/admin" className="mt-4 inline-block text-sm text-info underline">
        Go to the staff dashboard
      </Link>
    </main>
  )
}
