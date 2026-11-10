# Dimag AI — Detailed Project Report

**Report update:** 10 November 2026  
**Project:** YouTube creator analytics and automated Shorts publishing  
**Language:** Hindi/Hinglish  
**Stack:** React, TypeScript, Vite, Node.js, Express, MongoDB, Gemini, YouTube APIs, FFmpeg

## 1. Executive summary

Dimag AI ek web dashboard aur Node.js backend hai. User YouTube account authorize karke channel data dekh sakta hai, Gemini chat use kar sakta hai, aur channel ke liye Short generate kar sakta hai.

Dashboard ka **Create & Publish Short** button connected channel ke context aur saved channel memory se topic chunta hai, Hindi/Hinglish script aur metadata banata hai, Gemini TTS se voiceover generate karta hai, FFmpeg se vertical video render karta hai, aur video ko **public** YouTube upload karta hai. Upload ke baad app YouTube link dikhata hai. Isi publishing pipeline ko backend scheduler bhi configured schedule par chala sakta hai.

**Public upload real action hai.** Button dabane se video bina alag confirmation ke seedha public ho sakta hai. YouTube API project ki audit/verification requirements ke kaaran kuch uploads YouTube par private bhi reh sakte hain, chahe app public visibility maange.

## 2. Project goals

- Google OAuth ke zariye asli YouTube channel connect karna.
- YouTube Data API aur Analytics API se available channel/video metrics dikhana.
- Gemini se channel ke niche ke mutabik Short topics, scripts aur metadata banana.
- Hindi/Hinglish narration, subtitles aur 9:16 vertical video tayyar karna.
- User action ya scheduled worker se YouTube upload karna.
- Channel-specific tactics aur user-entered learning rules ko agle generations mein reuse karna.

## 3. User-facing features

### 3.1 YouTube connection aur account settings

- Google OAuth flow se authorized Google account ke channels discover hote hain.
- Channel connect, channel selection aur saved connection disconnect ki ja sakti hai.
- OAuth permissions mein YouTube upload, read-only channel data aur read-only Analytics access shamil hain.
- Refresh token MongoDB mein AES-256-GCM encryption ke saath store hota hai.
- OAuth state HMAC se sign hota hai aur expiry check hoti hai.
- API credentials backend environment mein rehte hain; browser ko Gemini/Google secrets nahi bheje jaate.
- Purane connected channels ko naya upload scope dene ke liye Google OAuth dobara complete karna pad sakta hai.

### 3.2 Channel analytics

- YouTube Data API se channel title, lifetime views, subscriber total (agar API se available ho) aur published video count milta hai.
- Uploads playlist aur YouTube Data API `videos.list` se latest 10 videos ke title, thumbnail, publish date, view count aur like count milte hain; isliye naye uploads table mein Analytics processing ka intezar kiye bina aa sakte hain.
- YouTube Analytics API se aakhri 90 din ke subscriber gained/lost aur watch time aate hain; in reports ko update hone mein 24–48 ghante lag sakte hain. Naye videos bina Analytics row ke bhi zero watch hours/subscriber changes ke saath dikhte hain.
- Analytics aur Data API rows video ID se merge hote hain; recent rows ke view counts Data API ke view count ko tarjeeh dete hain. Channel ka total views Data API ka direct lifetime statistic hota hai, aur unavailable/zero ho to latest returned video counts ka sum fallback hai.
- UI retention curve aur click-through rate (CTR) nahi banata; ye metrics current integration se nahi maange jaate.
- Khaali ya zero result ko demo data se replace nahi kiya jaata.

### 3.3 Gemini Studio

