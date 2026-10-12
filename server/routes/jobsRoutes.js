const express = require("express");
const router = express.Router();
const multer = require("multer");
const jobsDb = require("../db/jobsDb");
const { extractResumeText } = require("../services/textExtractor");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

const POPULAR_SKILLS = [
  "React", "Node.js", "Python", "TypeScript", "JavaScript", "SQL", "AWS", "Docker",
  "Figma", "Tailwind CSS", "GraphQL", "System Design", "Git", "FastAPI", "MongoDB",
  "PostgreSQL", "Java", "C++", "C#", ".NET", "Go", "Golang", "Kubernetes", "Azure",
  "GCP", "Next.js", "Vue.js", "Angular", "Express", "Django", "Flask", "Spring Boot",
  "Microservices", "REST API", "CI/CD", "Linux", "Redis", "Kafka", "Machine Learning",
  "AI", "DevOps", "Cybersecurity", "Data Analysis", "Tableau", "Power BI", "Excel",
  "Agile", "Scrum", "Jira", "HTML5", "CSS3", "SASS", "Redux", "Jest", "Cypress"
];

const INDIAN_STATES = [
  "Karnataka", "Maharashtra", "Tamil Nadu", "Telangana", "Delhi", "Uttar Pradesh",
  "Haryana", "West Bengal", "Gujarat", "Kerala", "Rajasthan", "Punjab", "Andhra Pradesh",
  "Madhya Pradesh", "Bihar", "Odisha", "Goa", "Chandigarh"
];

