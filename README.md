# AI Interview Monitor

> Real-time behavioral analysis and malpractice detection for AI-powered interviews.
> Built with MediaPipe FaceMesh, Django REST Framework, and Next.js.

---

## What It Does

AI Interview Monitor is a full-stack web application that monitors candidate behavior during video interviews in real time. It detects malpractice signals, tracks behavioral patterns, and generates structured session reports — all with **zero API costs** for the core detection layer.

**The entire face analysis pipeline runs client-side in the browser. No video is sent to any server.**

---

## Features

### Real-Time Face Analysis (Browser — Zero Cost)
- **478-point facial mesh** via MediaPipe FaceMesh — full face surface with 3D depth
- **Iris-level gaze tracking** — precise eye direction using iris landmark positions
- **Head pose estimation** — yaw (turning), pitch (looking up/down), roll (tilt)
- **Eye aspect ratio (EAR)** — blink rate, drowsiness detection
- **Mouth analysis** — talking detection, smile recognition

### Malpractice Detection
- **Tab/window switch detection** — Page Visibility API, fires on every switch
- **Multiple face detection** — alerts when a second person enters frame
- **Face absence tracking** — flags when candidate leaves camera view
- **Background audio monitoring** — Web Audio API detects voice spikes from helpers
- **Head turn detection** — candidate looking away from screen
- **Looking down pattern** — repeated downward gaze suggests phone or notes
- **Repeated glance pattern** — same off-screen direction repeatedly = suspicious

### Emotion Analysis (Interview-Optimised)
Custom emotions derived from 478 landmarks — more relevant than generic emotion labels:

| Emotion | Signal Used |
|---------|-------------|
| Engaged | Eye contact + nodding + gaze stability |
| Focused | Stable gaze + normal blink rate + centered head |
| Confused | Brow furrow + head tilt + wide eyes |
| Nervous | High blink rate + micro-movements + gaze instability |
| Suspicious | Head turn + looking down + repeated side glances |
| Disengaged | Wandering gaze + low expression + drowsy eyes |

### Scoring Engine
Three real-time scores updated continuously:

- **Attention Score** — based on gaze stability and look-away count
- **Integrity Score** — deducted for tab switches, multi-face, audio anomalies
- **Engagement Score** — based on face presence, nodding, eye contact
- **Overall Score** — weighted composite (Integrity 40%, Attention 35%, Engagement 25%)

### Session Report
After each session:
- Overall score with verdict (Recommended / Review / Flagged)
- Score breakdown with contributing factors
- Timestamped event log of all flagged incidents
- Downloadable `.txt` report with full session summary

### Django REST Backend
- Session management with UUID-based session IDs
- Event logging per session
- Emotion snapshot storage every 10 seconds
- Report generation and retrieval
- HR dashboard stats endpoint

---

## Tech Stack

| Layer | Technology | Cost |
|-------|-----------|------|
| Face detection | MediaPipe FaceMesh (478 landmarks) | Free |
| Iris tracking | MediaPipe refineLandmarks | Free |
| Tab detection | Page Visibility API | Free |
| Audio monitoring | Web Audio API | Free |
| Frontend | Next.js 16 + Fira Code/Sans | Free |
| Backend | Django 4.2 + Django REST Framework | Free |
| Database | PostgreSQL (prod) / SQLite (dev) | Free |
| Frontend deploy | Vercel | Free |
| Backend deploy | Railway | Free |

**Total monthly infrastructure cost: ₹0**

---

## Project Structure

```
ai-interview-monitor/
├── frontend/                        # Next.js application
│   └── src/
│       ├── app/
│       │   ├── layout.jsx           # Root layout with Google Fonts
│       │   ├── page.jsx             # Landing page
│       │   └── monitor/page.jsx     # Live monitoring page
│       ├── hooks/
│       │   ├── useFaceMesh.js       # MediaPipe integration + canvas drawing
│       │   ├── useAudioMonitor.js   # Web Audio API background voice detection
│       │   ├── useTabDetection.js   # Page Visibility API tab switch detection
│       │   └── useSession.js        # Django API communication
│       └── lib/
│           └── emotions.js          # Emotion analysis, gaze, head pose, scoring
│
└── backend/                         # Django project
    ├── config/
    │   ├── settings.py
    │   └── urls.py
    └── interviews/                  # Main Django app
        ├── models.py                # Session, Event, EmotionSnapshot
        ├── serializers.py
        ├── views.py                 # 7 REST endpoints
        └── urls.py
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sessions/start/` | Start a new monitoring session |
| GET | `/api/sessions/` | List all sessions (HR dashboard) |
| GET | `/api/sessions/<id>/` | Get full session with events |
| POST | `/api/sessions/<id>/events/` | Log a malpractice or behavioral event |
| POST | `/api/sessions/<id>/emotions/` | Log periodic emotion snapshot |
| POST | `/api/sessions/<id>/end/` | End session, store final scores |
| GET | `/api/dashboard/` | Overall stats for HR dashboard |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+
- npm or yarn

### 1. Clone the repository

