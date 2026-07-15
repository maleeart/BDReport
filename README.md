# BDReport

Automated PowerPoint generator and daily team reports system integrated with LINE Webhook and Firebase.

## Setup

Create a `.env.local` file with the following variables:

```env
# Firebase Admin SDK Configuration
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="your-client-email@..."
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"

# LINE Messaging API Configuration
LINE_CHANNEL_SECRET="your-channel-secret"
LINE_CHANNEL_ACCESS_TOKEN="your-channel-access-token"

# Gemini API Key
GEMINI_API_KEY="your-gemini-api-key"

# Secret Token for securing Cron endpoints
CRON_SECRET="your-cron-secret-token"
```

## API Endpoints

### 1. LINE Webhook
- **URL**: `/api/webhook`
- **Method**: `POST`
- **Description**: Webhook endpoint to receive events from LINE.
  - Text messages are saved to Firestore (`line_reports` collection).
  - Images are downloaded and uploaded to Firebase Storage (`reports/` folder) and logged in Firestore.

### 2. Cron Job PPTX Generator
- **URL**: `/api/cron/generate`
- **Method**: `GET`
- **Headers**:
  - `Authorization: Bearer <CRON_SECRET>`
- **Description**: Generates slide status updates for the day:
  - Fetches all user reports from today.
  - Summarizes each user's work with Gemini API.
  - Creates a `.pptx` presentation with cover, highlights, and user details side-by-side with images.
  - Uploads the file to Firebase Storage under `slides/{date}.pptx`.
