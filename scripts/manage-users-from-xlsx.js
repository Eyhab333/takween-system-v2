// Excel-driven user administration. Safe by default: EXECUTE=true is required to write.
require("dotenv").config({ path: ".env.local" });

const path = require("path");
const XLSX = require("xlsx");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const WORKSHEET_NAME = "إدارة المستخدمين";
const REQUIRED_COLUMNS = [
  "action", "nationalId", "name", "email", "department", "position",
  "orgUnitId", "positionCode", "role", "tags",
];
const ACTIONS = new Set(["ADD", "UPDATE", "DEACTIVATE", "RESET_PASSWORD"]);
const ROLES = new Set(["employee", "hr", "chairman", "ceo", "admin", "superadmin"]);
const ORG_UNIT_IDS = new Set([
  "manar_boys_sayh", "manar_boys_faleh", "manar_girls", "rawdat_1", "rawdat_2", "rawdat_3", "rawdat_4",
  "bena_center_boys", "bena_center_girls", "supervision", "executive_admin",
  "council", "centers", "athar_center",
]);
const POSITION_CODES = new Set([
  "teacher", "administrative_staff", "principal", "deputy_principal", "supervisor",
  "educational_supervisor", "administrative_supervisor", "supervision_head",
  "supervision_coordinator", "hr", "finance", "ceo", "chairman", "council_member",
  "executive_assistant", "trainee", "early_childhood_caregiver", "student_support", "students_mentor",
  "school_monitor", "activity_lead", "media_specialist", "designer", "collector",
  "secretary", "platforms_specialist", "projects", "maintenance", "media_manager",
  "athar_center_manager", "support_services", "center_manager",
]);

const EXECUTE = process.env.EXECUTE === "true";
const INPUT_PATH = path.resolve(process.cwd(), process.argv[2] || "scripts/user-management.xlsx");

function getServices() {
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
  return { auth: getAuth(), db: getFirestore() };
}

function cellValue(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function readRows() {
  const workbook = XLSX.readFile(INPUT_PATH, { raw: false });
  const worksheet = workbook.Sheets[WORKSHEET_NAME];
  if (!worksheet) throw new Error(`Missing required worksheet: ${WORKSHEET_NAME}`);

  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false });
  if (!rows.length) throw new Error(`Worksheet is empty: ${WORKSHEET_NAME}`);
  const header = rows[0].map(cellValue).map((value) => value.replace(/^\uFEFF/, ""));
  if (
    header.length !== REQUIRED_COLUMNS.length ||
    header.some((column, index) => column !== REQUIRED_COLUMNS[index])
  ) {
    throw new Error(`Columns must be exactly: ${REQUIRED_COLUMNS.join(",")}`);
  }

  return rows.slice(1).flatMap((values, index) => {
    const cells = values.map(cellValue);
    if (!cells.some(Boolean)) return [];
    return [{
      rowNumber: index + 2,
      ...Object.fromEntries(header.map((column, columnIndex) => [column, cells[columnIndex] ?? ""])),
    }];
  });
}

function tagsFromCell(value) {
  return Array.from(new Set(value.split("|").map((tag) => tag.trim()).filter(Boolean)));
}

function passwordForNationalId(nationalId) {
  return `${nationalId}@Tk2026`;
}

function validateRow(row) {
  row.action = row.action.trim().toUpperCase();
  if (!ACTIONS.has(row.action)) return "action must be ADD, UPDATE, DEACTIVATE, or RESET_PASSWORD";
  if (!row.email) return "email is required";
  if (!/^\S+@\S+\.\S+$/.test(row.email)) return "email is invalid";
  if (row.orgUnitId && !ORG_UNIT_IDS.has(row.orgUnitId)) return "orgUnitId is invalid";
  if (row.positionCode && !POSITION_CODES.has(row.positionCode)) return "positionCode is invalid";
  if (row.role && !ROLES.has(row.role)) return "role is invalid";
  if (row.nationalId && !/^\d+$/.test(row.nationalId)) return "nationalId must contain digits only";
  if (row.action === "ADD") {
    const required = ["nationalId", "name", "email", "department", "position", "orgUnitId", "positionCode", "role", "tags"];
    const missing = required.filter((field) => !row[field]);
    if (missing.length) return `ADD requires: ${missing.join(", ")}`;
  }
  if (row.action === "RESET_PASSWORD" && !row.nationalId) return "RESET_PASSWORD requires nationalId";
  if (
    row.action === "UPDATE" &&
    !["nationalId", "name", "department", "position", "orgUnitId", "positionCode", "role", "tags"].some(
      (field) => row[field]
    )
  ) return "UPDATE has no supplied fields";
  return null;
}

