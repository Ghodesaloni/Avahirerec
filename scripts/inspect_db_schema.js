const { getPool } = require("../server/db/postgres");

async function check() {
  const p = getPool();
  if (!p) {
    console.log("No pool available");
    process.exit(1);
  }
  const tables = ['users', 'jobs', 'candidates', 'interviews', 'resumes', 'notifications', 'app_settings', 'smtp_emails', 'email_sent'];
  for (const t of tables) {
    try {
      const res = await p.query(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
        [t]
      );
      console.log(`\nTable public.${t}:`);
      console.log("Columns:", res.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));
      const cnt = await p.query(`SELECT COUNT(*) FROM public.${t}`);
      console.log("Record count:", cnt.rows[0].count);
    } catch (e) {
      console.log(`Table public.${t} error:`, e.message);
    }
  }

  // Also check existing users in public.users
  try {
    const users = await p.query("SELECT id, email, full_name, company FROM public.users");
    console.log("\nExisting users in public.users:");
    console.table(users.rows);
  } catch (e) {
    console.log("Error querying users:", e.message);
  }

  process.exit(0);
}

check().catch(console.error);
