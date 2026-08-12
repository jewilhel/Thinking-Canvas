import { requireAuthenticatedUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAuthenticatedUser();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">{children}</div>
  );
}