async function resolveUser(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") return null;
    throw error;
  }
}

function firestoreFields(row, { isAdd }) {
  const fields = {};
  for (const field of ["nationalId", "name", "department", "position", "orgUnitId", "positionCode", "role"]) {
    if (isAdd || row[field]) fields[field] = row[field];
  }
  if (isAdd) fields.email = row.email;
  if (isAdd || row.tags) fields.tags = tagsFromCell(row.tags);
  if (isAdd) fields.employmentStatus = "active";
  fields.updatedAt = FieldValue.serverTimestamp();
  return fields;
}

async function applyRow(services, row) {
  const validationError = validateRow(row);
  if (validationError) return { status: "SKIP", reason: validationError };

  const { auth, db } = services;
  let authUser;
  try { authUser = await resolveUser(auth, row.email); }
  catch (error) { return { status: "SKIP", reason: error.message }; }

  if (row.action === "ADD") {
    const resolvedUser = authUser ? "existing Auth user" : "new Auth user";
    if (!EXECUTE) return { status: "DRY", reason: `ADD ${row.email} (${resolvedUser})` };

    let createdUid = null;
    try {
      if (!authUser) {
        authUser = await auth.createUser({
          email: row.email,
          displayName: row.name,
          password: passwordForNationalId(row.nationalId),
          disabled: false,
        });
        createdUid = authUser.uid;
      } else {
        await auth.updateUser(authUser.uid, { email: row.email, displayName: row.name, disabled: false });
      }
      const claims = authUser.customClaims || {};
      await auth.setCustomUserClaims(authUser.uid, { ...claims, role: row.role });
      await db.collection("users").doc(authUser.uid).set(firestoreFields(row, { isAdd: true }), { merge: true });
      return { status: "OK", reason: `ADD ${row.email}` };
    } catch (error) {
      if (createdUid) await auth.updateUser(createdUid, { disabled: true }).catch(() => {});
      return { status: "ERROR", reason: error.message };
    }
  }

  if (!authUser) return { status: "SKIP", reason: "Auth user not found" };
  if (!EXECUTE) return { status: "DRY", reason: `${row.action} ${row.email}` };

  try {
    if (row.action === "RESET_PASSWORD") {
      await auth.updateUser(authUser.uid, { password: passwordForNationalId(row.nationalId) });
      return { status: "OK", reason: `RESET_PASSWORD ${row.email}` };
    }
    if (row.action === "DEACTIVATE") {
      await auth.updateUser(authUser.uid, { disabled: true });
      await db.collection("users").doc(authUser.uid).set(
        { employmentStatus: "inactive", updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      return { status: "OK", reason: `DEACTIVATE ${row.email}` };
    }

    const authUpdates = {};
    if (row.name) authUpdates.displayName = row.name;
    if (Object.keys(authUpdates).length) await auth.updateUser(authUser.uid, authUpdates);
    if (row.role) await auth.setCustomUserClaims(authUser.uid, { ...(authUser.customClaims || {}), role: row.role });
    const fields = firestoreFields(row, { isAdd: false });
    if (Object.keys(fields).length > 1) {
      await db.collection("users").doc(authUser.uid).set(fields, { merge: true });
    }
    return { status: "OK", reason: `UPDATE ${row.email}` };
  } catch (error) {
    return { status: "ERROR", reason: error.message };
  }
}

async function run() {
  const rows = readRows();
  const services = getServices();
  const totals = { total: rows.length, dry: 0, ok: 0, skip: 0, error: 0 };
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
  console.log(`Workbook: ${INPUT_PATH}; worksheet: ${WORKSHEET_NAME}`);
  for (const row of rows) {
    const result = await applyRow(services, row);
    totals[result.status.toLowerCase()] += 1;
    console.log(`row ${row.rowNumber}: ${result.status} — ${result.reason}`);
  }
  console.log(`Summary: total=${totals.total} dry=${totals.dry} ok=${totals.ok} skipped=${totals.skip} errors=${totals.error}`);
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
