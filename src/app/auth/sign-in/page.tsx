import { signIn } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

const messages: Record<string, string> = {
  "invalid-input": "Enter a valid email address and password.",
  "invalid-credentials": "The email address or password was not accepted.",
  "session-required": "Sign in to continue to the protected workspace.",
  "signed-out": "You have been signed out.",
};

type SignInPageProps = {
  searchParams: Promise<{ error?: string; reason?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const parameters = await searchParams;
  const messageKey = parameters.error ?? parameters.reason;
  const message = messageKey ? messages[messageKey] : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-16">
      <section
        aria-labelledby="sign-in-heading"
        className="w-full rounded-3xl border border-zinc-800 bg-zinc-950 p-8 shadow-2xl"
      >
        <p className="text-sm font-medium text-amber-300">Thinking Canvas</p>
        <h1 id="sign-in-heading" className="mt-3 text-3xl font-semibold">
          Sign in to the spike workspace
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          Milestone 0 uses non-production accounts and data while the security
          and collaboration architecture is being verified.
        </p>

        {message ? (
          <p
            role="status"
            className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-200"
          >
            {message}
          </p>
        ) : null}

        <form action={signIn} className="mt-8 space-y-5">
          <div>
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            />
          </div>
          <div>
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={8}
              required
              className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            />
          </div>
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
      </section>
    </main>
  );
}
