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
import { BaseUsageRepository } from '@/lib/db/repositories/baseUsage';
import { upsertBaseUsage } from './actions';

export default async function BaseUsagePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const product = await new ProductRepository(prisma).findById(params.id);
  if (!product) notFound();

  const vendorRates = await new VendorRateRepository(prisma).findByProduct(params.id);
  const baseUsages = await new BaseUsageRepository(prisma).findByProduct(params.id);

  const vendorRateMap = new Map(vendorRates.map((vr) => [vr.id, vr]));

  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;
  const upsert = upsertBaseUsage.bind(null, params.id);

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
        <span className="text-foreground font-medium">Base Usage</span>
      </div>

      <h1 className="text-xl font-semibold mb-6">Base Usage</h1>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      <Table className="mb-8">
        <TableHeader>
          <TableRow>
            <TableHead>Vendor Rate</TableHead>
            <TableHead>Usage Per Month</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {baseUsages.map((bu) => (
            <TableRow key={bu.id}>
              <TableCell>{vendorRateMap.get(bu.vendorRateId)?.name ?? bu.vendorRateId}</TableCell>
              <TableCell>{bu.usagePerMonth.toString()}</TableCell>
            </TableRow>
          ))}
          {baseUsages.length === 0 && (
            <TableRow>
              <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                No base usage entries yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <section className="max-w-md">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Add / Update Base Usage
        </h2>
        {vendorRates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add vendor rates first before configuring base usage.
          </p>
        ) : (
          <form action={upsert} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="vendorRateId">Vendor Rate</Label>
              <select
                id="vendorRateId"
                name="vendorRateId"
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">Select vendor rate</option>
                {vendorRates.map((vr) => (
                  <option key={vr.id} value={vr.id}>
                    {vr.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="usagePerMonth">Usage Per Month</Label>
              <Input
                id="usagePerMonth"
                name="usagePerMonth"
                type="number"
                step="0.000001"
                min="0"
                required
                placeholder="0"
              />
            </div>
            <Button type="submit">Save Base Usage</Button>
          </form>
        )}
      </section>
    </div>
  );
}