- Backend `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, aur comma-separated `GEMINI_API_KEYS` se deduplicated key pool banata hai aur requests ko round-robin karta hai.
- Script generation ka text-only fallback chain `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`, aur `gemini-1.5-pro` hai; quota/key failures par key rotate hoti hai. Har request par adhiktam teen retries hote hain.
- Chat apne configured text models par bounded fallback karta hai. TTS sirf `GEMINI_TTS_MODEL` audio request karta hai aur failure par text model par switch kiye bina API keys rotate karta hai.
- Chat, response regenerate, copy aur local like/dislike controls available hain.
- Chat history server ya MongoDB mein persist nahi hoti.

### 3.4 Channel memory

- Har channel ki memory alag MongoDB record mein rehti hai.
- User proven tactics ke liye title, evidence/impact aur instruction save kar sakta hai.
- User video mistake/post-mortem ke saath updated rule save kar sakta hai.
- Self-correction enabled ho to aakhri paanch mistake rules agle Short prompt mein negative constraints bante hain.
- Tactics Gemini ko guidance ke roop mein di jaati hain.
- App automatic retention analysis se mistakes nahi nikalti; learning rules user-provided hain.

## 4. Create & Publish Short: end-to-end workflow

1. User connected YouTube channel select karta hai aur **Create & Publish Short** button dabata hai.
2. Frontend `/api/brain/publish` par selected channel ID bhejta hai.
3. Backend MongoDB publishing lease leta hai; isi channel par overlapping manual/scheduled job ho to doosri request roki jaati hai.
4. Backend check karta hai ki channel connected ho aur saved OAuth grant mein `youtube.upload` scope ho.
5. Backend channel summary aur persistent channel memory load karta hai.
6. Gemini khud channel niche se ek topic chunta hai; user se prompt/topic lena zaroori nahi. Model hook, Hindi/Hinglish script, title, description, tags aur subtitle beats deta hai.
7. Script ko chhota rakhne ke liye prompt 22 words aur 12–15 seconds target karta hai; renderer zyada se zyada 20 seconds ka Short accept karta hai.
8. Script aur subtitle text se brackets, labels, quotes aur common English meta-instructions sanitize kiye jaate hain; cleaned text hi Gemini TTS ko diya jaata hai.
9. Gemini TTS Hindi/Hinglish audio generate karta hai. Audio WAV ho to FFmpeg use MP3 mein convert karta hai.
10. FFmpeg background clip ko 1080 x 1920 portrait mein scale/crop karke subtle zoom deta hai, uppercase highlighted subtitles burn karta hai, aur pehle 0.5 second ke liye neon-yellow hook card dikhata hai.
11. Optional BGM `assets/audio/` ya `assets/sfx/` se load hota hai aur voiceover se 18 dB neeche mix hota hai; optional hook SFX 0-second par mix hota hai. Assets na milne par narration-only mix render hota hai.
12. Rendered video YouTube par `public` visibility ke saath upload hota hai. Title mein `#Shorts` aur description mein `#Shorts #DimaagKiBatti #BrainFacts #PsychologyFacts` add hote hain.
13. Video title, ID, upload status aur related metadata `VideoLog` mein record hote hain; successful completion ka waqt channel memory mein update hota hai.
14. Frontend success toast aur YouTube watch link dikhata hai, phir analytics refresh karta hai.
15. Publishing lease release hoti hai; temporary voiceover/audio/subtitle files clean ki jaati hain.

### Video visual ki important boundary

Current renderer Gemini se har scene ka alag AI video/image nahi banata. Visual source `assets/backgrounds/` mein licensed clip ho sakti hai; folder khaali ho to generated dark gradient use hota hai. First-frame hook card, subtle zoom, kinetic subtitle timing, optional BGM aur hook SFX visual/audio polish dete hain, lekin high retention ya algorithmic reach ki guarantee nahi dete. AI is flow mein topic, script aur metadata banata hai; TTS narration karta hai; FFmpeg available background par subtitles aur audio ke saath final video render karta hai.

### Public-upload behavior

