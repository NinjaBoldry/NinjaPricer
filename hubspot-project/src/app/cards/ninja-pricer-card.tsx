import { useState, useEffect } from 'react';
import {
  hubspot,
  Button,
  Text,
  Flex,
  Link,
  Input,
  Alert,
  Divider,
  Heading,
  LoadingSpinner,
} from '@hubspot/ui-extensions';

type CardState =
  | { state: 'loading' }
  | { state: 'no_scenario' }
  | {
      state: 'linked_no_quote';
      scenarioId: string;
      scenarioName: string;
      scenarioUpdatedAt: string;
      pricerUrl: string;
    }
  | {
      state: 'pending_approval';
      scenarioId: string;
      scenarioName: string;
      pricerUrl: string;
    }
  | {
      state: 'approval_rejected';
      scenarioId: string;
      scenarioName: string;
      pricerUrl: string;
    }
  | {
      state: 'published';
      scenarioId: string;
      scenarioName: string;
      hubspotQuoteId: string;
      shareableUrl?: string;
      revision: number;
      lastStatus?: string;
      dealOutcome?: string;
      pricerUrl: string;
    }
  | { state: 'error'; message: string };

hubspot.extend(() => <NinjaPricerCard />);

function NinjaPricerCard() {
  const [cardState, setCardState] = useState<CardState>({ state: 'loading' });
  const [customerName, setCustomerName] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkResult, setLinkResult] = useState<{ pricerUrl: string } | null>(null);

  async function fetchState() {
    try {
      const res = await hubspot.serverless('get-card-state', {});
      setCardState(res.response?.body as CardState);
    } catch (e) {
      setCardState({
        state: 'error',
        message: e instanceof Error ? e.message : 'unknown error',
      });
    }
  }

  useEffect(() => {
    fetchState();
  }, []);

  async function onBuildQuote() {
    setBusy(true);
    setLinkResult(null);
    try {
      const res = await hubspot.serverless('link-deal', {
        parameters: { customerName: customerName.trim() || 'New Customer' },
      });
      const body = res.response?.body as { scenarioId?: string; pricerUrl?: string };
      if (body?.pricerUrl) {
        // Store the URL so we can render a Link for the user to click.
        // window.open is not available in the card sandbox.
        setLinkResult({ pricerUrl: body.pricerUrl });
      }
      await fetchState();
    } finally {
      setBusy(false);
    }
  }

  async function onPublish(scenarioId: string) {
    setBusy(true);
    try {
      await hubspot.serverless('publish-quote', { parameters: { scenarioId } });
      await fetchState();
    } finally {
      setBusy(false);
    }
  }

  // --- Render states ---

  if (cardState.state === 'loading') {
    return (
      <Flex direction="column" gap="sm">
        <LoadingSpinner label="Loading quote state…" />
      </Flex>
    );
  }

  if (cardState.state === 'error') {
    return (
      <Alert title="Error" variant="danger">
        {cardState.message}
      </Alert>
    );
  }

  if (cardState.state === 'no_scenario') {
    return (
      <Flex direction="column" gap="md">
        <Heading>Ninja Pricer</Heading>
        <Text>No quote yet for this Deal.</Text>
        <Input
          name="customerName"
          label="Customer name"
          value={customerName}
          onChange={setCustomerName}
        />
        <Button variant="primary" disabled={busy} onClick={onBuildQuote}>
          {busy ? 'Creating…' : 'Build Quote'}
        </Button>
        {linkResult && (
          <Link href={linkResult.pricerUrl} external>
            Open scenario in Pricer
          </Link>
        )}
      </Flex>
    );
  }

  if (cardState.state === 'linked_no_quote') {
    return (
      <Flex direction="column" gap="md">
        <Heading>{cardState.scenarioName}</Heading>
        <Text>
          Scenario linked. Last edited:{' '}
          {new Date(cardState.scenarioUpdatedAt).toLocaleString()}
        </Text>
        <Flex direction="row" gap="sm">
          <Link href={cardState.pricerUrl} external>
            Continue in Pricer
          </Link>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => onPublish(cardState.scenarioId)}
          >
            {busy ? 'Publishing…' : 'Publish to HubSpot'}
          </Button>
        </Flex>
      </Flex>
    );
  }

  if (cardState.state === 'pending_approval') {
    return (
      <Flex direction="column" gap="md">
        <Heading>{cardState.scenarioName}</Heading>
        <Alert title="Waiting on manager approval" variant="warning">
          A manager needs to approve before the quote can be sent.
        </Alert>
        <Link href={cardState.pricerUrl} external>
          View in Pricer
        </Link>
      </Flex>
    );
  }

  if (cardState.state === 'approval_rejected') {
    return (
      <Flex direction="column" gap="md">
        <Heading>{cardState.scenarioName}</Heading>
        <Alert title="Approval rejected" variant="danger">
          Revise the scenario to pass rails and resubmit.
        </Alert>
        <Link href={cardState.pricerUrl} external>
          Open in Pricer to revise
        </Link>
      </Flex>
    );
  }

  // state === 'published'
  return (
    <Flex direction="column" gap="md">
      <Heading>
        {cardState.scenarioName} — Rev {cardState.revision}
      </Heading>
      {cardState.shareableUrl && (
        <Link href={cardState.shareableUrl} external>
          Open HubSpot Quote
        </Link>
      )}
      <Text>Status: {cardState.lastStatus ?? 'Sent'}</Text>
      {cardState.dealOutcome && <Text>Deal outcome: {cardState.dealOutcome}</Text>}
      <Divider />
      <Link href={cardState.pricerUrl} external>
        Revise in Pricer
      </Link>
    </Flex>
  );
}
