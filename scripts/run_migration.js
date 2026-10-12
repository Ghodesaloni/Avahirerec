const { initTables, getPool } = require("../server/db/postgres");

async function run() {
  console.log("Running Account-Wise Isolation database migration...");
  await initTables();
  console.log("initTables completed.");

  const p = getPool();
  if (p) {
    const jobs = await p.query("SELECT COUNT(*) FROM public.jobs WHERE user_id IS NOT NULL");
    const cands = await p.query("SELECT COUNT(*) FROM public.candidates WHERE user_id IS NOT NULL");
    const ivs = await p.query("SELECT COUNT(*) FROM public.interviews WHERE user_id IS NOT NULL");
    const resumes = await p.query("SELECT COUNT(*) FROM public.resumes WHERE user_id IS NOT NULL");
    console.log("Backfilled user_id counts:");
    console.log(`- jobs: ${jobs.rows[0].count}`);
    console.log(`- candidates: ${cands.rows[0].count}`);
    console.log(`- interviews: ${ivs.rows[0].count}`);
    console.log(`- resumes: ${resumes.rows[0].count}`);
  }
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
