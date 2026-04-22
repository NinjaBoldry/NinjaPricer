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

interface Props {
  scenarioId: string;
  hubspotDealId: string | null;
  latestQuote: HubSpotQuoteRow | null;
  /** True when the engine has at least one hard-severity rail warning */
  hasHardRailOverrides: boolean;
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

function PublishButton({
  scenarioId,
  hasHardRailOverrides,
}: {
  scenarioId: string;
  hasHardRailOverrides: boolean;
}) {
  const [result, setResult] = useState<{
    ok: true;
    hubspotQuoteId: string;
    shareableUrl: string | null;
  } | null>(null);
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
    return (
      <div className="space-y-1">
        <p className="text-sm text-green-700 font-medium">Published successfully.</p>
        {result.shareableUrl && (
          <a
            href={result.shareableUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline text-blue-600"
          >
            Open quote in HubSpot
          </a>
        )}
        <p className="text-xs text-slate-500">Quote ID: {result.hubspotQuoteId}</p>
      </div>
    );
  }

  if (hasHardRailOverrides) {
    return (
      <div className="space-y-2">
        <Button disabled variant="outline">
          Publish to HubSpot
        </Button>
        <p className="text-sm text-amber-700">
          Approval flow required — configure HubSpot Workflow (Phase 2c) before publishing scenarios
          with rail overrides.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button onClick={handlePublish} disabled={isPending}>
        {isPending ? 'Publishing…' : 'Publish to HubSpot'}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
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
}: {
  scenarioId: string;
  quote: HubSpotQuoteRow;
  hasHardRailOverrides: boolean;
}) {
  const [reviseError, setReviseError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRevise() {
    setReviseError(null);
    startTransition(async () => {
      const res = await supersedeScenarioQuoteAction({ scenarioId });
      if (!res.ok) setReviseError(res.message);
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
        {hasHardRailOverrides ? (
          <>
            <Button disabled variant="outline" size="sm">
              Revise (new revision)
            </Button>
            <p className="text-sm text-amber-700">
              Approval flow required — configure HubSpot Workflow (Phase 2c) before publishing
              scenarios with rail overrides.
            </p>
          </>
        ) : (
          <Button onClick={handleRevise} disabled={isPending} variant="outline" size="sm">
            {isPending ? 'Publishing revision…' : 'Revise (new revision)'}
          </Button>
        )}
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
        />
      ) : (
        <PublishButton scenarioId={scenarioId} hasHardRailOverrides={hasHardRailOverrides} />
      )}
    </section>
  );
}
