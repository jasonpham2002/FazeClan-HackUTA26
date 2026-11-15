import { useMutation } from '@tanstack/react-query'
import { api } from '../../api'
import type { Role } from '../../api/types'
import { Button, describeError } from './ui'

export function SessionButton({ role }: { role: Role }) {
  const mutation = useMutation({
    mutationFn: () => api.signOut(role),
    onSuccess: () => window.location.replace(role === 'staff' ? '/sign-in?role=staff' : '/sign-in'),
  })

  return (
    <div className="flex flex-col items-start gap-1">
      <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? 'Signing out…' : 'Sign out'}
      </Button>
      {mutation.isError && (
        <p role="alert" className="text-sm font-medium">
          Could not sign out. {describeError(mutation.error).detail}
        </p>
      )}
    </div>
  )
}
