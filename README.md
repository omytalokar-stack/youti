# Dimag AI

Dimag AI includes a Vite frontend and an Express/MongoDB backend for channel memory, Gemini-assisted Shorts, headless video rendering, scheduled YouTube publishing, and analytics.

## Setup

1. Install Node.js and MongoDB, then run `npm install`.
2. Copy `.env.example` to `.env` and set MongoDB, Gemini, and Google OAuth credentials.
3. Configure the OAuth client in Google Cloud with the redirect URI in `YOUTUBE_REDIRECT_URI`, and enable YouTube Data API v3 and YouTube Analytics API. The user must reconnect after upload scope is added.
4. Start the backend with `npm run dev` or `npm start`; start the frontend separately with `npm run dev:client`. Vite proxies `/api` to `http://localhost:5000`; set `BACKEND_URL` to use another backend during frontend development. For separate production hosting, set `VITE_API_URL` to the backend API base URL during the frontend build.
5. Install FFmpeg and FFprobe with the `libass` subtitles filter on the backend host. Put licensed vertical background clips in `assets/backgrounds/`, optional licensed whoosh/impact SFX in `assets/sfx/`, ambient/tension music in `assets/audio/` (use a filename containing `ambient`, `bgm`, `music`, `suspense`, or `tension`), and a Hindi-capable font in `assets/fonts/`. If no background is present, the renderer creates a dark gradient background. Missing audio assets fall back to voiceover-only.

## Install on mobile or desktop

- The frontend is an installable Progressive Web App (PWA). Open the deployed site over HTTPS, then go to **Settings → Open install page → Install Dimag AI**. Supported browsers show their native install prompt; if the prompt is unavailable, use the browser menu's **Install app** or **Add to Home screen** action.
- On iPhone/iPad, open the site in Safari, tap **Share → Add to Home Screen → Add**.
- The PWA uses the pink app icon and can cache the app shell/static assets for offline launch. API actions still require an internet connection and the backend.
- This creates a browser-installed web app, not an APK or a Play Store/App Store package.

The OAuth encryption key must be 32 random bytes encoded as 64 hex characters. The OAuth state secret should be a separate random secret. Never commit `.env`.
Set `FRONTEND_URL` to the frontend origin and set `YOUTUBE_REDIRECT_URI` to the exact callback registered in Google Cloud. The video table includes the 10 latest uploads and their YouTube Data API view counts immediately; subscriber changes and watch hours are from the latest 90 days of YouTube Analytics and may take 24–48 hours to process. Channel totals are lifetime totals from the Data API.

## Automatic video publishing

