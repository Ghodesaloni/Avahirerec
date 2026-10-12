require("dotenv").config();
const express = require("express");
const http = require("http");

const TEST_PORT = 3005;
const BASE_URL = `http://localhost:${TEST_PORT}`;

function makeRequest({ method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        "Content-Type": "application/json",
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", chunk => { data += chunk; });
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {
          json = data;
        }
        resolve({ status: res.statusCode, data: json, headers: res.headers });
      });
    });

    req.on("error", reject);
    if (body) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));
  const apiRouter = require("../server/routes");
  app.use("/api", apiRouter);

  const server = app.listen(TEST_PORT);
  await new Promise((resolve) => server.once("listening", resolve));

  console.log("=================================================================");
  console.log(`🧪 AVAHIRE ACCOUNT-WISE DATA ISOLATION TEST SUITE (PORT ${TEST_PORT})`);
  console.log("=================================================================\n");

  const emailA = `recruiter_a_${Date.now()}@alpha-corp.com`;
  const emailB = `recruiter_b_${Date.now()}@beta-corp.com`;
  const password = "Password123!";

  let tokenA = "";
  let tokenB = "";
  let userA = null;
  let userB = null;

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
    }
  }

  // --- TEST 1: REGISTRATION & AUTHENTICATION ---
  console.log("1. Registering Two Distinct Recruiter Accounts...");

  const regA = await makeRequest({
    method: "POST",
    path: "/api/auth/register",
    body: {
      fullName: "Alice Recruiter",
      email: emailA,
      password: password,
      company: "Alpha Corp",
      phone: "9876543210"
    }
  });

  assert(regA.status === 201 && regA.data.success, `Account A registered: ${emailA}`);
  tokenA = regA.data.token;

  const regB = await makeRequest({
    method: "POST",
    path: "/api/auth/register",
    body: {
      fullName: "Bob Recruiter",
      email: emailB,
      password: password,
      company: "Beta Corp",
      phone: "9123456780"
    }
  });

  assert(regB.status === 201 && regB.data.success, `Account B registered: ${emailB}`);
  tokenB = regB.data.token;

  // Verify unique profile extraction
  const profA = await makeRequest({
    method: "GET",
    path: "/api/users/profile",
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  userA = profA.data.data;
  assert(userA.email === emailA, `Account A identity verified: ${userA.email} (ID: ${userA.id})`);

  const profB = await makeRequest({
    method: "GET",
    path: "/api/users/profile",
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  userB = profB.data.data;
  assert(userB.email === emailB, `Account B identity verified: ${userB.email} (ID: ${userB.id})`);
  assert(userA.id !== userB.id, `Account A and Account B have distinct primary IDs (${userA.id} vs ${userB.id})`);

  // --- TEST 2: JOBS CREATION & ISOLATION ---
  console.log("\n2. Testing Jobs Creation and Isolation...");

  const jobCreateA = await makeRequest({
    method: "POST",
    path: "/api/jobs",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: {
      title: "Senior Alpha Engineer",
      dept: "Engineering",
      location: "Remote",
      type: "Full-Time",
      experience: "5+ Years",
      status: "Active",
      description: "Alpha job description"
    }
  });
  const jobA = jobCreateA.data.data;
  assert(jobCreateA.status === 201 && jobA.id, `Account A created job: ${jobA.title} (ID: ${jobA.id})`);

  const jobCreateB = await makeRequest({
    method: "POST",
    path: "/api/jobs",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: {
      title: "Senior Beta Designer",
      dept: "Design",
      location: "Hybrid",
      type: "Full-Time",
      experience: "3+ Years",
      status: "Active",
      description: "Beta job description"
    }
  });
  const jobB = jobCreateB.data.data;
  assert(jobCreateB.status === 201 && jobB.id, `Account B created job: ${jobB.title} (ID: ${jobB.id})`);

  // Verify Account A lists ONLY Job A
  const jobsListA = await makeRequest({
    method: "GET",
    path: "/api/jobs",
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const listA = jobsListA.data.data || [];
  assert(
    listA.some(j => j.id === jobA.id) && !listA.some(j => j.id === jobB.id),
    `Account A job list contains Job A and strictly excludes Job B (Found ${listA.length} jobs)`
  );

  // Verify Account B lists ONLY Job B
  const jobsListB = await makeRequest({
    method: "GET",
    path: "/api/jobs",
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  const listB = jobsListB.data.data || [];
  assert(
    listB.some(j => j.id === jobB.id) && !listB.some(j => j.id === jobA.id),
    `Account B job list contains Job B and strictly excludes Job A (Found ${listB.length} jobs)`
  );

  // --- TEST 3: IDOR ON JOBS (Account A trying to view/modify Job B) ---
  console.log("\n3. Testing IDOR Protection on Jobs...");

  const idorGetJob = await makeRequest({
    method: "GET",
    path: `/api/jobs/${jobB.id}`,
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert(idorGetJob.status === 404, `IDOR Blocked: Account A GET Job B returned HTTP ${idorGetJob.status}`);

  const idorUpdateJob = await makeRequest({
    method: "PUT",
    path: `/api/jobs/${jobB.id}`,
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { title: "Hacked Job Title" }
  });
  assert(idorUpdateJob.status === 404, `IDOR Blocked: Account A PUT Job B returned HTTP ${idorUpdateJob.status}`);

  const idorDeleteJob = await makeRequest({
    method: "DELETE",
    path: `/api/jobs/${jobB.id}`,
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert(idorDeleteJob.status === 404, `IDOR Blocked: Account A DELETE Job B returned HTTP ${idorDeleteJob.status}`);

  // --- TEST 4: CANDIDATES & RESUMES ISOLATION ---
  console.log("\n4. Testing Candidates & Resumes Isolation...");

  const candCreateA = await makeRequest({
    method: "POST",
    path: "/api/candidates",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: {
      name: "Candidate Alpha",
      email: "cand_alpha@test.com",
      phone: "9876500001",
      role: "Senior Alpha Engineer",
      status: "Shortlisted",
      score: 92,
      jobId: jobA.id
    }
  });
  const candA = candCreateA.data.data;
  assert(candCreateA.status === 201 && candA.id, `Account A created candidate: ${candA.name} (ID: ${candA.id})`);

  const candCreateB = await makeRequest({
    method: "POST",
    path: "/api/candidates",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: {
      name: "Candidate Beta",
      email: "cand_beta@test.com",
      phone: "9876500002",
      role: "Senior Beta Designer",
      status: "Shortlisted",
      score: 88,
      jobId: jobB.id
    }
  });
  const candB = candCreateB.data.data;
  assert(candCreateB.status === 201 && candB.id, `Account B created candidate: ${candB.name} (ID: ${candB.id})`);

  // Candidate listing verification
  const candListA = await makeRequest({
    method: "GET",
    path: "/api/candidates",
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert(
    candListA.data.data.some(c => c.id === candA.id) && !candListA.data.data.some(c => c.id === candB.id),
    `Account A candidates list contains Candidate A and excludes Candidate B`
  );

  const candListB = await makeRequest({
    method: "GET",
    path: "/api/candidates",
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert(
    candListB.data.data.some(c => c.id === candB.id) && !candListB.data.data.some(c => c.id === candA.id),
    `Account B candidates list contains Candidate B and excludes Candidate A`
  );

  // --- TEST 5: IDOR ON CANDIDATES (Transcripts, Recordings, and Data) ---
  console.log("\n5. Testing IDOR Protection on Candidates & Documents...");

  const idorGetCand = await makeRequest({
    method: "GET",
    path: `/api/candidates/${candB.id}`,
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert(idorGetCand.status === 404, `IDOR Blocked: Account A GET Candidate B returned HTTP ${idorGetCand.status}`);

  const idorDownloadTranscript = await makeRequest({
    method: "GET",
    path: `/api/candidates/${candB.id}/transcript/download`,
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert(idorDownloadTranscript.status === 404, `IDOR Blocked: Account A transcript download for Candidate B returned HTTP ${idorDownloadTranscript.status}`);

  const idorDownloadRecording = await makeRequest({
    method: "GET",
    path: `/api/candidates/${candB.id}/recording/download`,
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert(idorDownloadRecording.status === 404, `IDOR Blocked: Account A recording download for Candidate B returned HTTP ${idorDownloadRecording.status}`);

  const idorUpdateCand = await makeRequest({
    method: "PUT",
    path: `/api/candidates/${candB.id}`,
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { status: "Rejected" }
  });
  assert(idorUpdateCand.status === 404, `IDOR Blocked: Account A PUT Candidate B returned HTTP ${idorUpdateCand.status}`);

  // --- TEST 6: INTERVIEWS ISOLATION & PUBLIC CANDIDATE ACCESS ---
  console.log("\n6. Testing Interviews Isolation & Candidate Entry Links...");

  const ivCreateA = await makeRequest({
    method: "POST",
    path: "/api/interviews",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: {
      name: candA.name,
      email: candA.email,
      role: candA.role,
      date: "2026-10-15",
      time: "10:00 AM",
      type: "AI Technical Interview",
      status: "Scheduled"
    }
  });
  const ivA = ivCreateA.data.data;
  assert(ivCreateA.status === 201 && ivA.id && ivA.linkCode, `Account A created interview with linkCode: ${ivA.linkCode}`);

  const ivCreateB = await makeRequest({
    method: "POST",
    path: "/api/interviews",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: {
      name: candB.name,
      email: candB.email,
      role: candB.role,
      date: "2026-10-16",
      time: "02:00 PM",
      type: "AI Technical Interview",
      status: "Scheduled"
    }
  });
  const ivB = ivCreateB.data.data;
  assert(ivCreateB.status === 201 && ivB.id && ivB.linkCode, `Account B created interview with linkCode: ${ivB.linkCode}`);

  // Recruiter interviews list
  const ivListA = await makeRequest({
    method: "GET",
    path: "/api/interviews",
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert(
    ivListA.data.data.some(i => i.id === ivA.id) && !ivListA.data.data.some(i => i.id === ivB.id),
    `Account A interviews list contains Interview A and excludes Interview B`
  );

  // Recruiter IDOR check on interview
  const idorGetIv = await makeRequest({
    method: "GET",
    path: `/api/interviews/${ivB.id}`,
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert(idorGetIv.status === 404, `IDOR Blocked: Account A GET Interview B returned HTTP ${idorGetIv.status}`);

  // Candidate public access via link code (Candidate can access their own session room)
  const candidateRoomEntry = await makeRequest({
    method: "GET",
    path: `/api/interviews/code/${ivA.linkCode}`
  });
  assert(
    candidateRoomEntry.status === 200 && candidateRoomEntry.data.data.linkCode === ivA.linkCode,
    `Candidate can enter assigned room via public linkCode without recruiter token`
  );

  // --- TEST 7: NOTIFICATIONS ISOLATION ---
  console.log("\n7. Testing Notifications Isolation & IDOR Protection...");

  // Send notification for Account A
  const notifService = require("../server/services/notificationService");
  await notifService.notifyJobCreated({
    userId: userA.id,
    userEmail: userA.email,
    jobTitle: jobA.title,
    dept: jobA.dept,
    jobId: jobA.id
  });

  const notifsA = await makeRequest({
    method: "GET",
    path: "/api/notifications",
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const notifListA = notifsA.data.data || [];
  assert(notifListA.length >= 1, `Account A received notifications: count = ${notifListA.length}`);

  const notifsB = await makeRequest({
    method: "GET",
    path: "/api/notifications",
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  const notifListB = notifsB.data.data || [];
  assert(
    !notifListB.some(n => n.message && n.message.includes(jobA.title)),
    `Account B notification feed contains zero notifications from Account A`
  );
  assert(
    !notifListA.some(n => n.userEmail && n.userEmail.toLowerCase() === emailB.toLowerCase()),
    `Account A notification feed contains zero notifications from Account B`
  );

  // Test IDOR on notification actions (Account B cannot mark as read or delete Account A's notification)
  if (notifListA[0]) {
    const idorNotif = await makeRequest({
      method: "PUT",
      path: `/api/notifications/${notifListA[0].id}/read`,
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert(idorNotif.status === 404, `IDOR Blocked: Account B cannot mark Account A notification as read (HTTP ${idorNotif.status})`);
  }

  // --- TEST 8: DASHBOARD STATS ISOLATION ---
  console.log("\n8. Testing Dashboard Statistics Isolation...");

  const dashA = await makeRequest({
    method: "GET",
    path: "/api/dashboard/stats",
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  const kpisA = dashA.data.data.kpis;
  const totalJobsA = kpisA.find(k => k.label === "Total Jobs")?.value;

  const dashB = await makeRequest({
    method: "GET",
    path: "/api/dashboard/stats",
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  const kpisB = dashB.data.data.kpis;
  const totalJobsB = kpisB.find(k => k.label === "Total Jobs")?.value;

  assert(totalJobsA === "1", `Account A dashboard reports exactly 1 job (found ${totalJobsA})`);
  assert(totalJobsB === "1", `Account B dashboard reports exactly 1 job (found ${totalJobsB})`);

  // --- TEST 9: REPORTS ISOLATION ---
  console.log("\n9. Testing Reports Isolation...");

  const repSummaryA = await makeRequest({
    method: "GET",
    path: "/api/reports/summary",
    headers: { Authorization: `Bearer ${tokenA}` }
  });
  assert(
    repSummaryA.data.data.accountEmail === emailA,
    `Account A report summary strictly bound to Account A email (${repSummaryA.data.data.accountEmail})`
  );

  const repSummaryB = await makeRequest({
    method: "GET",
    path: "/api/reports/summary",
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert(
    repSummaryB.data.data.accountEmail === emailB,
    `Account B report summary strictly bound to Account B email (${repSummaryB.data.data.accountEmail})`
  );

  // --- TEST 10: SETTINGS ISOLATION ---
  console.log("\n10. Testing Settings & Profile Isolation...");

  const updateSetA = await makeRequest({
    method: "PUT",
    path: "/api/settings",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: {
      companyName: "Alpha Exclusive Company",
      preferences: { darkMode: true, jobsPerPage: "50" }
    }
  });
  assert(updateSetA.status === 200, `Account A updated preferences`);

  const getSetB = await makeRequest({
    method: "GET",
    path: "/api/settings",
    headers: { Authorization: `Bearer ${tokenB}` }
  });
  assert(
    getSetB.data.data.companyName !== "Alpha Exclusive Company",
    `Account B settings unaffected by Account A's configuration`
  );

  console.log("\n=================================================================");
  console.log(`🎉 TEST SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log("=================================================================\n");

  server.close();
  if (passedTests === totalTests) {
    console.log("SUCCESS: Account-wise data isolation is 100% verified across all modules!");
    process.exit(0);
  } else {
    console.error("FAILURE: Some isolation assertions failed.");
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Unhandled test runner error:", err);
  process.exit(1);
});
