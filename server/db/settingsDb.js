const { readData, writeData } = require("./dbEngine");
const { getPool, query } = require("./postgres");

const SETTINGS_COLLECTION = "settings";
const PROFILE_COLLECTION = "profile";
const INTERVIEW_SETTINGS_COLLECTION = "interview_settings";

const defaultPreferences = {
  darkMode: false,
  compactView: true,
  showAvatars: true,
  autoRefresh: "Every 5 minutes",
  jobsPerPage: "10",
  candidatesPerPage: "10",
  interviewDuration: "30 Minutes",
  interviewMode: "AI Interview"
};

const defaultInterviewSettings = {
  duration: "30 Minutes",
  joinWindow: "5 Minutes",
  graceTime: "2 Minutes",
  autoEnd: true,
  allowReschedule: false,
  timezone: "(GMT+05:30) Asia/Kolkata",

  interviewMode: "AI Interview",
  aiAvatar: "Ava (Female)",
  difficulty: "Medium",
  language: "English",
  askFollowUps: true,
  resumeBasedQuestions: true,
  roleBasedQuestions: true,

  enableProctoring: true,
  faceDetection: true,
  multiplePersonDetection: true,
  tabSwitchDetection: true,
  fullScreenMonitoring: true,
  suspiciousThreshold: "3 Actions",
  suspiciousToggle: false,
  screenRecording: false,
  videoRecording: true,
  audioRecording: true,

  invitationEmail: true,
  reminderBeforeInterview: true,
  reminderTime: "15 Minutes",
  completionEmail: true,

  guidelines: [
    "Ensure you are in a quiet place with good internet connection.",
    "Keep your face clearly visible in the camera.",
    "Do not switch tabs or open other applications.",
    "Do not take help from others during the interview.",
    "Be honest and answer confidently.",
    "Interview will be recorded for evaluation purposes."
  ],
  updatedAt: new Date().toISOString()
};

const defaultSettings = {
  companyName: "",
  companyWebsite: "",
  companyLocation: "",
  industry: "",
  aiStrictness: "Moderate",
  defaultInterviewDuration: 45,
  minShortlistAtsScore: 80,
  autoSendInviteOnShortlist: true,
  emailNotifications: {
    candidateApplied: true,
    interviewCompleted: true,
    weeklyReport: true
  },
  aiAvatar: "Ava (Technical Evaluator)",
  timeZone: "Asia/Kolkata (IST)",
  preferences: defaultPreferences,
  updatedAt: new Date().toISOString()
};

const defaultProfile = {
  name: "",
  title: "",
  email: "",
  phone: "",
  avatar: "",
  dept: "",
  bio: "",
  location: "",
  joinedDate: "",
  updatedAt: new Date().toISOString()
};

class SettingsDatabase {
  // Synchronous read for high-throughput in-memory & file fallback
  getSettings(userEmail = null) {
    if (userEmail) {
      const cleanEmail = String(userEmail).toLowerCase().trim();
      const perUserKey = `settings_${cleanEmail}`;
      const userSpecific = readData(perUserKey, null);
      if (userSpecific) {
        return {
          ...defaultSettings,
          ...userSpecific,
          preferences: {
            ...defaultPreferences,
            ...(userSpecific.preferences || {})
          },
          interviewSettings: this.getInterviewSettings(userEmail)
        };
      }
      return {
        ...defaultSettings,
        preferences: { ...defaultPreferences },
        interviewSettings: this.getInterviewSettings(userEmail)
      };
    }

    const orgSettings = readData(SETTINGS_COLLECTION, defaultSettings);
    let preferences = orgSettings.preferences || defaultPreferences;
    const interviewSettings = this.getInterviewSettings(null);
    return {
      ...orgSettings,
      preferences,
      interviewSettings
    };
  }

