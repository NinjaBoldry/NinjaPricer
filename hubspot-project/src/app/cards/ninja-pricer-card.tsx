import { hubspot, Text, Flex, Link, Heading, Divider } from '@hubspot/ui-extensions';

hubspot.extend(({ context }) => <NinjaPricerCard dealId={context?.crm?.objectId ?? ''} />);

function NinjaPricerCard({ dealId }: { dealId: string }) {
  const launchUrl = `https://ninjapricer-production.up.railway.app/scenarios/from-deal?dealId=${encodeURIComponent(dealId)}`;

  return (
    <Flex direction="column" gap="md">
      <Heading>Ninja Pricer</Heading>
      <Text>Build or open the quote for this Deal.</Text>
      <Divider />
      <Link href={launchUrl} external>
        Open in Ninja Pricer →
      </Link>
    </Flex>
  );
}
