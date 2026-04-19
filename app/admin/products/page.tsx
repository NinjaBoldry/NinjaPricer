import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
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

const KIND_LABELS: Record<string, string> = {
  SAAS_USAGE: 'SaaS Usage',
  PACKAGED_LABOR: 'Packaged Labor',
  CUSTOM_LABOR: 'Custom Labor',
};

export default async function ProductsPage() {
  const products = await new ProductRepository(prisma).listAll();

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Products</h1>
        <Link
          href="/admin/products/new"
          className="inline-flex items-center justify-center rounded-lg border border-transparent bg-primary px-2.5 text-[0.8rem] font-medium text-primary-foreground h-7 hover:bg-primary/80 transition-colors"
        >
          + New Product
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <Link
                  href={`/admin/products/${p.id}`}
                  className="font-medium hover:underline"
                >
                  {p.name}
                </Link>
              </TableCell>
              <TableCell>{KIND_LABELS[p.kind] ?? p.kind}</TableCell>
              <TableCell>
                <Badge variant={p.isActive ? 'default' : 'secondary'}>
                  {p.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {products.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={3}
                className="text-center text-muted-foreground py-8"
              >
                No products yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
