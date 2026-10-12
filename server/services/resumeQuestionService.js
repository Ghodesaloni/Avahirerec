/**
 * Resume Analysis & Contextual Question Generation Service
 * 
 * Deeply analyzes candidate resume data (projects, work experience, skills, education, raw text)
 * and generates tailored, intelligent technical interview questions specifically probing their
 * actual projects, architectural decisions, motivations, problem solving, and technical stack.
 */

/**
 * Clean & extract text lines from string or array
 */
function cleanLines(input) {
  if (Array.isArray(input)) {
    return input.map(s => String(s || "").trim()).filter(Boolean);
  }
  if (typeof input === "string") {
    return input.split("\n").map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Extract projects from resume raw text if structured projects array is empty or partial
 */
function extractProjectsFromText(rawText = "") {
  if (!rawText) return [];
  const text = String(rawText);
  const projects = [];

  // Match project section
  const projectSectionRegex = /(?:projects?|academic\s+projects?|major\s+projects?|key\s+projects?|personal\s+projects?|portfolio\s+projects?)\s*[:\n]([\s\S]*?)(?=(?:experience|work\s+history|employment|education|academics|skills|technical\s+skills|certifications|awards|achievements|publications|interests|declaration|\n\s*--\s*\d+\s*of\s*\d+\s*--|$))/i;
  const sectionMatch = text.match(projectSectionRegex);
  const sectionContent = sectionMatch ? sectionMatch[1].trim() : "";

  const linesToScan = sectionContent ? sectionContent.split("\n") : text.split("\n");
  let currentProj = null;

  for (let i = 0; i < linesToScan.length; i++) {
    const rawLine = linesToScan[i].trim();
    if (!rawLine || rawLine.startsWith("--") || /^(?:summary|education|skills|certifications|awards)\b/i.test(rawLine)) {
      continue;
    }

    // Line starting with bullet or dash is description
    const isBullet = /^[\*\-•▪▫►✔–—]\s*/.test(rawLine);
    const cleanedLine = rawLine.replace(/^[\*\-•▪▫►✔–—]\s*/, "").trim();

    if (!isBullet && rawLine.length > 3 && rawLine.length < 90 && !rawLine.endsWith(".") && !rawLine.toLowerCase().includes("developed a") && !rawLine.toLowerCase().includes("built a")) {
      // Possible project title line (e.g. "AvaHire - AI Recruitment System | AI/ML, Data Science", "Smart House System | IoT, Arduino", "Visora AI - Personal AI Tutor")
      if (currentProj && (currentProj.title || currentProj.description.length > 0)) {
        projects.push(currentProj);
      }

      // Parse title and tech stack if formatted with '|' or '-' or ':'
      let title = cleanedLine;
      let techs = [];
      
      if (title.includes("|")) {
        const parts = title.split("|");
        title = parts[0].trim();
        techs = parts[1].split(/[,/]/).map(t => t.trim()).filter(Boolean);
      } else if (title.includes(" - ") && !title.toLowerCase().startsWith("project")) {
        const parts = title.split(" - ");
        if (parts.length === 2 && parts[1].length < 40) {
          title = parts[0].trim();
          techs = [parts[1].trim()];
        }
      }

      currentProj = {
        title: title.replace(/^project\s*[:\d-]*\s*/i, "").trim(),
        technologies: techs,
        description: []
      };
    } else if (currentProj) {
      if (cleanedLine) {
        currentProj.description.push(cleanedLine);
      }
    }
  }

  if (currentProj && currentProj.title) {
    projects.push(currentProj);
  }

  return projects;
}

/**
 * Normalize and enrich candidate projects list
 */
function normalizeCandidateProjects(candidate = {}) {
  let list = [];

  if (Array.isArray(candidate.projects) && candidate.projects.length > 0) {
    list = candidate.projects.map(p => {
      if (typeof p === "string") {
        return {
          title: p,
          technologies: [],
          description: []
        };
      }
      return {
        title: p.title || p.name || "Software Project",
        technologies: Array.isArray(p.technologies) ? p.technologies : (p.techStack || p.technologies ? [p.techStack || p.technologies] : []),
        description: cleanLines(p.description || p.details || p.bullets || [])
      };
    });
  }

  // If no projects found in array or incomplete, attempt extraction from rawText or summary
  if (list.length === 0 && (candidate.rawText || candidate.raw_text || candidate.summary)) {
    const extracted = extractProjectsFromText(candidate.rawText || candidate.raw_text || candidate.summary);
    if (extracted.length > 0) {
      list = extracted;
    }
  }

  // Fallback: Check if notes or summary mention specific projects
  if (list.length === 0) {
    const combinedText = `${candidate.summary || ""} ${candidate.notes || ""} ${candidate.rawText || ""}`;
    const knownProjectMatches = [
      { name: "Smart House", keywords: ["smart house", "smart home", "home automation", "iot house"] },
      { name: "AvaHire - AI Recruitment System", keywords: ["avahire", "recruitment system", "resume screening", "ai interview system"] },
      { name: "Visora AI - Personal AI Tutor", keywords: ["visora", "ai tutor", "tutoring platform"] },
      { name: "E-Commerce Microservices Platform", keywords: ["e-commerce", "ecommerce", "shopping cart", "payment gateway"] },
      { name: "Cloud Management & DevOps Automation", keywords: ["devops", "ansible", "kubernetes", "ci/cd pipeline", "docker container"] }
    ];

    for (const kp of knownProjectMatches) {
      if (kp.keywords.some(k => combinedText.toLowerCase().includes(k))) {
        list.push({
          title: kp.name,
          technologies: candidate.skills ? candidate.skills.slice(0, 3) : ["Full Stack", "System Architecture"],
          description: [`Implemented system design and feature workflows for ${kp.name}.`]
        });
        break;
      }
    }
  }

  return list;
}

/**
 * Generate deep, contextual interview questions based on candidate's verified resume and interview settings
 */
function generateResumeBasedQuestions(candidate = {}, role = "Software Engineer", projects = [], ivSettings = {}) {
  const candidateName = candidate.name || candidate.candidateName || "Candidate";
  const candidateRole = role || candidate.role || candidate.targetJobTitle || "Software Engineer";
  const skills = candidate.allSkills || candidate.skills || [];
  const skillsStr = skills.length > 0 ? skills.slice(0, 4).join(", ") : "software architecture and coding";
  const questions = [];

  const resumeQuestionsEnabled = ivSettings.resumeBasedQuestions !== false;
  const roleQuestionsEnabled = ivSettings.roleBasedQuestions !== false;
  const difficulty = (ivSettings.difficulty || "Medium").toLowerCase();

  // 1. Initial warm-up & background question
  questions.push(
    `Welcome ${candidateName}! Could you please introduce yourself and walk us through your technical journey in ${candidateRole}?`
  );

  // 2. Project-Specific Questions from Resume (if resumeBasedQuestions enabled)
  if (resumeQuestionsEnabled) {
    if (projects && projects.length > 0) {
      projects.forEach((proj, idx) => {
        const projTitle = proj.title || `Project ${idx + 1}`;
        const techList = proj.technologies && proj.technologies.length > 0 ? proj.technologies.join(", ") : "";
        const techPhrase = techList ? ` utilizing ${techList}` : "";

        if (difficulty === "easy") {
          questions.push(
            `In ${projTitle}${techPhrase}, what was your specific role, and what core features did you personally implement?`
          );
          questions.push(
            `What libraries or frameworks did you choose for ${projTitle}, and what was straightforward or simple to work with?`
          );
        } else if (difficulty === "hard") {
          questions.push(
            `In ${projTitle}${techPhrase}, walk me through the end-to-end data flow, distributed components, and how you ensured low latency and high availability under load.`
          );
          questions.push(
            `What was the most severe architectural constraint or race condition you encountered while scaling ${projTitle}, and how did you resolve it?`
          );
        } else {
          // Medium (default)
          questions.push(
            `I can see on your resume that you created ${projTitle}${techPhrase}. Please explain your motivation behind this idea and what core problem you set out to solve?`
          );
          questions.push(
            `In ${projTitle}, walk me through the system architecture and key technical design decisions you made during development.`
          );
          questions.push(
            `What was the most challenging bug or technical hurdle you encountered while building ${projTitle}, and how did you resolve it?`
          );
        }
      });
    } else {
      questions.push(
        `I can see you have experience with ${skillsStr}. Could you share a major project or technical system you designed from scratch, explaining your motivation and approach?`
      );
    }
  }

  // 3. Role & JD-Based Technical Questions (if roleBasedQuestions enabled)
  if (roleQuestionsEnabled) {
    if (difficulty === "easy") {
      if (skills.some(s => /react|vue|angular|frontend|ui/i.test(s))) {
        questions.push(
          `Can you explain the difference between state and props, and how you manage user input in web components?`
        );
      }
      if (skills.some(s => /node|express|backend|python|django|fastapi|java|spring/i.test(s))) {
        questions.push(
          `How do you set up basic API routing, handle HTTP request errors, and structure a backend service?`
        );
      }
      if (skills.some(s => /ml|ai|machine learning|data science|tensorflow|pytorch/i.test(s))) {
        questions.push(
          `Can you describe the basic differences between supervised and unsupervised learning, and how you prepare training data?`
        );
      }
      if (skills.some(s => /docker|kubernetes|aws|cloud|devops|ci\/cd/i.test(s))) {
        questions.push(
          `What are containers used for, and how do you write a simple Dockerfile for a web application?`
        );
      }
      questions.push(
        `What is your approach to writing clean, readable code and commenting your work for team members?`
      );
    } else if (difficulty === "hard") {
      if (skills.some(s => /react|vue|angular|frontend|ui/i.test(s))) {
        questions.push(
          `How do you optimize virtual DOM diffing, handle micro-frontend orchestration, and debug complex memory leaks in single-page applications?`
        );
      }
      if (skills.some(s => /node|express|backend|python|django|fastapi|java|spring/i.test(s))) {
        questions.push(
          `How do you implement distributed locking, idempotent API requests, database sharding, and ACID transaction boundaries across microservices?`
        );
      }
      if (skills.some(s => /ml|ai|machine learning|data science|tensorflow|pytorch/i.test(s))) {
        questions.push(
          `How do you optimize deep learning model quantization, batching strategies for GPU memory constraints, and mitigate covariate shift in production pipelines?`
        );
      }
      if (skills.some(s => /docker|kubernetes|aws|cloud|devops|ci\/cd/i.test(s))) {
        questions.push(
          `How do you architect multi-region Kubernetes clusters with service meshes (Istio), automated canary rollouts, and disaster recovery failover?`
        );
      }
      questions.push(
        `How do you design an end-to-end chaos engineering and observability strategy using distributed tracing, metrics, and automated alert remediation?`
      );
    } else {
      // Medium
      if (skills.some(s => /react|vue|angular|frontend|ui/i.test(s))) {
        questions.push(
          `How do you handle client-side state management, performance rendering bottlenecks, and component reusability in large web applications?`
        );
      }
      if (skills.some(s => /node|express|backend|python|django|fastapi|java|spring/i.test(s))) {
        questions.push(
          `How do you design secure, scalable RESTful or real-time APIs, and manage database connection pooling and query optimization?`
        );
      }
      if (skills.some(s => /ml|ai|machine learning|data science|tensorflow|pytorch/i.test(s))) {
        questions.push(
          `How do you evaluate your machine learning models to prevent overfitting and ensure real-time inference latency meets production standards?`
        );
      }
      if (skills.some(s => /docker|kubernetes|aws|cloud|devops|ci\/cd/i.test(s))) {
        questions.push(
          `How do you ensure zero-downtime deployments, container orchestration, and comprehensive monitoring across distributed environments?`
        );
      }
      questions.push(
        `How do you approach automated unit testing, CI/CD pipelines, and code reviews to maintain high software quality?`
      );
    }
  }

  return questions;
}

/**
 * Build a complete structured Resume Analysis & Context object for the AI Agent
 */
function analyzeCandidateResumeForAgent(candidate = {}, scheduledInterview = null, ivSettings = {}) {
  const candidateName = candidate.name || candidate.candidateName || scheduledInterview?.name || "Candidate";
  const candidateRole = candidate.role || candidate.targetJobTitle || scheduledInterview?.role || "Software Engineer";
  const candidateEmail = candidate.email || candidate.candidateEmail || scheduledInterview?.email || "";
  const candidatePhone = candidate.phone || candidate.candidatePhone || scheduledInterview?.phone || "";
  const candidateCompany = scheduledInterview?.company || candidate.company || "AvaHire Technologies Pvt. Ltd.";

  // Normalize skills
  const skills = candidate.allSkills || candidate.skills || [];
  const normalizedSkills = candidate.all_normalized_skills || [];
  const categorizedSkills = candidate.categorizedSkills || candidate.skillsCategory || {};

  // Extract experience
  const expYears = candidate.expYears || candidate.experience_years || (candidate.experience ? candidate.experience : "1-2 Years");
  const experienceEntries = candidate.experienceEntries || candidate.experience_entries || [];

  // Extract education & certifications
  const education = candidate.education || candidate.educationEntries || "Bachelor of Technology";
  const certifications = candidate.certifications || [];

  // Extract and normalize projects
  const projects = normalizeCandidateProjects(candidate);

  // Generate resume-tailored questions with interview settings
  const generatedQuestions = generateResumeBasedQuestions(candidate, candidateRole, projects, ivSettings);

  // Formulate project highlights text for AI system prompt
  const projectHighlights = projects.map((p, idx) => {
    const techStr = p.technologies && p.technologies.length > 0 ? ` [Tech: ${p.technologies.join(", ")}]` : "";
    const descStr = p.description && p.description.length > 0 ? ` - ${p.description.slice(0, 3).join("; ")}` : "";
    return `${idx + 1}. ${p.title}${techStr}${descStr}`;
  });

  return {
    candidateName,
    candidateEmail,
    candidatePhone,
    candidateRole,
    candidateCompany,
    experience: typeof expYears === "number" ? `${expYears} Years` : expYears,
    skills,
    normalizedSkills,
    categorizedSkills,
    education: Array.isArray(education) ? education.map(e => e.degree || e.institution || JSON.stringify(e)).join(", ") : String(education),
    certifications,
    projects,
    projectHighlights,
    resumeSummary: candidate.summary || candidate.professional_summary || `${candidateName} - ${candidateRole}`,
    resumeFileName: candidate.resumeFileName || null,
    rawResumeSnippet: (candidate.rawText || candidate.raw_text || "").slice(0, 2000),
    generatedQuestions
  };
}

module.exports = {
  extractProjectsFromText,
  normalizeCandidateProjects,
  generateResumeBasedQuestions,
  analyzeCandidateResumeForAgent
};
