require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Read configuration from environment or stored AWS config (prioritizing AWS RDS PostgreSQL)
let awsStoredConfig = {};
try {
  const awsConfigFile = path.resolve(__dirname, "../data/aws_server_config.json");
  if (fs.existsSync(awsConfigFile)) {
    awsStoredConfig = JSON.parse(fs.readFileSync(awsConfigFile, "utf8")) || {};
  }
} catch (e) {}

const rawDbUrl = (process.env.AWS_RDS_URL || process.env.DATABASE_URL || "").trim();
const rawHostFromUrl = rawDbUrl && !rawDbUrl.includes("://") ? rawDbUrl : null;

const sqlHost = process.env.DB_HOST || process.env.AWS_RDS_HOST || awsStoredConfig.rdsHost || rawHostFromUrl || process.env.SQL_HOST || process.env.PGHOST || "localhost";
const sqlPort = parseInt(process.env.DB_PORT || process.env.AWS_RDS_PORT || awsStoredConfig.rdsPort || process.env.SQL_PORT || process.env.PGPORT || "5432", 10);
const sqlDb = process.env.DB_NAME || process.env.AWS_RDS_DB || awsStoredConfig.rdsDatabase || process.env.SQL_DB_NAME || process.env.PGDATABASE || "avahire_db";
const sqlUser = process.env.DB_USER || process.env.AWS_RDS_USER || awsStoredConfig.rdsUser || process.env.SQL_USER || process.env.PGUSER || "postgres";
const sqlPassword = process.env.DB_PASSWORD || process.env.AWS_RDS_PASSWORD || awsStoredConfig.rdsPassword || process.env.SQL_PASSWORD || process.env.PGPASSWORD || "";
const databaseUrl = process.env.AWS_RDS_URL || process.env.DATABASE_URL;

// Normalize DATABASE_URL and strip accidental bracket wrappers if entered from template [PASSWORD]
function getCleanDatabaseUrl() {
  // If explicit DB_HOST or AWS_RDS_HOST is configured, prefer direct RDS parameters
  if (process.env.DB_HOST || process.env.AWS_RDS_HOST) {
    return null;
  }
  const rawUrl =
    process.env.AWS_RDS_URL ||
    process.env.DATABASE_URL ||
    (process.env.SQL_USER && process.env.SQL_USER.startsWith("postgresql://")
      ? process.env.SQL_USER
      : null);
  if (!rawUrl) return null;
  // If not starting with postgresql:// or postgres://, treat as host, not a full connection URI
  if (!rawUrl.startsWith("postgresql://") && !rawUrl.startsWith("postgres://")) {
    return null;
  }
  try {
    const u = new URL(rawUrl);
    let pw = decodeURIComponent(u.password);
    if (pw.startsWith("[") && pw.endsWith("]")) {
      pw = pw.slice(1, -1);
    }
    return `${u.protocol}//${u.username}:${encodeURIComponent(pw)}@${u.host}${u.pathname}`;
  } catch {
    return rawUrl;
  }
}

// Local file-based fallback database for offline/development resilience
const DATA_DIR = path.resolve(__dirname, "../data");
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    // Ignore error if already exists
  }
}

const USERS_FILE = path.join(DATA_DIR, "postgres_users_mirror.json");
const TOKENS_FILE = path.join(DATA_DIR, "postgres_verification_tokens_mirror.json");

function readJson(file) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    }
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
  }
  return [];
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
  }
}

let pool = null;
let pgConnected = false;

// Create pool lazily
function getPool() {
  if (!pool) {
    const cleanUrl = getCleanDatabaseUrl();
    const isCloudPostgres = Boolean(
      cleanUrl && (
        cleanUrl.includes("supabase.co") ||
        cleanUrl.includes("supabase.com") ||
        cleanUrl.includes("neon.tech") ||
        cleanUrl.includes("sslmode=require") ||
        !cleanUrl.includes("localhost")
      )
    );

    const isAwsRds = Boolean(sqlHost && sqlHost.includes("rds.amazonaws.com"));
    const isRemote = Boolean(sqlHost && !sqlHost.includes("localhost") && !sqlHost.includes("127.0.0.1"));

    const poolConfig = cleanUrl
      ? {
          connectionString: cleanUrl,
          ssl: isCloudPostgres ? { rejectUnauthorized: false } : undefined,
          max: 10,
          connectionTimeoutMillis: 10000,
        }
      : {
          host: sqlHost,
          port: sqlPort,
          database: sqlDb,
          user: sqlUser,
          password: sqlPassword,
          ssl: (isAwsRds || isRemote) ? { rejectUnauthorized: false } : undefined,
          max: 10,
          connectionTimeoutMillis: 10000,
        };

    pool = new Pool(poolConfig);

    pool.on("error", (err) => {
      console.warn("PostgreSQL pool idle client warning:", err.message);
    });
  }
  return pool;
}

