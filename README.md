# Nature Class Community

Nature Class helps any adult lead a lesson outside. Each lesson is already
written: what to say, what to point at, what the children do, and how to close
it. The teacher prepares on a phone or tablet, takes the class outside, and the
screen stays secondary to the place.

This repository is the source of the teaching product, released under the GNU
Affero General Public License v3.0. It was built during the
Assembly Code 2026 cohort, which supported it. The hosted version runs at
<https://natureclass.education>.

## What is in it

The full single-teacher loop:

1. **Choose a lesson** from the season's shelf.
2. **Prepare**: a spoken walkthrough, pre-reading, what to bring and where to go,
   a safety guide.
3. **Run it outside**: one step at a time, with words to say, notes for the
   adult, questions for the class, and an optional play button on spoken lines.
4. **Print**: the teacher's field guide, the children's sheets and cards to clip.
5. **Finish** with circle time and reflection.

Teacher accounts, a teacher's own classes and places, a journal of lessons run,
and an offline field pack are included as well.

## Run it

You need Node 22 (see `.nvmrc`). Nothing else is required.

```bash
npm ci
npm run build
npm start
```

Open <http://localhost:3000>, choose **Try today's lesson**, and pick one of the
example places. Without a database the first lesson on the shelf opens in full,
and any lesson opens directly at `/session?session=<id>` (the ids are in
`packs/*.json`).

For development, `npm run dev` instead of build and start.

### Signing in, on your own machine

Accounts need a Postgres database and nothing paid. Any Postgres 16 works,
including a local one:

```bash
cp .env.example .env.local
# set DATABASE_URL and DATABASE_URL_UNPOOLED to your database,
# and BETTER_AUTH_SECRET to a long random string
npx prisma migrate deploy
npm run dev
```

With no email provider configured, `npm run dev` prints the sign-in link to the
terminal instead of emailing it. A production build refuses to sign anyone in
until an email provider is set, rather than pretending it sent a link.

## Optional services

None of these is needed to install, build, or run a lesson. Each one adds
something when it is configured, and the app says less, never something wrong,
when it is not. Every variable is described in `.env.example`.

| Service | What it adds | Without it |
|---|---|---|
| Pointmoon (`POINTMOON_API_URL`, defaults to the public service at `https://pointmoon.ai`) | Live conditions and what is in season near the class | Each lesson's authored text stands. Pointmoon is a separate service, not part of this repository |
| Postgres + Better Auth | Teacher accounts, classes, places, journal | Signed-out example use, as above |
| Resend | Sign-in and feedback email | Development prints the link; production refuses to send |
| Google or Microsoft sign-in | Convenience sign-in buttons | Email sign-in only |
| An AI model provider | Optional teacher helpers | Authored lessons only; nothing is generated |
| Langfuse | Prompt and timing records for the AI helpers | Nothing is recorded |
| PostHog | Aggregate usage analytics | Off; nothing is sent |
| Nominatim-compatible geocoder | Typing a school address | Example places, or the browser's location |
| ElevenLabs | Regenerating the spoken recordings | The committed recordings play as they are |

The test suite (`npx vitest run`) runs with none of them.

## Licences

- **Code**: AGPL-3.0, see [`LICENSE`](LICENSE). If you run a modified version
  as a service, section 13 asks you to offer your users its source.
- **Lesson packs** (`packs/`) and the spoken recordings that voice them: CC BY-SA 4.0.
- **Fonts, photographs, illustrations and reference data** carry their own
  licences, listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Copyright © 2026 Johan Gace.

## How this repository is made

Nature Class is developed in a private working repository. Each release is
exported here as one commit containing the complete source of what is running,
and `COMMUNITY_SOURCE.json` records the exact source commit it came from. The
private history, issue tracker and internal notes are not part of the release.

## Contributing

Issues are welcome. Pull requests are not being accepted yet, while the
contributor agreement is reviewed. When they open, a merged contribution is
carried into the next release and credited on its release commit.

Security reports: see [`SECURITY.md`](SECURITY.md).