function parseJobDescriptionText(text = "", filename = "") {
  if (!text) {
    const fallbackTitle = filename ? filename.replace(/\.(pdf|docx?|txt|rtf)$/i, "").replace(/[_-]/g, " ") : "New Job Opening";
    return {
      title: fallbackTitle,
      dept: "Engineering",
      jobLevel: "Mid Level",
      reportsTo: "Engineering Manager",
      loc: "Karnataka",
      isRemotePosition: false,
      workMode: "On-site",
      type: "Full-time",
      expLevel: "3-5 Years",
      description: "",
      keySkills: []
    };
  }

  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const lowerText = text.toLowerCase();

  // 1. Extract Job Title
  let title = "";
  const titlePatterns = [
    /(?:job\s*title|position|role|designation|hiring\s*for)\s*[:\-–]\s*([^\n\r,;]+)/i,
    /(?:we\s*are\s*hiring|opening\s*for|looking\s*for\s*(?:a|an)?)\s+([A-Za-z0-9\s\/\-\+\#\.]+?(?:engineer|developer|architect|lead|manager|designer|specialist|analyst|associate|intern|consultant|director|officer|executive|scientist|administrator))/i
  ];

  for (const p of titlePatterns) {
    const m = text.match(p);
    if (m && m[1] && m[1].trim().length > 2 && m[1].trim().length < 80) {
      title = m[1].trim().replace(/^[:\-–\s]+/, "");
      break;
    }
  }

  if (!title && lines.length > 0) {
    for (let i = 0; i < Math.min(lines.length, 6); i++) {
      const line = lines[i];
      if (
        line.length > 4 &&
        line.length < 65 &&
        !/^(company|location|date|page|about\s*us|job\s*description|overview|requirements)/i.test(line) &&
        /(engineer|developer|designer|manager|lead|analyst|architect|specialist|officer|consultant|scientist|intern|associate)/i.test(line)
      ) {
        title = line.replace(/^[:\-–\s]+/, "");
        break;
      }
    }
  }

  if (!title && lines.length > 0) {
    title = lines[0].slice(0, 60);
  }

  if (!title) {
    title = filename ? filename.replace(/\.(pdf|docx?|txt|rtf)$/i, "").replace(/[_-]/g, " ") : "Software Engineer";
  }

  // 2. Extract Department
  let dept = "Engineering";
  if (/(design|ui\/ux|graphic|visual|product\s*design)/i.test(lowerText) || /(designer)/i.test(title)) {
    dept = "Design";
  } else if (/(product\s*manager|product\s*owner|scrum\s*master)/i.test(lowerText) || /(product)/i.test(title)) {
    dept = "Product";
  } else if (/(marketing|seo|growth|content|social\s*media|brand)/i.test(lowerText)) {
    dept = "Marketing";
  } else if (/(sales|business\s*development|bdr|sdr|account\s*executive)/i.test(lowerText)) {
    dept = "Sales";
  } else if (/(human\s*resources|talent\s*acquisition|recruiter|people\s*ops|hr)/i.test(lowerText)) {
    dept = "Human Resources";
  } else if (/(finance|accounting|audit|tax|treasury)/i.test(lowerText)) {
    dept = "Finance";
  } else if (/(operations|logistics|supply\s*chain|procurement)/i.test(lowerText)) {
    dept = "Operations";
  }

  // 3. Extract Job Level
  let jobLevel = "Mid Level";
  const titleLower = title.toLowerCase();
  if (/(director|vp|vice\s*president|head\s*of|chief|cxo)/i.test(titleLower) || /(director|vp)/i.test(lowerText)) {
    jobLevel = "Director / Executive";
  } else if (/(lead|principal|architect|staff)/i.test(titleLower)) {
    jobLevel = "Lead / Principal";
  } else if (/(senior|sr\b|senior\s*level)/i.test(titleLower) || /(senior|sr\.)/i.test(lowerText)) {
    jobLevel = "Senior Level";
  } else if (/(junior|jr\b|intern|trainee|fresher|entry\s*level|graduate)/i.test(titleLower) || /(entry\s*level|internship)/i.test(lowerText)) {
    jobLevel = "Entry Level / Junior";
  }

  // 4. Extract Experience Level
  let expLevel = "3-5 Years";
  const expMatch = text.match(/(?:experience|exp|years\s*of\s*experience)\s*[:\-–]?\s*(\d+)\s*(?:-|to|\+)?\s*(\d*)\s*(?:years?|yrs?|yr)/i) ||
                   text.match(/(\d+)\s*(?:-|to|\+)\s*(\d*)\s*(?:years?|yrs?|yr)\s*(?:of)?\s*(?:relevant)?\s*experience/i);

  if (expMatch) {
    const minExp = parseInt(expMatch[1], 10);
    const maxExp = expMatch[2] ? parseInt(expMatch[2], 10) : minExp;
    const avgExp = (minExp + maxExp) / 2;

    if (avgExp <= 1) {
      expLevel = "0-1 Years";
    } else if (avgExp <= 3) {
      expLevel = "1-3 Years";
    } else if (avgExp <= 5) {
      expLevel = "3-5 Years";
    } else if (avgExp <= 8) {
      expLevel = "5-8 Years";
    } else {
      expLevel = "8+ Years";
    }
  } else if (jobLevel === "Entry Level / Junior") {
    expLevel = "0-1 Years";
  } else if (jobLevel === "Senior Level") {
    expLevel = "5-8 Years";
  } else if (jobLevel === "Lead / Principal" || jobLevel === "Director / Executive") {
    expLevel = "8+ Years";
  }

  // 5. Extract Work Mode & Remote Status
  let workMode = "On-site";
  let isRemotePosition = false;
  if (/(100%\s*remote|fully\s*remote|remote\s*position|work\s*from\s*anywhere|wfh)/i.test(lowerText)) {
    workMode = "Remote";
    isRemotePosition = true;
  } else if (/(\bhybrid\b|hybrid\s*work|partly\s*remote)/i.test(lowerText)) {
    workMode = "Hybrid";
  } else if (/\bremote\b/i.test(lowerText) && !/non-remote|no\s*remote/i.test(lowerText)) {
    workMode = "Remote";
    isRemotePosition = true;
  }

  // 6. Extract Location
  let loc = "Karnataka";
  if (isRemotePosition || workMode === "Remote") {
    loc = "Remote";
  } else {
    // Check for cities
    if (/(bangalore|bengaluru)/i.test(lowerText)) loc = "Karnataka";
    else if (/(mumbai|pune|nagpur)/i.test(lowerText)) loc = "Maharashtra";
    else if (/(delhi|ncr|new\s*delhi)/i.test(lowerText)) loc = "Delhi";
    else if (/(hyderabad)/i.test(lowerText)) loc = "Telangana";
    else if (/(chennai|coimbatore)/i.test(lowerText)) loc = "Tamil Nadu";
    else if (/(gurgaon|gurugram|noida)/i.test(lowerText)) loc = "Haryana";
    else if (/(kolkata)/i.test(lowerText)) loc = "West Bengal";
    else if (/(ahmedabad|surat)/i.test(lowerText)) loc = "Gujarat";
    else if (/(kochi|trivandrum|thiruvananthapuram)/i.test(lowerText)) loc = "Kerala";
    else {
      // Check for state names directly
      for (const st of INDIAN_STATES) {
        if (new RegExp(`\\b${st}\\b`, "i").test(lowerText)) {
          loc = st;
          break;
        }
      }
    }
  }

  // 7. Extract Employment Type
  let type = "Full-time";
  if (/(part\s*time|part-time)/i.test(lowerText)) {
    type = "Part-time";
  } else if (/(contract|freelance|consultant|fixed\s*term)/i.test(lowerText)) {
    type = "Contract";
  } else if (/(internship|intern\b)/i.test(lowerText)) {
    type = "Internship";
  }

  // 8. Extract Skills
  const keySkills = [];
  for (const skill of POPULAR_SKILLS) {
    const escaped = skill.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regex = new RegExp(`(?:^|[^a-zA-Z0-9+#.])${escaped}(?:$|[^a-zA-Z0-9+#.])`, "i");
    if (regex.test(text)) {
      if (!keySkills.includes(skill)) {
        keySkills.push(skill);
      }
    }
  }

  // 9. Format Clean Description
  let description = text.trim();
  if (description.length > 3000) {
    description = description.slice(0, 3000) + "...";
  }

  return {
    title,
    dept,
    jobLevel,
    reportsTo: dept === "Engineering" ? "Engineering Manager" : `${dept} Manager`,
    loc,
    isRemotePosition,
    workMode,
    type,
    expLevel,
    description,
    keySkills: keySkills.slice(0, 10)
  };
}

// POST /api/jobs/parse-document - extracts and parses job description document
router.post("/parse-document", upload.single("document"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No document file uploaded" });
    }
    const extracted = await extractResumeText(req.file.buffer, req.file.mimetype, req.file.originalname);
    const text = extracted.cleanText || extracted.text || "";

    const parsedData = parseJobDescriptionText(text, req.file.originalname);
    res.json({
      success: true,
      data: parsedData,
      filename: req.file.originalname,
      charCount: text.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || "Failed to parse document" });
  }
});

