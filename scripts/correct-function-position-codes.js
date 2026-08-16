// Corrects only the seven legacy-function users' positionCode values.
// Safe by default: DRY_RUN=true unless explicitly invoked with DRY_RUN=false.
require("dotenv").config({ path: ".env.local" });

const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const DRY_RUN = process.env.DRY_RUN !== "false";

const FUNCTION_POSITION_CODES = {
  edu_supervisor: "educational_supervisor",
  secretary: "secretary",
  platforms: "platforms_specialist",
  projects: "projects",
  maintenance: "maintenance",
  media_manager: "media_manager",
  athar_center: "athar_center_manager",
};

function getDb() {
  if (!getApps().length) {
    const projectId = (
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      ""
    ).replace(/["',\s]/g, "");
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        "Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY"
      );
    }

    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }

  return getFirestore();
}

async function run() {
  const db = getDb();
  const keys = Object.keys(FUNCTION_POSITION_CODES);
  const snapshot = await db
    .collection("users")
    .where("requestRecipientKey", "in", keys)
    .get();

  const found = new Map(snapshot.docs.map((doc) => [doc.data().requestRecipientKey, doc]));
  const missing = keys.filter((key) => !found.has(key));
  const duplicateKeys = keys.filter(
    (key) => snapshot.docs.filter((doc) => doc.data().requestRecipientKey === key).length !== 1
  );

  if (missing.length || duplicateKeys.length) {
    throw new Error(
      `Refusing to continue: missing=${missing.join(",") || "none"}; duplicates=${
        duplicateKeys.join(",") || "none"
      }`
    );
  }

  const changes = [];
  for (const key of keys) {
    const doc = found.get(key);
    const data = doc.data();

    if (typeof data.orgUnitId !== "string" || !data.orgUnitId) {
      throw new Error(`Refusing to continue: ${key} has no orgUnitId.`);
    }

    const positionCode = FUNCTION_POSITION_CODES[key];
    if (data.positionCode !== positionCode) {
      changes.push({ key, doc, from: data.positionCode ?? null, to: positionCode });
    }
  }

  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "EXECUTE"}`);
  for (const change of changes) {
    console.log(`${change.key}: ${change.from ?? "(missing)"} -> ${change.to}`);
  }

  if (!DRY_RUN && changes.length) {
    const batch = db.batch();
    for (const change of changes) {
      // Intentionally updates only the canonical positionCode field.
      batch.update(change.doc.ref, { positionCode: change.to });
    }
    await batch.commit();
  }

  console.log("Summary:");
  console.log(`  inspected: ${keys.length}`);
  console.log(`  unchanged: ${keys.length - changes.length}`);
  console.log(`  updated: ${DRY_RUN ? 0 : changes.length}`);
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
