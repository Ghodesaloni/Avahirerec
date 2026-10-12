const fs = require("fs");
const path = require("path");

// Robust loader for docx build
let docxModule;
try {
  docxModule = require(path.resolve(__dirname, "../node_modules/docx/build/index.cjs"));
} catch (e) {
  try {
    docxModule = require("docx/build/index.cjs");
  } catch (e2) {
    docxModule = require("docx");
  }
}

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  HeadingLevel,
  ShadingType
} = docxModule;

const TRANSCRIPTS_DIR = path.resolve(__dirname, "../data/transcripts");

function ensureTranscriptsDir() {
  if (!fs.existsSync(TRANSCRIPTS_DIR)) {
    try {
      fs.mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
    } catch (err) {
      console.error("[TranscriptDoc] Error creating transcripts directory:", err.message);
    }
  }
}

function sanitizeId(id) {
  return String(id || "candidate").replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Format interview date and time safely
 */
function parseDateTime(dateStr) {
  if (!dateStr) {
    const now = new Date();
    return {
      date: now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      time: now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    };
  }

  // Handle format like "10 Oct 2026, 11:11"
  if (dateStr.includes(",")) {
    const parts = dateStr.split(",");
    return {
      date: parts[0].trim(),
      time: parts.slice(1).join(",").trim()
    };
  }

  return {
    date: dateStr,
    time: "Scheduled Time"
  };
}

/**
 * Parse safe array from string or array
 */
function parseSafeArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const p = JSON.parse(val);
      if (Array.isArray(p)) return p;
    } catch {}
  }
  return [];
}

/**
 * Build Word Document (.docx) for Candidate Interview Transcript & Evaluation
 */
