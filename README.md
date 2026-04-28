# MIENT Call — Render Deploy Guide

This is the call-schedule app, packaged for **Render** with a custom domain at **howardlab.net**.

Login: `admin` / `ADMIN123!`

---

## What's in this folder

- `client/` — React frontend
- `server/` — Express API + SQLite database
- `data.seed.db` — your current call schedule, baked in. Copied to the persistent disk on first boot.
- `render.yaml` — tells Render how to host the app
- `scripts/start.sh` — copies the seed DB to the persistent disk on first boot, then starts the server

---

## Deploy in 6 steps

### 1. Make a GitHub repo (or skip — see step 3 alt)

If you have a GitHub account:
- Go to [github.com/new](https://github.com/new)
- Name: `mient-call`
- Private
- **Don't** initialize with README/license/.gitignore
- Click **Create repository**

Then on your Mac, in Terminal:

```bash
cd ~/Desktop/mient-call-render   # or wherever you unzipped it
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/mient-call.git
git push -u origin main
```

If GitHub asks for a password, use a **Personal Access Token** (not your account password). Create one at [github.com/settings/tokens](https://github.com/settings/tokens) → "Generate new token (classic)" → check `repo` scope → copy and use as the password.

### 2. Sign up for Render

[render.com](https://render.com) → **Get Started** → sign up with GitHub (easiest) or email. Free.

### 3. Create the web service

In the Render dashboard:
- Click **New +** → **Web Service**
- Pick **Build and deploy from a Git repository** → connect GitHub → select `mient-call`
- Render will read `render.yaml` automatically. You should see:
  - Name: `mient-call`
  - Plan: `Starter` ($7/month, always-on) — change to `Free` if you don't mind 30-second wake-up delays
  - Build command: `npm install && npm run build`
  - Start command: `npm start`
  - Disk: 1 GB at `/var/data`
- Click **Create Web Service**

First deploy takes ~3-5 minutes.

**Alternative if GitHub is fighting you:** Render supports zip uploads via their CLI, but the GitHub path is much smoother for ongoing updates. If you really need to skip GitHub, message back and I'll write up the CLI path.

### 4. Confirm it's working

When the build finishes, Render gives you a URL like `https://mient-call.onrender.com`. Open it. You should see the login page. Log in with `admin` / `ADMIN123!`.

### 5. Add `howardlab.net` as a custom domain on Render

In the Render dashboard for your service:
- Go to **Settings** → **Custom Domains** → **Add Custom Domain**
- Enter `howardlab.net` → click **Save**
- Render will show you a CNAME target like `mient-call.onrender.com` — **copy this value**

### 6. Point Cloudflare DNS at Render

In your Cloudflare dashboard:
- Click on the `howardlab.net` site
- Left sidebar → **DNS** → **Records** → **Add record**
- Type: **CNAME**
- Name: `@` (this means root domain — Cloudflare also lets you type `howardlab.net`)
- Target: paste the value Render gave you (e.g. `mient-call.onrender.com`)
- Proxy status: **DNS only** (gray cloud, NOT orange) — this is important. Render handles its own HTTPS, and Cloudflare's proxy will fight with Render's certificate.
- TTL: Auto
- Click **Save**

Also add a `www` record if you want `www.howardlab.net` to work too:
- Type: CNAME, Name: `www`, Target: same `mient-call.onrender.com`, Proxy: **DNS only**

DNS propagates in 5-30 minutes. Render will auto-issue an HTTPS certificate within ~10 minutes after that.

When done: `https://howardlab.net` is your app.

---

## Calendar push links

Once live, providers can subscribe in Apple Calendar, Google Calendar, or Outlook:

```
https://howardlab.net/api/ical/<provider-id>.ics
```

The admin panel inside the app shows each provider's subscribe URL.

---

## Updating the app later

Edit files locally → `git add . && git commit -m "update" && git push` → Render auto-rebuilds and redeploys. Database survives because it lives on the persistent disk, not in the repo.

---

## Costs

- Render Starter plan: **$7/month** (always-on, no wake-up delay)
- Render persistent disk: **~$0.25/month** for 1 GB
- Cloudflare DNS: **free**
- Domain renewal: whatever you pay Cloudflare yearly

Total: **~$7.25/month**.

If you switch the plan to **Free** in `render.yaml`, it's $0 — but the app sleeps after 15 min of no activity (30 sec wake-up on the next visit). For a personal call schedule that's usually fine; calendar subscriptions still work, they just retry transparently.

---

## Troubleshooting

- **"Application failed to respond"** on first load → Render is still building, give it 3-5 min
- **502 / 503 after going live** → check **Logs** tab in Render. Most common cause: build failed; check for missing env var or typo
- **Login doesn't work** → password is `ADMIN123!` exactly (uppercase, exclamation point)
- **Custom domain stuck on "Verifying"** → DNS isn't pointing yet. Run `dig howardlab.net CNAME` in Terminal — should show `mient-call.onrender.com`. If not, check Cloudflare DNS panel; the proxy must be **off** (gray cloud).
- **Want to reset all data** → in Render: Settings → Disks → delete the disk → next deploy seeds fresh from `data.seed.db`
