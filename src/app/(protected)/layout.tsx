import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { requireAuthenticatedUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAuthenticatedUser();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="font-semibold">Thinking Canvas</p>
            <p className="text-xs text-zinc-500">
              Protected Milestone 0 workspace
            </p>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-sm text-zinc-400 sm:block">
              {user.email ?? user.id}
            </p>
            <form action={signOut}>
              <Button type="submit" variant="outline">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