  // Asynchronous read directly querying PostgreSQL public.app_settings
  async getSettingsAsync(userEmail = null) {
    const inMemory = this.getSettings(userEmail);
    if (!userEmail) {
      try {
        const pool = getPool();
        const res = await pool.query(
          "SELECT setting_data FROM public.app_settings WHERE setting_key = 'general' LIMIT 1"
        );
        if (res.rows && res.rows[0]) {
          const pgData = res.rows[0].setting_data;
          return {
            ...inMemory,
            ...pgData,
            preferences: { ...inMemory.preferences, ...(pgData.preferences || {}) }
          };
        }
      } catch (err) {
        console.warn("[settingsDb] PostgreSQL getSettingsAsync fallback:", err.message);
      }
      return inMemory;
    }

    const cleanEmail = String(userEmail).toLowerCase().trim();
    try {
      const pool = getPool();
      // 1. Check user-specific setting
      const userRes = await pool.query(
        "SELECT setting_data FROM public.app_settings WHERE setting_key = $1 LIMIT 1",
        [`general:${cleanEmail}`]
      );
      if (userRes.rows && userRes.rows[0]) {
        const userPgData = userRes.rows[0].setting_data;
        return {
          ...defaultSettings,
          ...inMemory,
          ...userPgData,
          preferences: { ...defaultPreferences, ...inMemory.preferences, ...(userPgData.preferences || {}) }
        };
      }

      // 2. Also check public.users preferences column
      const userRow = await pool.query(
        "SELECT preferences FROM public.users WHERE LOWER(email) = $1 LIMIT 1",
        [cleanEmail]
      );
      if (userRow.rows && userRow.rows[0] && userRow.rows[0].preferences) {
        return {
          ...defaultSettings,
          ...inMemory,
          preferences: { ...defaultPreferences, ...inMemory.preferences, ...userRow.rows[0].preferences }
        };
      }
    } catch (err) {
      console.warn("[settingsDb] PostgreSQL getSettingsAsync per-user fallback:", err.message);
    }

    return inMemory;
  }

  updateSettings(updates, userEmail = null) {
    if (updates.interviewSettings) {
      this.updateInterviewSettings(updates.interviewSettings, userEmail);
    }

    if (userEmail) {
      const cleanEmail = String(userEmail).toLowerCase().trim();
      const perUserKey = `settings_${cleanEmail}`;
      const currentPerUser = readData(perUserKey, defaultSettings);
      const updated = {
        ...defaultSettings,
        ...currentPerUser,
        ...updates,
        preferences: {
          ...(currentPerUser.preferences || defaultPreferences),
          ...(updates.preferences || {})
        },
        updatedAt: new Date().toISOString()
      };
      writeData(perUserKey, updated);

      this._persistSettingsToPostgres(updated, userEmail).catch((err) => {
        console.warn("[settingsDb] PostgreSQL settings persist notice:", err.message);
      });

      return this.getSettings(userEmail);
    }

    // Global settings fallback when userEmail is null
    const current = readData(SETTINGS_COLLECTION, defaultSettings);
    const updated = {
      ...current,
      ...updates,
      preferences: {
        ...(current.preferences || defaultPreferences),
        ...(updates.preferences || {})
      },
      updatedAt: new Date().toISOString()
    };

    writeData(SETTINGS_COLLECTION, updated);

    this._persistSettingsToPostgres(updated, null).catch((err) => {
      console.warn("[settingsDb] PostgreSQL settings persist notice:", err.message);
    });

    return this.getSettings(null);
  }

  async _persistSettingsToPostgres(settingsData, userEmail = null) {
    const pool = getPool();
    if (!userEmail) {
      // Persist global setting_key = 'general'
      await pool.query(
        `INSERT INTO public.app_settings (setting_key, setting_data, updated_at)
         VALUES ('general', $1, NOW())
         ON CONFLICT (setting_key) DO UPDATE SET setting_data = EXCLUDED.setting_data, updated_at = NOW();`,
        [JSON.stringify(settingsData)]
      );
      return;
    }

    // Persist strictly per-user setting and update users table
    const cleanEmail = String(userEmail).toLowerCase().trim();
    await pool.query(
      `INSERT INTO public.app_settings (setting_key, setting_data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (setting_key) DO UPDATE SET setting_data = EXCLUDED.setting_data, updated_at = NOW();`,
      [`general:${cleanEmail}`, JSON.stringify(settingsData)]
    );

    if (settingsData.preferences) {
      await pool.query(
        `UPDATE public.users SET preferences = $1, updated_at = NOW() WHERE LOWER(email) = $2;`,
        [JSON.stringify(settingsData.preferences), cleanEmail]
      );
    }
  }

  getInterviewSettings(userEmail = null) {
    if (userEmail) {
      const cleanEmail = String(userEmail).toLowerCase().trim();
      const perUserKey = `interview_settings_${cleanEmail}`;
      const userSpecific = readData(perUserKey, null);
      if (userSpecific) {
        return {
          ...defaultInterviewSettings,
          ...userSpecific
        };
      }
      return { ...defaultInterviewSettings };
    }
    const globalInterviewSettings = readData(INTERVIEW_SETTINGS_COLLECTION, defaultInterviewSettings);
    return {
      ...defaultInterviewSettings,
      ...globalInterviewSettings
    };
  }

