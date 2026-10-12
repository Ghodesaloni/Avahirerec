const fs = require("fs");
const path = require("path");

// Robust loader for exceljs
let ExcelJS;
try {
  ExcelJS = require(path.resolve(__dirname, "../node_modules/exceljs"));
} catch (e) {
  try {
    ExcelJS = require("exceljs");
  } catch (e2) {
    throw new Error("exceljs library is not available in node_modules: " + e2.message);
  }
}

const REPORTS_DIR = path.resolve(__dirname, "../data/reports");

function ensureReportsDir() {
  if (!fs.existsSync(REPORTS_DIR)) {
    try {
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
    } catch (err) {
      console.error("[ExcelReport] Error creating reports directory:", err.message);
    }
  }
}

function getReportsDir(accountSlug = "") {
  ensureReportsDir();
  if (!accountSlug || accountSlug === "global") {
    return REPORTS_DIR;
  }
  const safeSlug = accountSlug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "_");
  const dir = path.join(REPORTS_DIR, safeSlug);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.warn("[ExcelReport] Notice creating account dir:", err.message);
      return REPORTS_DIR;
    }
  }
  return dir;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Format a Date to DD-MMM-YYYY (e.g. 11-Oct-2026)
 */
function formatDisplayDate(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
  if (isNaN(d.getTime())) return "11-Oct-2026";
  const day = String(d.getDate()).padStart(2, "0");
  const mon = MONTH_NAMES[d.getMonth()] || "Oct";
  const year = d.getFullYear();
  return `${day}-${mon}-${year}`;
}

/**
 * Format a Date to YYYY-MM-DD key (e.g. 2026-10-11)
 */
