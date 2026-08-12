import { LogOut } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

type Props = {
  identity: string;
};

export function AuthenticatedHeader({ identity }: Props) {
  return (
    <header className="border-b border-zinc-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <div>
          <p className="font-semibold">Thinking Canvas</p>
          <p className="text-xs text-zinc-400">Shared spatial workspace</p>
        </div>
        <div className="flex items-center gap-3">
          <p className="hidden text-sm text-zinc-400 sm:block">{identity}</p>
          <form action={signOut}>
            <Button type="submit" variant="outline">
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