- Manual button `public` visibility explicitly request karta hai; `YOUTUBE_UPLOAD_PRIVACY` manual button ko override nahi karta.
- Scheduled job ke liye `YOUTUBE_UPLOAD_PRIVACY` setting istemal hoti hai.
- Button ko click karne se pehle selected channel aur public-publishing effect verify karein.
- YouTube API project audit restrictions ke kaaran API ka accepted `public` status hamesha turant public watch page ki guarantee nahi hai.

## 5. Scheduled publishing

- Default daily start: `16:00` in `Asia/Kolkata`.
- Scheduler `*/30 * * * *` par due channels check karta hai; failed generation/upload par har 30 minute retry karta hai aur MongoDB state mein successful daily cycle save karta hai.
- Retry success hone par us din ke baaki retries rukte hain; agla scheduled cycle agle din `16:00` par shuru hota hai.
- Daily start time ke baad successful dashboard manual upload pending scheduled cycle ko complete mark karta hai; start time se pehle manual upload us din ke scheduled run ko cancel nahi karta.
- Schedule har connected channel par publishing pipeline chalane ki koshish karta hai.
- Sirf upload scope wale channels publish ho sakte hain; scheduler per-channel failure log karke agle channel par aage badhta hai.
- MongoDB lease multiple worker instances ke beech same channel ke overlapping upload ko rokne mein madad karta hai.
- `AUTOMATION_CRON=disabled` ya `AUTOMATION_CRON=off` scheduler band karta hai.
- `AUTOMATION_START_HOUR` local timezone mein daily start hour (0–23) hai; `AUTOMATION_TIMEZONE` default `Asia/Kolkata` hai. Retry behavior ke liye `AUTOMATION_CRON` `*/30 * * * *` rakhein.
- Backend ko scheduled waqt par chalte rehna chahiye. Sleeping machine/serverless deployment mein external scheduler ya always-on worker chahiye.
- Is waqt app mein cron ka alag dashboard toggle nahi hai; schedule backend environment se configure hota hai.

## 6. Architecture aur code map

### Frontend

- `src/App.tsx` — React application shell aur tab selection.
- `src/context/AppContext.tsx` — shared app state, YouTube/channel data, chat, memory aur public-publish action.
- `src/components/layout/Header.tsx` — global **Create & Publish Short** action.
- `src/components/tabs/AgentBrain.tsx` — channel memory, tactics, mistakes, publish action aur successful upload link.
- `src/components/tabs/AnalyticsDashboard.tsx` — channel totals aur video metrics.
- `src/components/tabs/GeminiStudio.tsx` — Gemini conversation UI.
- `src/components/tabs/SettingsTab.tsx` — YouTube account connection aur Gemini test action.
- `src/services/api.ts` — frontend API calls, errors aur `/api` base URL.

### Backend

- `server.js` — Express app, CORS, JSON parsing, request logging, health route, error handler, MongoDB aur scheduler startup.
- `routes/brainRoutes.js` — channel memory, chat, text-only cycle, public publish, tactics aur mistakes endpoints.
- `routes/youtubeRoutes.js` — OAuth callback, channel list, disconnect aur analytics endpoints.
- `services/geminiService.js` — script/topic generation, format validation, Gemini model aur API-key fallback, chat.
- `services/geminiApiKeys.js` — backend environment se primary aur optional backup Gemini key.
- `services/ttsService.js` — Gemini TTS API-key fallback, audio generation aur MP3 conversion.
- `services/renderService.js` — FFmpeg/FFprobe checks, vertical render, subtitles, background/SFX handling aur 20-second limit.
- `services/automationService.js` — credential checks se lekar generation, render, upload aur video log tak orchestration.
- `services/automationLockService.js` — manual aur scheduled publish jobs ke liye shared MongoDB lease.
- `services/schedulerService.js` — cron schedule aur per-channel automated publishing.
- `services/automationScheduleStateService.js` — daily cycle date calculation aur manual/scheduled success tracking.
- `models/AutomationScheduleState.js` — retry ke beech active daily cycle aur last successful scheduled cycle.
- `services/youtubeService.js` — OAuth, encrypted credential handling, YouTube channel, recent upload catalog/live counts aur Analytics API operations.
- `services/youtubeUploadService.js` — YouTube upload permission, metadata, privacy aur MP4 upload.
- `config/db.js` — MongoDB connection.

