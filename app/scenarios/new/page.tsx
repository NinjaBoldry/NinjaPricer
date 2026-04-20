import { createScenarioAction } from './actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function NewScenarioPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-semibold mb-6">New scenario</h1>
      {searchParams.error && (
        <p className="text-sm text-red-600 mb-4 rounded bg-red-50 px-3 py-2">
          {searchParams.error}
        </p>
      )}
      <form action={createScenarioAction} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="name">Scenario name</Label>
          <Input id="name" name="name" required placeholder="Q3 Enterprise Pitch" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="customerName">Customer</Label>
          <Input id="customerName" name="customerName" required placeholder="Acme Corp" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="contractMonths">Contract length (months)</Label>
          <Input
            id="contractMonths"
            name="contractMonths"
            type="number"
            min="1"
            defaultValue="12"
            required
          />
        </div>
        <Button type="submit">Create scenario</Button>
      </form>
    </div>
  );
}
