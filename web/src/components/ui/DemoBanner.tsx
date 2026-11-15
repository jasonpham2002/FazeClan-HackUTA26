import { useState } from 'react'
import { dataSource, getSimulatedFailure, resetFixtureData, setSimulatedFailure } from '../../api'

/**
 * Shown on every page in fixture mode so sample data is never mistaken for
 * real interviews. Renders nothing in live mode.
 */
export function DemoBanner() {
  const [failure, setFailure] = useState<number | null>(() => (dataSource === 'fixtures' ? getSimulatedFailure() : null))
  if (dataSource !== 'fixtures') return null

  return (
    <div className="border-b border-warn/25 bg-warn/8 text-[0.8125rem]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 sm:px-6">
        <span className="inline-flex items-center gap-1.5 font-semibold text-warn">
          <span aria-hidden="true" className="size-2 rounded-full bg-warn" />
          Fixture mode
        </span>
        <span className="text-muted">
          Sample data stored only in this browser. No real applicants or calls; nothing is sent to a server.
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          <label htmlFor="simulate-failure" className="text-muted">
            Simulate API error
          </label>
          <select
            id="simulate-failure"
            className="h-8 rounded-md border border-border bg-bg px-2 hover:border-border-strong"
            value={failure ?? ''}
            onChange={(event) => {
              const next = event.target.value ? Number(event.target.value) : null
              setSimulatedFailure(next)
              setFailure(next)
            }}
          >
            <option value="">Off</option>
            <option value="401">401 not signed in</option>
            <option value="403">403 forbidden</option>
            <option value="409">409 conflict on save</option>
            <option value="500">500 server error</option>
          </select>
          <button
            type="button"
            className="h-8 underline decoration-border-strong hover:decoration-text"
            onClick={() => {
              resetFixtureData()
              window.location.reload()
            }}
          >
            Reset sample data
          </button>
        </span>
      </div>
    </div>
  )
}
