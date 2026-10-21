# Quiz & Certificate Studio — Netlify starter

Hindi/English-friendly starter project for creating MCQ quizzes, sharing public quiz links, scoring answers on the server, issuing certificates to passing learners, and verifying certificates by ID.

## What it includes
- Static responsive frontend (`public/index.html`)
- Netlify Function API (`netlify/functions/api.mjs`)
- Persistent Netlify Blobs storage (survives redeploys)
- Server-side answer checking; correct answers are not sent to quiz takers
- Passing percentage per quiz
- Certificate ID and public verification endpoint
- Print / Save as PDF; certificate image download currently exports SVG
- Admin key gate for quiz creation and editing

## Important: admin security
This starter has no user accounts. Anyone who knows `QCS_ADMIN_KEY` can create/edit quizzes. Keep the key private. Set a long random value in Netlify environment variables. Do not put it in HTML or commit it into the repository. Public quizzes and issued certificates are intentionally viewable/verifyable by link/ID. Do not use this starter to store sensitive personal data.

## Deploy on Netlify (free starter path)
1. Extract the ZIP.
2. Push the project folder to a GitHub repository (recommended), or use Netlify CLI from a computer. Netlify Drop is for static assets and is not enough for this project because it needs Functions.
3. In Netlify, choose **Add new project → Import an existing project** and connect the GitHub repository.
4. Build settings should be detected from `netlify.toml`: publish directory `public`, functions directory `netlify/functions`. No build command is required.
5. After the site is created, open **Project configuration → Environment variables** and add:
   - Key: `QCS_ADMIN_KEY`
   - Value: a long random secret, e.g. use a password manager to generate 32+ characters.
   Set its scope to Functions if Netlify offers scope selection.
6. Trigger a new deploy after adding the variable.
7. Open `https://YOUR-SITE.netlify.app`. Go to **Quiz बनाएं**, enter the `QCS_ADMIN_KEY` when prompted, create questions and publish.
8. Use **Share link** to send learners a URL such as `https://YOUR-SITE.netlify.app/?quiz=QUIZ_ID`.
9. Passing learners receive a certificate ID. Verify it from the dashboard or with `https://YOUR-SITE.netlify.app/?verify=CERTIFICATE_ID`.

## Local testing (computer required)
Install Node.js 20+, then from this folder run:

```bash
npm install
npx netlify dev
```

Set `QCS_ADMIN_KEY` in your shell before running Netlify Dev, or use a local `.env` file that is not committed. For example, create `.env` with `QCS_ADMIN_KEY=replace-with-a-long-random-secret`. Do not upload `.env` to GitHub. Open the local URL shown by Netlify CLI.

## Free tier notes
Netlify Blobs is used as a persistent key/value store and is automatically available to Netlify Functions. Netlify's free plan limits/credits can change; check the current plan dashboard. Blobs is not a relational database and concurrent edits to the same key can overwrite each other. This is a small starter, not a high-scale exam platform. For large use, multi-admin roles, anti-cheating controls, analytics, or transactional consistency, move to a proper database/auth system.

## API endpoints
- `GET /api/health`
- `GET /api/quizzes` — public quiz list
- `POST /api/quizzes` — create/update, requires `x-admin-key`
- `GET /api/quizzes/:id` — public quiz questions without answer key; admin key returns answers for editing
- `POST /api/submit/:id` — server-side score and certificate issuance
- `GET /api/verify/:certificateId` — public certificate verification

## Notes / limitations
- No email delivery, login, custom domain setup, or certificate revocation UI.
- Certificate PDF: use the browser's **Print / Save as PDF** option.
- The image button exports SVG (opens in browsers and can be converted to PNG/JPG). It does not generate a true raster JPG in this version.
- Netlify Blobs is persistent storage, not a full relational database. It is used here to keep the initial setup as close to free and simple as possible.
