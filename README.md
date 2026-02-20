# Mohr Insurance — Webinar Confirmation Bot

Voice agent system that automates confirmation calls for the **Medicare 101 Workshop with James Mohr**. Integrates **Retell AI** for voice calls with **GoHighLevel** for CRM/contact management, backed by a real-time dashboard.

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  GoHighLevel     │────▶│  Express API │────▶│  Retell AI  │
│  (CRM/Contacts)  │◀────│  + Scheduler │◀────│  (Voice)    │
└─────────────────┘     └──────┬───────┘     └─────────────┘
                               │
                        ┌──────┴───────┐
                        │  PostgreSQL  │
                        │  (Railway)   │
                        └──────┬───────┘
                               │
                        ┌──────┴───────┐
                        │  React       │
                        │  Dashboard   │
                        └──────────────┘
```

## Two-Call Sequence

### Call 1 — Registration Confirmation
- Fires when a lead registers for the webinar
- Thanks them, sets expectations for email/text automations
- Tells them they'll get a confirmation call 24hrs before
- Retries 3x/day at 9am, 1pm, 5pm PST until connected or 24hrs before webinar

### Call 2 — 24-Hour Confirmation
- Fires 24 hours before webinar start time
- Confirms attendance, reminds about webinar link delivery
- Retries at 9am, 1pm, 5pm PST until the last call window before webinar start time (e.g., 1pm final call for a 5pm webinar)

### Edge Cases
- If registered <24hrs before webinar → skips Call 1, goes straight to Call 2
- If registered after 5pm PST → first call deferred to 9am next day
- Call 1 stops 30 minutes before webinar start time; Call 2 stops at the last call window before webinar start time

## Webinar Schedule

| GHL Tag | Day | Time (CST) |
|---|---|---|
| `tuesday 11am` | Tuesday | 11:00 AM CST |
| `tuesday 6pm` | Tuesday | 6:00 PM CST |
| `thursday 1pm` | Thursday | 1:00 PM CST |
| `saturday 11am` | Saturday | 11:00 AM CST |

---

## Railway Setup Guide

### Step 1: Create a Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with your GitHub account (easiest method)
3. You'll land on your Railway dashboard

### Step 2: Create a New Project
1. Click **"New Project"** on your dashboard
2. Select **"Deploy from GitHub Repo"**
3. Connect your GitHub account if not already connected
4. Select the **webinarconfirmationbot** repository
5. Railway will auto-detect the project configuration

### Step 3: Add PostgreSQL Database
1. Inside your project, click **"New"** → **"Database"** → **"Add PostgreSQL"**
2. Railway will provision a Postgres database instantly
3. Click on the Postgres service → **"Variables"** tab
4. Copy the `DATABASE_URL` — you'll need this in the next step

### Step 4: Set Environment Variables
1. Click on your **web service** (the GitHub repo service)
2. Go to the **"Variables"** tab
3. Add the following variables:

```
GHL_API_KEY=pit-5d8ef1fb-3eb2-423d-81a1-5fe3c164219b
GHL_LOCATION_ID=dTtT96ODx29mbQcdOp0v
RETELL_API_KEY=key_bcd2a45a86465e701ea310a3b7b7
RETELL_AGENT_ID_CALL1=agent_4e94ee7387b3ef7e7a7649985a
RETELL_AGENT_ID_CALL2=agent_4e94ee7387b3ef7e7a7649985a
DATABASE_URL=<paste the DATABASE_URL from Step 3>
PORT=3001
NODE_ENV=production
CLIENT_URL=<your Railway public URL — set after first deploy>
```

4. **Tip:** Railway can auto-link the `DATABASE_URL` if you use the variable reference: `${{Postgres.DATABASE_URL}}`

### Step 5: Deploy
1. Railway will auto-deploy when you push to the repo
2. Or click **"Deploy"** manually in the Railway dashboard
3. The build process will:
   - Install dependencies
   - Generate Prisma client
   - Build the React frontend
   - Run database migrations
   - Start the Express server

### Step 6: Get Your Public URL
1. Go to your web service → **"Settings"** tab
2. Under **"Networking"**, click **"Generate Domain"**
3. Railway will give you a URL like `webinar-bot-production-xxxx.up.railway.app`
4. Go back to **"Variables"** and update `CLIENT_URL` to this URL

### Step 7: Configure Webhooks
You need to point GHL and Retell to your Railway URL:

**GoHighLevel Webhook:**
1. In GHL, go to **Automation** → **Workflows**
2. Create a workflow triggered on **Pipeline Stage Change** → "Pre-Webinar"
3. Add a **Webhook** action pointing to:
   ```
   https://your-railway-url.up.railway.app/api/webhooks/ghl
   ```

**Retell AI Webhook:**
1. In Retell AI dashboard, go to your agent settings
2. Set the **Post-Call Webhook URL** to:
   ```
   https://your-railway-url.up.railway.app/api/webhooks/retell
   ```

### Step 8: Initial Contact Sync
Once deployed, trigger the first sync:
- Click **"Sync GHL"** button on the dashboard, OR
- POST to `https://your-railway-url.up.railway.app/api/sync/contacts`

---

## Local Development

```bash
# Install dependencies
npm install
cd server && npm install
cd ../client && npm install

# Set up your .env file (copy from .env.example)
cp .env.example .env
# Edit .env with your actual DATABASE_URL for local Postgres

# Run database migrations
cd server && npx prisma migrate dev

# Start development servers (backend + frontend)
cd .. && npm run dev
```

The dashboard will be available at `http://localhost:5173` and the API at `http://localhost:3001`.

## Dashboard

The dashboard shows:
- **Stats cards** — Total registrants, Call 1 connections, Call 2 confirmations, connection rate
- **Contact table** — All registrants with status bubbles
- **Filters** — By webinar tag, status, search
- **Contact detail** — Click any contact for full call history

### Status Bubbles
| Bubble | Meaning |
|---|---|
| 🟢 Green | Connected (Call 1) / Confirmed (Call 2) |
| 🔴 Red | Attempted but not connected |
| 🟡 Amber | Connected but not yet confirmed (Call 2) |
| 🔵 Blue (pulsing) | Calls in progress |
| ⚪ Gray | Not yet started |

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard/contacts` | List contacts with call status |
| GET | `/api/dashboard/stats` | Aggregate dashboard stats |
| GET | `/api/dashboard/contact/:id` | Single contact detail |
| POST | `/api/webhooks/ghl` | GHL webhook receiver |
| POST | `/api/webhooks/retell` | Retell AI webhook receiver |
| POST | `/api/sync/contacts` | Manual GHL contact sync |
| GET | `/api/health` | Health check |
