'use client';

import { useEffect, useState } from 'react';
import { DownloadIcon, PlusIcon, SirenIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { AuditTable } from '@/app/cso/audit/_components/audit-table';

// Types

type IncidentType =
  | 'MISSING_KEY'
  | 'SUSPICIOUS_ACTIVITY'
  | 'EQUIPMENT_FAULT'
  | 'PROCEDURAL'
  | 'OTHER';

type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

type Incident = {
  id: string;
  reference: string;
  type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  occurred_at: string;
  logged_by_name?: string;
};

// Constants

const SEVERITY_CLASS: Record<IncidentSeverity, string> = {
  LOW: 'bg-muted text-muted-foreground',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HIGH: 'bg-destructive/10 text-destructive',
};

const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  MISSING_KEY: 'Missing key',
  SUSPICIOUS_ACTIVITY: 'Suspicious activity',
  EQUIPMENT_FAULT: 'Equipment fault',
  PROCEDURAL: 'Procedural',
  OTHER: 'Other',
};

const INCIDENT_TYPE_CHIPS: { label: string; value: string }[] = [
  { label: 'All types', value: '' },
  { label: 'Missing key', value: 'MISSING_KEY' },
  { label: 'Suspicious activity', value: 'SUSPICIOUS_ACTIVITY' },
  { label: 'Equipment fault', value: 'EQUIPMENT_FAULT' },
  { label: 'Procedural', value: 'PROCEDURAL' },
  { label: 'Other', value: 'OTHER' },
];

const SEVERITY_CHIPS: { label: string; value: string }[] = [
  { label: 'All severities', value: '' },
  { label: 'Low', value: 'LOW' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'High', value: 'HIGH' },
];

// Component

