'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/labor-skus', label: 'Labor SKUs' },
  { href: '/admin/labor/departments', label: 'Departments' },
  { href: '/admin/employees', label: 'Employees' },
  { href: '/admin/labor/burdens', label: 'Burdens' },
  { href: '/admin/commissions', label: 'Commissions' },
  { href: '/admin/bundles', label: 'Bundles' },
  { href: '/admin/users', label: 'Users' },
] as const;

// Rails are per-product, accessed via /admin/products/[id]/rails — not a top-level nav item.

export default function AdminSidebar({ currentPath }: { currentPath?: string }) {
  const pathname = usePathname() ?? currentPath ?? '/admin';
  return (
    <nav className="w-56 shrink-0 border-r bg-slate-50 p-4 space-y-1">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
        Admin
      </p>
      {NAV.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            {...(active ? { 'aria-current': 'page' as const } : {})}
            className={`block rounded px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-200'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
