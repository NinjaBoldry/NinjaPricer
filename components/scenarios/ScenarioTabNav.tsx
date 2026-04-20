'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: 'notes', label: 'Notes' },
  { href: 'training', label: 'Training & White-glove' },
  { href: 'service', label: 'Service' },
];

export default function ScenarioTabNav({ scenarioId }: { scenarioId: string }) {
  const pathname = usePathname();

  return (
    <nav className="border-b px-6 flex gap-1 text-sm shrink-0">
      {TABS.map((tab) => {
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
