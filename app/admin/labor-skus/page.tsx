import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { prisma } from '@/lib/db/client';
import { LaborSKURepository } from '@/lib/db/repositories/laborSku';

export default async function LaborSKUsPage() {
  const skus = await new LaborSKURepository(prisma).listAllWithProduct();

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/admin" className="hover:underline">Admin</Link>
        <span>/</span>
        <span className="text-foreground font-medium">Labor SKUs</span>
      </div>

      <h1 className="text-xl font-semibold mb-2">Labor SKUs</h1>
      <p className="text-sm text-muted-foreground mb-6">
        All active labor SKUs across products. Add or edit SKUs from their product.
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Cost / Unit</TableHead>
            <TableHead>Default Revenue</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {skus.map((sku) => (
            <TableRow key={sku.id}>
              <TableCell className="font-medium">
                <Link
                  href={`/admin/products/${sku.productId}/labor-skus`}
                  className="hover:underline"
                >
                  {sku.name}
                </Link>
              </TableCell>
              <TableCell>
                <Link
                  href={`/admin/products/${sku.productId}`}
                  className="hover:underline"
                >
                  {sku.product.name}
                </Link>
              </TableCell>
              <TableCell>{sku.unit}</TableCell>
              <TableCell>${sku.costPerUnitUsd.toString()}</TableCell>
              <TableCell>${sku.defaultRevenueUsd.toString()}</TableCell>
            </TableRow>
          ))}
          {skus.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No labor SKUs yet.{' '}
                <Link href="/admin/products" className="underline">
                  Add one from a product
                </Link>
                .
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
