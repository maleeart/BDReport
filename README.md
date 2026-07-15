# BDReport

Automated PowerPoint generator and daily team reports system integrated with LINE Webhook, Firestore, and Gemini AI. This system operates 100% free under the Firebase Spark Plan (no paid storage bucket required).

## Features
- **LINE Webhook Integration**: Receives text and image reports, saving text logs and lossless Base64 images directly inside Firestore.
- **AI-Powered Summaries**: Utilizes Gemini 1.5 Flash to automatically summarize daily work and generate concise keywords/titles.
- **PowerPoint Generation**: Dynamically copies and modifies a custom PowerPoint template (`templateReport.pptx`) using Python (`python-pptx` runtime), placing user summaries on the left and centering user images on the right.
- **Dashboard Web UI**: Control panel to view daily reports, preview images, and securely download generated presentations.

---

## Environment Variables (Setup)

Create a `.env.local` file (for local testing) and configure these variables in **Vercel Project Settings -> Environment Variables**:

```env
# Firebase Admin SDK Configuration (Firestore only)
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="your-client-email@..."
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# LINE Messaging API Configuration
LINE_CHANNEL_SECRET="your-channel-secret"
LINE_CHANNEL_ACCESS_TOKEN="your-channel-access-token"

# Gemini API Key (Free tier from Google AI Studio)
GEMINI_API_KEY="your-gemini-api-key"

# Secret Token for securing Cron endpoints
CRON_SECRET="your-cron-secret-token"

# Optional: Discord Webhook integration
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
```

---

## API Endpoints

### 1. LINE Webhook
- **URL**: `/api/webhook`
- **Method**: `POST`
- **Description**: Webhook endpoint to receive events from LINE.
  - Text messages are saved to Firestore (`line_reports` collection).
  - Images are downloaded, converted to Base64, and saved directly to the Firestore document.

### 2. Reports Fetch API
- **URL**: `/api/reports?date=YYYY-MM-DD`
- **Method**: `GET`
- **Description**: Fetches daily reports for the specified date (Asia/Bangkok timezone), groups them by user, and calls Gemini AI to summarize text logs.

### 3. Cron Job PPTX Generator
- **URL**: `/api/cron/generate?secret=<CRON_SECRET>&date=YYYY-MM-DD`
- **Method**: `GET`
- **Headers**: Supports `Authorization: Bearer <CRON_SECRET>`
- **Description**: Exposes a Vercel Python Serverless function that uses `python-pptx` to populate `templateReport.pptx` with today's report data, and returns the file download. If `DISCORD_WEBHOOK_URL` is set, it automatically posts the file to Discord.
- **Vercel Cron Trigger**: Runs automatically at **17:00 ICT daily** (`0 10 * * *` UTC) via `vercel.json` scheduler.

### 4. Secure Download Proxy
- **URL**: `/api/download?date=YYYY-MM-DD`
- **Method**: `GET`
- **Description**: Server-side proxy for browser downloads. It securely appends the `CRON_SECRET` on the server before hitting the generator route, ensuring the secret is never exposed to the client browser bundle.