// Sync all collections from data files to PostgreSQL
async function syncAllCollectionsToPostgres(client) {
  try {
    const dataDir = path.resolve(__dirname, "../data");

    // 1. Sync Jobs
    const jobsFile = path.join(dataDir, "jobs.json");
    if (fs.existsSync(jobsFile)) {
      const jobs = JSON.parse(fs.readFileSync(jobsFile, "utf8"));
      for (const j of jobs) {
        await client.query(`
          INSERT INTO public.jobs (
            id, title, dept, job_level, reports_to, loc, is_remote_position,
            work_mode, type, exp_level, description, key_skills, candidates,
            status, created_by, user_email, posted, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            dept = EXCLUDED.dept,
            loc = EXCLUDED.loc,
            status = EXCLUDED.status,
            candidates = EXCLUDED.candidates,
            updated_at = NOW();
        `, [
          j.id, j.title, j.dept || "Engineering", j.jobLevel || "Mid Level",
          j.reportsTo || "Engineering Manager", j.loc || "Remote",
          Boolean(j.isRemotePosition), j.workMode || "On-site", j.type || "Full-time",
          j.expLevel || "2-4 Years", j.description || "",
          JSON.stringify(j.keySkills || []), Number(j.candidates || 0),
          j.status || "Active", j.createdBy || "", j.userEmail || j.createdBy || "",
          j.posted || "Recently"
        ]);
      }
    }

    // 2. Sync Resumes
    const resumesFile = path.join(dataDir, "resumes.json");
    if (fs.existsSync(resumesFile)) {
      const resumes = JSON.parse(fs.readFileSync(resumesFile, "utf8"));
      for (const r of resumes) {
        await client.query(`
          INSERT INTO public.resumes (
            id, candidate_id, name, email, phone, role, target_job_id,
            target_job_title, field, domain, score, status, skills,
            matched_skills, missing_skills, experience, exp_years,
            education, summary, key_points, raw_text, resume_file_name,
            file_url, created_by, user_email, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
            $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, NOW(), NOW()
          ) ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            role = EXCLUDED.role,
            score = EXCLUDED.score,
            status = EXCLUDED.status,
            skills = EXCLUDED.skills,
            created_by = EXCLUDED.created_by,
            user_email = EXCLUDED.user_email,
            updated_at = NOW();
        `, [
          r.id, r.candidateId || r.id, r.name, r.email, r.phone, r.role,
          r.targetJobId || null, r.targetJobTitle || null, r.field || null,
          r.domain || null, r.score || r.matchScore || 85, r.status || "Review",
          JSON.stringify(r.skills || []), JSON.stringify(r.matchedSkills || []),
          JSON.stringify(r.missingSkills || []), r.experience || null,
          Number(r.expYears || 2), typeof r.education === "string" ? r.education : JSON.stringify(r.education || []),
          r.summary || "", JSON.stringify(r.keyPoints || {}), r.rawText || "",
          r.resumeFileName || null, r.fileUrl || null, r.createdBy || "",
          r.userEmail || r.createdBy || ""
        ]);
      }
    }

    // 3. Sync Candidates
    const candFile = path.join(dataDir, "candidates.json");
    if (fs.existsSync(candFile)) {
      const cands = JSON.parse(fs.readFileSync(candFile, "utf8"));
      for (const c of cands) {
        await client.query(`
          INSERT INTO public.candidates (
            id, name, email, phone, role, avatar, interview_date, timestamp,
            duration, mode, score, status, notes, summary_points, recommendation,
            transcript, evaluation_breakdown, question_evaluations, audio_url, audio_path, created_by, user_email, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21, $22, NOW()
          ) ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            score = EXCLUDED.score,
            status = EXCLUDED.status,
            summary_points = EXCLUDED.summary_points,
            recommendation = EXCLUDED.recommendation,
            transcript = EXCLUDED.transcript,
            evaluation_breakdown = EXCLUDED.evaluation_breakdown,
            question_evaluations = EXCLUDED.question_evaluations,
            audio_url = COALESCE(EXCLUDED.audio_url, public.candidates.audio_url),
            audio_path = COALESCE(EXCLUDED.audio_path, public.candidates.audio_path),
            created_by = EXCLUDED.created_by,
            user_email = EXCLUDED.user_email,
            updated_at = NOW();
        `, [
          c.id, c.name, c.email, c.phone, c.role, c.avatar, c.interviewDate,
          String(c.timestamp || Date.now()), c.duration || "0m", c.mode || "AI Interview",
          Number(c.score || 90), c.status || "Under Review", c.notes || "",
          JSON.stringify(c.summaryPoints || []), c.recommendation || "",
          JSON.stringify(c.transcript || []), JSON.stringify(c.evaluationBreakdown || []),
          JSON.stringify(c.question_evaluations || c.qaEvaluations || []),
          c.audioUrl || c.audio_url || "", c.audioPath || c.audio_path || "",
          c.createdBy || "", c.userEmail || c.createdBy || ""
        ]);
      }
    }

    // 4. Sync Interviews
    const ivFile = path.join(dataDir, "interviews.json");
    if (fs.existsSync(ivFile)) {
      const ivs = JSON.parse(fs.readFileSync(ivFile, "utf8"));
      for (const iv of ivs) {
        await client.query(`
          INSERT INTO public.interviews (
            id, candidate_id, name, email, avatar, role, company, date,
            day_of_week, time, time_zone, duration, duration_mins, link_code,
            status, expiry, expiry_time, is_expired, score, created_by, user_email,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21, NOW(), NOW()
          ) ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            email = EXCLUDED.email,
            role = EXCLUDED.role,
            date = EXCLUDED.date,
            time = EXCLUDED.time,
            status = EXCLUDED.status,
            link_code = EXCLUDED.link_code,
            created_by = EXCLUDED.created_by,
            user_email = EXCLUDED.user_email,
            updated_at = NOW();
        `, [
          iv.id, iv.candidateId || null, iv.name, iv.email, iv.avatar, iv.role,
          iv.company || "AvaHire", iv.date, iv.dayOfWeek || "", iv.time,
          iv.timeZone || "IST", iv.duration || "45 Mins", Number(iv.durationMins || 45),
          iv.linkCode || "ava123", iv.status || "Scheduled", iv.expiry || "48 Hours",
          iv.expiryTime || null, Boolean(iv.isExpired), Number(iv.score || 0),
          iv.createdBy || "", iv.userEmail || iv.createdBy || ""
        ]);
      }
    }

    // 5. Sync App Collections
    for (const name of ["jobs", "candidates", "interviews", "resumes", "candidate_portal_sessions", "email_templates", "settings", "interview_settings"]) {
      const f = path.join(dataDir, `${name}.json`);
      const fAlt = name === "candidate_portal_sessions" ? path.join(dataDir, "candidate_portal_sessions_mirror.json") : f;
      const fileToUse = fs.existsSync(fAlt) ? fAlt : (fs.existsSync(f) ? f : null);
      if (fileToUse) {
        const parsed = JSON.parse(fs.readFileSync(fileToUse, "utf8"));
        await client.query(`
          INSERT INTO public.app_collections (collection_name, data, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (collection_name) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW();
        `, [name, JSON.stringify(parsed)]);
      }
    }

    // 6. Sync Email Templates to public.email_templates
    const emailTemplatesFile = path.join(dataDir, "email_templates.json");
    let templatesToSeed = [];
    if (fs.existsSync(emailTemplatesFile)) {
      try {
        templatesToSeed = JSON.parse(fs.readFileSync(emailTemplatesFile, "utf8"));
      } catch (e) {}
    }
    if (!templatesToSeed || templatesToSeed.length === 0) {
      templatesToSeed = [
        { id: 1, name: "Interview Invitation", subject: "You're invited to interview for {{role}} at {{company}}", body: "Hi {{candidateName}},\n\nWe were very impressed by your background and would like to invite you for an AI-powered technical interview for the {{role}} position.\n\nPlease join using your personalized link:\n{{interviewLink}}\n\nBest regards,\nTalent Acquisition Team\n{{company}}", category: "Interview" },
        { id: 2, name: "Shortlist Confirmation", subject: "Great news! You've been shortlisted for {{role}}", body: "Dear {{candidateName}},\n\nCongratulations! Your profile has been shortlisted for the next stage of our recruitment process for {{role}}.\n\nOur team will be in touch shortly with next steps.\n\nWarm regards,\n{{company}}", category: "Status" },
        { id: 3, name: "Rejection Email", subject: "Update on your application for {{role}}", body: "Dear {{candidateName}},\n\nThank you for taking the time to speak with us. While your qualifications are impressive, we have decided to move forward with other candidates whose skills more closely align with our current needs.\n\nWe wish you the very best in your job search.\n\nSincerely,\n{{company}}", category: "Status" },
        { id: 4, name: "Offer Letter", subject: "Official Offer Letter - {{role}} at {{company}}", body: "Dear {{candidateName}},\n\nOn behalf of {{company}}, we are thrilled to offer you the position of {{role}}! We were deeply impressed by your interviews and believe you will make a tremendous impact.\n\nPlease find attached the official offer details.\n\nWelcome aboard,\n{{company}}", category: "Offer" }
      ];
    }
    for (const t of templatesToSeed) {
      await client.query(`
        INSERT INTO public.email_templates (id, name, subject, body, category, uses, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          subject = EXCLUDED.subject,
          body = EXCLUDED.body,
          updated_at = NOW();
      `, [t.id, t.name, t.subject, t.body, t.category || "General", t.uses || 0]);
    }

    // 7. Sync App Settings to public.app_settings
    const settingsFile = path.join(dataDir, "settings.json");
    if (fs.existsSync(settingsFile)) {
      try {
        const sData = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
        await client.query(`
          INSERT INTO public.app_settings (setting_key, setting_data, updated_at)
          VALUES ('general', $1, NOW())
          ON CONFLICT (setting_key) DO UPDATE SET setting_data = EXCLUDED.setting_data, updated_at = NOW();
        `, [JSON.stringify(sData)]);
      } catch (e) {}
    }

    const ivSettingsFile = path.join(dataDir, "interview_settings.json");
    if (fs.existsSync(ivSettingsFile)) {
      try {
        const ivData = JSON.parse(fs.readFileSync(ivSettingsFile, "utf8"));
        await client.query(`
          INSERT INTO public.app_settings (setting_key, setting_data, updated_at)
          VALUES ('interview', $1, NOW())
          ON CONFLICT (setting_key) DO UPDATE SET setting_data = EXCLUDED.setting_data, updated_at = NOW();
        `, [JSON.stringify(ivData)]);
      } catch (e) {}
    }
  } catch (err) {
    console.warn("PostgreSQL collection sync notice:", err.message);
  }
}

