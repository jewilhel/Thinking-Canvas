import { ArrowUpRight, Blocks, FlaskConical, ShieldCheck } from "lucide-react";

const foundations = [
  {
    title: "Deployable shell",
    description: "Next.js, TypeScript, Tailwind CSS, and shadcn/ui are ready.",
    icon: Blocks,
  },
  {
    title: "Quality gates",
    description:
      "Formatting, linting, types, tests, and accessibility run in CI.",
    icon: ShieldCheck,
  },
  {
    title: "Architecture spikes",
    description:
      "Collaboration, persistence, canvas, documents, AI, and voice are next.",
    icon: FlaskConical,
  },
] as const;

export default function Home() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,var(--color-muted),transparent_42%)] px-6 py-10 sm:px-10 lg:px-16">
      <div
        aria-hidden="true"
        className="bg-foreground/5 absolute top-0 right-0 -z-10 h-96 w-96 translate-x-1/3 -translate-y-1/3 rounded-full blur-3xl"
      />

      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-between gap-16">
        <header className="border-border/80 flex items-center justify-between gap-4 border-b pb-5">
          <p className="text-sm font-semibold tracking-tight">
            Thinking Canvas
          </p>
          <p className="bg-background/70 text-muted-foreground rounded-full border px-3 py-1 text-xs shadow-sm backdrop-blur">
            Milestone 0
          </p>
        </header>

        <section
          className="max-w-3xl py-8"
          aria-labelledby="foundation-heading"
        >
          <p className="text-muted-foreground mb-5 text-xs font-semibold tracking-[0.2em] uppercase">
            Architecture spikes and project foundation
          </p>
          <h1
            id="foundation-heading"
            className="text-5xl leading-[0.95] font-semibold tracking-[-0.055em] text-balance sm:text-7xl"
          >
            A durable place to think together.
          </h1>
          <p className="text-muted-foreground mt-7 max-w-2xl text-lg leading-8 sm:text-xl">
            The first foundation is in place. This protected spike workspace
            will prove the collaboration, persistence, AI, and voice
            architecture before product features begin.
          </p>
        </section>

        <section
          aria-label="Foundation status"
          className="grid gap-3 md:grid-cols-3"
        >
          {foundations.map(({ title, description, icon: Icon }) => (
            <article
              key={title}
              className="group bg-background/75 hover:bg-background rounded-2xl border p-5 shadow-sm backdrop-blur transition-colors"
            >
              <div className="mb-8 flex items-start justify-between">
                <span className="bg-foreground text-background flex size-9 items-center justify-center rounded-xl">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </div>
              <h2 className="font-medium">{title}</h2>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                {description}
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
