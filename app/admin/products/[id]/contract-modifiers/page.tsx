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
import { ContractLengthModifierRepository } from '@/lib/db/repositories/contractLengthModifier';
import { upsertContractModifier, deleteContractModifier } from './actions';

export default async function ContractModifiersPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { error?: string };
}) {
  const product = await new ProductRepository(prisma).findById(params.id);
  if (!product) notFound();

  const modifiers = await new ContractLengthModifierRepository(prisma).findByProduct(params.id);

  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;
  const upsert = upsertContractModifier.bind(null, params.id);

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
        <span className="text-foreground font-medium">Contract Length Modifiers</span>
      </div>

      <h1 className="text-xl font-semibold mb-6">Contract Length Modifiers</h1>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      <Table className="mb-8">
        <TableHeader>
          <TableRow>
            <TableHead>Min Months</TableHead>
            <TableHead>Additional Discount %</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {modifiers.map((m) => (
            <TableRow key={m.id}>
              <TableCell>{m.minMonths}</TableCell>
              <TableCell>
                {(parseFloat(m.additionalDiscountPct.toString()) * 100).toFixed(2)}%
              </TableCell>
              <TableCell>
                <form action={deleteContractModifier.bind(null, m.id, params.id)}>
                  <Button type="submit" variant="destructive" size="sm">
                    Delete
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          ))}
          {modifiers.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                No contract length modifiers yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <section className="max-w-md">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Add / Update Contract Modifier
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          Discount is stored as a decimal (0–1). Enter 0.05 for 5%.
        </p>
        <form action={upsert} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="minMonths">Min Months</Label>
            <Input
              id="minMonths"
              name="minMonths"
              type="number"
              step="1"
              min="1"
              required
              placeholder="12"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="additionalDiscountPct">Additional Discount (0–1)</Label>
            <Input
              id="additionalDiscountPct"
              name="additionalDiscountPct"
              type="number"
              step="0.0001"
              min="0"
              max="1"
              required
              placeholder="0.05"
            />
          </div>
          <Button type="submit">Save Modifier</Button>
        </form>
      </section>
    </div>
  );
}