### Main database models

- `YouTubeCredential` — encrypted refresh token, IV/authentication tag, channel ID aur granted scopes.
- `BrainMemory` — tactics, mistake logs, self-correction mode aur last autonomous run.
- `VideoLog` — successful uploads ke video ID, title, hook/tags, upload date aur status.
- `AutomationLock` — channel publishing lease ID aur expiry.
- `AutomationScheduleState` — channel ka pending daily cycle aur last successful cycle date.

## 7. API overview

Sab API routes `/api` prefix ke neeche hain.

| Method | Route | Kaam |
|---|---|---|
| `GET` | `/health` | Backend status aur uptime |
| `GET` | `/brain/:channelId` | Channel memory read/initialize |
| `PATCH` | `/brain/:channelId` | Self-correction mode update |
| `POST` | `/brain/chat` | Gemini chat |
| `POST` | `/brain/cycle` | Text-only Short draft generate; current UI button is endpoint ko use nahi karta |
| `POST` | `/brain/publish` | Full render karke Short ko public upload |
| `POST` | `/brain/tactic` | Channel tactic save |
| `POST` | `/brain/mistake` | Channel learning rule save |
| `GET` | `/youtube/auth-url` | Google OAuth authorization URL |
| `GET` | `/youtube/oauth2callback` | OAuth response handle/store aur frontend redirect |
| `GET` | `/youtube/channels` | Connected channels list |
| `DELETE` | `/youtube/channels/:channelId` | Saved channel credential disconnect |
| `GET` | `/youtube/stats/:channelId` | Channel aur video analytics |

`/brain/publish` ko non-empty `channelId` chahiye. Invalid request `400`, missing channel credential `401`, missing upload permission `403`, aur active per-channel publish lease `409` deta hai.

## 8. Configuration aur local run

Secrets ko `.env` mein backend par configure karein. `.env.example` variable names aur safe defaults dikhata hai; asli secret values report/source mein nahi rakhni chahiye.

Important settings:

- `MONGODB_URI`, `PORT`, `FRONTEND_URL`
- `GEMINI_API_KEY`, `GEMINI_API_KEY_2`, `GEMINI_API_KEYS`, `GEMINI_TTS_MODEL`, `GEMINI_TTS_VOICE`
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`
- `OAUTH_STATE_SECRET`, `YOUTUBE_TOKEN_ENCRYPTION_KEY`
- `AUTOMATION_CRON`, `AUTOMATION_START_HOUR`, `AUTOMATION_TIMEZONE`
- `YOUTUBE_UPLOAD_PRIVACY`, `YOUTUBE_CATEGORY_ID`, `YOUTUBE_MADE_FOR_KIDS`
- `FFMPEG_PATH`, `FFPROBE_PATH`, `SUBTITLE_FONT`

### Setup checklist

1. Node.js `>=22.12.0` aur MongoDB install/start karein.
2. `npm install` chalayein aur `.env.example` se local `.env` banayein.
3. Usi Google Cloud project mein YouTube Data API v3 aur YouTube Analytics API enable karein jahan OAuth client bana hai.
4. OAuth consent screen aur redirect URI configure karein. Testing mode mein authorizing Google account ko Test users mein add karein.
5. OAuth state secret alag rakhein; token encryption key 32 random bytes (64 hex characters) honi chahiye. `.env` kabhi commit na karein.
6. Channel ko Settings se connect karein aur upload scope approve karein.
7. FFmpeg/FFprobe install karein; FFmpeg build mein `subtitles`/libass filter hona chahiye.
8. Licensed background videos, optional whoosh/impact SFX, ambient BGM aur Devanagari-capable font `assets/backgrounds/`, `assets/sfx/`, `assets/audio/`, `assets/fonts/` mein add karein. BGM filename mein `ambient`, `bgm`, `music`, `suspense` ya `tension` shamil karein.
9. Backend `npm run dev`, frontend doosre terminal mein `npm run dev:client` se start karein.
10. Frontend default `http://localhost:3000`, backend default `http://localhost:5000` hai. Vite `/api` ko backend par proxy karta hai.

