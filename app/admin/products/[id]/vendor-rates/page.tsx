import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { prisma } from '@/lib/db/client';
import { ProductRepository } from '@/lib/db/repositories/product';
import { VendorRateRepository } from '@/lib/db/repositories/vendorRate';
import { upsertVendorRate, deleteVendorRate } from './actions';

export default async function VendorRatesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const product = await new ProductRepository(prisma).findById(params.id);
  if (!product) notFound();

  const vendorRates = await new VendorRateRepository(prisma).findByProduct(params.id);

  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;
  const upsert = upsertVendorRate.bind(null, params.id);

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/admin/products" className="hover:underline">
          Products
        </Link>
        <span>/</span>
        <Link href={`/admin/products/${params.id}`} className="hover:underline">
          {product.name}
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Vendor Rates</span>
      </div>

      <h1 className="text-xl font-semibold mb-6">Vendor Rates</h1>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      <Table className="mb-8">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Unit Label</TableHead>
            <TableHead>Rate (USD)</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vendorRates.map((vr) => (
            <TableRow key={vr.id}>
              <TableCell>{vr.name}</TableCell>
              <TableCell>{vr.unitLabel}</TableCell>
              <TableCell>{parseFloat(vr.rateUsd.toString()).toFixed(6)}</TableCell>
              <TableCell>
                <form action={deleteVendorRate.bind(null, vr.id, params.id)}>
                  <Button type="submit" variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
          {vendorRates.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                No vendor rates yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <section className="max-w-md">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Add / Update Vendor Rate
        </h2>
        <form action={upsert} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required placeholder="e.g. OpenAI GPT-4o" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="unitLabel">Unit Label</Label>
            <Input id="unitLabel" name="unitLabel" required placeholder="e.g. tokens" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rateUsd">Rate (USD)</Label>
            <Input
              id="rateUsd"
              name="rateUsd"
              type="number"
              step="0.000001"
              min="0.000001"
              required
              placeholder="0.000001"
            />
          </div>
          <Button type="submit">Save Vendor Rate</Button>
        </form>
      </section>
    </div>
  );
}
