import { useMutation } from '@tanstack/react-query'
import type { FixtureFanInput, Me } from '../../api/types'
import { normalizePhone } from '../../fan/logic'
import { Button, describeError, Field, inputClass, Notice } from './ui'

export function FanDetailsForm({ account, lockEmail = false, onSave }: {
  account?: Me
  lockEmail?: boolean
  onSave: (details: FixtureFanInput) => Promise<void>
}) {
  const [firstName = '', ...lastName] = account?.displayName?.trim().split(/\s+/) ?? []
  const mutation = useMutation({
    mutationFn: async (form: FormData) => {
      const given = String(form.get('firstName') ?? '').trim()
      const family = String(form.get('lastName') ?? '').trim()
      const displayName = `${given} ${family}`
      const phone = normalizePhone(String(form.get('phone') ?? ''))
      if (!given || !family || displayName.length > 80) {
        throw new Error('Enter a first and last name totaling 80 characters or fewer.')
      }
      if (!phone) throw new Error('Enter a valid phone number.')
      await onSave({ displayName, email: String(form.get('email') ?? '').trim().toLowerCase(), phone })
    },
    onSuccess: () => window.location.replace('/profile'),
  })

  return (
    <form className="space-y-4" onSubmit={event => {
      event.preventDefault()
      if (!mutation.isPending) mutation.mutate(new FormData(event.currentTarget))
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="fan-first-name">
          <input id="fan-first-name" name="firstName" className={inputClass} autoComplete="given-name" defaultValue={firstName} required />
        </Field>
        <Field label="Last name" htmlFor="fan-last-name">
          <input id="fan-last-name" name="lastName" className={inputClass} autoComplete="family-name" defaultValue={lastName.join(' ')} required />
        </Field>
      </div>
      <Field label={account ? 'Email address' : 'Gmail address'} htmlFor="fan-email-address">
        <input id="fan-email-address" name="email" type="email" className={inputClass} autoComplete="email" defaultValue={account?.email} readOnly={lockEmail} required />
      </Field>
      <Field label="Phone number" htmlFor="fan-phone-number">
        <input id="fan-phone-number" name="phone" type="tel" className={inputClass} autoComplete="tel" defaultValue={account?.phone ?? ''} placeholder="202-555-0123" required />
      </Field>
      {mutation.isError && <Notice tone="danger">{describeError(mutation.error).detail}</Notice>}
      <Button type="submit" variant="primary" disabled={mutation.isPending}>
        {mutation.isPending ? 'Saving…' : account ? 'Save profile' : 'Sign up'}
      </Button>
    </form>
  )
}