## 9. Verification aur test results

**10 November 2026 ke local verification session mein:**

- `npm run lint` — pass.
- `npm run build` — pass.
- Backend modified JavaScript files ke `node --check` — pass.
- Sanitizer check (brackets, labels, quotes, meta-instruction removal) — pass.
- FFmpeg render smoke test (first-frame hook, voiceover + -18 dB BGM + 0-second SFX) — pass; 2-second output bana aur test files cleanup hue.
- Gemini primary model quota case mein fallback model use karke generation — pass.
- Gemini 3.8 Flash TTS se audio sample — pass.
- Channel ke liye real script generation, Hindi TTS aur FFmpeg portrait MP4 rendering — pass; sample duration `16.12` seconds thi.
- YouTube channel ke stored OAuth credential mein `youtube.upload` scope — present.
- FFmpeg/FFprobe aur required subtitles/libass filter — available.
- Publishing lock test — pehli lease acquire hui, duplicate lease reject hui.
- Invalid publish body/channel validation — expected `400`/`401` response, aur failed precondition par lease release verify hui.
- Frontend `/api` proxy aur backend health endpoint — `200`.
- Temporary pipeline-test audio/video files — cleanup kiye gaye.

**Kya verify nahi kiya gaya:** test ke dauran YouTube par public video upload nahi kiya. Isliye is report mein real published URL, final YouTube visibility ya YouTube API project audit status ka claim nahi hai. Public button dabane se hi channel par actual post hoga.

### Build output warnings

- Vite `configLoader: 'native'` aur `__dirname` ke future compatibility par warning deta hai.
- Production JavaScript bundle 500 kB chunk advisory se thoda upar hai.
- Ye warnings build fail nahi karti; current build successful tha.

## 10. Known limitations aur operational risk

- Manual publish real public action hai aur is version mein post se pehle confirmation/review step nahi hai.
- AI output ko publish se pehle human editorial review nahi milta.
- Current visuals licensed background/gradient aur subtitles hain; per-shot AI-generated visuals nahi.
- Scheduled publishing default public ho sakti hai; schedule enable/disable environment se control hota hai.
- Gemini text aur TTS dono API quota/model availability par depend karte hain; text generation ka fallback model hai. TTS quota/outage par generation fail ho sakti hai.
- TTS audio duration generated speech ke hisaab se badal sakti hai. Prompt 12–15 seconds target karta hai aur renderer 20 seconds se lamba voiceover reject karta hai.
- YouTube API project audit na hone par public uploads restrict ho sakte hain.
- Channel tactics/mistakes manually curated hain; retention-based automatic learning nahi.
- Chat history persist nahi hoti.
- General app login/user authorization layer nahi hai. Public internet par deploy karne se pehle API authentication, authorization, per-user channel isolation, rate limits aur abuse protection add karein.
- YouTube API quota/permissions aur Google Cloud configuration ki operational responsibility deployer ki hai.
- `renders/short_output.mp4` latest rendered video path hai; public download endpoint nahi hai.

## 11. Overall status

Application mein channel connection, analytics, Gemini chat/memory, automatic topic generation, Hindi Gemini TTS, FFmpeg video rendering, manual public publish route aur scheduled publishing ka code maujood hai. Recent local checks ne generation/rendering workflow aur basic upload preconditions pass kiye. **Real YouTube public upload end-to-end abhi manually verify hona baaki hai**, aur current user action selected channel par seedha public post kar sakta hai.
