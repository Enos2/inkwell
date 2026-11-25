<!-- Project: Inkwell -->
<!-- Location: README.md (project root) -->
<!-- Purpose: Explains what Inkwell is, how it is organised, and how to run it. -->

# Inkwell

**Where stories find their readers.** Inkwell is a social blogging and story-reading
platform for writers and readers around the world. Writers publish stories in
chapters, readers follow, comment, gift and support them, and the platform owner
runs the site with a ranked team of admins.

## Status

- **Backend:** first complete version (all feature areas listed below).
- **Frontend:** Next.js project started. The pages are being built.
- **Not ready for real users yet.** See "Before launch" at the end.

## What the backend does

- **Accounts:** register, log in and out. Tokens work for the website (cookie) and
  for a future mobile app (Bearer header).
- **Admin ranks:** Super Admin, Senior Admin, Ad Manager, Moderator, Editor and
  Support. Only the Super Admin can promote, demote or remove admins, and can switch
  a single ability on or off for one specific admin. Every admin action is logged.
- **Stories and chapters:** drafts, publishing, scheduled chapters, tags, YouTube
  and Vimeo links, members-only chapters, writer applications.
- **Reading tools:** library, reading progress, likes, comments with replies and
  paragraph comments, follows and a feed, notifications.
- **Profiles:** public profiles and social links.
- **Messaging:** private messages and blocking.
- **Ads:** the owner's own ads (banner, sidebar, between chapters, under posts)
  with country and tag targeting, view and click counts, and a Google AdSense switch.
- **Moderation:** reports, hiding stories and comments, featuring stories,
  suspending and banning users.
- **Money:** tips, gifts, writer memberships and Premium (no ads), a writer wallet,
  and payout requests.

## Tech stack

- **Backend:** Node.js, Express, TypeScript, Prisma, PostgreSQL (Neon)
- **Frontend:** Next.js, React, TypeScript, Tailwind CSS
- **Payments:** Paystack (cards and M-Pesa)

## Project structure

```
inkwell/
├── backend/     The API server (Express + Prisma)
│   ├── config/      Settings, database connection, admin ability lists
│   ├── middleware/  Login checks, rate limits, error handling
│   ├── routes/      The web addresses (endpoints)
│   ├── services/    The real work for each feature
│   ├── validators/  Checks for everything users send
│   ├── utils/       Small shared helpers
│   └── prisma/      The database plan (schema.prisma)
└── frontend/    The website (Next.js)
```

## Getting started

You need **Node.js 20 or newer** and a **PostgreSQL database** (a free Neon database
works well; turn connection pooling OFF when you copy the connection string).

### Backend

```
cd backend
npm install
Copy-Item .env.example .env
```

Open `backend/.env` and fill in the settings (table below), then:

```
npx prisma db push
npm run dev
```

Check that it works at http://localhost:4000/api/health

### Frontend

```
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

## Settings (`backend/.env`)

| Setting | Required | What it is |
|---|---|---|
| `PORT` | no | Port for the API (default 4000) |
| `FRONTEND_URL` | no | Address of the website, allowed to call the API |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Long random text (32+ characters) that signs login tokens |
| `SUPER_ADMIN_EMAIL` | yes | The first account to register with this email becomes Super Admin |
| `PAYSTACK_SECRET_KEY` | no | Paystack secret key (use a `sk_test_` key while building) |
| `PAYMENTS_SANDBOX` | no | `"true"` fakes payments for local testing. Ignored in production |

Never upload your real `.env` file anywhere. `.env.example` is the safe template.

## Admin ranks

| Rank | Main powers |
|---|---|
| Super Admin | Everything. The only one who manages admins and money |
| Senior Admin | Content, users, reports, featured stories, activity log |
| Ad Manager | Ads and the AdSense switch |
| Moderator | Hide stories and comments, suspend and ban, handle reports |
| Editor | Feature stories, approve writers |
| Support | View reports |

## API overview

All addresses start with `/api`.

| Area | Base address |
|---|---|
| Accounts | `/auth` |
| Profiles | `/users` |
| Writers | `/writer` |
| Stories, chapters, tags, featured | `/stories`, `/chapters`, `/tags`, `/featured` |
| Reading tools | `/library`, `/progress`, `/likes`, `/comments` |
| Social | `/follows`, `/feed`, `/notifications`, `/messages`, `/blocks` |
| Reports and ads | `/reports`, `/ads` |
| Money | `/payments`, `/memberships`, `/wallet`, `/webhooks/paystack` |
| Admin | `/admin/...` (writers, ads, moderation, payments, admins, logs) |

## Payments

Payments use Paystack's hosted checkout, so card and M-Pesa details never reach this
server. Prices are in US dollars and readers can pay in USD or KES (the Super Admin
sets the exchange rate). Writers keep their share of every payment in a wallet and
request payouts, which the Super Admin pays by hand. Always confirm Paystack's
current fees and requirements before launch.

## Before launch

- Set `NODE_ENV=production` on the host and make sure `PAYMENTS_SANDBOX` is off.
- Add the live Paystack key and set the webhook address
  (`/api/webhooks/paystack`) in the Paystack dashboard.
- Email verification and password reset are not built yet.
- File uploads (avatars, covers) are not built yet. Images are links for now.
- There are no automated tests yet.
- Check the rate-limit numbers and proxy setting once the real host is chosen.

## License

To be decided by the owner.

<!-- Location: README.md (project root) -->
<!-- End of file: README.md -->