- The backend generates a short Hindi/Hinglish script and timestamped subtitle beats with Gemini, generates Hindi speech with Gemini TTS, renders a vertical MP4, and uploads it to the authorized channel.
- Spoken text is sanitized before synthesis; render output includes a neon-yellow hook card for the first 0.5 seconds, subtle background zoom, highlighted subtitles, and optional ducked BGM/zero-time hook SFX. Upload metadata appends `#Shorts` to the title and standard niche hashtags to the description.
- Clicking **Create & Publish Short** in the dashboard or Agent Brain chooses a channel-relevant topic, generates the script, voiceover, and video, then immediately uploads it as **public**. Check the generated content and channel before clicking; this is a real public YouTube upload.
- By default, the scheduler starts one daily public-publishing cycle at 4:00 PM in `Asia/Kolkata`. If generation or upload fails, it retries every 30 minutes until that cycle succeeds; after success it waits until 4:00 PM the next day. This is a real automatic public-publishing schedule. Set `AUTOMATION_CRON=disabled` to turn it off.
- A successful manual **Create & Publish Short** after the daily start time completes that day's pending cycle, preventing scheduled retries from creating a second upload. A manual upload before 4:00 PM does not cancel that day's scheduled run.
- `AUTOMATION_CRON` controls how often the scheduler checks for work and should remain `*/30 * * * *` for the default retry behavior. `AUTOMATION_START_HOUR` selects the daily start hour from 0 to 23 in `AUTOMATION_TIMEZONE`.
- `AUTOMATION_TIMEZONE` must be a valid IANA timezone, such as `Asia/Kolkata` or `America/Los_Angeles`; values like `Asia` are incomplete. If it is invalid, the backend still starts but scheduled publishing stays disabled until the value is corrected.
- Set `GEMINI_API_KEY` and optionally `GEMINI_API_KEY_2` in the backend environment. Text generation and text-to-speech try the second configured key if the first key fails; never expose these keys in the frontend or commit their values.
- `YOUTUBE_UPLOAD_PRIVACY=public` controls scheduled uploads. The manual **Create & Publish Short** button always publishes publicly.
- `YOUTUBE_CATEGORY_ID=22` sets YouTube's category ID (22 = People & Blogs).
- `YOUTUBE_MADE_FOR_KIDS=false` must reflect the channel's actual audience; set it to `true` for content directed to children.
- `GEMINI_TTS_MODEL` and `GEMINI_TTS_VOICE` select the Gemini speech model and voice; defaults are `gemini-3.8-flash-tts` and `Puck`.
- The scheduled job skips channels whose saved OAuth grant does not include `youtube.upload`. Reconnect each existing channel in Settings and accept the additional YouTube upload permission. Refresh tokens cannot gain a new scope without user consent.
- `fluent-ffmpeg` does not bundle FFmpeg. Set `FFMPEG_PATH` and `FFPROBE_PATH` if executables are not on `PATH`; the renderer checks for the binary and the `subtitles` filter before processing.
- Generated voiceover and subtitle temporaries are removed after the run. The latest rendered file is stored at `renders/short_output.mp4`; it is not exposed as a public download route.
- The backend must stay running at the scheduled time. Serverless or sleeping hosts need an external scheduler/always-on worker instead of an in-process cron.
- Gemini TTS uses the configured Gemini API key and quota. The generated audio is converted to MP3 using the backend's FFmpeg installation.
- YouTube may restrict public uploads from API projects that have not completed YouTube's required API audit. The API's accepted privacy status does not guarantee public visibility for an unaudited project.

## Google OAuth and analytics troubleshooting

- In Google Cloud Console, enable **YouTube Data API v3** and **YouTube Analytics API** in the same project as the OAuth client. If the Analytics API was just enabled, wait a few minutes and refresh analytics.
- If the OAuth consent screen is in **Testing**, add each Google account that will connect a channel under **Google Auth Platform → Audience → Test users**. Otherwise Google can show `access_denied` because the app has not granted that account access.
- The authorized redirect URI must exactly match `YOUTUBE_REDIRECT_URI`, including protocol, host, port, and path.

## API

- `GET /api/health` — process health and uptime.
- `GET /api/brain/:channelId` — get or initialize channel memory.
- `POST /api/brain/cycle` — JSON body `{ "channelId": "..." }`; generate a text-only Short draft.
- `POST /api/brain/publish` — JSON body `{ "channelId": "..." }`; generate a Short, render voiceover and video, and upload it publicly. Returns the YouTube URL; rejects overlapping publishes for the same channel.
- `POST /api/brain/chat` — JSON body `{ "prompt": "..." }`; ask Gemini 3.8 Flash, with Gemini 3.1 Flash-Lite as an automatic fallback when the primary model is unavailable.
- `POST /api/brain/mistake` — JSON body `{ "channelId": "...", "videoId": "...", "issue": "...", "retentionDropAt": "...", "ruleUpdated": "..." }`.
- `POST /api/brain/tactic` — JSON body `{ "channelId": "...", "title": "...", "impact": "...", "description": "..." }`.
- `GET /api/youtube/auth-url` — obtain a Google consent URL; callback discovers channels owned by the account.
- `GET /api/youtube/oauth2callback` — Google OAuth callback; stores the refresh token encrypted in MongoDB and redirects to the frontend.
- `GET /api/youtube/channels` — list connected channels.
- `DELETE /api/youtube/channels/:channelId` — remove a channel’s saved backend token.
- `GET /api/youtube/stats/:channelId` — channel totals and per-video analytics.