function formatDateKey(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
  if (isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Normalize selection date string from various formats (e.g. "11-Oct-2026", "2026-10-11", timestamp)
 */
function normalizeDateInfo(dateStr) {
  if (!dateStr) {
    const now = new Date();
    return { key: formatDateKey(now), display: formatDisplayDate(now) };
  }

  // If already in YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const d = new Date(dateStr + "T00:00:00");
    return { key: dateStr, display: formatDisplayDate(d) };
  }

  // If in DD-MMM-YYYY (e.g. 11-Oct-2026)
  const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (ddmmyyyyMatch) {
    const day = parseInt(ddmmyyyyMatch[1], 10);
    const monStr = ddmmyyyyMatch[2].toLowerCase();
    const year = parseInt(ddmmyyyyMatch[3], 10);
    const monIdx = MONTH_NAMES.findIndex(m => m.toLowerCase() === monStr);
    if (monIdx >= 0) {
      const key = `${year}-${String(monIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { key, display: `${String(day).padStart(2, "0")}-${MONTH_NAMES[monIdx]}-${year}` };
    }
  }

  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return { key: formatDateKey(parsed), display: formatDisplayDate(parsed) };
  }

  const today = new Date();
  return { key: formatDateKey(today), display: formatDisplayDate(today) };
}

/**
 * Build Excel Workbook with AvaHire branding and styled table
 */
async function buildWorkbook({ title, subtitle, dateLabel, candidates, baseUrl = "" }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AvaHire AI Recruitment Platform";
  workbook.lastModifiedBy = "AvaHire Automated Reporter";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("Selected Candidates", {
    views: [{ showGridLines: true }]
  });

  // Columns specification
  const columns = [
    { key: "srNo", header: "Sr. No.", width: 10 },
    { key: "name", header: "Candidate Name", width: 26 },
    { key: "email", header: "Candidate Email", width: 32 },
    { key: "phone", header: "Contact Number", width: 20 },
    { key: "role", header: "Job Title", width: 26 },
    { key: "dept", header: "Department", width: 22 },
    { key: "interviewDate", header: "Interview Date", width: 22 },
    { key: "selectionDate", header: "Selection Date", width: 18 },
    { key: "interviewStatus", header: "Interview Status", width: 20 },
    { key: "finalStatus", header: "Final Hiring Status", width: 20 },
    { key: "transcriptLink", header: "Interview Transcript Download Link", width: 38 },
    { key: "recordingLink", header: "Interview Recording Download Link", width: 38 }
  ];

  // 1. Header Banner
  sheet.mergeCells("A1:L1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = title || "AvaHire AI - Daily Selected Candidates Report";
  titleCell.font = { name: "Segoe UI", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4F46E5" } // Indigo
  };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(1).height = 36;

  // 2. Subheader with Date and Candidate Count
  sheet.mergeCells("A2:L2");
  const subCell = sheet.getCell("A2");
  const countText = `${candidates.length} Selected Candidate${candidates.length === 1 ? "" : "s"}`;
  subCell.value = `${subtitle || `Report Date: ${dateLabel}`}  |  Total Selected: ${countText}  |  Generated: ${new Date().toLocaleString("en-GB")}`;
  subCell.font = { name: "Segoe UI", size: 10, italic: true, color: { argb: "FF334155" } };
  subCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF1F5F9" } // Slate 100
  };
  subCell.alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(2).height = 24;

  // Empty spacer row 3
  sheet.getRow(3).height = 10;

  // 3. Table Column Headers on Row 4
  const headerRow = sheet.getRow(4);
  headerRow.height = 30;

  columns.forEach((col, idx) => {
    const colNumber = idx + 1;
    sheet.getColumn(colNumber).width = col.width;
    const cell = headerRow.getCell(colNumber);
    cell.value = col.header;
    cell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E293B" } // Slate 800
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF0F172A" } },
      bottom: { style: "medium", color: { argb: "FF4F46E5" } },
      left: { style: "thin", color: { argb: "FF334155" } },
      right: { style: "thin", color: { argb: "FF334155" } }
    };
  });

  // 4. Data Rows starting at Row 5
  candidates.forEach((cand, index) => {
    const rowNumber = index + 5;
    const row = sheet.getRow(rowNumber);
    row.height = 24;

    const srNo = index + 1;
    const name = cand.name || "Candidate";
    const email = cand.email || "N/A";
    const phone = cand.phone || "N/A";
    const role = cand.role || "Software Engineer";
    const dept = cand.department || "Engineering";
    const interviewDate = cand.interviewDate || "N/A";
    const selectionDate = cand.selectionDate || dateLabel;
    const interviewStatus = cand.interviewStatus || "Completed";
    const finalStatus = "Selected";

    const transcriptUrl = `${baseUrl}/api/candidates/${encodeURIComponent(cand.id)}/transcript/download`;
    const recordingUrl = `${baseUrl}/api/candidates/${encodeURIComponent(cand.id)}/audio/download`;

    const isEven = index % 2 === 0;
    const rowBg = isEven ? "FFFFFFFF" : "FFF8FAFC"; // alternating row fill

    const values = [
      srNo,
      name,
      email,
      phone,
      role,
      dept,
      interviewDate,
      selectionDate,
      interviewStatus,
      finalStatus
    ];

    values.forEach((val, colIdx) => {
      const cell = row.getCell(colIdx + 1);
      cell.value = val;
      cell.font = { name: "Segoe UI", size: 10, color: { argb: "FF0F172A" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: rowBg }
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } }
      };

      if (colIdx === 0 || colIdx === 7 || colIdx === 8) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else if (colIdx === 9) {
        // Final Status
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FF047857" } }; // Emerald 700
      } else {
        cell.alignment = { vertical: "middle", horizontal: "left" };
      }
    });

    // Col 11: Transcript Download Link
    const transcriptCell = row.getCell(11);
    transcriptCell.value = {
      text: "Download Transcript (.docx)",
      hyperlink: transcriptUrl,
      tooltip: `Download interview transcript docx for ${name}`
    };
    transcriptCell.font = { name: "Segoe UI", size: 10, underline: true, color: { argb: "FF2563EB" }, bold: true };
    transcriptCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
    transcriptCell.alignment = { vertical: "middle", horizontal: "center" };
    transcriptCell.border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } }
    };

    // Col 12: Recording Download Link
    const recordingCell = row.getCell(12);
    recordingCell.value = {
      text: "Download Recording (Audio)",
      hyperlink: recordingUrl,
      tooltip: `Download interview audio recording for ${name}`
    };
    recordingCell.font = { name: "Segoe UI", size: 10, underline: true, color: { argb: "FF4F46E5" }, bold: true };
    recordingCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
    recordingCell.alignment = { vertical: "middle", horizontal: "center" };
    recordingCell.border = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFE2E8F0" } },
      right: { style: "thin", color: { argb: "FFE2E8F0" } }
    };
  });

  return workbook;
}

/**
 * Generate and save Date-Wise Excel Report for Selected Candidates
 */
async function generateDailyReport(dateKey, selectedCandidates, baseUrl = "", accountSlug = "") {
  ensureReportsDir();
  const reportsDir = getReportsDir(accountSlug);
  const norm = normalizeDateInfo(dateKey);
  const targetDateKey = norm.key;
  const displayDate = norm.display;

  // Filter candidates specifically for this selection date
  const filtered = (selectedCandidates || []).filter(c => {
    if (c.status !== "Selected") return false;
    const cNorm = normalizeDateInfo(c.selectionDate);
    return cNorm.key === targetDateKey;
  });

  // Prevent duplicate candidates based on candidate id
  const uniqueMap = new Map();
  filtered.forEach(c => {
    if (!uniqueMap.has(c.id)) {
      uniqueMap.set(c.id, c);
    }
  });
  const deduped = Array.from(uniqueMap.values());

  const filename = `Selected_Candidates_${targetDateKey}.xlsx`;
  const filePath = path.join(reportsDir, filename);

  const workbook = await buildWorkbook({
    title: `AvaHire AI - Daily Selected Candidates Report (${displayDate})`,
    subtitle: `Selection Date: ${displayDate}`,
    dateLabel: displayDate,
    candidates: deduped,
    baseUrl
  });

  await workbook.xlsx.writeFile(filePath);
  const stats = await fs.promises.stat(filePath);

  console.log(`[ExcelReport] Generated daily report: ${filename} [${accountSlug || "global"}] (${deduped.length} candidates, ${stats.size} bytes)`);

  const accountQuery = accountSlug ? `?userEmail=${encodeURIComponent(accountSlug)}` : "";

  return {
    success: true,
    dateKey: targetDateKey,
    displayDate,
    candidateCount: deduped.length,
    filename,
    filePath,
    fileSize: stats.size,
    downloadUrl: `/api/reports/selected-candidates/date/${targetDateKey}${accountQuery}`,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Generate and save Complete All-Dates Excel Report
 */
async function generateAllDatesReport(allSelectedCandidates, baseUrl = "", accountSlug = "") {
  ensureReportsDir();
  const reportsDir = getReportsDir(accountSlug);

  const selected = (allSelectedCandidates || []).filter(c => c.status === "Selected");

  // Deduplicate
  const uniqueMap = new Map();
  selected.forEach(c => {
    if (!uniqueMap.has(c.id)) {
      uniqueMap.set(c.id, c);
    }
  });
  const deduped = Array.from(uniqueMap.values());

  // Sort by selection date descending
  deduped.sort((a, b) => {
    const d1 = normalizeDateInfo(a.selectionDate).key;
    const d2 = normalizeDateInfo(b.selectionDate).key;
    return d2.localeCompare(d1);
  });

  const filename = "Selected_Candidates_All_Dates.xlsx";
  const filePath = path.join(reportsDir, filename);

  const workbook = await buildWorkbook({
    title: "AvaHire AI - Master Selected Candidates Report (All Dates)",
    subtitle: "Complete Consolidated Record Across All Selection Dates",
    dateLabel: "All Dates",
    candidates: deduped,
    baseUrl
  });

  await workbook.xlsx.writeFile(filePath);
  const stats = await fs.promises.stat(filePath);

  console.log(`[ExcelReport] Generated All-Dates report: ${filename} [${accountSlug || "global"}] (${deduped.length} candidates, ${stats.size} bytes)`);

  const accountQuery = accountSlug ? `?userEmail=${encodeURIComponent(accountSlug)}` : "";

  return {
    success: true,
    candidateCount: deduped.length,
    filename,
    filePath,
    fileSize: stats.size,
    downloadUrl: `/api/reports/selected-candidates/all${accountQuery}`,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Synchronize and regenerate all date-wise reports whenever candidates are selected or updated
 */
async function syncAllReports(allCandidates, baseUrl = "", accountSlug = "") {
  ensureReportsDir();

  const selectedList = (allCandidates || []).filter(c => c && c.status === "Selected");

  // Group by selection date key
  const groups = new Map();
  selectedList.forEach(c => {
    const norm = normalizeDateInfo(c.selectionDate);
    const key = norm.key;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(c);
  });

  // Always ensure today is represented
  const todayKey = formatDateKey(new Date());
  if (!groups.has(todayKey)) {
    groups.set(todayKey, []);
  }

  const reports = [];
  for (const [dateKey, cands] of groups.entries()) {
    const rep = await generateDailyReport(dateKey, cands, baseUrl, accountSlug);
    reports.push(rep);
  }

  // Also generate master all-dates report
  const allReport = await generateAllDatesReport(selectedList, baseUrl, accountSlug);
  reports.push(allReport);

  return reports;
}

/**
 * List available dates with candidate counts
 */
function getAvailableDatesSummary(allCandidates = []) {
  ensureReportsDir();
  const selectedList = (allCandidates || []).filter(c => c && c.status === "Selected");

  const dateMap = new Map();
  selectedList.forEach(c => {
    const norm = normalizeDateInfo(c.selectionDate);
    const key = norm.key;
    if (!dateMap.has(key)) {
      dateMap.set(key, {
        dateKey: key,
        displayDate: norm.display,
        candidateCount: 0,
        filename: `Selected_Candidates_${key}.xlsx`,
        candidates: []
      });
    }
    const entry = dateMap.get(key);
    entry.candidateCount++;
    entry.candidates.push({
      id: c.id,
      name: c.name,
      email: c.email,
      role: c.role
    });
  });

  // Always include today
  const todayKey = formatDateKey(new Date());
  if (!dateMap.has(todayKey)) {
    dateMap.set(todayKey, {
      dateKey: todayKey,
      displayDate: formatDisplayDate(new Date()),
      candidateCount: 0,
      filename: `Selected_Candidates_${todayKey}.xlsx`,
      candidates: []
    });
  }

  return Array.from(dateMap.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

/**
 * Find report file by date key or filename
 */
function findReportFile(dateKeyOrAll, accountSlug = "") {
  const reportsDir = getReportsDir(accountSlug);
  if (!dateKeyOrAll || dateKeyOrAll === "all" || dateKeyOrAll === "All") {
    const p = path.join(reportsDir, "Selected_Candidates_All_Dates.xlsx");
    if (fs.existsSync(p)) return { filePath: p, filename: "Selected_Candidates_All_Dates.xlsx" };
    const globalP = path.join(REPORTS_DIR, "Selected_Candidates_All_Dates.xlsx");
    if (fs.existsSync(globalP)) return { filePath: globalP, filename: "Selected_Candidates_All_Dates.xlsx" };
    return null;
  }

  const norm = normalizeDateInfo(dateKeyOrAll);
  const targetName = `Selected_Candidates_${norm.key}.xlsx`;
  const p = path.join(reportsDir, targetName);
  if (fs.existsSync(p)) return { filePath: p, filename: targetName };
  const globalP = path.join(REPORTS_DIR, targetName);
  if (fs.existsSync(globalP)) return { filePath: globalP, filename: targetName };

  return null;
}

module.exports = {
  REPORTS_DIR,
  ensureReportsDir,
  getReportsDir,
  formatDisplayDate,
  formatDateKey,
  normalizeDateInfo,
  generateDailyReport,
  generateAllDatesReport,
  syncAllReports,
  getAvailableDatesSummary,
  findReportFile
};
