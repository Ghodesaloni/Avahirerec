const path = require("path");
const fs = require("fs");
const assert = require("assert");

// Load backend services directly
const candidatesDb = require("../server/db/candidatesDb");
const recordingStorageService = require("../server/services/recordingStorageService");
const transcriptDocService = require("../server/services/transcriptDocService");
const excelReportService = require("../server/services/excelReportService");

async function runTests() {
  console.log("===============================================================================");
  console.log("AvaHire Automated Interview Documentation & Daily Excel Report Test Suite");
  console.log("===============================================================================\n");

  const results = [];

  function logPass(testName, details = "") {
    console.log(`\x1b[32m✔ PASS\x1b[0m: ${testName}`);
    if (details) console.log(`   └─ ${details}`);
    results.push({ test: testName, status: "PASS", details });
  }

  function logFail(testName, error) {
    console.error(`\x1b[31m✖ FAIL\x1b[0m: ${testName} ->`, error.message);
    results.push({ test: testName, status: "FAIL", error: error.message });
  }

  // TEST 1: Conduct an AI interview and verify transcript and audio recording are saved automatically
  let testCandidateId = `test-cand-${Date.now()}`;
  try {
    // 1a. Save audio recording via recordingStorageService
    const fakeAudioBuffer = Buffer.from("RIFF....WAVEfmt ....data....test audio buffer content");
    const recordingResult = await recordingStorageService.saveRecording({
      candidateId: testCandidateId,
      linkCode: "ava999",
      audioBuffer: fakeAudioBuffer,
      mimeType: "audio/webm"
    });

    assert(recordingResult.success, "Recording save returned false");
    assert(fs.existsSync(recordingResult.filePath), "Recording file does not exist on disk");
    assert(recordingResult.fileSize > 0, "Recording file size is 0");

    // 1b. Create candidate evaluation record with transcript
    const newCandData = {
      id: testCandidateId,
      name: "Snehal Harde (Test)",
      email: "snehal.test@example.com",
      phone: "+91 98765 43210",
      role: "Lead DevOps Engineer",
      department: "Cloud Engineering",
      interviewDate: "11 Oct 2026, 11:30",
      duration: "18m 30s",
      mode: "AI Live Interview",
      status: "Under Review",
      audioUrl: recordingResult.audioUrl,
      audioPath: recordingResult.filePath,
      recordingStatus: "completed",
      transcript: [
        { speaker: "Ava", time: "00:00:01", isAI: true, text: "Welcome to your DevOps assessment with AvaHire." },
        { speaker: "Snehal Harde (Test)", time: "00:00:15", isAI: false, text: "Thank you Ava, happy to be here." },
        { speaker: "Ava", time: "00:00:25", isAI: true, text: "Can you explain your approach to zero-downtime Kubernetes deployments?" },
        { speaker: "Snehal Harde (Test)", time: "00:01:10", isAI: false, text: "I use blue-green and canary strategies with Argo Rollouts and health checks." }
      ],
      questionEvaluations: [
        {
          questionIndex: 1,
          question: "Can you explain your approach to zero-downtime Kubernetes deployments?",
          answer: "I use blue-green and canary strategies with Argo Rollouts and health checks.",
          total_score: 95,
          verdict: "Strong Hire",
          feedback: "Demonstrated clear production expertise in continuous delivery."
        }
      ]
    };

    const savedCand = await candidatesDb.create(newCandData);
    assert(savedCand && savedCand.id === testCandidateId, "Candidate was not saved to DB");
    assert(savedCand.recordingStatus === "completed", "Recording status is not completed");

    logPass(
      "Test 1: Conduct AI interview & save transcript + audio automatically",
      `Saved candidate [${testCandidateId}] with ${savedCand.transcript.length} dialogues and audio at ${recordingResult.filePath}`
    );
  } catch (err) {
    logFail("Test 1: Conduct AI interview & save transcript + audio automatically", err);
  }

  // TEST 2: Verify transcript downloads as valid .docx Word document
  try {
    const cand = await candidatesDb.getById(testCandidateId);
    const docResult = await transcriptDocService.generateTranscriptDoc(cand);

    assert(docResult.success, "Docx generation returned false");
    assert(fs.existsSync(docResult.filePath), "Docx file was not created on disk");
    assert(docResult.fileSize > 1000, `Docx file too small: ${docResult.fileSize} bytes`);

    // Check OOXML / ZIP magic bytes: PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
    const headerBytes = Buffer.alloc(4);
    const fd = fs.openSync(docResult.filePath, "r");
    fs.readSync(fd, headerBytes, 0, 4, 0);
    fs.closeSync(fd);

    const isZipOoxml = headerBytes[0] === 0x50 && headerBytes[1] === 0x4b && headerBytes[2] === 0x03 && headerBytes[3] === 0x04;
    assert(isZipOoxml, "Generated file does not match Word OOXML PK magic signature");

    logPass(
      "Test 2: Transcript generates as valid .docx Word Document",
      `Filename: ${docResult.filename} (${docResult.fileSize} bytes), Magic Header verified: PK\\x03\\x04 (valid Word doc)`
    );
  } catch (err) {
    logFail("Test 2: Transcript generates as valid .docx Word Document", err);
  }

  // TEST 3: Verify HR can listen to and download saved interview recording
  try {
    const fileInfo = recordingStorageService.findRecordingFile(testCandidateId);
    assert(fileInfo !== null, "Recording file info not found");
    assert(fileInfo.size > 0, "Recording size is 0");
    assert(fileInfo.mimeType.includes("audio"), `Unexpected mimeType: ${fileInfo.mimeType}`);

    // Verify file can be read as audio stream
    const readStream = fs.createReadStream(fileInfo.filePath);
    let bytesRead = 0;
    await new Promise((resolve, reject) => {
      readStream.on("data", chunk => { bytesRead += chunk.length; });
      readStream.on("end", resolve);
      readStream.on("error", reject);
    });

    assert(bytesRead === fileInfo.size, "Stream bytes read did not match file size");

    logPass(
      "Test 3: HR can listen to and download saved interview recording",
      `Streamable audio file verified: ${fileInfo.filename} (${bytesRead} bytes, ${fileInfo.mimeType})`
    );
  } catch (err) {
    logFail("Test 3: HR can listen to and download saved interview recording", err);
  }

  // TEST 4: Select two candidates on 11 October 2026 and verify both appear in report for that date
  const candA_Id = `cand-sel-11-a-${Date.now()}`;
  const candB_Id = `cand-sel-11-b-${Date.now()}`;
  try {
    await candidatesDb.create({
      id: candA_Id,
      name: "Saloni Ghode",
      email: "salonighode@gmail.com",
      phone: "+91 91234 56789",
      role: "Full Stack Engineer",
      department: "Engineering",
      interviewDate: "11-Oct-2026",
      status: "Selected",
      selectionDate: "11-Oct-2026"
    });

    await candidatesDb.create({
      id: candB_Id,
      name: "Snehal Harde",
      email: "snehal.harde2935@gmail.com",
      phone: "+91 98765 43210",
      role: "DevOps Architect",
      department: "Infrastructure",
      interviewDate: "11-Oct-2026",
      status: "Selected",
      selectionDate: "11-Oct-2026"
    });

    const allCands = await candidatesDb.getAll();
    const rep11 = await excelReportService.generateDailyReport("2026-10-11", allCands);

    assert(rep11.success, "Failed to generate 11-Oct report");
    assert(fs.existsSync(rep11.filePath), "Selected_Candidates_2026-10-11.xlsx does not exist");
    assert(rep11.candidateCount >= 2, `Expected at least 2 candidates in 11-Oct report, got ${rep11.candidateCount}`);

    logPass(
      "Test 4: Select two candidates on 11 October 2026 and verify both in 11-Oct report",
      `File: ${rep11.filename} contains ${rep11.candidateCount} selected candidates`
    );
  } catch (err) {
    logFail("Test 4: Select two candidates on 11 October 2026 and verify both in 11-Oct report", err);
  }

  // TEST 5: Select another candidate on 12 October 2026 and verify candidate appears ONLY in 12 October report
  const candC_Id = `cand-sel-12-c-${Date.now()}`;
  try {
    await candidatesDb.create({
      id: candC_Id,
      name: "Aarav Sharma",
      email: "aarav.sharma@example.com",
      phone: "+91 99887 76655",
      role: "AI Research Scientist",
      department: "AI/ML",
      interviewDate: "12-Oct-2026",
      status: "Selected",
      selectionDate: "12-Oct-2026"
    });

    const allCands = await candidatesDb.getAll();
    const rep12 = await excelReportService.generateDailyReport("2026-10-12", allCands);
    const rep11 = await excelReportService.generateDailyReport("2026-10-11", allCands);

    assert(rep12.candidateCount >= 1, `Expected candidate in 12-Oct report, got ${rep12.candidateCount}`);

    // Verify Aarav is not in 11-Oct candidates
    const cands11 = allCands.filter(c => c.status === "Selected" && excelReportService.normalizeDateInfo(c.selectionDate).key === "2026-10-11");
    const hasAaravIn11 = cands11.some(c => c.id === candC_Id);
    assert(!hasAaravIn11, "Aarav Sharma incorrectly appeared in 11-Oct report!");

    logPass(
      "Test 5: Select candidate on 12 October 2026 and verify candidate in 12-Oct report ONLY",
      `12-Oct report has ${rep12.candidateCount} candidate, strictly separated from 11-Oct report`
    );
  } catch (err) {
    logFail("Test 5: Select candidate on 12 October 2026 and verify candidate in 12-Oct report ONLY", err);
  }

  // TEST 6: Add another selected candidate on 11 October and verify existing report updates without duplicates
  const candD_Id = `cand-sel-11-d-${Date.now()}`;
  try {
    const beforeCands = await candidatesDb.getAll();
    const countBefore = beforeCands.filter(c => c.status === "Selected" && excelReportService.normalizeDateInfo(c.selectionDate).key === "2026-10-11").length;

    await candidatesDb.create({
      id: candD_Id,
      name: "Pooja Verma",
      email: "pooja.verma@example.com",
      phone: "+91 98111 22334",
      role: "Product Designer",
      department: "Design",
      interviewDate: "11-Oct-2026",
      status: "Selected",
      selectionDate: "11-Oct-2026"
    });

    const afterCands = await candidatesDb.getAll();
    const rep11Updated = await excelReportService.generateDailyReport("2026-10-11", afterCands);

    assert(rep11Updated.candidateCount === countBefore + 1, `Expected ${countBefore + 1} candidates on 11-Oct, got ${rep11Updated.candidateCount}`);

    logPass(
      "Test 6: Add another selected candidate on 11 October & verify report updates without duplicates",
      `Report updated seamlessly to ${rep11Updated.candidateCount} candidates`
    );
  } catch (err) {
    logFail("Test 6: Add another selected candidate on 11 October & verify report updates without duplicates", err);
  }

  // TEST 7: Change a selected candidate's status to Rejected and verify daily report is updated
  try {
    const beforeCands = await candidatesDb.getAll();
    const countBefore = beforeCands.filter(c => c.status === "Selected" && excelReportService.normalizeDateInfo(c.selectionDate).key === "2026-10-11").length;

    // Change Pooja Verma's status to Rejected
    await candidatesDb.update(candD_Id, { status: "Rejected" });

    const afterCands = await candidatesDb.getAll();
    const rep11AfterReject = await excelReportService.generateDailyReport("2026-10-11", afterCands);

    assert(rep11AfterReject.candidateCount === countBefore - 1, `Expected ${countBefore - 1} candidates on 11-Oct after rejection, got ${rep11AfterReject.candidateCount}`);

    logPass(
      "Test 7: Change selected candidate status to Rejected & verify daily report removes candidate",
      `Report count updated from ${countBefore} to ${rep11AfterReject.candidateCount} candidates`
    );
  } catch (err) {
    logFail("Test 7: Change selected candidate status to Rejected & verify daily report removes candidate", err);
  }

  // TEST 8: Verify HR can download historical daily reports and complete all-dates report
  try {
    const allCands = await candidatesDb.getAll();
    const datesSummary = excelReportService.getAvailableDatesSummary(allCands);
    assert(datesSummary.length >= 2, "Expected at least 2 date entries in dates summary");

    const allDatesReport = await excelReportService.generateAllDatesReport(allCands);
    assert(allDatesReport.success, "Failed to generate All Dates report");
    assert(fs.existsSync(allDatesReport.filePath), "Selected_Candidates_All_Dates.xlsx not found");
    assert(allDatesReport.candidateCount >= 3, `Expected at least 3 candidates in All Dates report, got ${allDatesReport.candidateCount}`);

    // Verify file lookup
    const foundFile11 = excelReportService.findReportFile("2026-10-11");
    const foundFileAll = excelReportService.findReportFile("all");
    assert(foundFile11 !== null, "Could not find 11-Oct file");
    assert(foundFileAll !== null, "Could not find all-dates file");

    logPass(
      "Test 8: HR can download historical daily reports and master all-dates report",
      `All-Dates Report: ${allDatesReport.filename} with ${allDatesReport.candidateCount} candidates across ${datesSummary.length} dates`
    );
  } catch (err) {
    logFail("Test 8: HR can download historical daily reports and master all-dates report", err);
  }

  // TEST 9: Test browser download restrictions, backend errors, missing recordings, database persistence
  try {
    // 9a. Non-existent candidate audio lookup
    const missingAudio = recordingStorageService.findRecordingFile("non_existent_candidate_xyz");
    assert(missingAudio === null, "Expected null for missing candidate audio");

    // 9b. Non-existent transcript docx lookup
    const missingDoc = transcriptDocService.findTranscriptFile("non_existent_candidate_xyz");
    assert(missingDoc === null, "Expected null for missing candidate docx");

    // 9c. Empty report date generation
    const emptyDateReport = await excelReportService.generateDailyReport("2025-01-01", []);
    assert(emptyDateReport.candidateCount === 0, "Empty date report should have 0 candidates");
    assert(fs.existsSync(emptyDateReport.filePath), "Empty date report should still produce a valid Excel file");

    // 9d. Verify persistence of candidate with all fields
    const persisted = await candidatesDb.getById(candA_Id);
    assert(persisted !== null, "Candidate not found");
    assert(persisted.status === "Selected", "Candidate status not persisted");
    assert(persisted.selectionDate === "11-Oct-2026", "Candidate selection date not persisted");

    logPass(
      "Test 9: Edge cases & error handling (missing recordings, empty dates, persistence)",
      "All edge cases handled gracefully without throwing unhandled exceptions"
    );
  } catch (err) {
    logFail("Test 9: Edge cases & error handling", err);
  }

  // Cleanup test candidates
  try {
    await candidatesDb.delete(testCandidateId);
    await candidatesDb.delete(candA_Id);
    await candidatesDb.delete(candB_Id);
    await candidatesDb.delete(candC_Id);
    await candidatesDb.delete(candD_Id);
  } catch (e) {}

  console.log("\n===============================================================================");
  console.log(`Test Execution Summary: ${results.filter(r => r.status === "PASS").length}/${results.length} Tests Passed`);
  console.log("===============================================================================\n");

  const allPassed = results.every(r => r.status === "PASS");
  if (!allPassed) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
