import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'
import type { Reward, RewardInput, RewardKind } from '../../api/types'
import { Badge, Button, Card, EmptyState, ErrorState, Field, inputClass, linkClass, LoadingState, Notice, Section } from '../../components/ui/ui'
import { SampleBadge } from '../../fan/fazeid-ui'
import { redemptionLabels, rewardKindLabels } from '../../fan/RewardsPage'
import { formatDateTime } from '../../lib/format'

const EMPTY: RewardInput = {
  headline: '', title: '', imageUrl: null, description: '', kind: 'merch', cost: 100, stock: 10, active: true,
  terms: 'Simulation only. Nothing is shipped.',
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!)
  return btoa(binary)
}

function RewardForm({ reward, onDone }: { reward: Reward | null; onDone: () => void }) {
  const queries = useQueryClient()
  const [draft, setDraft] = useState<RewardInput>(() => reward
    ? {
      headline: reward.headline ?? '', title: reward.title, imageUrl: reward.imageUrl ?? null, description: reward.description,
      kind: reward.kind, cost: reward.cost, stock: reward.stock, active: reward.active, terms: reward.terms,
    }
    : EMPTY)
  const [imageError, setImageError] = useState('')
  const [uploading, setUploading] = useState(false)
  const save = useMutation({
    mutationFn: () => (reward ? api.updateReward(reward.id, draft) : api.createReward(draft)),
    onSuccess: onDone,
    onSettled: () => {
      queries.invalidateQueries({ queryKey: ['admin', 'rewards'] })
      queries.invalidateQueries({ queryKey: ['rewards'] })
    },
  })
  const set = <K extends keyof RewardInput>(key: K, value: RewardInput[K]) => setDraft(current => ({ ...current, [key]: value }))
  const id = reward?.id ?? 'new'
  async function onImage(file: File | undefined) {
    setImageError('')
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 1_500_000) {
      setImageError('Use a JPEG, PNG, GIF, or WebP image under 1.5 MB.')
      return
    }
    setUploading(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const uploaded = await api.uploadRewardImage({ contentType: file.type, dataBase64: bytesToBase64(bytes) })
      set('imageUrl', uploaded.imageUrl)
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'The image was not saved.')
    } finally {
      setUploading(false)
    }
  }
  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={event => { event.preventDefault(); if (!save.isPending && !uploading) save.mutate() }}>
      <Field label="Headline" htmlFor={`rw-headline-${id}`} hint="The short line fans see first.">
        <input id={`rw-headline-${id}`} value={draft.headline ?? ''} onChange={event => set('headline', event.target.value)} className={inputClass} />
      </Field>
      <Field label="Gift name" htmlFor={`rw-title-${id}`}>
        <input id={`rw-title-${id}`} required value={draft.title} onChange={event => set('title', event.target.value)} className={inputClass} />
      </Field>
      <div className="space-y-3 md:col-span-2">
        <Field label="Image" htmlFor={`rw-image-${id}`} hint="Upload a photo, or paste an https link.">
          <input id={`rw-image-${id}`} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={event => void onImage(event.target.files?.[0])} className={inputClass} />
        </Field>
        <input
          aria-label="Image link"
          placeholder="https://"
          value={draft.imageUrl ?? ''}
          onChange={event => set('imageUrl', event.target.value || null)}
          className={inputClass}
        />
        {draft.imageUrl && <img src={draft.imageUrl} alt="" className="h-28 w-28 rounded-lg border border-border object-cover" />}
        {uploading && <p className="text-sm text-muted">Saving image…</p>}
        {imageError && <p className="text-sm text-danger">{imageError}</p>}
      </div>
      <Field label="Kind" htmlFor={`rw-kind-${id}`}>
        <select id={`rw-kind-${id}`} value={draft.kind} onChange={event => set('kind', event.target.value as RewardKind)} className={inputClass}>
          {Object.entries(rewardKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </Field>
      <div className="md:col-span-2">
        <Field label="Description" htmlFor={`rw-desc-${id}`}>
          <textarea id={`rw-desc-${id}`} rows={2} value={draft.description} onChange={event => set('description', event.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="Points to redeem" htmlFor={`rw-cost-${id}`}>
        <input id={`rw-cost-${id}`} type="number" min={1} step={1} required value={draft.cost} onChange={event => set('cost', Number(event.target.value))} className={inputClass} />
      </Field>
      <Field label="Stock" htmlFor={`rw-stock-${id}`} hint="Leave empty if it is not stock-limited.">
        <input id={`rw-stock-${id}`} type="number" min={0} step={1} value={draft.stock ?? ''} onChange={event => set('stock', event.target.value === '' ? null : Number(event.target.value))} className={inputClass} />
      </Field>
      <div className="md:col-span-2">
        <Field label="Terms shown to fans" htmlFor={`rw-terms-${id}`} hint="Say plainly that this is a proposed benefit if nothing is fulfilled.">
          <input id={`rw-terms-${id}`} value={draft.terms} onChange={event => set('terms', event.target.value)} className={inputClass} />
        </Field>
      </div>
      <label className="flex items-center gap-3 text-sm md:col-span-2">
        <input type="checkbox" className="size-5" checked={draft.active} onChange={event => set('active', event.target.checked)} />
        Fans can redeem this now
      </label>
      <div className="space-y-3 md:col-span-2">
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={save.isPending || uploading}>{save.isPending ? 'Saving…' : reward ? 'Save changes' : 'Add gift'}</Button>
          {reward && <Button disabled={save.isPending} onClick={onDone}>Cancel</Button>}
        </div>
        {save.isError && <ErrorState error={save.error} />}
        {save.isError && <p className="text-sm text-danger">Not saved.</p>}
      </div>
    </form>
  )
}

export function RewardsAdminPage() {
  const rewards = useQuery({ queryKey: ['admin', 'rewards'], queryFn: api.listAdminRewards })
  const redemptions = useQuery({ queryKey: ['admin', 'redemptions'], queryFn: api.listAdminRedemptions })
  const [editing, setEditing] = useState<string | null>(null)
  const [added, setAdded] = useState(0)

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="title-display text-4xl sm:text-5xl">Rewards</h1>
        <p className="max-w-[70ch] text-muted">
          Add a gift with a headline, image, and point cost. Merchandise that is marked redeemable appears for fans.
        </p>
      </header>

      <Section title="Catalogue">
        {rewards.isPending ? <LoadingState label="Loading rewards…" />
          : rewards.isError ? <ErrorState error={rewards.error} onRetry={() => rewards.refetch()} />
          : !rewards.data.length ? <EmptyState title="No rewards yet">Add the first one below.</EmptyState>
          : (
            <ul>
              {rewards.data.map(reward => (
                <li key={reward.id} className="border-t border-border py-5 first:border-t-0">
                  {editing === reward.id ? <RewardForm reward={reward} onDone={() => setEditing(null)} /> : (
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="flex min-w-0 gap-3">
                        {reward.imageUrl && <img src={reward.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-border object-cover" />}
                        <div className="min-w-0">
                        {reward.headline && <p className="text-sm font-semibold">{reward.headline}</p>}
                        <h3 className="font-bold">{reward.title}</h3>
                        <p className="text-sm text-muted">
                          {rewardKindLabels[reward.kind] ?? reward.kind} · {reward.cost} points · {reward.stock === null ? 'not stock-limited' : `${reward.stock} in stock`}
                        </p>
                        {reward.terms && <p className="text-sm text-subtle">{reward.terms}</p>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {reward.isDemo && <SampleBadge />}
                        <Badge tone={reward.active ? 'ok' : 'gray'}>{reward.active ? 'Redeemable' : 'Not redeemable'}</Badge>
                        <Button size="sm" onClick={() => setEditing(reward.id)}>Edit</Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
      </Section>

      <Card title="Add a gift">
        <RewardForm key={added} reward={null} onDone={() => setAdded(count => count + 1)} />
        {added > 0 && <div className="mt-4"><Notice tone="ok">Reward added. It is in the catalogue above as read back from the server.</Notice></div>}
      </Card>

      <Section title="Redemptions" meta={redemptions.data ? `${redemptions.data.length} recorded` : undefined}>
        {redemptions.isPending ? <LoadingState label="Loading redemptions…" />
          : redemptions.isError ? <ErrorState error={redemptions.error} onRetry={() => redemptions.refetch()} />
          : !redemptions.data.length ? <EmptyState title="No redemptions recorded yet" />
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm">
                <thead className="text-muted">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-4 font-semibold">Fan</th>
                    <th className="py-2 pr-4 font-semibold">Reward</th>
                    <th className="py-2 pr-4 font-semibold">Points</th>
                    <th className="py-2 pr-4 font-semibold">Requested</th>
                    <th className="py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {redemptions.data.map(item => (
                    <tr key={item.id} className="border-b border-border">
                      <td className="py-2.5 pr-4">
                        {item.fan
                          ? <Link to={`/admin/fans/${encodeURIComponent(item.fan.id)}/points`} className={linkClass}>{item.fan.displayName || item.fan.email || item.fan.id}</Link>
                          : 'Unknown fan'}
                      </td>
                      <td className="py-2.5 pr-4">{item.rewardTitle}</td>
                      <td className="py-2.5 pr-4 tabular-nums">{item.cost}</td>
                      <td className="py-2.5 pr-4">{formatDateTime(item.createdAt)}</td>
                      <td className="py-2.5">{redemptionLabels[item.status] ?? item.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Section>
    </div>
  )
}