async function generateTranscriptDoc(candidate, extraInfo = {}) {
  ensureTranscriptsDir();
  if (!candidate) throw new Error("Candidate record is required to generate transcript document");

  const candidateId = candidate.id || `cand-${Date.now()}`;
  const safeId = sanitizeId(candidateId);
  const candidateName = candidate.name || "Candidate";
  const candidateRole = candidate.role || extraInfo.jobTitle || "Software Engineer";
  const candidateDept = candidate.department || extraInfo.department || "Engineering";
  const candidateEmail = candidate.email || "N/A";
  const candidatePhone = candidate.phone || "N/A";
  const score = candidate.score !== undefined ? candidate.score : (candidate.total_score || 0);
  const status = candidate.status || "Under Review";
  const duration = candidate.duration || "N/A";
  const mode = candidate.mode || "AI Live Interview";
  const recommendation = candidate.recommendation || "Evaluated by AvaHire AI Evaluation Engine.";

  const dt = parseDateTime(candidate.interviewDate);
  const interviewDate = dt.date;
  const interviewTime = dt.time;

  const transcript = parseSafeArray(candidate.transcript || candidate.transcripts);
  const questionEvaluations = parseSafeArray(candidate.questionEvaluations || candidate.qaEvaluations || candidate.question_evaluations);
  const summaryPoints = parseSafeArray(candidate.summaryPoints);

  // Styling palette
  const PRIMARY_COLOR = "4F46E5"; // Indigo
  const SECONDARY_COLOR = "0F172A"; // Slate 900
  const MUTED_COLOR = "64748B"; // Slate 500
  const BG_LIGHT = "F8FAFC"; // Slate 50
  const BORDER_COLOR = "CBD5E1"; // Slate 300
  const HIGHLIGHT_COLOR = "10B981"; // Emerald

  const children = [];

  // 1. Header Banner
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 200, after: 100 },
      children: [
        new TextRun({
          text: "AvaHire AI Recruitment Platform",
          font: "Segoe UI",
          bold: true,
          size: 32,
          color: PRIMARY_COLOR
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: "Official Candidate Interview Transcript & Evaluation Report",
          font: "Segoe UI",
          size: 24,
          bold: true,
          color: SECONDARY_COLOR
        })
      ]
    })
  );

  // 2. Candidate Information Summary Table
  const tableBorder = {
    top: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
    left: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
    right: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR }
  };

  const createCell = (label, value, isHighlight = false) => {
    return new TableCell({
      borders: tableBorder,
      shading: { fill: isHighlight ? "EEF2FF" : BG_LIGHT, type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 150, right: 150 },
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: label + ": ", bold: true, size: 20, font: "Segoe UI", color: SECONDARY_COLOR }),
            new TextRun({ text: String(value || "N/A"), size: 20, font: "Segoe UI", color: isHighlight ? PRIMARY_COLOR : SECONDARY_COLOR, bold: isHighlight })
          ]
        })
      ]
    });
  };

  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          createCell("Candidate Name", candidateName, true),
          createCell("Job Title / Role", candidateRole)
        ]
      }),
      new TableRow({
        children: [
          createCell("Candidate Email", candidateEmail),
          createCell("Contact Number", candidatePhone)
        ]
      }),
      new TableRow({
        children: [
          createCell("Department", candidateDept),
          createCell("Interview Mode", mode)
        ]
      }),
      new TableRow({
        children: [
          createCell("Interview Date", interviewDate),
          createCell("Interview Time", interviewTime)
        ]
      }),
      new TableRow({
        children: [
          createCell("Duration", duration),
          createCell("Overall Score", `${score} / 100`, true)
        ]
      }),
      new TableRow({
        children: [
          createCell("Current Status", status, true),
          createCell("Candidate ID", candidateId)
        ]
      })
    ]
  });

  children.push(infoTable);

  // 3. Recommendation & AI Summary
  children.push(
    new Paragraph({
      spacing: { before: 300, after: 100 },
      children: [
        new TextRun({ text: "Hiring Recommendation & Summary", font: "Segoe UI", bold: true, size: 24, color: PRIMARY_COLOR })
      ]
    }),
    new Paragraph({
      spacing: { after: 150 },
      children: [
        new TextRun({ text: "AI Assessment: ", bold: true, font: "Segoe UI", size: 20, color: SECONDARY_COLOR }),
        new TextRun({ text: recommendation, font: "Segoe UI", size: 20, color: SECONDARY_COLOR })
      ]
    })
  );

  if (summaryPoints.length > 0) {
    summaryPoints.forEach((pt) => {
      const text = typeof pt === "string" ? pt : pt.text;
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 80 },
          children: [
            new TextRun({ text: text || "", font: "Segoe UI", size: 20, color: SECONDARY_COLOR })
          ]
        })
      );
    });
  }

  // 4. Questions & Answers Section
  children.push(
    new Paragraph({
      spacing: { before: 300, after: 150 },
      children: [
        new TextRun({ text: "Technical Interview Questions & Answers", font: "Segoe UI", bold: true, size: 24, color: PRIMARY_COLOR })
      ]
    })
  );

  if (questionEvaluations.length > 0) {
    questionEvaluations.forEach((qa, idx) => {
      const qIndex = qa.questionIndex || idx + 1;
      const qText = qa.question || `Question ${qIndex}`;
      const aText = qa.answer || "No response recorded.";
      const qScore = qa.total_score !== undefined ? qa.total_score : qa.accuracyScore;
      const verdict = qa.verdict || "Evaluated";
      const feedback = qa.feedback || "";

      children.push(
        new Paragraph({
          spacing: { before: 150, after: 60 },
          children: [
            new TextRun({ text: `Question ${qIndex}: `, font: "Segoe UI", bold: true, size: 21, color: PRIMARY_COLOR }),
            new TextRun({ text: qText, font: "Segoe UI", bold: true, size: 21, color: SECONDARY_COLOR })
          ]
        }),
        new Paragraph({
          spacing: { after: 60 },
          children: [
            new TextRun({ text: "Candidate's Answer: ", font: "Segoe UI", bold: true, size: 20, color: MUTED_COLOR }),
            new TextRun({ text: aText, font: "Segoe UI", size: 20, color: SECONDARY_COLOR, italics: true })
          ]
        })
      );

      if (qScore !== undefined || feedback) {
        children.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [
              new TextRun({ text: `Score: ${qScore}/100  |  Verdict: ${verdict}  `, font: "Segoe UI", bold: true, size: 19, color: HIGHLIGHT_COLOR }),
              feedback ? new TextRun({ text: `| Feedback: ${feedback}`, font: "Segoe UI", size: 19, color: MUTED_COLOR }) : new TextRun({ text: "" })
            ]
          })
        );
      }
    });
  } else {
    // If structured Q&As not yet split, extract Q&A from transcript
    let currentQ = "";
    let qCount = 0;
    transcript.forEach((t) => {
      if (t.isAI || t.speaker === "Ava" || t.speaker === "AI Interviewer") {
        currentQ = t.text;
        qCount++;
        children.push(
          new Paragraph({
            spacing: { before: 150, after: 60 },
            children: [
              new TextRun({ text: `Question ${qCount}: `, font: "Segoe UI", bold: true, size: 21, color: PRIMARY_COLOR }),
              new TextRun({ text: t.text, font: "Segoe UI", bold: true, size: 21, color: SECONDARY_COLOR })
            ]
          })
        );
      } else {
        children.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: "Candidate's Answer: ", font: "Segoe UI", bold: true, size: 20, color: MUTED_COLOR }),
              new TextRun({ text: t.text, font: "Segoe UI", size: 20, color: SECONDARY_COLOR, italics: true })
            ]
          })
        );
      }
    });
  }

  // 5. Complete Verbatim Transcript Dialogue
  children.push(
    new Paragraph({
      spacing: { before: 300, after: 150 },
      children: [
        new TextRun({ text: "Complete Realtime Interview Transcript Dialogue", font: "Segoe UI", bold: true, size: 24, color: PRIMARY_COLOR })
      ]
    })
  );

  if (transcript.length === 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "No realtime transcript dialogue recorded for this session.", font: "Segoe UI", size: 20, color: MUTED_COLOR, italics: true })
        ]
      })
    );
  } else {
    transcript.forEach((item) => {
      const isAI = item.isAI || item.speaker === "Ava" || item.speaker === "AI Interviewer";
      const speakerName = item.speaker || (isAI ? "Ava (AI Interviewer)" : candidateName);
      const timeTag = item.time ? ` [${item.time}]` : "";

      children.push(
        new Paragraph({
          spacing: { before: 80, after: 40 },
          children: [
            new TextRun({
              text: `${speakerName}${timeTag}: `,
              font: "Segoe UI",
              bold: true,
              size: 20,
              color: isAI ? PRIMARY_COLOR : "2563EB"
            }),
            new TextRun({
              text: item.text || "",
              font: "Segoe UI",
              size: 20,
              color: SECONDARY_COLOR
            })
          ]
        })
      );
    });
  }

  // 6. Verification Footer
  children.push(
    new Paragraph({
      spacing: { before: 400, after: 100 },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Document Generated by AvaHire AI Automated Recruitment Platform | Candidate ID: ${candidateId} | Generated: ${new Date().toISOString()}`,
          font: "Segoe UI",
          size: 16,
          color: MUTED_COLOR,
          italics: true
        })
      ]
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const cleanName = candidateName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${cleanName}_Interview_Transcript_${safeId}.docx`;
  const filePath = path.join(TRANSCRIPTS_DIR, filename);

  await fs.promises.writeFile(filePath, buffer);
  const stats = await fs.promises.stat(filePath);

  const downloadUrl = `/api/candidates/${encodeURIComponent(candidateId)}/transcript/download`;

  console.log(`[TranscriptDoc] Created Word document for candidate [${candidateId}] -> ${filename} (${stats.size} bytes)`);

  return {
    success: true,
    candidateId,
    filename,
    filePath,
    fileSize: stats.size,
    downloadUrl,
    buffer
  };
}

/**
 * Find existing transcript docx file for candidate
 */
function findTranscriptFile(candidateId) {
  ensureTranscriptsDir();
  if (!candidateId) return null;
  const safeId = sanitizeId(candidateId);

  try {
    const files = fs.readdirSync(TRANSCRIPTS_DIR);
    // Find file matching candidateId
    const match = files.find(f => f.endsWith(`_${safeId}.docx`) || f.includes(safeId) && f.endsWith(".docx"));
    if (match) {
      const fullPath = path.join(TRANSCRIPTS_DIR, match);
      const stats = fs.statSync(fullPath);
      return {
        filename: match,
        filePath: fullPath,
        fileSize: stats.size,
        updatedAt: stats.mtime,
        downloadUrl: `/api/candidates/${encodeURIComponent(candidateId)}/transcript/download`
      };
    }
  } catch (err) {
    console.warn("[TranscriptDoc] Search notice:", err.message);
  }
  return null;
}

module.exports = {
  TRANSCRIPTS_DIR,
  ensureTranscriptsDir,
  generateTranscriptDoc,
  findTranscriptFile
};
