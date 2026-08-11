import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function CanvasNotFound() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="text-sm font-medium text-amber-300">Canvas unavailable</p>
      <h1 className="mt-4 text-4xl font-semibold">
        This canvas cannot be opened.
      </h1>
      <p className="mt-4 leading-7 text-zinc-400">
        It may no longer exist, or it may not be shared with this account.
      </p>
      <Link href="/app" className={buttonVariants({ className: "mt-8" })}>
        Return to your canvases
      </Link>
    </main>
  );
}