const { requireAuth } = require("../middleware/authMiddleware");

// GET /api/jobs - list all jobs scoped strictly to the authenticated recruiter's account
router.get("/", requireAuth, async (req, res) => {
  try {
    const { status, dept, workMode, search } = req.query;
    const jobs = await jobsDb.getAllAsync({
      status,
      dept,
      workMode,
      search,
      user: req.user,
      userId: req.user.id,
      userEmail: req.user.email
    });
    res.json({ success: true, count: jobs.length, data: jobs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/jobs/:id - get single job (with IDOR protection)
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const job = await jobsDb.getById(req.params.id, req.user);
    if (!job) {
      return res.status(404).json({ success: false, error: "Job not found or access denied" });
    }
    res.json({ success: true, data: job });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/jobs - create new job associated with authenticated account
router.post("/", requireAuth, (req, res) => {
  try {
    const { title, dept, jobLevel, reportsTo, loc, isRemotePosition, workMode, type, expLevel, description, keySkills, status } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, error: "Job title is required" });
    }

    const newJob = jobsDb.create({
      title,
      dept,
      jobLevel,
      reportsTo,
      loc,
      isRemotePosition,
      workMode,
      type,
      expLevel,
      description,
      keySkills,
      status,
      userId: req.user.id,
      createdBy: req.user.email,
      userEmail: req.user.email
    });

    // In-app Notification Trigger
    const notificationService = require("../services/notificationService");
    notificationService.notifyJobCreated({
      userEmail: req.user.email,
      jobTitle: newJob.title,
      dept: newJob.dept,
      jobId: newJob.id
    }).catch(e => console.warn("Notification error:", e.message));

    res.status(201).json({ success: true, data: newJob, message: "Job created successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/jobs/:id - update existing job (only permitted for owner)
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const updated = await jobsDb.update(req.params.id, req.body, req.user);
    if (!updated) {
      return res.status(404).json({ success: false, error: "Job not found or unauthorized to update" });
    }
    res.json({ success: true, data: updated, message: "Job updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/jobs/:id - delete job (only permitted for owner)
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const deleted = await jobsDb.delete(req.params.id, req.user);
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Job not found or unauthorized to delete" });
    }
    res.json({ success: true, message: "Job deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
