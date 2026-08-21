'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  CirclePlusIcon,
  DownloadIcon,
  PlusIcon,
  SirenIcon,
} from 'lucide-react';

import { apiFetch } from '@/lib/api';
import { toCsv, downloadCsv } from '@/lib/csv';
import { type OptionalTimeRangeValue } from '@/lib/date-range';
import { logger } from '@/lib/logger';
import {
  type IncidentType,
  type IncidentSeverity,
  INCIDENT_TYPES,
  INCIDENT_SEVERITIES,
  INCIDENT_TYPE_LABELS,
  INCIDENT_SEVERITY_CLASSES,
} from '@/lib/constants';

import { TimeRangeFilter } from '@/components/smartkey/time-range-filter';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  incidentFormSchema,
  type IncidentFormInput,
} from '@/lib/validation/schemas';
import { AuditTable } from '@/app/cso/audit/_components/audit-table';

type Incident = {
  id: string;
  reference: string;
  type: IncidentType;
  severity: IncidentSeverity;
  description: string;
  occurred_at: string;
  logged_by_name?: string;
};

export const AuditView = () => {
  const [activeTab, setActiveTab] = useState<'audit' | 'incidents'>('audit');

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentCursor, setIncidentCursor] = useState<string | null>(null);
  const [incidentState, setIncidentState] = useState<
    'idle' | 'loading' | 'ready' | 'error' | 'loadingMore'
  >('idle');
  const [incidentTypeFilter, setIncidentTypeFilter] = useState<IncidentType[]>(
    []
  );
  const [incidentSeverityFilter, setIncidentSeverityFilter] = useState<
    IncidentSeverity[]
  >([]);
  const [incidentRange, setIncidentRange] = useState<OptionalTimeRangeValue>({
    preset: 'all',
    range: null,
  });

  const auditExportRef = useRef<(() => Promise<void>) | null>(null);
  const [exporting, setExporting] = useState(false);

  const [logOpen, setLogOpen] = useState(false);
  const [logRef, setLogRef] = useState<string | null>(null);
  const [logServerError, setLogServerError] = useState<string | null>(null);

  const {
    control,
    register,
    handleSubmit,
    watch,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<IncidentFormInput>({
    resolver: zodResolver(incidentFormSchema),
  });

  const watchedSeverity = watch('severity');

  const fetchIncidents = async (reset = true, cursor?: string) => {
    if (reset) setIncidentState('loading');
    else setIncidentState('loadingMore');

    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);
    if (incidentRange.range) {
      params.set('from', incidentRange.range.from);
      params.set('to', incidentRange.range.to);
    }

    const result = await apiFetch<{
      incidents: Record<string, unknown>[];
      next_cursor: string | null;
    }>(`/api/incidents?${params.toString()}`);
    if (result.error || !result.data) {
      setIncidentState('error');
      return;
    }
    const incoming: Incident[] = (result.data.incidents ?? []).map((i) => ({
      id: i.id as string,
      reference: i.reference as string,
      type: i.type as IncidentType,
      severity: i.severity as IncidentSeverity,
      description: i.description as string,
      occurred_at: i.occurred_at as string,
    }));
    setIncidentCursor(result.data.next_cursor ?? null);
    setIncidents(reset ? incoming : (prev) => [...prev, ...incoming]);
    setIncidentState('ready');
  };

  useEffect(() => {
    if (activeTab === 'incidents' && incidentState === 'idle') {
      fetchIncidents(true);
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch from scratch whenever the range changes (skip the initial mount
  // — that's already handled by the effect above). Unlike the type/severity
  // filters, the range must be applied server-side to be meaningful across
  // the full history, not just the currently-loaded page(s).
  const isFirstIncidentRangeRender = useRef(true);
  useEffect(() => {
    if (isFirstIncidentRangeRender.current) {
      isFirstIncidentRangeRender.current = false;
      return;
    }
    fetchIncidents(true);
  }, [incidentRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredIncidents = incidents.filter((i) => {
    if (incidentTypeFilter.length > 0 && !incidentTypeFilter.includes(i.type))
      return false;
    if (
      incidentSeverityFilter.length > 0 &&
      !incidentSeverityFilter.includes(i.severity)
    )
      return false;
    return true;
  });

  const toggleTypeFilter = (value: IncidentType) => {
    setIncidentTypeFilter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const toggleSeverityFilter = (value: IncidentSeverity) => {
    setIncidentSeverityFilter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleLogIncident = async (data: IncidentFormInput) => {
    setLogServerError(null);
    const result = await apiFetch<{ reference: string }>('/api/incidents', {
      method: 'POST',
      body: {
        type: data.type,
        severity: data.severity,
        description: data.description,
        occurred_at: new Date().toISOString(),
      },
    });
    if (result.error) {
      setLogServerError(result.error);
      return;
    }
    setLogRef(result.data?.reference ?? null);
    if (activeTab === 'incidents') fetchIncidents(true);
  };

  const resetLogSheet = () => {
    resetForm();
    setLogServerError(null);
    setLogRef(null);
  };

  // Export the active tab's data as CSV. The audit tab delegates to the table
  // (which owns its filters); the incidents tab exports the filtered list here.
  const handleExport = async () => {
    setExporting(true);
    try {
      if (activeTab === 'audit') {
        await auditExportRef.current?.();
      } else {
        const csv = toCsv(
          ['Reference', 'Type', 'Severity', 'Description', 'Occurred at'],
          filteredIncidents.map((i) => [
            i.reference,
            INCIDENT_TYPE_LABELS[i.type],
            i.severity,
            i.description,
            new Date(i.occurred_at).toISOString(),
          ])
        );
        downloadCsv(
          `incidents-${new Date().toISOString().slice(0, 10)}.csv`,
          csv
        );
      }
    } catch (e) {
      logger.error('audit: CSV export failed', {
        err: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setExporting(false);
    }
  };

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
            <Button onClick={() => setLogOpen(true)}>
              <PlusIcon className="size-4" aria-hidden="true" />
              Log incident
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={
              exporting ||
              (activeTab === 'incidents' && filteredIncidents.length === 0)
            }
            aria-busy={exporting}
          >
            <DownloadIcon className="size-4" aria-hidden="true" />
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        </div>
      </div>

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

      {activeTab === 'audit' && <AuditTable exportRef={auditExportRef} />}

      {activeTab === 'incidents' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="pl-2 text-sm font-semibold text-foreground">
                Filter by:
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-dashed"
                  >
                    <CirclePlusIcon className="size-3.5" aria-hidden="true" />
                    Type
                    {incidentTypeFilter.length > 0 && (
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                        {incidentTypeFilter.length}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuLabel>Filter by type</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {INCIDENT_TYPES.map((opt) => (
                    <DropdownMenuCheckboxItem
                      key={opt.value}
                      checked={incidentTypeFilter.includes(opt.value)}
                      onCheckedChange={() => toggleTypeFilter(opt.value)}
                    >
                      {opt.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {incidentTypeFilter.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setIncidentTypeFilter([])}
                        className="text-muted-foreground"
                      >
                        Clear filter
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-dashed"
                  >
                    <CirclePlusIcon className="size-3.5" aria-hidden="true" />
                    Severity
                    {incidentSeverityFilter.length > 0 && (
                      <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                        {incidentSeverityFilter.length}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuLabel>Filter by severity</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {INCIDENT_SEVERITIES.map((opt) => (
                    <DropdownMenuCheckboxItem
                      key={opt.value}
                      checked={incidentSeverityFilter.includes(opt.value)}
                      onCheckedChange={() => toggleSeverityFilter(opt.value)}
                    >
                      {opt.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {incidentSeverityFilter.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setIncidentSeverityFilter([])}
                        className="text-muted-foreground"
                      >
                        Clear filter
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <TimeRangeFilter
              value={incidentRange}
              onChange={setIncidentRange}
              allowAllTime
            />
          </div>

          {(incidentState === 'loading' || incidentState === 'idle') && (
            <div className="flex flex-col gap-2" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          )}

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

          {(incidentState === 'ready' || incidentState === 'loadingMore') && (
            <>
              {filteredIncidents.length === 0 ? (
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
                  {filteredIncidents.map((incident, idx) => (
                    <div
                      key={incident.id}
                      className={`flex items-start gap-3 px-4 py-3 ${idx !== filteredIncidents.length - 1 ? 'border-b border-border' : ''}`}
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="font-mono text-xs font-semibold text-foreground">
                            {incident.reference}
                          </code>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${INCIDENT_SEVERITY_CLASSES[incident.severity]}`}
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
                    {incidentState === 'loadingMore'
                      ? 'Loading...'
                      : 'Load more'}
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

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

          {logRef ? (
            <>
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
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
              <SheetFooter className="border-t border-border p-6">
                <SheetClose asChild>
                  <Button className="w-full">Close</Button>
                </SheetClose>
              </SheetFooter>
            </>
          ) : (
            <form
              className="flex flex-1 flex-col overflow-hidden"
              onSubmit={handleSubmit(handleLogIncident)}
              noValidate
            >
              <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="log-type">Type</Label>
                  <Controller
                    control={control}
                    name="type"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          id="log-type"
                          aria-invalid={!!errors.type}
                          aria-describedby={
                            errors.type ? 'log-type-error' : undefined
                          }
                        >
                          <SelectValue placeholder="Select a type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MISSING_KEY">
                            Missing key
                          </SelectItem>
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
                    )}
                  />
                  {errors.type && (
                    <p
                      id="log-type-error"
                      className="text-sm text-destructive"
                      role="alert"
                    >
                      {errors.type.message}
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="log-severity">Severity</Label>
                  <Controller
                    control={control}
                    name="severity"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          id="log-severity"
                          aria-invalid={!!errors.severity}
                          aria-describedby={
                            errors.severity ? 'log-severity-error' : undefined
                          }
                        >
                          <SelectValue placeholder="Select severity level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LOW">Low</SelectItem>
                          <SelectItem value="MEDIUM">Medium</SelectItem>
                          <SelectItem value="HIGH">High</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.severity ? (
                    <p
                      id="log-severity-error"
                      className="text-sm text-destructive"
                      role="alert"
                    >
                      {errors.severity.message}
                    </p>
                  ) : (
                    watchedSeverity === 'HIGH' && (
                      <p className="text-xs text-amber-600">
                        HIGH severity — CSO will be notified immediately.
                      </p>
                    )
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="log-desc">Description</Label>
                  <Textarea
                    id="log-desc"
                    {...register('description')}
                    placeholder="Describe what occurred, when, and who was involved..."
                    rows={5}
                    aria-required="true"
                    aria-invalid={!!errors.description}
                    aria-describedby={
                      errors.description ? 'log-desc-error' : undefined
                    }
                    className="resize-none"
                  />
                  {errors.description && (
                    <p
                      id="log-desc-error"
                      className="text-sm text-destructive"
                      role="alert"
                    >
                      {errors.description.message}
                    </p>
                  )}
                </div>

                {logServerError && (
                  <p className="text-sm text-destructive" role="alert">
                    {logServerError}
                  </p>
                )}
              </div>

              <SheetFooter className="border-t border-border p-6">
                <SheetClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </SheetClose>
                <Button type="submit" aria-busy={isSubmitting}>
                  {isSubmitting ? 'Logging...' : 'Log incident'}
                </Button>
              </SheetFooter>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};
