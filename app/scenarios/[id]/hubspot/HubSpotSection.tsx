'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  linkScenarioDealAction,
  publishScenarioAction,
  supersedeScenarioQuoteAction,
} from '@/app/scenarios/[id]/actions';

// ---------------------------------------------------------------------------
// Types mirroring the DB rows passed from the RSC page
// ---------------------------------------------------------------------------

export interface HubSpotQuoteRow {
  id: string;
  revision: number;
  hubspotQuoteId: string;
  shareableUrl: string | null;
  publishState: string;
  lastStatus: string | null;
  publishedAt: Date | null;
  lastStatusAt: Date | null;
}

export interface HubSpotApprovalRequestRow {
  id: string;
  status: string;
  submittedAt: Date;
  resolvedAt: Date | null;
  resolvedByHubspotOwnerId: string | null;
  hubspotDealId: string;
}

interface Props {
  scenarioId: string;
  hubspotDealId: string | null;
  latestQuote: HubSpotQuoteRow | null;
  /** True when the engine has at least one hard-severity rail warning */
  hasHardRailOverrides: boolean;
  /** Current approval request for this scenario, if any */
  approvalRequest: HubSpotApprovalRequestRow | null;
}

// ---------------------------------------------------------------------------
// Link Deal sub-section
// ---------------------------------------------------------------------------

