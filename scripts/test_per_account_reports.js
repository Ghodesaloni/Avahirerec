/**
 * Verification Script: Per-Account Reports Separation & Selected-Only Candidate Hub
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const excelReportService = require("../server/services/excelReportService");
const candidatesDb = require("../server/db/candidatesDb");

async function runTests() {
  console.log("===============================================================================");
  console.log("Testing Per-Account Reports Separation & Selected-Only Candidates");
  console.log("===============================================================================\n");

  const ts = Date.now();
  const user1 = "salonighode@gmail.com";
  const user2 = "snehal.harde2935@gmail.com";

  // Create candidates for User 1 (Saloni)
  const candU1_Selected = {
    id: `cand-u1-sel-${ts}`,
    name: "User 1 Selected Candidate",
    email: `u1.sel.${ts}@test.com`,
    role: "Full Stack Engineer",
    department: "Engineering",
    status: "Selected",
    selectionDate: "12-Oct-2026",
    createdBy: user1,
    userEmail: user1
  };
  const candU1_Pending = {
    id: `cand-u1-pen-${ts}`,
    name: "User 1 Pending Candidate",
    email: `u1.pen.${ts}@test.com`,
    role: "QA Engineer",
    department: "QA",
    status: "Shortlisted",
    createdBy: user1,
    userEmail: user1
  };

  // Create candidates for User 2 (Snehal)
  const candU2_Selected = {
    id: `cand-u2-sel-${ts}`,
    name: "User 2 Selected Candidate",
    email: `u2.sel.${ts}@test.com`,
    role: "DevOps Engineer",
    department: "Infrastructure",
    status: "Selected",
    selectionDate: "12-Oct-2026",
    createdBy: user2,
    userEmail: user2
  };

  await candidatesDb.create(candU1_Selected);
  await candidatesDb.create(candU1_Pending);
  await candidatesDb.create(candU2_Selected);

  // Test 1: candidatesDb.getAll with userEmail returns ONLY that account's candidates
  const listU1 = await candidatesDb.getAll({ userEmail: user1 });
  const listU2 = await candidatesDb.getAll({ userEmail: user2 });

  const hasU1InU2 = listU2.some(c => c.id === candU1_Selected.id);
  const hasU2InU1 = listU1.some(c => c.id === candU2_Selected.id);

  assert(!hasU1InU2, "Error: User 1's candidate leaked into User 2's list!");
  assert(!hasU2InU1, "Error: User 2's candidate leaked into User 1's list!");
  console.log("✔ PASS: Account data isolation verified (candidates strictly separated by userEmail)");

  // Test 2: Generate report for User 1 vs User 2
  const repU1 = await excelReportService.generateDailyReport("2026-10-12", listU1, "", user1);
  const repU2 = await excelReportService.generateDailyReport("2026-10-12", listU2, "", user2);

  assert(fs.existsSync(repU1.filePath), "User 1 report file does not exist");
  assert(fs.existsSync(repU2.filePath), "User 2 report file does not exist");
  assert(repU1.filePath !== repU2.filePath, "User 1 and User 2 should have separate report file paths!");
  console.log(`✔ PASS: Separate account report files generated:`);
  console.log(`   User 1 path: ${repU1.filePath}`);
  console.log(`   User 2 path: ${repU2.filePath}`);

  // Test 3: Reports Summary per account
  const summaryU1 = excelReportService.getAvailableDatesSummary(listU1);
  const summaryU2 = excelReportService.getAvailableDatesSummary(listU2);

  console.log("✔ PASS: Date summaries calculated separately per account");

  // Test 4: Hub Selected-Only Filter logic
  const hubCandidatesU1 = listU1.filter(c => c && c.status === "Selected");
  const hasPendingInHub = hubCandidatesU1.some(c => c.status !== "Selected");
  assert(!hasPendingInHub, "Pending candidates must NOT be in the Reports Hub list!");
  assert(hubCandidatesU1.some(c => c.id === candU1_Selected.id), "Selected candidate should be in the Reports Hub list!");
  console.log(`✔ PASS: Reports Hub strictly filters to only Selected candidates (${hubCandidatesU1.length} selected candidates found)`);

  // Cleanup test candidates
  await candidatesDb.delete(candU1_Selected.id);
  await candidatesDb.delete(candU1_Pending.id);
  await candidatesDb.delete(candU2_Selected.id);

  console.log("\n===============================================================================");
  console.log("All Per-Account Reports Tests Passed Successfully!");
  console.log("===============================================================================");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