```bash
git clone https://github.com/arjunyash2/ai-interview-monitor.git
cd ai-interview-monitor
```

### 2. Start the Django backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your values

# Run migrations
python manage.py makemigrations interviews
python manage.py migrate

# Start server
python manage.py runserver
# Backend running at http://localhost:8000
```

### 3. Start the Next.js frontend

```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8000/api

# Start development server
npm run dev
# Frontend running at http://localhost:3000
```

### 4. Open the monitor

Go to `http://localhost:3000/monitor`, allow camera and microphone access, and click **Start Session**.

---

## Environment Variables

### Backend (`backend/.env`)

```env
SECRET_KEY=your-django-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:3000
DATABASE_URL=sqlite:///db.sqlite3
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

---

## How the Face Analysis Works

### MediaPipe FaceMesh

The browser loads MediaPipe FaceMesh models (~3MB) on session start. These run entirely on-device using WebAssembly — no face data is transmitted to any external server.

Each video frame is processed through the FaceMesh model returning 478 3D landmark coordinates. Key landmark groups:

```
Points 0–467    → Full face surface mesh
Points 133, 362 → Eye inner corners
Points 33, 263  → Eye outer corners
Points 468–472  → Left iris (5 points)
Points 473–477  → Right iris (5 points)
Point 1         → Nose tip (head pose yaw)
Point 152       → Chin (head pose pitch)
Points 234, 454 → Ear tragions (head roll)
```

### Gaze Calculation

Gaze direction is calculated from iris center position relative to eye corners:

```
gazeX = (irisCenter.x - eyeOuterCorner.x) / eyeWidth
```

A `gazeX` of 0.35–0.65 indicates the candidate is looking at the screen. Values outside this range trigger a gaze-away event.

### Emotion Derivation

Unlike face-api.js which provides generic pre-classified emotions, this system derives interview-specific behavioral signals directly from landmark geometry:

- **Brow furrow** — distance between inner eyebrow landmarks 107 and 336
- **Head tilt** — roll angle from ear landmark heights
- **Blink rate** — eye aspect ratio (EAR) tracked over time
- **Nodding** — head pitch oscillation frequency
- **Gaze stability** — variance of iris x-position over a 3-second window

---

## Monitoring UI

The live monitoring view shows two side-by-side feeds:
- **RAW** — plain mirrored camera feed
- **MESH** — camera feed with green 478-point face mesh + iris circles overlaid

Both feeds share the same MediaPipe stream with no second camera request.

---

## Deployment

### Deploy Backend to Railway

```bash
npm install -g @railway/cli
cd backend
railway login
railway init
railway add postgresql
railway up
```

Set environment variables in Railway dashboard:
```
SECRET_KEY=<strong-random-key>
DEBUG=False
ALLOWED_HOSTS=<your-app>.railway.app
CORS_ALLOWED_ORIGINS=https://<your-vercel-app>.vercel.app
DATABASE_URL=<auto-set-by-railway>
```

Run migrations:
```bash
railway run python manage.py migrate
```

### Deploy Frontend to Vercel

```bash
cd frontend
npx vercel
```

Set in Vercel dashboard:
```
NEXT_PUBLIC_API_URL=https://<your-app>.railway.app/api
```

---

## Detection Summary

| Signal | Detection Method | Severity |
|--------|-----------------|----------|
| Tab switch | Page Visibility API | Danger |
| Multiple faces | MediaPipe multi-face | Danger |
| Face absent | No landmarks detected | Warning |
| Background voice | Web Audio frequency spike | Danger |
| Head turned away | Yaw > 70% or < 30% | Warning |
| Looking down repeatedly | Pitch > 55% threshold | Warning |
| Suspicious glance pattern | 70%+ glances same direction | Danger |
| Wandering gaze | Low gaze stability score | Warning |

---

## Roadmap

- [ ] AI-powered behavioral analysis via Claude Vision API
- [ ] Whisper-based answer transcription
- [ ] PDF report export
- [ ] HR dashboard with candidate comparison
- [ ] Multi-round interview support
- [ ] Email notifications via Resend

---

## Architecture Decisions

**Why client-side detection?**
Running MediaPipe in the browser eliminates API costs, reduces latency, and avoids transmitting raw video frames to any server. The detection runs at 25–30 FPS with no network dependency.

**Why 478 landmarks over face-api.js's 68?**
The additional landmarks enable iris tracking, 3D depth, and precise geometric calculations for interview-relevant signals like confusion (brow geometry) and engagement (nodding from pitch oscillation) that 68-point models cannot deliver.

**Why Django REST Framework?**
DRF provides clean serialization, validation, and a browsable API for rapid development. The backend is additive — the frontend works standalone without it.

---

## License

MIT

---

## Author

**Arjun S.D**  
AI Developer · Python Backend Engineer  
[arjunyash2@gmail.com](mailto:arjunyash2@gmail.com) · [LinkedIn](https://www.linkedin.com/in/arjunsdileep/) · [Portfolio](https://arjunyash2.vercel.app)
