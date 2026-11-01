# AvaHire - AI Recruitment & Live Interviewing System

AvaHire is an autonomous, multimodal AI recruitment and interviewing platform. It combines deterministic 8-factor ATS resume screening, automated candidate lifecycle communications, and real-time candidate interviewing rooms featuring audio/visual anti-cheat proctoring, multi-rubric evaluation, and an HR recruiter management dashboard.

## Key Features

### 1. Recruiter Workspace & Dashboard
- **Executive Recruitment KPIs**: Real-time tracking of active job requisitions, candidate pipeline funnel, scheduled and completed interviews, and hire recommendations.
- **Job Requisitions Management**: Create, edit, and filter jobs with custom departments, seniority levels, requirements, and key skills.
- **Resume Hub & 8-Factor ATS Screening**: Upload resumes in PDF or Word (`.docx`), extract candidate entities (skills, experience, education, domain), and score alignment using deterministic rubric algorithms.
- **Candidate Talent Pipeline**: Track candidate progression through Applied, Screening, Interview, and Selected stages with full per-account isolation.
- **Interview Scheduling & Calendar**: Book candidate interview slots, generate secure tokenized join URLs, and configure proctoring sensitivity.
- **Email Center**: Idempotent email triggers for shortlisting notifications, interview invitations, 1-hour reminders, and offer letters.
- **Reports & Document Downloads**: Export candidate rosters to formatted Excel (`.xlsx`) spreadsheets and download structured interview transcripts (`.docx`).

### 2. Candidate AI Interview Portal
- **Secure Tokenized Entry**: Candidate verification against registered resume credentials (email and phone) with strict schedule window validation.
- **Device & System Check**: Integrated camera, microphone, speaker, and network latency diagnostic checks.
- **Interactive Instructions**: Proctoring rules, camera framing guidance, and interview format overview.
- **Live Interview Room**:
  - Live AI interviewer persona ("Ava") asking structured role-specific and technical questions.
  - Real-time speech recognition and captioning.
  - Computer vision and audio proctoring (monitoring tab switching/window blur, multiple faces, missing faces, poor lighting, and background voices).
  - Automated rubric scoring across Technical Correctness (40%), Completeness (25%), Relevance (15%), Problem Solving (15%), and Communication Clarity (5%).
- **Completion & Thank You**: Candidate feedback and automated scorecard submission.

## Tech Stack

- **Frontend**: React 19, React Router v7, Tailwind CSS, Radix UI Primitives, Lucide Icons, Recharts, Sonner Toasts
- **Backend & Middleware**: Express.js REST API with dynamic middleware pipeline
- **Database & Persistence**: Dual-layer architecture with PostgreSQL (ACID relational) and zero-downtime local JSON document mirror fallback
- **Audio & Media**: Web Audio API frequency analysis, SpeechRecognition, LiveKit WebRTC
- **AI & Evaluation**: Algorithmic 5-parameter rubric engine and Google GenAI LLM evaluation

## Getting Started

### Development
```bash
npm run dev
```
The application will start on port `3000` at `http://0.0.0.0:3000`.

### Production Build
```bash
npm run build
```
Creates an optimized production bundle in the `dist/` directory.

### Demo Recruiter Credentials
- **Email**: `salonighode@gmail.com`
- **Password**: `Password123!`
- **Alternative Admin**: `admin@avahire.ai` / `Password123!`
