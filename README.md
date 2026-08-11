# Thinking Canvas

Thinking Canvas is a shared spatial workspace where people and AI can develop, challenge, and review ideas together. The project is currently in Milestone 0: architecture spikes and project foundation.

## Local development

```sh
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Do not commit `.env.local` or any real credentials. Local, Netlify deploy-preview, and Netlify production values are separate environments.

## Quality checks

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

The approved milestone plan and implementation evidence live in [`docs/implementation/`](docs/implementation/).
