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
Quiz progression and multiplayer answer/elimination processing are not implemented yet.

Use Node.js 22.22.0 (`.node-version`), then run `npm ci` and `npm run dev`.
For phones on the same network, open the server's Network URL shown at startup;
share that URL rather than localhost. A browser cookie identifies each participant,
so use different browsers/devices for different players.

Room data is saved in `.data/rooms.json` (ignored by Git), so it survives restarts.
`ROOM_STORE_PATH` can override that path. This initial storage supports **one Node.js
server process with a writable persistent filesystem**. Before deploying to Vercel,
multiple processes or multiple servers, replace it with the planned shared database
and transactional storage. Polling currently synchronizes only waiting-room membership.

Validation: `npm run test:run`, `npm run type-check`, `npm run build`.
