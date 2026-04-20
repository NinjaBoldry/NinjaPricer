import Link from 'next/link';
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
import { UserRepository } from '@/lib/db/repositories/user';
import { requireAdmin } from '@/lib/auth/session';
import { inviteUser, setUserRole } from './actions';

export default async function UsersPage({ searchParams }: { searchParams?: { error?: string } }) {
  const [actingUser, users] = await Promise.all([
    requireAdmin(),
    new UserRepository(prisma).findAll(),
  ]);

  const error = searchParams?.error ? decodeURIComponent(searchParams.error) : null;

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/admin" className="hover:underline">
          Admin
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">Users</span>
      </div>

      <h1 className="text-xl font-semibold mb-6">Users</h1>

      {error && <p className="text-destructive text-sm mb-4">{error}</p>}

      <Table className="mb-10">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Change Role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => {
            const isSelf = u.id === actingUser.id;
            return (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded border ${
                      u.role === 'ADMIN'
                        ? 'border-blue-300 text-blue-700 bg-blue-50'
                        : 'border-gray-300 text-gray-600 bg-gray-50'
                    }`}
                  >
                    {u.role}
                  </span>
                </TableCell>
                <TableCell>
                  <form action={setUserRole.bind(null, u.id)} className="flex items-center gap-2">
                    <select
                      name="role"
                      defaultValue={u.role}
                      className="h-8 rounded border border-input bg-transparent px-2 text-sm shadow-sm"
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="SALES">SALES</option>
                    </select>
                    <Button type="submit" size="sm" variant="outline">
                      {isSelf ? 'Update (self)' : 'Update'}
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            );
          })}
          {users.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                No users yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <section className="max-w-md">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Invite User
        </h2>
        <p className="text-xs text-muted-foreground mb-4">
          Pre-provisions a user account. The invitee logs in via Microsoft SSO — no email is sent.
        </p>
        <form action={inviteUser} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              placeholder="name@ninjaconcepts.com"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-role">Role</Label>
            <select
              id="invite-role"
              name="role"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="SALES">SALES</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          <Button type="submit">Invite User</Button>
        </form>
      </section>
    </div>
  );
}
