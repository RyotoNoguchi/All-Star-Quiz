This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Implemented: multiplayer waiting room

The home page supports room creation, joining with a six-character code or invitation
link, a participant list refreshed every two seconds, and leaving a room. The same
browser restores its membership on reload. When the host leaves, the next participant
becomes host. Rooms allow 20 participants and expire 24 hours after creation.
The existing single-question demo is available at `/demo`.
Server APIs now implement progression, answer acceptance and normal/final question scoring. The home page remains a waiting room until the planned browser gameplay integration.

Use Node.js 22.22.0 (`.node-version`) and follow [the database setup guide](docs/DATABASE.md), then run `npm run dev`.
For phones on the same network, open the server's Network URL shown at startup;
share that URL rather than localhost. A browser cookie identifies each participant,
so use different browsers/devices for different players.

Room data is now stored in PostgreSQL with transactions shared across server processes.
See [the database setup guide](docs/DATABASE.md) for Docker startup, migrations, seeds,
isolated database tests and the transition from the previous local file storage.

Validation: `npm run test:run`, `npm run type-check`, `npm run build`.

## Development backlog

See [the GitHub implementation roadmap](https://github.com/RyotoNoguchi/All-Star-Quiz/issues/28) for all 27 planned tasks and their completion status, acceptance criteria, and dependencies. A local copy is in [docs/GITHUB_BACKLOG.md](docs/GITHUB_BACKLOG.md).

## Game contract

[サバイバルクイズ仕様 v1](docs/GAME_CONTRACT.md) defines the game rules, state transitions, server timing, retry behavior and public/private message contracts for Issue #1. Multiplayer gameplay will be implemented in the dependent issues.

## Hosting architecture

[配備構成 ADR-002](docs/HOSTING.md) defines Vercel, the separate persistent realtime server, shared stores, environment variables and deployment prerequisites. Run `npm run test:transport` for the local transport feasibility check.

## Quality checks

Run `npm ci` with the Node version in `.node-version`, then `npm run check` before opening a PR. This runs ESLint, Prettier, unit tests, the Socket.IO transport probe, TypeScript, and the production build. GitHub Actions runs the same sequence on pull requests and main.

`npm run format` formats the project source, configuration and documentation. Generated build files, dependencies, local data, environment files and the lockfile are excluded. The initial formatting baseline is included with the CI setup.

## Guest sessions

[ゲスト認証 ADR-005](docs/AUTHENTICATION.md) describes stable guest identities, 30-day HttpOnly sessions, expiry, legacy-cookie migration and membership across tabs and rooms.

## API

[型付きAPI](docs/API.md) documents the tRPC client/server contract, validation, error responses and the compatible legacy endpoint.

## Administration

[管理者のセットアップと権限](docs/ADMIN.md) describes account provisioning, login, expiry and the separation between administrators and room hosts.

## Question management and shared state

[問題管理API](docs/QUESTIONS.md) covers administrator CRUD, category selection and immutable game question sets.
[共有状態](docs/SHARED_STATE.md) covers the Redis cache, expiring leases, PostgreSQL authority and recovery.
Run `docker compose up -d` for both PostgreSQL and Redis. Configure `TEST_DATABASE_URL` and `TEST_REDIS_URL` from `.env.example` before running `npm run check`; its database integration suite also verifies Redis with an isolated key prefix.

## Persistent realtime server

[常駐通信サーバー](docs/REALTIME.md) documents authenticated tickets, allowed origins, multi-instance delivery and startup. Set a real `REALTIME_TICKET_SECRET`, run `npm run build`, then `npm run realtime:start` alongside the web server. Browser integration follows in Issue #16.

## Game progression

[ゲーム進行API](docs/GAME_PROGRESS.md) covers host commands, persisted deadlines, idempotency, departures and host transfer. The realtime process runs deadline maintenance. Answer acceptance and scoring follow in Issues #12–#14; browser gameplay follows in Issues #16–#18.

## Answer acceptance

[回答受付API](docs/ANSWERS.md) describes authenticated HTTP/Socket.IO submission, server timestamps, exclusive deadlines, durable admission and retry behavior.

## Normal-question scoring

[通常問題の判定](docs/SCORING.md) describes wrong/timeout/slowest elimination, ties, departures and immutable question results.

## Final results

[最終問題と確定結果](docs/FINAL_RESULTS.md) covers winner selection, tied rankings, persisted statistics and the final-reveal event.

ゲームイベント配信・全フェーズの状態同期は実装済みです。公開情報と本人の回答を分離し、イベント欠落時は最新状態から復元します。通信仕様は[REALTIME.md](docs/REALTIME.md)を参照してください。ホーム画面の待合室はイベント同期に接続済みです。通信断の再接続、最新状態の復元、複数タブの退出通知に対応しています。出題・回答画面はIssue #17以降で実装します。
