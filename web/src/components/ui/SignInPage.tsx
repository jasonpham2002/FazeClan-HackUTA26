import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { api, dataSource } from '../../api'
import { DEMO_FAN_CONTACT, DEMO_STAFF_CONTACT } from '../../api/fixtures/seed'
import type { DemoSignInContact, Role } from '../../api/types'
import { FanDetailsForm } from './FanDetailsForm'
import { Button, Card, describeError, Field, inputClass, linkClass, Notice } from './ui'

export function SignInPage() {
  const [params] = useSearchParams()
  const staff = params.get('role') === 'staff'
  const role = staff ? 'staff' : 'fan'

  return (
    <div className="mx-auto max-w-md space-y-5 py-5 sm:py-10">
      <h1 className="title-display text-4xl">{staff ? 'Staff sign in' : 'Fan sign in'}</h1>
      <Card>
        {dataSource === 'fixtures' ? (
          <DemoSignInForm key={role} role={role} />
        ) : (
          <EmailSignInForm key={role} staff={staff} linkFailed={params.has('error')} />
        )}
      </Card>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {!staff && dataSource === 'fixtures' && <Link to="/sign-up" className={linkClass}>Sign up</Link>}
        <Link to={staff ? '/sign-in' : '/sign-in?role=staff'} className={linkClass}>
          {staff ? 'Fan sign in' : 'Staff sign in'}
        </Link>
      </div>
    </div>
  )
}

export function FanSignUpPage() {
  if (dataSource !== 'fixtures') return <Navigate to="/sign-in" replace />

  return (
    <div className="mx-auto max-w-md space-y-5 py-5 sm:py-10">
      <h1 className="title-display text-4xl">Fan sign up</h1>
      <Card>
        <p className="mb-4 text-muted">Use sample details to set up your demo fan profile.</p>
        <FanDetailsForm onSave={api.signUpFixtureFan} />
      </Card>
      <p className="text-sm text-muted">
        Already signed up? <Link to="/sign-in" className={linkClass}>Sign in</Link>
      </p>
    </div>
  )
}

function DemoSignInForm({ role }: { role: Role }) {
  const [kind, setKind] = useState<DemoSignInContact['kind']>('gmail')
  const mutation = useMutation({
    mutationFn: (contact: DemoSignInContact) => api.signInFixture(role, contact),
    onSuccess: () => window.location.replace(role === 'staff' ? '/admin' : '/profile'),
  })
  const gmail = kind === 'gmail'
  const defaults = role === 'staff' ? DEMO_STAFF_CONTACT : DEMO_FAN_CONTACT

  return (
    <form className="space-y-4" onSubmit={event => {
      event.preventDefault()
      if (mutation.isPending) return
      const value = String(new FormData(event.currentTarget).get('contact') ?? '')
      mutation.mutate({ kind, value })
    }}>
      <p className="text-muted">Use the Gmail address or phone number on your demo account.</p>
      <fieldset className="flex flex-wrap gap-4" disabled={mutation.isPending}>
        <legend className="mb-2 text-sm font-semibold">Sign in with</legend>
        <label className="flex items-center gap-2">
          <input type="radio" name="method" checked={gmail} onChange={() => { setKind('gmail'); mutation.reset() }} />
          Gmail
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="method" checked={!gmail} onChange={() => { setKind('phone'); mutation.reset() }} />
          Phone number
        </label>
      </fieldset>
      <Field
        label={gmail ? 'Gmail address' : 'Phone number'}
        htmlFor="demo-sign-in-contact"
        hint={`Default demo account uses ${gmail ? defaults.email : defaults.phone}.`}
      >
        <input
          key={kind}
          id="demo-sign-in-contact"
          name="contact"
          className={inputClass}
          type={gmail ? 'email' : 'tel'}
          autoComplete={gmail ? 'email' : 'tel'}
          placeholder={gmail ? 'example@gmail.com' : '202-555-0123'}
          required
          disabled={mutation.isPending}
        />
      </Field>
      {mutation.isError && <Notice tone="danger">{mutation.error.message}</Notice>}
      <Button type="submit" variant="primary" disabled={mutation.isPending}>
        {mutation.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}

function EmailSignInForm({ staff, linkFailed }: { staff: boolean; linkFailed: boolean }) {
  const [email, setEmail] = useState('')
  const mutation = useMutation({
    mutationFn: (address: string) => api.requestMagicLink({
      email: address,
      callbackURL: new URL(staff ? '/admin' : '/profile?setup=1', window.location.origin).href,
      errorCallbackURL: new URL(staff ? '/sign-in?role=staff' : '/sign-in', window.location.origin).href,
    }),
  })

  return (
    <form className="space-y-4" onSubmit={event => {
      event.preventDefault()
      if (email.trim() && !mutation.isPending) mutation.mutate(email.trim().toLowerCase())
    }}>
      <p className="text-muted">Enter your email to get a secure sign-in link.</p>
      <Field
        label="Email address"
        htmlFor="sign-in-email"
        hint="Use an @example.test address (e.g. fan@example.test or staff@example.test)."
      >
        <input
          id="sign-in-email"
          className={inputClass}
          type="email"
          autoComplete="email"
          value={email}
          required
          disabled={mutation.isPending}
          onChange={event => {
            setEmail(event.target.value)
            mutation.reset()
          }}
        />
      </Field>
      {linkFailed && mutation.isIdle && (
        <Notice tone="danger">This sign-in link could not be used. Request a new link.</Notice>
      )}
      {mutation.isError && (
        <Notice tone="danger">Could not send the sign-in link. {describeError(mutation.error).detail}</Notice>
      )}
      {mutation.isSuccess && (
        <Notice tone="ok">
          Check your email for the sign-in link (or open{' '}
          <a className="font-semibold underline" href="http://127.0.0.1:8025" target="_blank" rel="noopener noreferrer">
            Mailpit
          </a>{' '}
          locally).
        </Notice>
      )}
      <Button type="submit" variant="primary" disabled={mutation.isPending}>
        {mutation.isPending ? 'Sending…' : mutation.isSuccess ? 'Resend sign-in link' : 'Send sign-in link'}
      </Button>
    </form>
  )
}
