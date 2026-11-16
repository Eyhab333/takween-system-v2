require("dotenv").config({ path: ".env.local" });

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

function getAdminAuth() {
  if (!getApps().length) {
    const rawProjectId =
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      "";

    const projectId = rawProjectId.replace(/["',\s]/g, "");
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        "Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY"
      );
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  return getAuth();
}

async function run() {
  const email = "hr.takweeen@qz.org.sa";
  const role = "hr";

  const auth = getAdminAuth();

  const user = await auth.getUserByEmail(email);

  const existingClaims = user.customClaims || {};

  const newClaims = {
    ...existingClaims,
    role,
  };

  await auth.setCustomUserClaims(user.uid, newClaims);

  console.log("✅ Custom claims updated");
  console.log("Email:", email);
  console.log("UID:", user.uid);
  console.log("Role:", role);
  console.log("Claims:", newClaims);
}

run().catch((error) => {
  console.error("❌ Failed:", error);
  process.exit(1);
});