export default function AuditLogPage() {
  // Tab
  const [activeTab, setActiveTab] = useState<'audit' | 'incidents'>('audit');

  // Incidents state
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentCursor, setIncidentCursor] = useState<string | null>(null);
  const [incidentState, setIncidentState] = useState<
    'idle' | 'loading' | 'ready' | 'error' | 'loadingMore'
  >('idle');
  const [incidentTypeFilter, setIncidentTypeFilter] = useState('');
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState('');

  // Log incident sheet
  const [logOpen, setLogOpen] = useState(false);
  const [logType, setLogType] = useState<IncidentType | ''>('');
  const [logSeverity, setLogSeverity] = useState<IncidentSeverity | ''>('');
  const [logDesc, setLogDesc] = useState('');
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [logRef, setLogRef] = useState<string | null>(null);

  // Fetch incidents

  const fetchIncidents = async (reset = true, cursor?: string) => {
    if (reset) setIncidentState('loading');
    else setIncidentState('loadingMore');

    const params = new URLSearchParams({ limit: '20' });
    if (incidentTypeFilter) params.set('type', incidentTypeFilter);
    if (incidentSeverityFilter) params.set('severity', incidentSeverityFilter);
    if (cursor) params.set('cursor', cursor);

    try {
      const res = await fetch(`/api/incidents?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setIncidentState('error');
        return;
      }
      const incoming: Incident[] = (
        (json.data?.incidents ?? []) as Record<string, unknown>[]
      ).map((i) => ({
        id: i.id as string,
        reference: i.reference as string,
        type: i.type as IncidentType,
        severity: i.severity as IncidentSeverity,
        description: i.description as string,
        occurred_at: i.occurred_at as string,
      }));
      setIncidentCursor(json.data?.next_cursor ?? null);
      setIncidents(reset ? incoming : (prev) => [...prev, ...incoming]);
      setIncidentState('ready');
    } catch {
      setIncidentState('error');
    }
  };

  useEffect(() => {
    if (activeTab === 'incidents' && incidentState === 'idle') {
      fetchIncidents(true);
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeTab === 'incidents') {
      fetchIncidents(true);
    }
  }, [incidentTypeFilter, incidentSeverityFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Log incident

  const handleLogIncident = async () => {
    if (!logType || !logSeverity || !logDesc.trim()) return;
    setLogging(true);
    setLogError(null);
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: logType,
          severity: logSeverity,
          description: logDesc,
          occurred_at: new Date().toISOString(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLogError(json.error ?? 'Failed to log incident.');
        return;
      }
      setLogRef(json.data?.reference ?? null);
      if (activeTab === 'incidents') fetchIncidents(true);
    } catch {
      setLogError('Something went wrong. Check your connection.');
    } finally {
      setLogging(false);
    }
  };

  const resetLogSheet = () => {
    setLogType('');
    setLogSeverity('');
    setLogDesc('');
    setLogError(null);
    setLogRef(null);
  };

  // Render

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Audit Log</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Immutable record of every consequential event in SmartKey.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'incidents' && (
            <Button
              onClick={() => {
                resetLogSheet();
                setLogOpen(true);
              }}
            >
              <PlusIcon className="size-4" aria-hidden="true" />
              Log incident
            </Button>
          )}
          <Button variant="outline">
            <DownloadIcon className="size-4" aria-hidden="true" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Tab switcher */}
      <div
        className="flex items-center gap-1 border-b border-border"
        role="tablist"
        aria-label="View"
      >
        {(['audit', 'incidents'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              activeTab === tab
                ? '-mb-px border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab === 'audit' ? 'Audit Log' : 'Incidents'}
          </button>
        ))}
      </div>

      {/* Audit Log tab */}
      {activeTab === 'audit' && <AuditTable />}

      {/* Incidents tab */}
      {activeTab === 'incidents' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Filter by incident type"
            >
              {INCIDENT_TYPE_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => setIncidentTypeFilter(chip.value)}
                  aria-pressed={incidentTypeFilter === chip.value}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    incidentTypeFilter === chip.value
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-card text-foreground hover:bg-muted'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Filter by severity"
            >
              {SEVERITY_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => setIncidentSeverityFilter(chip.value)}
                  aria-pressed={incidentSeverityFilter === chip.value}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    incidentSeverityFilter === chip.value
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-border bg-card text-foreground hover:bg-muted'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Loading */}
          {(incidentState === 'loading' || incidentState === 'idle') && (
            <div className="flex flex-col gap-2" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          )}

          {/* Error */}
          {incidentState === 'error' && (
            <div
              className="rounded-lg border border-destructive/30 bg-destructive/5 p-4"
              role="alert"
            >
              <p className="text-sm text-destructive">
                Failed to load incidents.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => fetchIncidents(true)}
              >
                Retry
              </Button>
            </div>
          )}

          {/* Incidents list */}
          {(incidentState === 'ready' || incidentState === 'loadingMore') && (
            <>
              {incidents.length === 0 ? (
                <Empty className="border border-border bg-card">
                  <EmptyMedia variant="icon">
                    <SirenIcon
                      className="size-8 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </EmptyMedia>
                  <EmptyContent>
                    <EmptyTitle>No incidents recorded</EmptyTitle>
                    <EmptyDescription>
                      No incidents match the current filters.
                    </EmptyDescription>
                  </EmptyContent>
                </Empty>
              ) : (
                <div className="flex flex-col rounded-lg border border-border bg-card shadow-[0_2px_4px_rgba(15,23,42,0.06)]">
                  {incidents.map((incident, idx) => (
                    <div
                      key={incident.id}
                      className={`flex items-start gap-3 px-4 py-3 ${idx !== incidents.length - 1 ? 'border-b border-border' : ''}`}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="font-mono text-xs font-semibold text-foreground">
                            {incident.reference}
                          </code>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_CLASS[incident.severity]}`}
                            aria-label={`Severity: ${incident.severity}`}
                          >
                            {incident.severity}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {INCIDENT_TYPE_LABELS[incident.type]}
                          </span>
                        </div>
                        <p className="text-sm text-foreground">
                          {incident.description}
                        </p>
                      </div>
                      <time className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground">
                        {new Date(incident.occurred_at).toLocaleString(
                          'en-GB',
                          {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          }
                        )}
                      </time>
                    </div>
                  ))}
                </div>
              )}

              {incidentCursor && (
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    onClick={() =>
                      fetchIncidents(false, incidentCursor ?? undefined)
                    }
                    disabled={incidentState === 'loadingMore'}
                    aria-busy={incidentState === 'loadingMore'}
                  >
                    {incidentState === 'loadingMore' ? 'Loading…' : 'Load more'}
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Log incident Sheet */}
      <Sheet
        open={logOpen}
        onOpenChange={(open) => {
          setLogOpen(open);
          if (!open) resetLogSheet();
        }}
      >
        <SheetContent
          side="right"
          className="flex flex-col gap-0 p-0 sm:max-w-md"
        >
          <SheetHeader className="border-b border-border p-6">
            <SheetTitle>Log incident</SheetTitle>
            <SheetDescription>
              Record a security or operational incident. HIGH severity incidents
              notify the CSO immediately.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
            {logRef ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="font-medium text-foreground">Incident logged</p>
                <code className="rounded-md bg-muted px-3 py-1.5 font-mono text-sm font-semibold">
                  {logRef}
                </code>
                <button
                  type="button"
                  onClick={resetLogSheet}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Log another
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="log-type">Type</Label>
                  <Select
                    value={logType}
                    onValueChange={(v) => setLogType(v as IncidentType)}
                  >
                    <SelectTrigger id="log-type">
                      <SelectValue placeholder="Select a type…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MISSING_KEY">Missing key</SelectItem>
                      <SelectItem value="SUSPICIOUS_ACTIVITY">
                        Suspicious activity
                      </SelectItem>
                      <SelectItem value="EQUIPMENT_FAULT">
                        Equipment fault
                      </SelectItem>
                      <SelectItem value="PROCEDURAL">Procedural</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="log-severity">Severity</Label>
                  <Select
                    value={logSeverity}
                    onValueChange={(v) => setLogSeverity(v as IncidentSeverity)}
                  >
                    <SelectTrigger id="log-severity">
                      <SelectValue placeholder="Select severity…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                  {logSeverity === 'HIGH' && (
                    <p className="text-xs text-amber-600">
                      HIGH severity — CSO will be notified immediately.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="log-desc">Description</Label>
                  <Textarea
                    id="log-desc"
                    value={logDesc}
                    onChange={(e) => setLogDesc(e.target.value)}
                    placeholder="Describe what occurred, when, and who was involved…"
                    rows={5}
                    aria-required="true"
                    className="resize-none"
                  />
                </div>
                {logError && (
                  <p className="text-sm text-destructive" role="alert">
                    {logError}
                  </p>
                )}
              </>
            )}
          </div>
          <SheetFooter className="border-t border-border p-6">
            {logRef ? (
              <SheetClose asChild>
                <Button className="w-full">Close</Button>
              </SheetClose>
            ) : (
              <>
                <SheetClose asChild>
                  <Button variant="outline">Cancel</Button>
                </SheetClose>
                <Button
                  disabled={
                    !logType || !logSeverity || !logDesc.trim() || logging
                  }
                  aria-busy={logging}
                  onClick={handleLogIncident}
                >
                  {logging ? 'Logging…' : 'Log incident'}
                </Button>
              </>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
