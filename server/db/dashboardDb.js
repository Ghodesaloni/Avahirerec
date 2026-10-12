const jobsDb = require("./jobsDb");
const resumesDb = require("./resumesDb");
const interviewsDb = require("./interviewsDb");
const candidatesDb = require("./candidatesDb");
const emailCenterDb = require("./emailCenterDb");

function matchesUser(item, userRef) {
  if (!userRef) return false;
  const targetId = typeof userRef === "object" ? userRef.id : null;
  const targetEmail = (typeof userRef === "object" ? (userRef.email || "") : String(userRef)).toLowerCase().trim();

  const itemUserId = item.user_id !== undefined ? Number(item.user_id) : (item.userId !== undefined ? Number(item.userId) : null);
  if (targetId && itemUserId && itemUserId === Number(targetId)) return true;

  if (targetEmail) {
    const createdBy = (item.createdBy || "").toLowerCase().trim();
    const userEmail = (item.userEmail || "").toLowerCase().trim();
    return createdBy === targetEmail || userEmail === targetEmail;
  }
  return false;
}

class DashboardDatabase {
  async getStats(userRef) {
    const cleanEmail = (typeof userRef === "object" ? (userRef.email || "") : String(userRef || "")).toLowerCase().trim();
    const targetUserId = typeof userRef === "object" && userRef.id ? Number(userRef.id) : null;
    if (!cleanEmail && !targetUserId) {
      return {
        kpis: [
          { icon: "fa-briefcase", color: "bg-violet-100 text-violet-600", label: "Total Jobs", value: "0", sub: "0 Active Jobs", subColor: "text-slate-400" },
          { icon: "fa-users", color: "bg-emerald-100 text-emerald-600", label: "Total Candidates", value: "0", sub: "0 In Pipeline", subColor: "text-slate-400" },
          { icon: "fa-calendar", color: "bg-blue-100 text-blue-600", label: "Interviews Scheduled", value: "0", sub: "0 Total Sessions", subColor: "text-slate-400" },
          { icon: "fa-chart-line", color: "bg-amber-100 text-amber-600", label: "Completed Interviews", value: "0", sub: "Evaluated by AI", subColor: "text-slate-400" },
          { icon: "fa-circle-check", color: "bg-rose-100 text-rose-600", label: "Selected Candidates", value: "0", sub: "Ready for offer", subColor: "text-slate-400" }
        ],
        weekData: [
          { d: "Mon", v: 0 }, { d: "Tue", v: 0 }, { d: "Wed", v: 0 }, { d: "Thu", v: 0 },
          { d: "Fri", v: 0 }, { d: "Sat", v: 0 }, { d: "Sun", v: 0 }
        ],
        stageData: [
          { name: "Applied", value: 0, pct: "0%", color: "#3b82f6" },
          { name: "Screening", value: 0, pct: "0%", color: "#8b5cf6" },
          { name: "Interview", value: 0, pct: "0%", color: "#f59e0b" },
          { name: "Interviewed", value: 0, pct: "0%", color: "#14b8a6" },
          { name: "Selected", value: 0, pct: "0%", color: "#22c55e" }
        ],
        jobs: [],
        topJobs: [],
        upcoming: [],
        activity: []
      };
    }

    const filter = { userId: targetUserId, userEmail: cleanEmail };
    let jobs = await (jobsDb.getAllAsync ? jobsDb.getAllAsync(filter) : jobsDb.getAll(filter));
    let resumes = await (resumesDb.getAllAsync ? resumesDb.getAllAsync(filter) : resumesDb.getAll(filter));
    let interviews = await interviewsDb.getAll(filter);
    let candidates = await candidatesDb.getAll(filter);

    const userCtx = { id: targetUserId, email: cleanEmail };
    jobs = jobs.filter(j => matchesUser(j, userCtx));
    resumes = resumes.filter(r => matchesUser(r, userCtx));
    interviews = interviews.filter(i => matchesUser(i, userCtx));
    candidates = candidates.filter(c => matchesUser(c, userCtx));

    const activeJobs = jobs.filter(j => (j.status || "").toLowerCase() === "active").length;
    const selectedCandidates = candidates.filter(c => (c.status || "").toLowerCase() === "selected").length +
      resumes.filter(r => (r.status || "").toLowerCase() === "hired").length;
    const completedInterviews = interviews.filter(i => (i.status || "").toLowerCase() === "completed").length;
    const activeScheduledInterviews = interviews.filter(i => {
      const s = (i.status || "").toLowerCase();
      return s === "active" || s === "scheduled";
    }).length;

    const kpis = [
      {
        icon: "fa-briefcase",
        color: "bg-violet-100 text-violet-600",
        label: "Total Jobs",
        value: String(jobs.length),
        sub: `${activeJobs} Active Jobs`,
        subColor: "text-slate-400"
      },
      {
        icon: "fa-users",
        color: "bg-emerald-100 text-emerald-600",
        label: "Total Candidates",
        value: String(resumes.length + candidates.length),
        sub: `${resumes.length} In Pipeline`,
        subColor: "text-emerald-600"
      },
      {
        icon: "fa-calendar",
        color: "bg-blue-100 text-blue-600",
        label: "Interviews Scheduled",
        value: String(activeScheduledInterviews),
        sub: `${interviews.length} Total Sessions`,
        subColor: "text-blue-600"
      },
      {
        icon: "fa-chart-line",
        color: "bg-amber-100 text-amber-600",
        label: "Completed Interviews",
        value: String(completedInterviews),
        sub: "Evaluated by AI",
        subColor: "text-slate-400"
      },
      {
        icon: "fa-circle-check",
        color: "bg-rose-100 text-rose-600",
        label: "Selected Candidates",
        value: String(selectedCandidates),
        sub: "Ready for offer",
        subColor: "text-slate-400"
      }
    ];

    // Weekly interview chart data from real interview sessions
    const daysMap = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    interviews.forEach(i => {
      if (i.dayOfWeek) {
        const prefix = i.dayOfWeek.slice(0, 3);
        if (daysMap[prefix] !== undefined) {
          daysMap[prefix] += 1;
        }
      }
    });

    const weekData = [
      { d: "Mon", v: daysMap.Mon },
      { d: "Tue", v: daysMap.Tue },
      { d: "Wed", v: daysMap.Wed },
      { d: "Thu", v: daysMap.Thu },
      { d: "Fri", v: daysMap.Fri },
      { d: "Sat", v: daysMap.Sat },
      { d: "Sun", v: daysMap.Sun }
    ];

    // Pipeline funnel stage breakdown from real user records
    const totalPipeline = resumes.length + candidates.length;
    const appliedCount = resumes.filter(r => (r.status || "").toLowerCase() === "new" || (r.status || "").toLowerCase() === "applied").length;
    const screeningCount = resumes.filter(r => (r.status || "").toLowerCase() === "shortlisted" || (r.status || "").toLowerCase() === "review").length;
    const interviewCount = interviews.length;
    const interviewedCount = candidates.length;
    const finalSelectedCount = selectedCandidates;

    const stageData = [
      { name: "Applied", value: appliedCount, pct: totalPipeline > 0 ? `${Math.round((appliedCount / totalPipeline) * 100)}%` : "0%", color: "#3b82f6" },
      { name: "Screening", value: screeningCount, pct: totalPipeline > 0 ? `${Math.round((screeningCount / totalPipeline) * 100)}%` : "0%", color: "#8b5cf6" },
      { name: "Interview", value: interviewCount, pct: totalPipeline > 0 ? `${Math.round((interviewCount / totalPipeline) * 100)}%` : "0%", color: "#f59e0b" },
      { name: "Interviewed", value: interviewedCount, pct: totalPipeline > 0 ? `${Math.round((interviewedCount / totalPipeline) * 100)}%` : "0%", color: "#14b8a6" },
      { name: "Selected", value: finalSelectedCount, pct: totalPipeline > 0 ? `${Math.round((finalSelectedCount / totalPipeline) * 100)}%` : "0%", color: "#22c55e" }
    ];

    // Top jobs with candidate counts
    const topJobs = jobs.slice(0, 4).map(j => ({
      id: j.id,
      title: j.title,
      dept: j.dept,
      loc: j.loc,
      candidates: j.candidates || 0,
      status: j.status || "Active"
    }));

    // Upcoming interviews list
    const upcoming = interviews.slice(0, 4).map(i => ({
      id: i.id,
      name: i.name,
      role: i.role,
      time: i.date && i.time ? `${i.date}, ${i.time}` : (i.date || i.time || ""),
      status: i.status || "Scheduled",
      linkCode: i.linkCode,
      avatar: i.avatar || ""
    }));

    // Recent activity stream strictly for the authenticated user
    const activity = [];
    const seenActivityKeys = new Set();

    const addActivity = (item) => {
      let key = item.id;
      let counter = 1;
      while (seenActivityKeys.has(key)) {
        key = `${item.id}-${counter++}`;
      }
      seenActivityKeys.add(key);
      activity.push({ ...item, id: key });
    };

    candidates.slice(0, 3).forEach((c, idx) => {
      addActivity({
        id: `act-interview-${c.id || idx}`,
        user: "You",
        action: `AI Interview completed: ${c.name} (${c.role}) - Score: ${c.score || 0}%`,
        time: c.interviewDate || "Recently",
        icon: "fa-robot",
        color: "text-violet-500 bg-violet-50"
      });
    });
    interviews.slice(0, 3).forEach((i, idx) => {
      addActivity({
        id: `act-scheduled-${i.id || idx}`,
        user: "You",
        action: `Scheduled interview: ${i.name} for ${i.role}`,
        time: i.date || "Scheduled",
        icon: "fa-calendar-check",
        color: "text-blue-500 bg-blue-50"
      });
    });
    resumes.slice(0, 3).forEach((r, idx) => {
      addActivity({
        id: `act-resume-${r.id || idx}`,
        user: "You",
        action: `Screened resume: ${r.name} (${r.role}) - ATS: ${r.atsScore || 0}%`,
        time: r.uploadedDate || "Recently",
        icon: "fa-file-lines",
        color: "text-emerald-500 bg-emerald-50"
      });
    });

    return {
      kpis,
      weekData,
      stageData,
      jobs: topJobs,
      topJobs,
      upcoming,
      activity
    };
  }
}

module.exports = new DashboardDatabase();
