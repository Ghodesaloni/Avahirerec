# AvaHire - Deployment Guide

This project is structured as a **Unified Full-Stack Node.js Application**:
- **Frontend**: React SPA compiled to `/dist` via `npm run build`.
- **Backend**: Express.js server in `server/server.js` serving both the API (`/api/*`) and the static frontend from `/dist`.
- **Database**: PostgreSQL (AWS RDS or any PostgreSQL) with automatic local dual-layer fallback if not configured.

---

## 1. Quick Start / Standard Node.js Server (EC2, VPS, Ubuntu, PM2)

### Steps:
1. **Clone the repository & install dependencies**:
   ```bash
   git clone <repo-url>
   cd <repo-folder>
   npm install --legacy-peer-deps
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```
   Key variables:
   - `PORT=3000`
   - `DATABASE_URL=postgresql://user:password@host:5432/dbname` (or AWS RDS credentials)
   - `GEMINI_API_KEY=your_gemini_key` (for AI evaluation & resume parsing)
   - `JWT_SECRET=your_jwt_secret`

3. **Build the Frontend**:
   ```bash
   npm run build
   ```

4. **Start the Production Server**:
   ```bash
   # Direct Node execution
   node server/server.js

   # Or using PM2 for production process management:
   npm install -g pm2
   pm2 start server/server.js --name "avahire"
   pm2 save
   pm2 startup
   ```

---

## 2. Docker Deployment (AWS ECS / Cloud Run / DigitalOcean / Fly.io)

A production `Dockerfile` is provided in the repository.

### Build and Run:
```bash
# Build the Docker image
docker build -t avahire:latest .

# Run container with environment file
docker run -d \
  -p 3000:3000 \
  --name avahire-app \
  --env-file .env \
  avahire:latest
```

---

## 3. Cloud Platform Guides

### A. Render (render.com)
1. Create a **New Web Service** connected to your Git repository.
2. Settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install --legacy-peer-deps && npm run build`
   - **Start Command**: `node server/server.js`
3. Add your environment variables in the Render Dashboard (**Environment** tab).
4. Click **Deploy**.

### B. Railway (railway.app)
1. Click **New Project** -> **Deploy from GitHub repo**.
2. Railway detects Node.js automatically.
3. In Service Settings:
   - **Build Command**: `npm install --legacy-peer-deps && npm run build`
   - **Start Command**: `node server/server.js`
4. Set required environment variables (add PostgreSQL database plugin or supply external `DATABASE_URL`).

### C. AWS (App Runner or Elastic Beanstalk)
- **AWS App Runner**:
  - Connect your container registry (Amazon ECR) or source repository.
  - Build command: `npm install --legacy-peer-deps && npm run build`
  - Start command: `node server/server.js`
  - Port: `3000`
  - Connect to **AWS RDS PostgreSQL** and **AWS S3** for media storage.

---

## 4. Key Environment Variables Summary

| Variable | Description | Required? |
|---|---|---|
| `PORT` | Listening port (default: 3000) | Optional |
| `DATABASE_URL` | PostgreSQL connection string | Recommended |
| `GEMINI_API_KEY` | Google Gemini API key for AI features | Recommended |
| `JWT_SECRET` | Secret key for auth tokens | Required for auth |
| `AWS_RDS_*` | AWS RDS PostgreSQL credentials | Optional (alternative to `DATABASE_URL`) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 & SES storage/email credentials | Optional |
| `SMTP_*` / `GMAIL_*` | Email notification credentials | Optional |

---

## 5. Health Check Endpoint

Once deployed, you can verify your service status anytime:
- `GET /health` or `GET /api/health`
- Returns status `healthy`, database connectivity state, and uptime.