function LinkDealForm({ scenarioId }: { scenarioId: string }) {
  const [dealId, setDealId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dealId.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await linkScenarioDealAction({ scenarioId, hubspotDealId: dealId.trim() });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        No HubSpot Deal linked yet. Enter an existing Deal ID to link it, or use the{' '}
        <code className="text-xs bg-slate-100 px-1 rounded">create_hubspot_deal_for_scenario</code>{' '}
        MCP tool for dedupe-aware Deal creation.
      </p>
      <form onSubmit={handleSubmit} className="flex gap-2 max-w-sm">
        <div className="flex-1 space-y-1">
          <Label htmlFor="hubspotDealId" className="sr-only">
            HubSpot Deal ID
          </Label>
          <Input
            id="hubspotDealId"
            placeholder="HubSpot Deal ID"
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            required
          />
        </div>
        <Button type="submit" disabled={isPending || !dealId.trim()}>
          {isPending ? 'Linking…' : 'Link Deal'}
        </Button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Publish sub-section (linked, no quote yet)
// ---------------------------------------------------------------------------

type PublishActionResult =
  | { ok: true; hubspotQuoteId: string; shareableUrl: string | null }
  | { ok: true; status: 'pending_approval'; approvalRequestId: string }
  | { ok: true; status: 'rejected'; approvalRequestId: string };

function PublishButton({
  scenarioId,
  hasHardRailOverrides,
}: {
  scenarioId: string;
  hasHardRailOverrides: boolean;
}) {
  const [result, setResult] = useState<PublishActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePublish() {
    setError(null);
    startTransition(async () => {
      const res = await publishScenarioAction({ scenarioId });
      if (res.ok) {
        setResult(res);
      } else {
        setError(res.message);
      }
    });
  }

  if (result) {
    if ('status' in result && result.status === 'pending_approval') {
      return (
        <div className="space-y-1">
          <p className="text-sm text-amber-700 font-medium">Approval request submitted.</p>
          <p className="text-xs text-slate-500">
            A manager has been notified via HubSpot Workflow. You will be able to publish once
            approved. (Request ID: {result.approvalRequestId})
          </p>
        </div>
      );
    }
    if ('status' in result && result.status === 'rejected') {
      return (
        <div className="space-y-1">
          <p className="text-sm text-red-700 font-medium">Approval rejected.</p>
          <p className="text-xs text-slate-500">
            The approval request was rejected. Please review the pricing and resubmit. (Request ID:{' '}
            {result.approvalRequestId})
          </p>
        </div>
      );
    }
    // status: published
    const published = result as { ok: true; hubspotQuoteId: string; shareableUrl: string | null };
    return (
      <div className="space-y-1">
        <p className="text-sm text-green-700 font-medium">Published successfully.</p>
        {published.shareableUrl && (
          <a
            href={published.shareableUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline text-blue-600"
          >
            Open quote in HubSpot
          </a>
        )}
        <p className="text-xs text-slate-500">Quote ID: {published.hubspotQuoteId}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button onClick={handlePublish} disabled={isPending}>
        {isPending ? 'Publishing…' : 'Publish to HubSpot'}
      </Button>
      {hasHardRailOverrides && !isPending && (
        <p className="text-sm text-amber-700">
          This scenario has hard-rail overrides — publishing will route through the approval flow.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PENDING_APPROVAL banner
// ---------------------------------------------------------------------------

function PendingApprovalBanner({
  approvalRequest,
  hubspotDealId,
}: {
  approvalRequest: HubSpotApprovalRequestRow;
  hubspotDealId: string;
}) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 space-y-2">
      <p className="text-sm font-semibold text-amber-800">Waiting on manager approval</p>
      <p className="text-xs text-amber-700">
        Submitted {new Date(approvalRequest.submittedAt).toLocaleString()}. A manager has been
        notified via HubSpot Workflow.
      </p>
      <a
        href={`https://app.hubspot.com/contacts/deals/${hubspotDealId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-xs underline text-blue-600"
      >
        View Deal in HubSpot
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// APPROVAL_REJECTED banner + resubmit
// ---------------------------------------------------------------------------

function RejectedBanner({ scenarioId }: { scenarioId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleResubmit() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await supersedeScenarioQuoteAction({ scenarioId });
      if (!res.ok) {
        setError(res.message);
      } else if ('status' in res && res.status === 'pending_approval') {
        setNotice(`Approval request resubmitted (ID: ${res.approvalRequestId}).`);
      } else if ('status' in res && res.status === 'rejected') {
        setError(`Still rejected (ID: ${res.approvalRequestId}). Review pricing and retry.`);
      } else {
        setNotice('Revision published successfully.');
      }
    });
  }

  return (
    <div className="rounded-md border border-red-300 bg-red-50 p-4 space-y-3">
      <p className="text-sm font-semibold text-red-800">Approval rejected</p>
      <p className="text-xs text-red-700">
        A manager rejected this pricing. Revise the scenario and resubmit for approval.
      </p>
      <div className="space-y-1">
        <Button
          onClick={handleResubmit}
          disabled={isPending}
          variant="outline"
          size="sm"
          className="border-red-400 text-red-700 hover:bg-red-100"
        >
          {isPending ? 'Resubmitting…' : 'Revise and resubmit'}
        </Button>
        {notice && <p className="text-xs text-amber-700">{notice}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Published quote status sub-section
// ---------------------------------------------------------------------------

function QuoteStatus({
  scenarioId,
  quote,
  hasHardRailOverrides,
  approvalRequest,
}: {
  scenarioId: string;
  quote: HubSpotQuoteRow;
  hasHardRailOverrides: boolean;
  approvalRequest: HubSpotApprovalRequestRow | null;
}) {
  const [reviseError, setReviseError] = useState<string | null>(null);
  const [reviseNotice, setReviseNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Handle approval-gated states before showing standard quote UI
  if (quote.publishState === 'PENDING_APPROVAL') {
    return (
      <PendingApprovalBanner
        approvalRequest={
          approvalRequest ?? {
            id: '',
            status: 'PENDING',
            submittedAt: new Date(),
            resolvedAt: null,
            resolvedByHubspotOwnerId: null,
            hubspotDealId: quote.hubspotQuoteId, // fallback
          }
        }
        hubspotDealId={approvalRequest?.hubspotDealId ?? quote.hubspotQuoteId}
      />
    );
  }

  if (quote.publishState === 'APPROVAL_REJECTED') {
    return <RejectedBanner scenarioId={scenarioId} />;
  }

  function handleRevise() {
    setReviseError(null);
    setReviseNotice(null);
    startTransition(async () => {
      const res = await supersedeScenarioQuoteAction({ scenarioId });
      if (!res.ok) {
        setReviseError(res.message);
      } else if ('status' in res && res.status === 'pending_approval') {
        setReviseNotice(`Approval request submitted (ID: ${res.approvalRequestId}).`);
      } else if ('status' in res && res.status === 'rejected') {
        setReviseError(
          `Approval rejected (ID: ${res.approvalRequestId}). Review pricing and retry.`,
        );
      }
    });
  }

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-slate-500">HubSpot Quote ID</dt>
        <dd className="font-mono">{quote.hubspotQuoteId}</dd>

        <dt className="text-slate-500">Revision</dt>
        <dd>v{quote.revision}</dd>

        <dt className="text-slate-500">State</dt>
        <dd>{quote.publishState}</dd>

        {quote.lastStatus && (
          <>
            <dt className="text-slate-500">Last status</dt>
            <dd>{quote.lastStatus}</dd>
          </>
        )}

        {quote.publishedAt && (
          <>
            <dt className="text-slate-500">Published</dt>
            <dd>{new Date(quote.publishedAt).toLocaleString()}</dd>
          </>
        )}
      </dl>

      {quote.shareableUrl && (
        <a
          href={quote.shareableUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline text-blue-600"
        >
          Open shareable quote link
        </a>
      )}

      <div className="pt-1 space-y-1">
        <Button onClick={handleRevise} disabled={isPending} variant="outline" size="sm">
          {isPending ? 'Publishing revision…' : 'Revise (new revision)'}
        </Button>
        {hasHardRailOverrides && !isPending && !reviseNotice && (
          <p className="text-sm text-amber-700">
            This scenario has hard-rail overrides — revising will route through the approval flow.
          </p>
        )}
        {reviseNotice && <p className="text-sm text-amber-700">{reviseNotice}</p>}
        {reviseError && <p className="text-sm text-red-600">{reviseError}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section component
// ---------------------------------------------------------------------------

export default function HubSpotSection({
  scenarioId,
  hubspotDealId,
  latestQuote,
  hasHardRailOverrides,
  approvalRequest,
}: Props) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">HubSpot</h2>
        {hubspotDealId && (
          <p className="text-sm text-slate-500">
            Deal:{' '}
            <a
              href={`https://app.hubspot.com/contacts/deals/${hubspotDealId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-blue-600"
            >
              {hubspotDealId}
            </a>
          </p>
        )}
      </div>

      {!hubspotDealId ? (
        <LinkDealForm scenarioId={scenarioId} />
      ) : latestQuote ? (
        <QuoteStatus
          scenarioId={scenarioId}
          quote={latestQuote}
          hasHardRailOverrides={hasHardRailOverrides}
          approvalRequest={approvalRequest}
        />
      ) : (
        <PublishButton scenarioId={scenarioId} hasHardRailOverrides={hasHardRailOverrides} />
      )}
    </section>
  );
}
