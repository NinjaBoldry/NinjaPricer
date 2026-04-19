// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AdminSidebar from './AdminSidebar';

const NAV_LINKS = [
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/labor-skus', label: 'Labor SKUs' },
  { href: '/admin/departments', label: 'Departments' },
  { href: '/admin/employees', label: 'Employees' },
  { href: '/admin/burdens', label: 'Burdens' },
  { href: '/admin/commissions', label: 'Commissions' },
  { href: '/admin/bundles', label: 'Bundles' },
  { href: '/admin/users', label: 'Users' },
];

it('renders all admin nav links', () => {
  render(<AdminSidebar currentPath="/admin/products" />);
  NAV_LINKS.forEach(({ label }) => {
    expect(screen.getByText(label)).toBeTruthy();
  });
});

it('marks the current path as active', () => {
  render(<AdminSidebar currentPath="/admin/products" />);
  const productsLink = screen.getByText('Products').closest('a');
  expect(productsLink?.getAttribute('aria-current')).toBe('page');
});
