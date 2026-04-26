'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const SELECT_CLASSES =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm';

export function NewProductForm({
  action,
}: {
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [kind, setKind] = useState<string>('');

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required placeholder="e.g. Ninja Notes" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="kind">Kind</Label>
        <select
          name="kind"
          id="kind"
          required
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className={SELECT_CLASSES}
        >
          <option value="">Select kind</option>
          <option value="SAAS_USAGE">SaaS Usage</option>
          <option value="PACKAGED_LABOR">Packaged Labor</option>
          <option value="CUSTOM_LABOR">Custom Labor</option>
        </select>
      </div>
      {kind === 'SAAS_USAGE' && (
        <div className="space-y-1">
          <Label htmlFor="revenueModel">Revenue model</Label>
          <select
            name="revenueModel"
            id="revenueModel"
            defaultValue="PER_SEAT"
            className={SELECT_CLASSES}
          >
            <option value="PER_SEAT">Per-seat</option>
            <option value="METERED">Metered</option>
          </select>
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="Short marketing description shown on customer quotes"
          rows={3}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="sku">SKU</Label>
        <Input
          id="sku"
          name="sku"
          placeholder="Auto-generated from name if blank"
          style={{ textTransform: 'uppercase' }}
        />
      </div>
      <Button type="submit">Create Product</Button>
    </form>
  );
}