// Initialize tables in PostgreSQL
async function initTables() {
  const p = getPool();
  try {
    const client = await p.connect();
    try {
      // 1. Users table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          full_name VARCHAR(255) NOT NULL,
          password_hash VARCHAR(255),
          company VARCHAR(255),
          website VARCHAR(255),
          designation VARCHAR(255),
          phone VARCHAR(100),
          is_verified BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Ensure 2FA, backup codes, preferences, settings and extended profile columns exist in public.users
      await client.query(`
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255);
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS backup_codes JSONB;
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS preferences JSONB;
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS interview_settings JSONB;
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar TEXT;
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS location VARCHAR(255);
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS department VARCHAR(255);
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio TEXT;
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS dob VARCHAR(100);
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS gender VARCHAR(50);
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS linkedin VARCHAR(255);
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS company_size VARCHAR(100);
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS industry VARCHAR(100);
      `);

      // 1b. User Active Sessions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.user_sessions (
          id VARCHAR(100) PRIMARY KEY,
          user_email VARCHAR(255) NOT NULL,
          device VARCHAR(255),
          location VARCHAR(255),
          ip_address VARCHAR(100),
          user_agent TEXT,
          last_active VARCHAR(100),
          is_current BOOLEAN DEFAULT TRUE,
          is_revoked BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. Verification tokens table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.verification_tokens (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          token VARCHAR(255) UNIQUE NOT NULL,
          expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
          used BOOLEAN DEFAULT FALSE,
          used_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 3. SMTP sent emails table for permanent email storage
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.smtp_emails (
          id SERIAL PRIMARY KEY,
          message_id VARCHAR(255),
          recipient VARCHAR(255) NOT NULL,
          recipient_name VARCHAR(255),
          sender_email VARCHAR(255),
          user_email VARCHAR(255),
          subject TEXT NOT NULL,
          body TEXT,
          html TEXT,
          email_type VARCHAR(100) DEFAULT 'general',
          template_id VARCHAR(100),
          status VARCHAR(100) DEFAULT 'Delivered',
          delivery_mode VARCHAR(100) DEFAULT 'smtp',
          metadata JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 4. Jobs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.jobs (
          id VARCHAR(255) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          dept VARCHAR(255),
          job_level VARCHAR(100),
          reports_to VARCHAR(255),
          loc VARCHAR(255),
          is_remote_position BOOLEAN DEFAULT FALSE,
          work_mode VARCHAR(100),
          type VARCHAR(100),
          exp_level VARCHAR(100),
          description TEXT,
          key_skills JSONB DEFAULT '[]'::jsonb,
          candidates INTEGER DEFAULT 0,
          status VARCHAR(100) DEFAULT 'Active',
          created_by VARCHAR(255),
          user_email VARCHAR(255),
          posted VARCHAR(100),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 5. Candidates table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.candidates (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          phone VARCHAR(100),
          role VARCHAR(255),
          avatar TEXT,
          interview_date VARCHAR(255),
          timestamp VARCHAR(100),
          duration VARCHAR(100),
          mode VARCHAR(100),
          score NUMERIC,
          status VARCHAR(100) DEFAULT 'Under Review',
          notes TEXT,
          summary_points JSONB DEFAULT '[]'::jsonb,
          recommendation TEXT,
          transcript JSONB DEFAULT '[]'::jsonb,
          evaluation_breakdown JSONB DEFAULT '[]'::jsonb,
          question_evaluations JSONB DEFAULT '[]'::jsonb,
          audio_url TEXT,
          audio_path TEXT,
          created_by VARCHAR(255),
          user_email VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS question_evaluations JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS audio_url TEXT;
        ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS audio_path TEXT;
        ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS selection_date TEXT;
        ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS selection_timestamp TEXT;
        ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS transcript_path TEXT;
        ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS transcript_url TEXT;
        ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS department VARCHAR(255);
        ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS recording_status VARCHAR(50) DEFAULT 'completed';
        ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS job_id VARCHAR(255);
        ALTER TABLE public.candidate_portal_sessions ADD COLUMN IF NOT EXISTS audio_url TEXT;
      `);

      // 6. Interviews table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.interviews (
          id VARCHAR(255) PRIMARY KEY,
          candidate_id VARCHAR(255),
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          avatar TEXT,
          role VARCHAR(255),
          company VARCHAR(255),
          date VARCHAR(100),
          day_of_week VARCHAR(100),
          time VARCHAR(100),
          time_zone VARCHAR(100),
          duration VARCHAR(100),
          duration_mins INTEGER DEFAULT 45,
          link_code VARCHAR(100),
          status VARCHAR(100) DEFAULT 'Scheduled',
          expiry VARCHAR(100),
          expiry_time VARCHAR(100),
          is_expired BOOLEAN DEFAULT FALSE,
          score NUMERIC,
          created_by VARCHAR(255),
          user_email VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 7. Resumes table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.resumes (
          id VARCHAR(255) PRIMARY KEY,
          candidate_id VARCHAR(255),
          name VARCHAR(255),
          email VARCHAR(255),
          phone VARCHAR(100),
          role VARCHAR(255),
          target_job_id VARCHAR(255),
          target_job_title VARCHAR(255),
          field VARCHAR(100),
          domain VARCHAR(100),
          score NUMERIC,
          status VARCHAR(100) DEFAULT 'Review',
          skills JSONB DEFAULT '[]'::jsonb,
          matched_skills JSONB DEFAULT '[]'::jsonb,
          missing_skills JSONB DEFAULT '[]'::jsonb,
          experience VARCHAR(100),
          exp_years NUMERIC DEFAULT 0,
          education TEXT,
          summary TEXT,
          key_points JSONB DEFAULT '{}'::jsonb,
          raw_text TEXT,
          resume_file_name VARCHAR(255),
          file_url TEXT,
          created_by VARCHAR(255),
          user_email VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 8. Email templates table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.email_templates (
          id SERIAL PRIMARY KEY,
          template_key VARCHAR(100),
          name VARCHAR(255) NOT NULL,
          subject TEXT NOT NULL,
          body TEXT NOT NULL,
          category VARCHAR(100),
          uses INTEGER DEFAULT 0,
          created_by VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 9. Email sent logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.email_sent (
          id VARCHAR(255) PRIMARY KEY,
          recipient VARCHAR(255) NOT NULL,
          recipient_name VARCHAR(255),
          sender_email VARCHAR(255),
          user_email VARCHAR(255),
          created_by VARCHAR(255),
          subject TEXT NOT NULL,
          body TEXT,
          html TEXT,
          type VARCHAR(100) DEFAULT 'General',
          template_id VARCHAR(100),
          opened BOOLEAN DEFAULT FALSE,
          opened_at TIMESTAMP WITH TIME ZONE,
          sent_at VARCHAR(100),
          status VARCHAR(100) DEFAULT 'Delivered',
          delivery_mode VARCHAR(100) DEFAULT 'smtp',
          message_id VARCHAR(255),
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 10. App settings table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.app_settings (
          setting_key VARCHAR(100) PRIMARY KEY,
          setting_data JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 11. Candidate portal sessions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.candidate_portal_sessions (
          id VARCHAR(255) PRIMARY KEY,
          link_code VARCHAR(100),
          candidate_name VARCHAR(255),
          candidate_email VARCHAR(255),
          candidate_phone VARCHAR(100),
          role VARCHAR(255),
          company VARCHAR(255),
          status VARCHAR(100),
          system_check_status JSONB DEFAULT '{}'::jsonb,
          overall_score NUMERIC,
          tech_depth_score VARCHAR(100),
          clarity_score VARCHAR(100),
          recommendation TEXT,
          elapsed_seconds INTEGER DEFAULT 0,
          transcripts JSONB DEFAULT '[]'::jsonb,
          evaluation_breakdown JSONB DEFAULT '[]'::jsonb,
          completed_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 12. App collections table (generic JSONB collections table)
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.app_collections (
          collection_name VARCHAR(100) PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 13. Proctoring violations and anti-cheating audit log table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.proctoring_violations (
          id SERIAL PRIMARY KEY,
          session_id VARCHAR(255),
          link_code VARCHAR(100),
          candidate_email VARCHAR(255),
          candidate_name VARCHAR(255),
          violation_type VARCHAR(100) NOT NULL,
          severity VARCHAR(50) DEFAULT 'warning',
          warning_number INTEGER DEFAULT 0,
          details TEXT,
          metadata JSONB DEFAULT '{}'::jsonb,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE public.candidate_portal_sessions ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0;
        ALTER TABLE public.candidate_portal_sessions ADD COLUMN IF NOT EXISTS termination_reason TEXT;
        ALTER TABLE public.candidate_portal_sessions ADD COLUMN IF NOT EXISTS violations JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE public.candidate_portal_sessions ADD COLUMN IF NOT EXISTS proctoring_status VARCHAR(100) DEFAULT 'Clear';
        ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS termination_reason TEXT;
        ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS termination_reason TEXT;
      `);

      // 14. Active Authenticated User Sessions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.user_sessions (
          id VARCHAR(255) PRIMARY KEY,
          user_email VARCHAR(255) NOT NULL,
          session_token_hash VARCHAR(255),
          device VARCHAR(255),
          location VARCHAR(255),
          ip_address VARCHAR(100),
          user_agent TEXT,
          last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          is_current BOOLEAN DEFAULT FALSE,
          is_revoked BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS backup_codes JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
        ALTER TABLE public.users ADD COLUMN IF NOT EXISTS interview_settings JSONB DEFAULT '{}'::jsonb;
      `);

      // Create indexes for faster token, email, job, candidate, and interview lookups
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_verification_tokens_token ON public.verification_tokens(token);
        CREATE INDEX IF NOT EXISTS idx_verification_tokens_email ON public.verification_tokens(email);
        CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
        CREATE INDEX IF NOT EXISTS idx_smtp_emails_recipient ON public.smtp_emails(recipient);
        CREATE INDEX IF NOT EXISTS idx_smtp_emails_user_email ON public.smtp_emails(user_email);
        CREATE INDEX IF NOT EXISTS idx_smtp_emails_type ON public.smtp_emails(email_type);
        CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
        CREATE INDEX IF NOT EXISTS idx_jobs_user_email ON public.jobs(user_email);
        CREATE INDEX IF NOT EXISTS idx_candidates_user_email ON public.candidates(user_email);
        CREATE INDEX IF NOT EXISTS idx_candidates_status ON public.candidates(status);
        CREATE INDEX IF NOT EXISTS idx_interviews_link_code ON public.interviews(link_code);
        CREATE INDEX IF NOT EXISTS idx_interviews_user_email ON public.interviews(user_email);
        CREATE INDEX IF NOT EXISTS idx_resumes_job_id ON public.resumes(target_job_id);
        CREATE INDEX IF NOT EXISTS idx_candidate_sessions_link_code ON public.candidate_portal_sessions(link_code);
        CREATE INDEX IF NOT EXISTS idx_email_sent_user_email ON public.email_sent(user_email);
        CREATE INDEX IF NOT EXISTS idx_proctoring_link_code ON public.proctoring_violations(link_code);
        CREATE INDEX IF NOT EXISTS idx_proctoring_candidate_email ON public.proctoring_violations(candidate_email);
      `);

      // 15. Notifications table
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.notifications (
          id VARCHAR(255) PRIMARY KEY,
          user_email VARCHAR(255) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          type VARCHAR(100) DEFAULT 'general',
          category VARCHAR(100) DEFAULT 'system',
          event_key VARCHAR(255),
          link VARCHAR(255),
          unread BOOLEAN DEFAULT TRUE,
          icon VARCHAR(100),
          icon_bg VARCHAR(100),
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_user_email ON public.notifications(user_email);
        CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(unread);
        CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notifications_event_key ON public.notifications(event_key);
      `);

      // 16. Account-wise data isolation: user_id foreign keys, indexes, and safe backfill
      await client.query(`
        ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS user_id INTEGER;
        ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS user_id INTEGER;
        ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS user_id INTEGER;
        ALTER TABLE public.resumes ADD COLUMN IF NOT EXISTS user_id INTEGER;
        ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id INTEGER;
        ALTER TABLE public.smtp_emails ADD COLUMN IF NOT EXISTS user_id INTEGER;
        ALTER TABLE public.email_sent ADD COLUMN IF NOT EXISTS user_id INTEGER;
        ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS user_id INTEGER;

        CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON public.jobs(user_id);
        CREATE INDEX IF NOT EXISTS idx_candidates_user_id ON public.candidates(user_id);
        CREATE INDEX IF NOT EXISTS idx_interviews_user_id ON public.interviews(user_id);
        CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON public.resumes(user_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
        CREATE INDEX IF NOT EXISTS idx_smtp_emails_user_id ON public.smtp_emails(user_id);
        CREATE INDEX IF NOT EXISTS idx_email_sent_user_id ON public.email_sent(user_id);

        -- Safe verified backfill of existing legacy records without guessing or arbitrary defaults
        UPDATE public.jobs j SET user_id = u.id FROM public.users u WHERE j.user_id IS NULL AND (LOWER(j.user_email) = LOWER(u.email) OR LOWER(j.created_by) = LOWER(u.email));
        UPDATE public.candidates c SET user_id = u.id FROM public.users u WHERE c.user_id IS NULL AND (LOWER(c.user_email) = LOWER(u.email) OR LOWER(c.created_by) = LOWER(u.email));
        UPDATE public.interviews i SET user_id = u.id FROM public.users u WHERE i.user_id IS NULL AND (LOWER(i.user_email) = LOWER(u.email) OR LOWER(i.created_by) = LOWER(u.email));
        UPDATE public.resumes r SET user_id = u.id FROM public.users u WHERE r.user_id IS NULL AND (LOWER(r.user_email) = LOWER(u.email) OR LOWER(r.created_by) = LOWER(u.email));
        UPDATE public.notifications n SET user_id = u.id FROM public.users u WHERE n.user_id IS NULL AND LOWER(n.user_email) = LOWER(u.email);
        UPDATE public.smtp_emails s SET user_id = u.id FROM public.users u WHERE s.user_id IS NULL AND LOWER(s.user_email) = LOWER(u.email);
        UPDATE public.email_sent e SET user_id = u.id FROM public.users u WHERE e.user_id IS NULL AND LOWER(e.user_email) = LOWER(u.email);
      `);

      // Sync any registered mirror users to PostgreSQL public.users
      try {
        const localUsers = readJson(USERS_FILE);
        for (const u of localUsers) {
          if (u && u.email) {
            const pw = u.passwordHash || u.password_hash || null;
            await client.query(`
              INSERT INTO public.users (email, full_name, password_hash, company, website, designation, phone, is_verified)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              ON CONFLICT (email) DO UPDATE
              SET password_hash = COALESCE(EXCLUDED.password_hash, public.users.password_hash),
                  full_name = COALESCE(EXCLUDED.full_name, public.users.full_name),
                  is_verified = TRUE;
            `, [
              u.email.toLowerCase(),
              u.fullName || u.name || "",
              pw,
              u.company || "",
              u.website || "",
              u.designation || "",
              u.phone || "",
              true,
            ]);
          }
        }

        // Pull ALL live PostgreSQL users down to local mirrors to guarantee 100% data consistency
        const allPgUsers = await client.query(`
          SELECT id, email, full_name, password_hash, company, website, designation, phone, is_verified, created_at, updated_at
          FROM public.users
          ORDER BY id ASC
        `);

        if (allPgUsers.rows && allPgUsers.rows.length > 0) {
          // Update all unverified users to verified so no user gets locked out
          await client.query(`UPDATE public.users SET is_verified = TRUE WHERE is_verified IS NOT TRUE`);

          const mergedUsers = [...localUsers];
          for (const row of allPgUsers.rows) {
            const cEmail = row.email.toLowerCase();
            const existingIdx = mergedUsers.findIndex(u => u.email && u.email.toLowerCase() === cEmail);
            const userObj = {
              id: row.id,
              uid: `usr_${row.id}`,
              email: cEmail,
              fullName: row.full_name,
              name: row.full_name,
              company: row.company || "AvaHire",
              website: row.website || "",
              designation: row.designation || "HR Administrator",
              phone: row.phone || "",
              passwordHash: row.password_hash,
              password_hash: row.password_hash,
              isVerified: true,
              createdAt: row.created_at || new Date().toISOString(),
              updatedAt: row.updated_at || new Date().toISOString(),
            };

            if (existingIdx >= 0) {
              mergedUsers[existingIdx] = { ...mergedUsers[existingIdx], ...userObj };
            } else {
              mergedUsers.push(userObj);
            }
          }
          writeJson(USERS_FILE, mergedUsers);

          // Also mirror into users.json
          const defaultUsersFile = path.join(DATA_DIR, "users.json");
          const defaultUsersList = readJson(defaultUsersFile);
          for (const mUser of mergedUsers) {
            const dIdx = defaultUsersList.findIndex(u => u.email && u.email.toLowerCase() === mUser.email.toLowerCase());
            const dUserObj = {
              id: mUser.id,
              uid: mUser.uid || `usr_${mUser.id}`,
              name: mUser.fullName || mUser.name,
              email: mUser.email,
              avatar: mUser.avatar || "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200",
              role: mUser.role || "recruiter",
              company: mUser.company || "AvaHire",
              designation: mUser.designation || "HR Administrator",
              phone: mUser.phone || "",
              password_hash: mUser.passwordHash || mUser.password_hash,
              created_at: mUser.createdAt,
            };
            if (dIdx >= 0) {
              defaultUsersList[dIdx] = { ...defaultUsersList[dIdx], ...dUserObj };
            } else {
              defaultUsersList.push(dUserObj);
            }
          }
          writeJson(defaultUsersFile, defaultUsersList);
        }
      } catch (syncErr) {
        console.warn("PostgreSQL user sync notice:", syncErr.message);
      }

      pgConnected = true;
      console.log("✓ PostgreSQL connected: all databases initialized in PostgreSQL (users, verification_tokens, jobs, candidates, interviews, resumes, email_templates, email_sent, app_settings, candidate_portal_sessions, app_collections).");
    } finally {
      client.release();
    }
  } catch (err) {
    pgConnected = false;
    const reason = err && err.message ? err.message : "No active PostgreSQL server found at " + sqlHost + ":" + sqlPort;
    console.warn("Notice: PostgreSQL live connection currently unavailable (" + reason + "). Dual-layer persistence active (using local storage).");
  }
}

// Immediately attempt non-blocking table verification
initTables().catch((err) => {
  console.warn("Initial PostgreSQL connection attempt:", err.message);
});

// Save or update user
async function saveUser(userData) {
  const { email, fullName, passwordHash, company, website, designation, phone, isVerified } = userData;

  // Always persist to local mirror for full availability
  const usersList = readJson(USERS_FILE);
  const existingIdx = usersList.findIndex((u) => u.email.toLowerCase() === email.toLowerCase());
  const now = new Date().toISOString();

  let userRecord;
  if (existingIdx >= 0) {
    userRecord = {
      ...usersList[existingIdx],
      fullName: fullName || usersList[existingIdx].fullName,
      company: company !== undefined ? company : usersList[existingIdx].company,
      website: website !== undefined ? website : usersList[existingIdx].website,
      designation: designation !== undefined ? designation : usersList[existingIdx].designation,
      phone: phone !== undefined ? phone : usersList[existingIdx].phone,
      passwordHash: passwordHash || usersList[existingIdx].passwordHash,
      isVerified: isVerified !== undefined ? Boolean(isVerified) : Boolean(usersList[existingIdx].isVerified),
      updatedAt: now,
    };
    usersList[existingIdx] = userRecord;
  } else {
    userRecord = {
      id: usersList.length + 1,
      email: email.toLowerCase(),
      fullName: fullName || email.split("@")[0],
      passwordHash,
      company: company || "",
      website: website || "",
      designation: designation || "",
      phone: phone || "",
      isVerified: isVerified !== undefined ? Boolean(isVerified) : false,
      createdAt: now,
      updatedAt: now,
    };
    usersList.push(userRecord);
  }
  writeJson(USERS_FILE, usersList);

  // Keep server/data/users.json in sync for unified login compatibility
  try {
    const defaultUsersFile = path.join(DATA_DIR, "users.json");
    const dUsers = readJson(defaultUsersFile);
    const dIdx = dUsers.findIndex((u) => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (dIdx >= 0) {
      dUsers[dIdx] = {
        ...dUsers[dIdx],
        name: fullName || dUsers[dIdx].name,
        company: company !== undefined ? company : dUsers[dIdx].company,
        designation: designation !== undefined ? designation : dUsers[dIdx].designation,
        phone: phone !== undefined ? phone : dUsers[dIdx].phone,
        password_hash: passwordHash || dUsers[dIdx].password_hash,
      };
    } else {
      dUsers.push({
        id: dUsers.length + 1,
        uid: `usr_${Date.now()}`,
        email: email.toLowerCase(),
        name: fullName || email.split("@")[0],
        avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
        role: "recruiter",
        company: company || "AvaHire Tech Solutions",
        designation: designation || "Talent Recruiter",
        phone: phone || "+91 98000 00000",
        password_hash: passwordHash || null,
        created_at: now,
      });
    }
    writeJson(defaultUsersFile, dUsers);
  } catch (syncErr) {
    console.warn("Could not sync user to users.json:", syncErr.message);
  }

  // Persist to PostgreSQL if available
  try {
    const p = getPool();
    const query = `
      INSERT INTO users (email, full_name, password_hash, company, website, designation, phone, is_verified)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (email) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          password_hash = COALESCE(EXCLUDED.password_hash, public.users.password_hash),
          company = EXCLUDED.company,
          website = EXCLUDED.website,
          designation = EXCLUDED.designation,
          phone = EXCLUDED.phone,
          is_verified = COALESCE(EXCLUDED.is_verified, public.users.is_verified),
          updated_at = CURRENT_TIMESTAMP
      RETURNING id, email, full_name, company, website, designation, phone, is_verified, created_at;
    `;
    const res = await p.query(query, [
      email.toLowerCase(),
      fullName || email.split("@")[0],
      passwordHash || null,
      company || "",
      website || "",
      designation || "",
      phone || "",
      userRecord.isVerified,
    ]);
    if (res.rows && res.rows[0]) {
      return res.rows[0];
    }
  } catch (err) {
    console.warn("PostgreSQL user save fallback:", err.message);
  }

  return userRecord;
}

// Reset password for an account
async function resetPassword(email, newPassword) {
  if (!email || !newPassword) return false;
  const crypto = require("crypto");
  const cleanEmail = email.trim().toLowerCase();
  const passwordHash = crypto.createHash("sha256").update(newPassword).digest("hex");
  const now = new Date().toISOString();

  const usersList = readJson(USERS_FILE);
  const idx = usersList.findIndex((u) => u.email?.toLowerCase() === cleanEmail);
  if (idx >= 0) {
    usersList[idx].passwordHash = passwordHash;
    usersList[idx].isVerified = true;
    usersList[idx].updatedAt = now;
    writeJson(USERS_FILE, usersList);
  } else {
    usersList.push({
      id: usersList.length + 1,
      email: cleanEmail,
      fullName: cleanEmail.split("@")[0],
      passwordHash,
      company: "AvaHire Tech",
      website: "",
      designation: "HR Manager",
      phone: "",
      isVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    writeJson(USERS_FILE, usersList);
  }

  try {
    const p = getPool();
    if (p) {
      await p.query(
        `UPDATE public.users SET password_hash = $1, is_verified = TRUE, updated_at = NOW() WHERE LOWER(email) = $2`,
        [passwordHash, cleanEmail]
      );
    }
  } catch (err) {
    console.warn("PostgreSQL resetPassword fallback:", err.message);
  }
  return true;
}

// Save one-time verification token
async function saveVerificationToken({ email, token, expiresAt }) {
  const now = new Date().toISOString();
  const tokenObj = {
    id: Date.now(),
    email: email.toLowerCase(),
    token,
    expiresAt: expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
    used: false,
    usedAt: null,
    createdAt: now,
  };

  // 1. Local mirror
  const tokens = readJson(TOKENS_FILE);
  tokens.push(tokenObj);
  writeJson(TOKENS_FILE, tokens);

  // 2. PostgreSQL
  try {
    const p = getPool();
    const query = `
      INSERT INTO verification_tokens (email, token, expires_at, used, created_at)
      VALUES ($1, $2, $3, FALSE, CURRENT_TIMESTAMP)
      RETURNING id, email, token, expires_at, used, created_at;
    `;
    const res = await p.query(query, [
      email.toLowerCase(),
      token,
      expiresAt instanceof Date ? expiresAt : new Date(expiresAt),
    ]);
    if (res.rows && res.rows[0]) {
      return res.rows[0];
    }
  } catch (err) {
    console.warn("PostgreSQL token save fallback:", err.message);
  }

  return tokenObj;
}

// Find verification token
async function findVerificationToken(token) {
  // 1. Try PostgreSQL first
  try {
    const p = getPool();
    const res = await p.query(
      `SELECT * FROM verification_tokens WHERE token = $1 ORDER BY id DESC LIMIT 1`,
      [token]
    );
    if (res.rows && res.rows.length > 0) {
      const row = res.rows[0];
      return {
        id: row.id,
        email: row.email,
        token: row.token,
        expiresAt: row.expires_at,
        used: row.used,
        usedAt: row.used_at,
        createdAt: row.created_at,
      };
    }
  } catch (err) {
    console.warn("PostgreSQL token lookup fallback:", err.message);
  }

  // 2. Fallback to local mirror
  const tokens = readJson(TOKENS_FILE);
  return tokens.find((t) => t.token === token) || null;
}

// Consume one-time token and verify user
async function consumeVerificationToken(token) {
  const tokenRecord = await findVerificationToken(token);
  if (!tokenRecord) {
    return { success: false, reason: "NOT_FOUND" };
  }

  if (tokenRecord.used) {
    return { success: false, reason: "ALREADY_USED", email: tokenRecord.email };
  }

  const expiry = new Date(tokenRecord.expiresAt);
  if (expiry < new Date()) {
    return { success: false, reason: "EXPIRED", email: tokenRecord.email };
  }

  const now = new Date();

  // Mark token used in PostgreSQL
  try {
    const p = getPool();
    await p.query(
      `UPDATE verification_tokens SET used = TRUE, used_at = $1 WHERE token = $2`,
      [now, token]
    );
    await p.query(
      `UPDATE users SET is_verified = TRUE, updated_at = $1 WHERE email = $2`,
      [now, tokenRecord.email.toLowerCase()]
    );
  } catch (err) {
    console.warn("PostgreSQL consume token fallback:", err.message);
  }

  // Update in local mirror
  const tokens = readJson(TOKENS_FILE);
  const tIdx = tokens.findIndex((t) => t.token === token);
  if (tIdx >= 0) {
    tokens[tIdx].used = true;
    tokens[tIdx].usedAt = now.toISOString();
    writeJson(TOKENS_FILE, tokens);
  }

  const usersList = readJson(USERS_FILE);
  const uIdx = usersList.findIndex((u) => u.email.toLowerCase() === tokenRecord.email.toLowerCase());
  if (uIdx >= 0) {
    usersList[uIdx].isVerified = true;
    usersList[uIdx].updatedAt = now.toISOString();
    writeJson(USERS_FILE, usersList);
  }

  return { success: true, email: tokenRecord.email };
}

// Verify recovery token without consuming yet (for preview/verification)
async function verifyRecoveryToken(token) {
  if (!token) return { valid: false, reason: "MISSING_TOKEN" };
  const cleanToken = token.trim();
  const tokenRecord = await findVerificationToken(cleanToken);
  if (!tokenRecord) {
    return { valid: false, reason: "NOT_FOUND" };
  }
  if (tokenRecord.used) {
    return { valid: false, reason: "ALREADY_USED", email: tokenRecord.email };
  }
  const expiry = new Date(tokenRecord.expiresAt);
  if (expiry < new Date()) {
    return { valid: false, reason: "EXPIRED", email: tokenRecord.email };
  }
  return { valid: true, email: tokenRecord.email };
}

// Securely reset password using a valid recovery token
async function resetPasswordWithToken({ token, newPassword }) {
  if (!token || !newPassword) {
    return { success: false, reason: "MISSING_DATA", error: "Token and new password are required." };
  }

  const cleanToken = token.trim();
  const tokenRecord = await findVerificationToken(cleanToken);
  if (!tokenRecord) {
    return { success: false, reason: "NOT_FOUND", error: "Invalid or nonexistent recovery token." };
  }
  if (tokenRecord.used) {
    return { success: false, reason: "ALREADY_USED", error: "This recovery token has already been used." };
  }
  const expiry = new Date(tokenRecord.expiresAt);
  if (expiry < new Date()) {
    return { success: false, reason: "EXPIRED", error: "This recovery token has expired. Please request a new one." };
  }

  const cleanEmail = tokenRecord.email.toLowerCase().trim();

  // 1. Update the password in database and local mirror
  await resetPassword(cleanEmail, newPassword);

  // 2. Mark token as consumed
  const now = new Date();
  try {
    const p = getPool();
    if (p) {
      await p.query(
        `UPDATE verification_tokens SET used = TRUE, used_at = $1 WHERE token = $2`,
        [now, cleanToken]
      );
    }
  } catch (err) {
    console.warn("PostgreSQL consume recovery token fallback:", err.message);
  }

  const tokens = readJson(TOKENS_FILE);
  const tIdx = tokens.findIndex((t) => t.token === cleanToken);
  if (tIdx >= 0) {
    tokens[tIdx].used = true;
    tokens[tIdx].usedAt = now.toISOString();
    writeJson(TOKENS_FILE, tokens);
  }

  return { success: true, email: cleanEmail };
}

// Get user by email
async function getUserByEmail(email) {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();

  try {
    const p = getPool();
    if (p) {
      const res = await p.query(
        `SELECT id, email, full_name, password_hash, company, website, designation, phone, is_verified, avatar, location, department, bio, dob, gender, linkedin, company_size, industry, created_at FROM public.users WHERE LOWER(email) = $1 LIMIT 1`,
        [cleanEmail]
      );
      if (res.rows && res.rows[0]) {
        const row = res.rows[0];
        return {
          id: row.id,
          uid: `usr_${row.id}`,
          email: row.email,
          fullName: row.full_name,
          name: row.full_name,
          company: row.company || "",
          companyName: row.company || "",
          website: row.website || "",
          companyWebsite: row.website || "",
          designation: row.designation || "",
          jobTitle: row.designation || "",
          phone: row.phone || "",
          password_hash: row.password_hash,
          passwordHash: row.password_hash,
          isVerified: row.is_verified,
          avatar: row.avatar || "",
          location: row.location || "",
          department: row.department || "Human Resources",
          bio: row.bio || "",
          dob: row.dob || "",
          displayDob: row.dob || "",
          gender: row.gender || "",
          linkedin: row.linkedin || "",
          companySize: row.company_size || "",
          industry: row.industry || "",
          createdAt: row.created_at,
        };
      }
    }
  } catch (err) {
    console.warn("PostgreSQL getUserByEmail fallback:", err.message);
  }

  const usersList = readJson(USERS_FILE);
  const found = usersList.find((u) => u.email?.toLowerCase() === cleanEmail);
  if (found) {
    return {
      id: found.id,
      uid: `usr_${found.id}`,
      email: found.email,
      fullName: found.fullName || found.name || "",
      name: found.fullName || found.name || "",
      company: found.company || "",
      companyName: found.company || "",
      website: found.website || "",
      companyWebsite: found.website || "",
      designation: found.designation || "",
      jobTitle: found.designation || "",
      phone: found.phone || "",
      password_hash: found.passwordHash || found.password_hash || null,
      passwordHash: found.passwordHash || found.password_hash || null,
      isVerified: Boolean(found.isVerified),
      avatar: found.avatar || "",
      location: found.location || "",
      department: found.department || "Human Resources",
      bio: found.bio || "",
      dob: found.dob || "",
      displayDob: found.dob || "",
      gender: found.gender || "",
      linkedin: found.linkedin || "",
      companySize: found.companySize || found.company_size || "",
      industry: found.industry || "",
      createdAt: found.createdAt,
    };
  }

  // Also check default users store
  const defaultUsersFile = path.join(DATA_DIR, "users.json");
  const fallbackUsers = readJson(defaultUsersFile);
  const fallbackFound = fallbackUsers.find((u) => u.email?.toLowerCase() === cleanEmail);
  if (fallbackFound) {
    return {
      id: fallbackFound.id,
      uid: fallbackFound.uid || `usr_${fallbackFound.id}`,
      email: fallbackFound.email,
      fullName: fallbackFound.name,
      name: fallbackFound.name,
      company: fallbackFound.company || "AvaHire",
      companyName: fallbackFound.company || "AvaHire",
      website: fallbackFound.website || "",
      companyWebsite: fallbackFound.website || "",
      designation: fallbackFound.designation || "HR Administrator",
      jobTitle: fallbackFound.designation || "HR Administrator",
      phone: fallbackFound.phone || "+91 98000 00000",
      password_hash: fallbackFound.password_hash || "password123",
      passwordHash: fallbackFound.password_hash || "password123",
      isVerified: true,
      avatar: fallbackFound.avatar || "",
      location: fallbackFound.location || "",
      department: fallbackFound.department || "Human Resources",
      bio: fallbackFound.bio || "",
      dob: fallbackFound.dob || "",
      displayDob: fallbackFound.dob || "",
      gender: fallbackFound.gender || "",
      linkedin: fallbackFound.linkedin || "",
      companySize: fallbackFound.companySize || fallbackFound.company_size || "",
      industry: fallbackFound.industry || "",
      createdAt: fallbackFound.created_at,
    };
  }

  return null;
}

// Update complete HR user profile across PostgreSQL and local mirror
async function updateUserProfile(email, profileData) {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();

  const fullName = profileData.fullName || profileData.name || "";
  const phone = profileData.phone || "";
  const designation = profileData.jobTitle || profileData.designation || "";
  const company = profileData.companyName || profileData.company || "";
  const website = profileData.companyWebsite || profileData.website || "";
  const companySize = profileData.companySize || profileData.company_size || "";
  const industry = profileData.industry || "";
  const location = profileData.location || "";
  const department = profileData.department || "";
  const bio = profileData.bio || "";
  const dob = profileData.displayDob || profileData.dob || "";
  const gender = profileData.gender || "";
  const linkedin = profileData.linkedin || "";
  const avatar = profileData.avatar !== undefined ? profileData.avatar : null;

  // 1. Update mirror file
  const usersList = readJson(USERS_FILE);
  const uIdx = usersList.findIndex((u) => u.email && u.email.toLowerCase() === cleanEmail);
  if (uIdx >= 0) {
    usersList[uIdx] = {
      ...usersList[uIdx],
      fullName: fullName || usersList[uIdx].fullName,
      phone: phone !== undefined ? phone : usersList[uIdx].phone,
      designation: designation || usersList[uIdx].designation,
      company: company || usersList[uIdx].company,
      website: website || usersList[uIdx].website,
      companySize: companySize || usersList[uIdx].companySize,
      industry: industry || usersList[uIdx].industry,
      location: location || usersList[uIdx].location,
      department: department || usersList[uIdx].department,
      bio: bio !== undefined ? bio : usersList[uIdx].bio,
      dob: dob || usersList[uIdx].dob,
      gender: gender || usersList[uIdx].gender,
      linkedin: linkedin || usersList[uIdx].linkedin,
      avatar: avatar !== null ? avatar : usersList[uIdx].avatar,
      updatedAt: new Date().toISOString()
    };
    writeJson(USERS_FILE, usersList);
  }

  // 2. Update server/data/users.json
  const defaultUsersFile = path.join(DATA_DIR, "users.json");
  const dUsers = readJson(defaultUsersFile);
  const dIdx = dUsers.findIndex((u) => u.email && u.email.toLowerCase() === cleanEmail);
  if (dIdx >= 0) {
    dUsers[dIdx] = {
      ...dUsers[dIdx],
      name: fullName || dUsers[dIdx].name,
      phone: phone !== undefined ? phone : dUsers[dIdx].phone,
      designation: designation || dUsers[dIdx].designation,
      company: company || dUsers[dIdx].company,
      website: website || dUsers[dIdx].website,
      companySize: companySize || dUsers[dIdx].companySize,
      industry: industry || dUsers[dIdx].industry,
      location: location || dUsers[dIdx].location,
      department: department || dUsers[dIdx].department,
      bio: bio !== undefined ? bio : dUsers[dIdx].bio,
      dob: dob || dUsers[dIdx].dob,
      gender: gender || dUsers[dIdx].gender,
      linkedin: linkedin || dUsers[dIdx].linkedin,
      avatar: avatar !== null ? avatar : dUsers[dIdx].avatar,
    };
    writeJson(defaultUsersFile, dUsers);
  }

  // 3. Update PostgreSQL
  try {
    const p = getPool();
    if (p) {
      const upd = await p.query(
        `UPDATE public.users SET
          full_name = COALESCE(NULLIF($1, ''), full_name),
          phone = COALESCE(NULLIF($2, ''), phone),
          designation = COALESCE(NULLIF($3, ''), designation),
          company = COALESCE(NULLIF($4, ''), company),
          website = COALESCE(NULLIF($5, ''), website),
          company_size = COALESCE(NULLIF($6, ''), company_size),
          industry = COALESCE(NULLIF($7, ''), industry),
          location = COALESCE(NULLIF($8, ''), location),
          department = COALESCE(NULLIF($9, ''), department),
          bio = COALESCE($10, bio),
          dob = COALESCE(NULLIF($11, ''), dob),
          gender = COALESCE(NULLIF($12, ''), gender),
          linkedin = COALESCE(NULLIF($13, ''), linkedin),
          avatar = CASE WHEN $14 IS NOT NULL THEN $14 ELSE avatar END,
          updated_at = NOW()
        WHERE LOWER(email) = $15`,
        [
          fullName, phone, designation, company, website,
          companySize, industry, location, department, bio,
          dob, gender, linkedin, avatar, cleanEmail
        ]
      );

      if (upd && upd.rowCount === 0) {
        await p.query(
          `INSERT INTO public.users (email, full_name, phone, designation, company, website, company_size, industry, location, department, bio, dob, gender, linkedin, avatar, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW())
           ON CONFLICT (email) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            phone = EXCLUDED.phone,
            designation = EXCLUDED.designation,
            company = EXCLUDED.company,
            website = EXCLUDED.website,
            company_size = EXCLUDED.company_size,
            industry = EXCLUDED.industry,
            location = EXCLUDED.location,
            department = EXCLUDED.department,
            bio = EXCLUDED.bio,
            dob = EXCLUDED.dob,
            gender = EXCLUDED.gender,
            linkedin = EXCLUDED.linkedin,
            avatar = EXCLUDED.avatar,
            updated_at = NOW()`,
          [
            cleanEmail, fullName || "HR Administrator", phone || "", designation || "HR Manager", company || "AvaHire", website || "",
            companySize || "", industry || "", location || "", department || "Human Resources", bio || "",
            dob || "", gender || "", linkedin || "", avatar || ""
          ]
        );
      }
    }
  } catch (err) {
    console.warn("PostgreSQL updateUserProfile error:", err.message);
  }

  return await getUserByEmail(cleanEmail);

  return null;
}

// Save sent SMTP email to PostgreSQL
async function saveSmtpEmail({
  messageId,
  recipient,
  recipientName,
  senderEmail,
  userEmail,
  subject,
  body,
  html,
  emailType,
  templateId,
  status,
  deliveryMode,
  metadata,
}) {
  const p = getPool();
  if (!p) return null;
  try {
    const res = await p.query(
      `INSERT INTO public.smtp_emails 
        (message_id, recipient, recipient_name, sender_email, user_email, subject, body, html, email_type, template_id, status, delivery_mode, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *;`,
      [
        messageId || null,
        (recipient || "").toLowerCase().trim(),
        recipientName || "",
        senderEmail || "",
        (userEmail || recipient || "").toLowerCase().trim(),
        subject || "No Subject",
        body || "",
        html || null,
        emailType || "general",
        templateId ? String(templateId) : null,
        status || "Delivered",
        deliveryMode || "smtp",
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
    return res.rows[0] || null;
  } catch (err) {
    console.warn("PostgreSQL saveSmtpEmail notice:", err.message);
    return null;
  }
}

// Retrieve stored SMTP emails from PostgreSQL
async function getSmtpEmails({ userEmail, recipient, emailType, limit = 100 }) {
  const p = getPool();
  if (!p) return [];
  try {
    const conditions = [];
    const values = [];

    if (userEmail) {
      values.push(userEmail.toLowerCase().trim());
      conditions.push(`(LOWER(user_email) = $${values.length} OR LOWER(sender_email) = $${values.length} OR LOWER(recipient) = $${values.length})`);
    }

    if (recipient) {
      values.push(recipient.toLowerCase().trim());
      conditions.push(`LOWER(recipient) = $${values.length}`);
    }

    if (emailType && emailType !== "all") {
      values.push(emailType);
      conditions.push(`email_type = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    values.push(limit);
    const queryStr = `SELECT * FROM public.smtp_emails ${whereClause} ORDER BY created_at DESC LIMIT $${values.length};`;

    const res = await p.query(queryStr, values);
    return res.rows;
  } catch (err) {
    console.warn("PostgreSQL getSmtpEmails notice:", err.message);
    return [];
  }
}

// Generic query runner
async function query(text, params) {
  try {
    const p = getPool();
    if (!p) {
      return { rows: [] };
    }
    return await p.query(text, params);
  } catch (err) {
    console.warn("PostgreSQL query fallback:", err.message);
    return { rows: [] };
  }
}

// Get all registered users for quick account switching
async function getAllUsers() {
  const usersList = readJson(USERS_FILE);
  const defaultUsersFile = path.join(DATA_DIR, "users.json");
  const fallbackUsers = readJson(defaultUsersFile);

  const emailMap = new Map();
  for (const u of fallbackUsers) {
    if (u && u.email) {
      emailMap.set(u.email.toLowerCase(), {
        id: u.id,
        uid: u.uid || `usr_${u.id}`,
        email: u.email.toLowerCase(),
        name: u.name || u.fullName || u.email.split("@")[0],
        fullName: u.name || u.fullName || u.email.split("@")[0],
        avatar: u.avatar || "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200",
        company: u.company || "AvaHire",
        designation: u.designation || "HR Administrator",
        role: u.role || "recruiter",
      });
    }
  }

  for (const u of usersList) {
    if (u && u.email) {
      const cEmail = u.email.toLowerCase();
      emailMap.set(cEmail, {
        id: u.id,
        uid: u.uid || `usr_${u.id}`,
        email: cEmail,
        name: u.fullName || u.name || cEmail.split("@")[0],
        fullName: u.fullName || u.name || cEmail.split("@")[0],
        avatar: u.avatar || "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200",
        company: u.company || "AvaHire",
        designation: u.designation || "HR Administrator",
        role: u.role || "recruiter",
      });
    }
  }

  return Array.from(emailMap.values());
}

function isPgConnected() {
  return pgConnected;
}

function getConnectionStatus() {
  return {
    connected: pgConnected,
    mode: pgConnected ? "PostgreSQL (Live Database)" : "Local JSON Engine (Dual-Layer Persistence Fallback)",
    host: sqlHost,
    port: sqlPort,
    database: sqlDb,
    user: sqlUser,
    hasUrlConfigured: Boolean(process.env.AWS_RDS_URL || process.env.DATABASE_URL)
  };
}

module.exports = {
  getPool,
  initTables,
  isPgConnected,
  getConnectionStatus,
  saveUser,
  resetPassword,
  saveVerificationToken,
  findVerificationToken,
  consumeVerificationToken,
  verifyRecoveryToken,
  resetPasswordWithToken,
  getUserByEmail,
  getAllUsers,
  saveSmtpEmail,
  getSmtpEmails,
  updateUserProfile,
  query,
};
