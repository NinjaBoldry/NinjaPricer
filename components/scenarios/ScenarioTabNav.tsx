'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const STATIC_TABS = [
  { href: 'notes', label: 'Notes' },
  { href: 'training', label: 'Training & White-glove' },
  { href: 'service', label: 'Service' },
  { href: 'quotes', label: 'Quotes' },
  { href: 'hubspot', label: 'HubSpot' },
];

interface MeteredProduct {
  id: string;
  name: string;
}

interface Props {
  scenarioId: string;
  meteredProducts?: MeteredProduct[];
}

export default function ScenarioTabNav({ scenarioId, meteredProducts = [] }: Props) {
  const pathname = usePathname();

  // METERED tabs sit between Notes and Training so SaaS-related tabs cluster.
  const meteredTabs = meteredProducts.map((p) => ({
    href: `metered/${p.id}`,
    label: p.name,
  }));
  const tabs = [STATIC_TABS[0]!, ...meteredTabs, ...STATIC_TABS.slice(1)];

  return (
    <nav className="border-b px-6 flex gap-1 text-sm shrink-0">
      {tabs.map((tab) => {
        const href = `/scenarios/${scenarioId}/${tab.href}`;
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.href}
            href={href}
            className={`px-3 py-3 font-medium border-b-2 transition-colors ${
              isActive
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
