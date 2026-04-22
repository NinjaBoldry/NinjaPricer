import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { prisma } from '@/lib/db/client';
import { BundleRepository } from '@/lib/db/repositories/bundle';
import { createBundle } from './actions';

export default async function BundlesPage({ searchParams }: { searchParams?: { error?: string } }) {
  const bundles = await new BundleRepository(prisma).findAll();
  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Bundles</span>
      </div>

      <h1 className="text-xl font-semibold mb-6">Bundles</h1>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      <Table className="mb-8">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Items</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bundles.map((b) => (
            <TableRow key={b.id}>
              <TableCell>
                <Link href={`/admin/bundles/${b.id}`} className="font-medium hover:underline">
                  {b.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">{b.description ?? '—'}</TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground">
                  {b.items.length} item{b.items.length !== 1 ? 's' : ''}
                </span>
              </TableCell>
            </TableRow>
          ))}
          {bundles.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                No bundles yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <section className="max-w-md">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          New Bundle
        </h2>
        <form action={createBundle} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="bundle-name">Name</Label>
            <Input id="bundle-name" name="name" required placeholder="e.g. Enterprise Starter" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Short marketing description shown on customer quotes"
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sku">SKU (optional)</Label>
            <Input
              id="sku"
              name="sku"
              placeholder="Auto-generated from name if blank"
              style={{ textTransform: 'uppercase' }}
            />
          </div>
          <Button type="submit">Create Bundle</Button>
        </form>
      </section>
    </div>
  );
}
