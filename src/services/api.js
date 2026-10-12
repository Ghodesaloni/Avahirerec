import axios from "axios";

// In browser, relative URL /api goes directly to port 3000 where webpack-dev-server or express server runs
// Ignore stale external domain override from foreign environment variables
const getApiBase = () => {
  if (typeof window !== "undefined") {
    // In browser, always use relative path on current host
    return "";
  }
  const envUrl = process.env.REACT_APP_BACKEND_URL;
  if (envUrl && !envUrl.includes("preview.emergentagent.com")) {
    return envUrl;
  }
  return "";
};

const api = axios.create({
  baseURL: `${getApiBase()}/api`,
  headers: {
    "Content-Type": "application/json"
  }
});

// Attach PostgreSQL Auth Token and user email from localStorage if present
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("avahire_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    try {
      const user = JSON.parse(localStorage.getItem("avahire_user") || "{}");
      const userEmail = (user?.email || localStorage.getItem("avahire_registered_email") || "").trim();
      if (userEmail) {
        config.headers["X-User-Email"] = userEmail;
        if (!config.params) {
          config.params = {};
        }
        if (!config.params.userEmail) {
          config.params.userEmail = userEmail;
        }

        // For POST/PUT payloads, auto-inject creator identity if not provided
        if (config.data && typeof config.data === "object" && !(config.data instanceof FormData)) {
          if (!config.data.createdBy) config.data.createdBy = userEmail;
          if (!config.data.userEmail) config.data.userEmail = userEmail;
        }
      }
    } catch {
      // ignore JSON parse error
    }
  }
  return config;
});

