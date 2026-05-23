'use client';

import { useState } from 'react';
import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  KeyRoundIcon,
  XIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

type Request = {
  id: string;
  requester: string;
  department: string;
  submittedAt: string;
  keyCode: string;
  room: string;
  zone: string;
  weekendDate: string;
  activity: string;
  whitelisted: boolean;
};

const pendingRequests: Request[] = [
  {
    id: 'wr-001',
    requester: 'Dr. Bakare',
    department: 'Faculty of Engineering',
    submittedAt: '2h ago',
    keyCode: 'NS-304',
    room: 'Senate Hall A',
    zone: 'New Senate',
    weekendDate: 'Sat 3 May 2026',
    activity:
      'Lab equipment maintenance — testing and calibrating the tensile strength machine before the upcoming practical sessions.',
    whitelisted: true,
  },
  {
    id: 'wr-002',
    requester: 'Mrs. Adeleke',
    department: 'Faculty of Engineering',
    submittedAt: '5h ago',
    keyCode: 'OS-12',
    room: 'Old Senate Storage',
    zone: 'Old Senate',
    weekendDate: 'Sun 4 May 2026',
    activity:
      'Departmental retreat preparation — arranging furniture and setting up audio-visual equipment for the departmental planning retreat.',
    whitelisted: true,
  },
  {
    id: 'wr-003',
    requester: 'Mr. Fashola',
    department: 'Faculty of Engineering',
    submittedAt: '1d ago',
    keyCode: 'NS-305',
    room: 'Senate Hall B',
    zone: 'New Senate',
    weekendDate: 'Sat 10 May 2026',
    activity:
      'Research data collection — completing final measurements for the structural analysis project before the submission deadline.',
    whitelisted: false,
  },
];

const tabs = [
  { label: 'Pending', count: pendingRequests.length },
  { label: 'Decided this week', count: 0 },
  { label: 'All', count: null },
] as const;

export default function WeekendRequestsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [selected, setSelected] = useState<Request | null>(null);
  const [note, setNote] = useState('');
  const [decision, setDecision] = useState<'approved' | 'declined' | null>(
    null
  );

  const handleClose = () => {
    setSelected(null);
    setNote('');
    setDecision(null);
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Weekend Requests
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Review and decide weekend access requests for your department.
        </p>
      </div>

      {/* Tabs */}
      <div
        className="flex items-center gap-1 border-b border-border"
        role="tablist"
        aria-label="Filter requests"
      >
        {tabs.map((tab, idx) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={activeTab === idx}
            onClick={() => setActiveTab(idx)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              activeTab === idx
                ? '-mb-px border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.count !== null && tab.count > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 text-xs font-semibold text-primary">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Request list */}
      {activeTab === 0 && pendingRequests.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-sm font-medium text-foreground">
            No pending requests right now.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Weekend requests appear here when staff submit them.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(activeTab === 0 ? pendingRequests : []).map((req) => (
            <div
              key={req.id}
              className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-[0_2px_4px_rgba(15,23,42,0.06)] sm:flex-row sm:items-start"
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                  {req.requester
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-sm font-semibold text-foreground">
                    {req.requester}
                  </span>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <KeyRoundIcon
                        className="size-3.5 text-primary"
                        aria-hidden="true"
                      />
                      <code className="font-mono">{req.keyCode}</code> —{' '}
                      {req.room}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="size-3.5" aria-hidden="true" />
                      {req.weekendDate}
                    </span>
                    <span className="flex items-center gap-1">
                      <ClockIcon className="size-3.5" aria-hidden="true" />
                      {req.submittedAt}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {req.activity}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => setSelected(req)}
                className="shrink-0"
              >
                Review
              </Button>
            </div>
          ))}

          {activeTab !== 0 && (
            <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground">
                No requests in this view.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Detail sheet */}
      <Sheet open={!!selected} onOpenChange={(open) => !open && handleClose()}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader className="border-b border-border p-6">
            <SheetTitle className="text-base">
              Weekend access request
            </SheetTitle>
          </SheetHeader>

          {selected && (
            <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
              {decision ? (
                /* Success / declined state */
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  {decision === 'approved' ? (
                    <>
                      <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100">
                        <CheckCircleIcon
                          className="size-6 text-emerald-700"
                          aria-hidden="true"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Approved.
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selected.requester} has been notified by email.
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Signed with your stored signature reference at{' '}
                          {new Date().toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          .
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                        <XIcon
                          className="size-6 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Declined.
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selected.requester} has been notified.
                        </p>
                      </div>
                    </>
                  )}
                  <Button variant="outline" onClick={handleClose}>
                    Done
                  </Button>
                </div>
              ) : (
                <>
                  {/* Requester */}
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                      {selected.requester
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {selected.requester}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selected.department} · Submitted {selected.submittedAt}
                      </p>
                    </div>
                  </div>

                  {/* Request details */}
                  <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4">
                    <div className="flex items-center gap-2 text-xs">
                      <KeyRoundIcon
                        className="size-3.5 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span className="font-medium text-foreground">
                        <code className="font-mono">{selected.keyCode}</code> —{' '}
                        {selected.room}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarIcon
                        className="size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      {selected.weekendDate}
                    </div>
                    <p className="text-xs text-foreground">
                      {selected.activity}
                    </p>
                  </div>

                  {/* Authorisation warning */}
                  {!selected.whitelisted && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <AlertTriangleIcon
                        className="mt-0.5 size-4 shrink-0 text-amber-600"
                        aria-hidden="true"
                      />
                      <p className="text-xs text-amber-800">
                        This requester is not currently whitelisted for this
                        key. Approval will grant temporary 24-hour access.
                      </p>
                    </div>
                  )}

                  {/* Note */}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="hod-note" className="text-xs">
                      Note to requester{' '}
                      <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Textarea
                      id="hod-note"
                      placeholder="Included in the notification email…"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      className="resize-none text-sm"
                    />
                  </div>

                  {/* Decision buttons */}
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      className="flex-1"
                      onClick={() => setDecision('approved')}
                    >
                      Approve and sign
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 border-destructive text-destructive hover:bg-destructive/5 hover:text-destructive"
                      onClick={() => setDecision('declined')}
                    >
                      Decline
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
