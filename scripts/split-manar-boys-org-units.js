// Splits only the listed former manar_boys users. Safe by default: DRY_RUN=true.
require("dotenv").config({ path: ".env.local" });

const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const DRY_RUN = process.env.DRY_RUN !== "false";

const SAYH_EMAILS = [
  "a-s-alkmays@qz.org.sa",
  "r.almutawa@qz.org.sa",
  "m.alateeq@qz.org.sa",
  "f.alqashami@qz.org.sa",
  "a.d.alawad@qz.org.sa",
  "students-mentor-syeh@qz.org.sa",
  "q.alfrhud@qz.org.sa",
  "t.alhazzany@qz.org.sa",
  "am.alnutifi@qz.org.sa",
  "f.alfahad@qz.org.sa",
  "as.almulhim@qz.org.sa",
  "a.aljidawii@qz.org.sa",
  "a.attab@qz.org.sa",
  "m.bayoumi@qz.org.sa",
  "aa.alamer@qz.org.sa",
  "k.alsadle@qz.org.sa",
  "a.alsamhan@qz.org.sa",
  "a.h.almasoud@qz.org.sa",
  "a.h.aljaser@qz.org.sa",
  "k-m-ahmd@qz.org.sa",
  "a-mahmood@qz.org.sa",
];

const FALEH_EMAILS = [
  "riadah3@qz.org.sa",
  "ralfaiz@qz.org.sa",
  "a.almotwa@qz.org.sa",
  "students-mentor-faleh@qz.org.sa",
  "mahmood@qz.org.sa",
  "hameed-s@qz.org.sa",
  "m.ali@qz.org.sa",
  "k.alfanisan@qz.org.sa",
  "ma.albader@qz.org.sa",
  "k.s.alhamad@qz.org.sa",
  "sa.alhamad@qz.org.sa",
  "a.alzunidi@qz.org.sa",
  "a-ahmad@qz.org.sa",
  "kh-a-atriqi@qz.org.sa",
  "r-a-atriqi@qz.org.sa",
  "m-f-elfahd@qz.org.sa",
  "kh-m-asyhemi@qz.org.sa",
];

function getDb() {
  if (!getApps().length) {
    const projectId = (process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "")
      .replace(/["',\s]/g, "");
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error("Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
    }
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getFirestore();
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function run() {
  const sayh = new Set(SAYH_EMAILS.map(normalizeEmail));
  const faleh = new Set(FALEH_EMAILS.map(normalizeEmail));
  const overlap = [...sayh].filter((email) => faleh.has(email));
  if (overlap.length) throw new Error(`Email appears in both units: ${overlap.join(", ")}`);

  const planned = [
    ...SAYH_EMAILS.map((email) => ({ email: normalizeEmail(email), orgUnitId: "manar_boys_sayh" })),
    ...FALEH_EMAILS.map((email) => ({ email: normalizeEmail(email), orgUnitId: "manar_boys_faleh" })),
  ];
  const db = getDb();
  const users = await db.collection("users").get();
  const byEmail = new Map();
  for (const user of users.docs) {
    const email = normalizeEmail(user.data().email);
    if (!email) continue;
    const matches = byEmail.get(email) || [];
    matches.push(user);
    byEmail.set(email, matches);
  }

  const changes = [];
  const errors = [];
  for (const item of planned) {
    const matches = byEmail.get(item.email) || [];
    if (matches.length !== 1) {
      errors.push(`${item.email}: ${matches.length ? "duplicate user documents" : "user not found"}`);
      continue;
    }
    const user = matches[0];
    const currentOrgUnitId = user.data().orgUnitId;
    if (!["manar_boys", item.orgUnitId].includes(currentOrgUnitId)) {
      errors.push(`${item.email}: unexpected orgUnitId=${currentOrgUnitId || "(missing)"}`);
      continue;
    }
    if (currentOrgUnitId !== item.orgUnitId) {
      changes.push({ email: item.email, ref: user.ref, to: item.orgUnitId });
    }
  }

  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "EXECUTE"}`);
  for (const change of changes) console.log(`${change.email}: ${change.to}`);
  for (const error of errors) console.error(`ERROR: ${error}`);

  if (!DRY_RUN && errors.length) {
    console.error("Refusing to write because the supplied mapping is not fully safe.");
  } else if (!DRY_RUN && changes.length) {
    const batch = db.batch();
    for (const change of changes) batch.update(change.ref, { orgUnitId: change.to });
    await batch.commit();
  }

  console.log(`Summary: sayh=${SAYH_EMAILS.length} faleh=${FALEH_EMAILS.length} changed=${changes.length} errors=${errors.length}`);
  if (!DRY_RUN && errors.length) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