export const authApi = {
  login: async (credentials) => {
    try {
      const res = await api.post("/auth/login", credentials);
      return res.data;
    } catch (authErr) {
      if (authErr.response?.data?.error) {
        throw authErr;
      }
      try {
        const res = await api.post("/users/login", credentials);
        return res.data;
      } catch (userErr) {
        if (userErr.response?.data?.error) {
          throw userErr;
        }
        throw authErr || userErr;
      }
    }
  },
  resetPassword: async ({ email, password, token }) => {
    const res = await api.post("/auth/reset-password", { email, newPassword: password, token });
    return res.data;
  },
  forgotPassword: async (email) => {
    const res = await api.post("/auth/forgot-password", { email });
    return res.data;
  },
  verifyResetToken: async (token) => {
    const res = await api.get(`/auth/verify-reset-token?token=${encodeURIComponent(token)}`);
    return res.data;
  },
  register: async (userData) => {
    try {
      const res = await api.post("/auth/register", userData);
      return res.data;
    } catch (err) {
      // Propagate duplicate user error (409) or bad request (400) directly to caller
      if (err.response?.data?.error) {
        throw err;
      }
      try {
        const res = await api.post("/users/register", userData);
        return res.data;
      } catch (innerErr) {
        if (innerErr.response?.data?.error) {
          throw innerErr;
        }
        throw err;
      }
    }
  },
  googleAuth: async ({ email, name, avatar }) => {
    try {
      const res = await api.post("/auth/google", { email, name, avatar });
      return res.data;
    } catch (err) {
      if (err.response?.data?.error) {
        throw err;
      }
      const uid = `usr_google_${Date.now()}`;
      return {
        success: true,
        data: {
          id: Date.now(),
          uid,
          email,
          name: name || email.split("@")[0],
          role: "recruiter",
          company: "AvaHire Partner",
          designation: "Talent Recruiter",
          phone: "+91 98000 00000",
          authProvider: "google",
        },
        token: uid,
        message: `Signed in with Google as ${name || email.split("@")[0]}`,
      };
    }
  },
  verifyEmail: async (token) => {
    const res = await api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`);
    return res.data;
  },
  resendVerification: async (email) => {
    const res = await api.post("/auth/resend-verification", { email });
    return res.data;
  },
  getMe: async () => {
    try {
      const res = await api.get("/users/me");
      return res.data;
    } catch (err) {
      const stored = localStorage.getItem("avahire_user");
      if (stored) {
        return { success: true, data: JSON.parse(stored) };
      }
      throw err;
    }
  },
  getDemoAccounts: async () => {
    try {
      const res = await api.get("/users/demo-accounts");
      return res.data;
    } catch {
      return {
        success: true,
        data: []
      };
    }
  }
};

export const jobsApi = {
  getAll: async (params = {}) => {
    const res = await api.get("/jobs", { params });
    return Array.isArray(res.data?.data) ? res.data.data : [];
  },
  getById: async (id) => {
    const res = await api.get(`/jobs/${id}`);
    return res.data.data;
  },
  create: async (jobData) => {
    const res = await api.post("/jobs", jobData);
    return res.data.data;
  },
  update: async (id, jobData) => {
    const res = await api.put(`/jobs/${id}`, jobData);
    return res.data.data;
  },
  delete: async (id) => {
    const res = await api.delete(`/jobs/${id}`);
    return res.data;
  },
  parseDocument: async (formData) => {
    const res = await api.post("/jobs/parse-document", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    return res.data;
  }
};

export const resumesApi = {
  getAll: async (params = {}) => {
    const res = await api.get("/resumes", { params });
    return Array.isArray(res.data?.data) ? res.data.data : [];
  },
  getById: async (id) => {
    const res = await api.get(`/resumes/${id}`);
    return res.data.data;
  },
  create: async (resumeData) => {
    const res = await api.post("/resumes", resumeData);
    return res.data.data;
  },
  update: async (id, resumeData) => {
    const res = await api.put(`/resumes/${id}`, resumeData);
    return res.data.data;
  },
  updateStatus: async (id, status) => {
    const res = await api.patch(`/resumes/${id}/status`, { status });
    return res.data.data;
  },
  delete: async (id) => {
    const res = await api.delete(`/resumes/${id}`);
    return res.data;
  },
  analyzeCandidate: async (id, { jobId, customJd } = {}) => {
    const res = await api.post(`/resumes/${id}/analyze-jd`, { jobId, customJd });
    return res.data;
  },
  analyzeBatch: async ({ jobId, customJd, candidateIds } = {}) => {
    const res = await api.post("/resumes/analyze-batch-jd", { jobId, customJd, candidateIds });
    return res.data;
  },
  uploadAndScreen: async (formData) => {
    const res = await api.post("/resumes/upload-and-screen", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    return res.data;
  }
};

export const interviewsApi = {
  getAll: async (params = {}) => {
    const res = await api.get("/interviews", { params });
    return Array.isArray(res.data?.data) ? res.data.data : [];
  },
  getById: async (id) => {
    const res = await api.get(`/interviews/${id}`);
    return res.data.data;
  },
  getByLinkCode: async (linkCode) => {
    const res = await api.get(`/interviews/code/${linkCode}`);
    return res.data.data;
  },
  create: async (interviewData) => {
    const res = await api.post("/interviews", interviewData);
    return res.data.data;
  },
  update: async (id, interviewData) => {
    const res = await api.put(`/interviews/${id}`, interviewData);
    return res.data.data;
  },
  delete: async (id) => {
    const res = await api.delete(`/interviews/${id}`);
    return res.data;
  }
};

export const candidatesApi = {
  getAll: async (params = {}) => {
    const res = await api.get("/candidates", { params });
    return Array.isArray(res.data?.data) ? res.data.data : [];
  },
  getById: async (id) => {
    const res = await api.get(`/candidates/${id}`);
    return res.data.data;
  },
  create: async (data) => {
    const res = await api.post("/candidates", data);
    return res.data.data;
  },
  update: async (id, data) => {
    const res = await api.put(`/candidates/${id}`, data);
    return res.data.data;
  },
  delete: async (id) => {
    const res = await api.delete(`/candidates/${id}`);
    return res.data;
  },
  uploadRecording: async (candidateId, formDataOrPayload) => {
    if (formDataOrPayload instanceof FormData) {
      const res = await api.post(`/candidates/${candidateId}/recording`, formDataOrPayload, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      return res.data;
    }
    const res = await api.post(`/candidates/${candidateId}/recording`, formDataOrPayload);
    return res.data;
  },
  getRecordingInfo: async (candidateId) => {
    const res = await api.get(`/candidates/${candidateId}/recording`);
    return res.data;
  },
  getAudioUrl: (candidateId) => {
    return `/api/candidates/${encodeURIComponent(candidateId)}/audio`;
  },
  getAudioDownloadUrl: (candidateId) => {
    return `/api/candidates/${encodeURIComponent(candidateId)}/audio/download`;
  },
  getTranscriptDownloadUrl: (candidateId) => {
    return `/api/candidates/${encodeURIComponent(candidateId)}/transcript/download`;
  },
  getTranscriptInfo: async (candidateId) => {
    const res = await api.get(`/candidates/${candidateId}/transcript`);
    return res.data;
  },
  generateTranscript: async (candidateId) => {
    const res = await api.post(`/candidates/${candidateId}/transcript/generate`);
    return res.data;
  }
};

export const reportsApi = {
  getSummary: async (params = {}) => {
    const res = await api.get("/reports/summary", { params });
    return res.data;
  },
  getDates: async (params = {}) => {
    const res = await api.get("/reports/selected-candidates/dates", { params });
    return res.data;
  },
  getTodayReportUrl: (userEmail) => {
    const emailParam = userEmail ? `?userEmail=${encodeURIComponent(userEmail)}` : "";
    return `/api/reports/selected-candidates/today${emailParam}`;
  },
  getDateReportUrl: (date, userEmail) => {
    const emailParam = userEmail ? `?userEmail=${encodeURIComponent(userEmail)}` : "";
    return `/api/reports/selected-candidates/date/${encodeURIComponent(date)}${emailParam}`;
  },
  getAllDatesReportUrl: (userEmail) => {
    const emailParam = userEmail ? `?userEmail=${encodeURIComponent(userEmail)}` : "";
    return `/api/reports/selected-candidates/all${emailParam}`;
  },
  regenerate: async (userEmail) => {
    const res = await api.post("/reports/regenerate", {}, {
      params: userEmail ? { userEmail } : {}
    });
    return res.data;
  }
};

export const emailApi = {
  getTemplates: async () => {
    const res = await api.get("/emails/templates");
    return res.data.data;
  },
  createTemplate: async (data) => {
    const res = await api.post("/emails/templates", data);
    return res.data.data;
  },
  getSent: async () => {
    const res = await api.get("/emails/sent");
    return res.data.data;
  },
  send: async (data) => {
    const res = await api.post("/emails/send", data);
    return res.data.data;
  }
};

export const dashboardApi = {
  getStats: async (userEmail) => {
    try {
      let email = userEmail;
      if (!email && typeof window !== "undefined") {
        try {
          const user = JSON.parse(localStorage.getItem("avahire_user") || "{}");
          email = user?.email || "";
        } catch {
          // ignore
        }
      }
      const res = await api.get("/dashboard/stats", {
        params: email ? { userEmail: email } : {}
      });
      return res.data?.data || res.data;
    } catch (err) {
      console.error("getStats error:", err);
      return null;
    }
  }
};

export const settingsApi = {
  getSettings: async () => {
    const res = await api.get("/settings");
    return res.data.data;
  },
  get: async () => {
    const res = await api.get("/settings");
    return res.data.data;
  },
  updateSettings: async (data) => {
    const res = await api.put("/settings", data);
    return res.data.data;
  },
  updatePreferences: async (preferences) => {
    const res = await api.put("/settings", { preferences });
    return res.data.data;
  },
  getInterviewSettings: async () => {
    const res = await api.get("/settings/interview");
    return res.data.data;
  },
  updateInterviewSettings: async (data) => {
    const res = await api.put("/settings/interview", data);
    return res.data.data;
  },
  getProfile: async () => {
    const res = await api.get("/settings/profile");
    return res.data.data;
  },
  updateProfile: async (data) => {
    const res = await api.put("/settings/profile", data);
    return res.data.data;
  },
  getAwsSettings: async () => {
    const res = await api.get("/settings/aws");
    return res.data.data;
  },
  updateAwsSettings: async (data) => {
    const res = await api.put("/settings/aws", data);
    return res.data.data;
  },
  testAwsConnection: async () => {
    const res = await api.post("/settings/aws/test");
    return res.data;
  },
  changePassword: async ({ currentPassword, newPassword, email }) => {
    const res = await api.post("/users/change-password", { currentPassword, newPassword, email });
    return res.data;
  },
  updateUserProfile: async (data) => {
    const res = await api.put("/users/profile", data);
    return res.data;
  },
  manage2FA: async ({ enabled, email }) => {
    const res = await api.post("/users/2fa", { enabled, email });
    return res.data;
  },
  deleteAccount: async (email) => {
    const res = await api.post("/users/delete-account", { email });
    return res.data;
  }
};

export const awsApi = {
  getConfig: async () => {
    const res = await api.get("/settings/aws");
    return res.data.data;
  },
  updateConfig: async (data) => {
    const res = await api.put("/settings/aws", data);
    return res.data.data;
  },
  testConnection: async () => {
    const res = await api.post("/settings/aws/test");
    return res.data;
  },
  getHealth: async () => {
    const res = await api.get("/health");
    return res.data;
  }
};

export const candidatePortalApi = {
  getResumes: async () => {
    const res = await api.get("/candidate-portal/resumes");
    return Array.isArray(res.data?.data) ? res.data.data : [];
  },
  getInterviewSettings: async () => {
    const res = await api.get("/candidate-portal/interview-settings");
    return res.data.data;
  },
  getSession: async (linkCode) => {
    const res = await api.get(`/candidate-portal/session/${linkCode}`);
    return res.data.data;
  },
  getScheduleTiming: async (linkCode) => {
    const res = await api.get(`/candidate-portal/schedule/${linkCode}`);
    return res.data?.data;
  },
  login: async ({ linkCode, email, phone }) => {
    const res = await api.post("/candidate-portal/login", { linkCode, email, phone });
    return res.data;
  },
  saveSystemCheck: async (payload) => {
    const res = await api.post("/candidate-portal/system-check", payload);
    return res.data;
  },
  getQuestions: async (linkCode) => {
    const res = await api.get(`/candidate-portal/questions/${linkCode}`);
    return res.data;
  },
  streamTranscriptChunk: async (chunk) => {
    const res = await api.post("/candidate-portal/transcript-chunk", chunk);
    return res.data;
  },
  saveSession: async (sessionData) => {
    const res = await api.post("/candidate-portal/session", sessionData);
    return res.data.data;
  },
  completeInterview: async (payload) => {
    const res = await api.post("/candidate-portal/complete", payload);
    return res.data;
  },
  getAllSessions: async (params = {}) => {
    const res = await api.get("/candidate-portal/sessions", { params });
    return res.data.data;
  },
  getHROverview: async () => {
    const res = await api.get("/candidate-portal/hr-overview");
    return res.data;
  }
};

export default api;
