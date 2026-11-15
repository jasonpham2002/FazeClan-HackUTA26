import { useQuery } from '@tanstack/react-query'
import { Card } from '../components/ui/ui'
import { fetchLiveLines } from '../lib/liveTranscript'

export function CallTranscript({ applicationId }: { applicationId: string }) {
  const transcript = useQuery({
    queryKey: ['call-transcript', applicationId],
    queryFn: async () => {
      try {
        return await fetchLiveLines(applicationId)
      } catch {
        return []
      }
    },
    refetchInterval: 2000,
  })
  const lines = transcript.data ?? []
  return <Card title="Live call">{lines.length === 0 ? <p className="text-sm text-muted">What you say on the FaceTime shows up here.</p> : <ul className="space-y-3">{lines.map((line, index) => <li key={`${line.speaker}-${index}`}><p className="text-sm text-muted">{line.speaker === 'you' ? 'You' : 'AI host'}</p><p>{line.text}</p></li>)}</ul>}</Card>
}
