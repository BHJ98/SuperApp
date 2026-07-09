import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAppData } from '@/apps/finance/providers'
import { Button } from '@/apps/finance/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/apps/finance/components/ui/card'
import { Badge } from '@/apps/finance/components/ui/badge'
import { useToast } from '@/apps/finance/components/ui/toast'
import { Building2, Link2, RefreshCw, Trash2, Clock, AlertCircle } from 'lucide-react'

type Institution = { id: string; name: string; logo: string | null }

type BankConnection = {
  id: string
  requisition_id: string
  institution_id: string
  institution_name: string
  institution_logo: string | null
  iban: string | null
  status: 'pending' | 'active' | 'expired' | 'error'
  last_synced_at: string | null
  accounts: { name: string } | null
}

export default function BankSyncPage() {
  const { supabase } = useAppData()
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()

  const [connections, setConnections] = useState<BankConnection[]>([])
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [loadingInstitutions, setLoadingInstitutions] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Enable Banking redirects back here with ?code=ONE_TIME_CODE&state=OUR_KEY
  const codeParam = searchParams.get('code')
  const stateParam = searchParams.get('state')

  useEffect(() => { loadConnections() }, [])

  useEffect(() => {
    if (!codeParam || !stateParam) return
    setSearchParams({}, { replace: true })
    syncConnection(stateParam, true, codeParam)
  }, [codeParam, stateParam])

  async function loadConnections() {
    setLoading(true)
    const { data } = await supabase
      .from('bank_connections')
      .select('id, requisition_id, institution_id, institution_name, institution_logo, iban, status, last_synced_at, accounts(name)')
      .order('created_at', { ascending: false })
    setConnections(
      ((data ?? []) as any[]).map((c) => ({
        ...c,
        accounts: Array.isArray(c.accounts) ? (c.accounts[0] ?? null) : c.accounts,
      })) as BankConnection[],
    )
    setLoading(false)
  }

  async function openPicker() {
    setShowPicker(true)
    if (institutions.length > 0) return
    setLoadingInstitutions(true)
    const { data, error } = await supabase.functions.invoke('bank-institutions')
    if (!error && Array.isArray(data)) setInstitutions(data)
    else toast('Banken laden mislukt', 'error')
    setLoadingInstitutions(false)
  }

  async function connectBank(institution_id: string) {
    setConnecting(true)
    const redirect_url = `${window.location.origin}/finance/bank-sync`
    const { data, error } = await supabase.functions.invoke('bank-connect', {
      body: { institution_id, redirect_url },
    })
    if (error || !data?.link) {
      toast(`Verbinding mislukt: ${error?.message ?? 'Onbekende fout'}`, 'error')
      setConnecting(false)
      return
    }
    window.location.href = data.link
  }

  async function syncConnection(requisition_id: string, afterRedirect = false, code?: string) {
    setSyncing(requisition_id)
    if (afterRedirect) toast('Bank verbonden! Transacties worden geladen…')

    const { data, error } = await supabase.functions.invoke('bank-sync', {
      body: { requisition_id, code },
    })
    setSyncing(null)

    if (error) {
      toast(`Sync mislukt: ${error.message}`, 'error')
    } else {
      toast(
        data.imported > 0
          ? `${data.imported} nieuwe transacties geïmporteerd`
          : 'Geen nieuwe transacties',
      )
    }
    loadConnections()
  }

  async function deleteConnection(id: string) {
    setDeleting(id)
    await supabase.from('bank_connections').delete().eq('id', id)
    setDeleting(null)
    loadConnections()
  }

  function StatusBadge({ status }: { status: string }) {
    const map: Record<string, string> = {
      active: 'bg-ok-soft text-ok border-border',
      pending: 'bg-warn-soft text-warn border-border',
      expired: 'bg-danger-soft text-danger border-border',
      error: 'bg-danger-soft text-danger border-border',
    }
    const labels: Record<string, string> = {
      active: 'Actief', pending: 'Wacht op autorisatie', expired: 'Verlopen', error: 'Fout',
    }
    return (
      <Badge className={map[status] ?? 'bg-muted text-muted-foreground'}>
        {labels[status] ?? status}
      </Badge>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Bank koppeling</h1>
          <p className="text-muted-foreground mt-1">
            Importeer automatisch transacties via Open Banking (PSD2)
          </p>
        </div>
        <Button onClick={openPicker} disabled={showPicker}>
          <Link2 className="h-4 w-4 mr-1" />
          Bank koppelen
        </Button>
      </div>

      {/* Institution picker */}
      {showPicker && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Kies je bank</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingInstitutions ? (
              <p className="text-muted-foreground text-sm">Banken ophalen…</p>
            ) : institutions.length === 0 ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <AlertCircle className="h-4 w-4" />
                Kon banken niet laden. Controleer of de Edge Functions zijn gedeployed.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {institutions.map((inst) => (
                  <button
                    key={inst.id}
                    onClick={() => connectBank(inst.id)}
                    disabled={connecting}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-[var(--accent-finance)] hover:bg-[var(--accent-finance)]/5 transition-all text-left disabled:opacity-50"
                  >
                    {inst.logo ? (
                      <img src={inst.logo} alt={inst.name} className="w-8 h-8 rounded object-contain flex-shrink-0" />
                    ) : (
                      <Building2 className="w-8 h-8 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium leading-tight">{inst.name}</span>
                  </button>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowPicker(false)}>
              Annuleren
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Connected banks */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Laden…</p>
      ) : connections.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground font-medium">Nog geen bank gekoppeld</p>
            <p className="text-sm text-muted-foreground mt-1">
              Koppel je bank om transacties automatisch te importeren.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => (
            <Card key={conn.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {conn.institution_logo ? (
                    <img
                      src={conn.institution_logo}
                      alt={conn.institution_name}
                      className="w-10 h-10 rounded object-contain flex-shrink-0"
                    />
                  ) : (
                    <Building2 className="w-10 h-10 text-muted-foreground flex-shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{conn.institution_name}</span>
                      <StatusBadge status={conn.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 space-x-3">
                      {conn.iban && <span className="font-mono">••••{conn.iban.slice(-4)}</span>}
                      {conn.accounts?.name && <span>{conn.accounts.name}</span>}
                      {conn.last_synced_at && (
                        <span className="flex items-center gap-1 inline-flex">
                          <Clock className="h-3 w-3" />
                          {new Date(conn.last_synced_at).toLocaleString('nl-NL', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncConnection(conn.requisition_id)}
                      disabled={syncing === conn.requisition_id}
                    >
                      <RefreshCw className={`h-4 w-4 mr-1 ${syncing === conn.requisition_id ? 'animate-spin' : ''}`} />
                      Sync
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Koppeling met ${conn.institution_name} verwijderen? Je moet dan opnieuw autoriseren om te kunnen syncen.`)) {
                          deleteConnection(conn.id)
                        }
                      }}
                      disabled={deleting === conn.id}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8 rounded-lg border border-border p-4 text-sm text-muted-foreground space-y-1.5">
        <p className="font-medium text-foreground mb-2">Hoe werkt het?</p>
        <p>• Je bankgegevens worden nooit opgeslagen — wij lezen alleen transacties via de officiële PSD2 Open Banking API</p>
        <p>• Autorisatie moet elke 90 dagen worden vernieuwd (EU-vereiste)</p>
        <p>• Transacties worden automatisch gecategoriseerd via je bestaande regels</p>
        <p>• De "Sync" knop haalt de laatste 90 dagen op; duplicaten worden automatisch overgeslagen</p>
      </div>
    </div>
  )
}