  async getInterviewSettingsAsync(userEmail = null) {
    const inMemory = this.getInterviewSettings(userEmail);
    if (!userEmail) {
      try {
        const pool = getPool();
        const res = await pool.query(
          "SELECT setting_data FROM public.app_settings WHERE setting_key = 'interview' LIMIT 1"
        );
        if (res.rows && res.rows[0]) {
          return { ...inMemory, ...res.rows[0].setting_data };
        }
      } catch (err) {
        console.warn("[settingsDb] PostgreSQL getInterviewSettingsAsync fallback:", err.message);
      }
      return inMemory;
    }

    const cleanEmail = String(userEmail).toLowerCase().trim();
    try {
      const pool = getPool();
      // 1. Check user-specific interview settings
      const userRes = await pool.query(
        "SELECT setting_data FROM public.app_settings WHERE setting_key = $1 LIMIT 1",
        [`interview:${cleanEmail}`]
      );
      if (userRes.rows && userRes.rows[0]) {
        return { ...inMemory, ...userRes.rows[0].setting_data };
      }

      // 2. Check public.users interview_settings column
      const userRow = await pool.query(
        "SELECT interview_settings FROM public.users WHERE LOWER(email) = $1 LIMIT 1",
        [cleanEmail]
      );
      if (userRow.rows && userRow.rows[0] && userRow.rows[0].interview_settings) {
        return { ...inMemory, ...userRow.rows[0].interview_settings };
      }
    } catch (err) {
      console.warn("[settingsDb] PostgreSQL getInterviewSettingsAsync per-user fallback:", err.message);
    }

    return inMemory;
  }

  updateInterviewSettings(updates, userEmail = null) {
    if (userEmail) {
      const cleanEmail = String(userEmail).toLowerCase().trim();
      const perUserKey = `interview_settings_${cleanEmail}`;
      const current = readData(perUserKey, defaultInterviewSettings);
      const updated = {
        ...defaultInterviewSettings,
        ...current,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      writeData(perUserKey, updated);

      this._persistInterviewSettingsToPostgres(updated, userEmail).catch((err) => {
        console.warn("[settingsDb] PostgreSQL interview settings persist notice:", err.message);
      });

      return updated;
    }

    const current = this.getInterviewSettings(null);
    const updated = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    writeData(INTERVIEW_SETTINGS_COLLECTION, updated);

    this._persistInterviewSettingsToPostgres(updated, null).catch((err) => {
      console.warn("[settingsDb] PostgreSQL interview settings persist notice:", err.message);
    });

    return updated;
  }

  async _persistInterviewSettingsToPostgres(interviewData, userEmail = null) {
    const pool = getPool();
    if (!userEmail) {
      await pool.query(
        `INSERT INTO public.app_settings (setting_key, setting_data, updated_at)
         VALUES ('interview', $1, NOW())
         ON CONFLICT (setting_key) DO UPDATE SET setting_data = EXCLUDED.setting_data, updated_at = NOW();`,
        [JSON.stringify(interviewData)]
      );
      return;
    }

    const cleanEmail = String(userEmail).toLowerCase().trim();
    await pool.query(
      `INSERT INTO public.app_settings (setting_key, setting_data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (setting_key) DO UPDATE SET setting_data = EXCLUDED.setting_data, updated_at = NOW();`,
      [`interview:${cleanEmail}`, JSON.stringify(interviewData)]
    );

    await pool.query(
      `UPDATE public.users SET interview_settings = $1, updated_at = NOW() WHERE LOWER(email) = $2;`,
      [JSON.stringify(interviewData), cleanEmail]
    );
  }

  getProfile(userEmail = null) {
    if (userEmail) {
      const cleanEmail = String(userEmail).toLowerCase().trim();
      const perUser = readData(`profile_${cleanEmail}`, null);
      if (perUser) return { ...defaultProfile, ...perUser };
      return { ...defaultProfile };
    }
    return readData(PROFILE_COLLECTION, defaultProfile);
  }

  updateProfile(updates, userEmail = null) {
    if (userEmail) {
      const cleanEmail = String(userEmail).toLowerCase().trim();
      const perUserKey = `profile_${cleanEmail}`;
      const current = readData(perUserKey, defaultProfile);
      const updated = {
        ...defaultProfile,
        ...current,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      writeData(perUserKey, updated);
      return updated;
    }

    const current = this.getProfile(null);
    const updated = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    writeData(PROFILE_COLLECTION, updated);
    return updated;
  }
}

module.exports = new SettingsDatabase();
