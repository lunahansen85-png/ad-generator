# Ad Generator

Generates every template in a category (Morten or Testimonial) from one hook/quote,
instead of hand-editing Python scripts + CSV files.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No password is required locally
unless you set `APP_PASSWORD` (see below).

## How it's organized

- `assets/bases/` — the 21 base template images, copied from the original
  `Claude ads` project (10 `template_base_*`, `template_base_tp_stars`, 10 `morten_base_*`).
- `assets/fonts/` — the same Open Sans fonts used by the original Python scripts.
- `lib/templates/testimonial.ts` / `lib/templates/morten.ts` — one render function per
  template, ported line-for-line from the original `generate_*_all.py` scripts (text
  wrapping, auto-sizing, colors, positions).
- `lib/canvas-helpers.ts` — shared text-wrap/auto-fit/draw primitives (the Node/canvas
  equivalent of Pillow's `wrap_text` + `textbbox` used across every script).
- `app/api/generate/route.ts` — renders every applicable template for the given category
  and returns them as base64 images.
- `app/page.tsx` — the UI: category picker, form, preview gallery, "download all as zip".
- `proxy.ts` — the password gate (see below).

Adding a new template later means adding one entry to `testimonialTemplates` or
`mortenTemplates` with its own base image and render function — no changes to the UI or
API needed.

## Password-protecting it before deploying

The app is open to anyone with the link until you set an `APP_PASSWORD` environment
variable. Once set, visitors must enter that password once (stored in a cookie) before
reaching the generator or its API. Copy `.env.local.example` to `.env.local` to test this
locally, or set `APP_PASSWORD` directly in Railway's environment variables before sharing
the link with the team.

## Deploying to Railway

1. Push this folder to its own GitHub repo (or connect it directly — it's fully
   self-contained and separate from your other projects).
2. Create a new Railway project from that repo. Railway auto-detects Next.js.
3. Set the `APP_PASSWORD` environment variable in Railway before sharing the URL.
4. Railway gives you a `*.up.railway.app` domain by default — you can rename it to
   something less guessable, or attach a custom domain, from the project's Settings.
