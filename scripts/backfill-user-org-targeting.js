// Backfills only orgUnitId and positionCode on existing /users documents.
// Safe by default: DRY_RUN=true unless explicitly invoked with DRY_RUN=false.
require("dotenv").config({ path: ".env.local" });

const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const DRY_RUN = process.env.DRY_RUN !== "false";

const ORG_UNIT_BY_SCHOOL_KEY = new Set([
  "manar_boys",
  "manar_girls",
  "rawdat_1",
  "rawdat_2",
  "rawdat_3",
  "rawdat_4",
  "bena_center_girls",
]);

const ORG_UNIT_BY_DEPARTMENT = {
  "منار الريادة بنين": "manar_boys",
  "منار الريادة بنات": "manar_girls",
  "الروضة الاولى": "rawdat_1",
  "الروضة الأولى": "rawdat_1",
  "الروضة الثانية": "rawdat_2",
  "الروضة الثالثة": "rawdat_3",
  "الروضة الرابعة": "rawdat_4",
  "مركز بناء بنين": "bena_center_boys",
};

const POSITION_CODE_BY_POSITION = {
  "معلم": "teacher",
  "معلمة": "teacher",
  "إدارية": "administrative_staff",
  "اداري": "administrative_staff",
  "اداريه": "administrative_staff",
  "مساعد اداري": "administrative_staff",
  "مساعدة إدارية": "administrative_staff",
  "كاتبة": "administrative_staff",
  "مدير": "principal",
  "مديرة": "principal",
  "وكيلة": "deputy_principal",
  "وكيل نظام": "deputy_principal",
  "وكيل تعليمي": "deputy_principal",
  "مشرف تعليمي": "supervisor",
  "مشرفة تعليمية": "educational_supervisor",
  "مشرفة إدارية": "administrative_supervisor",
  "رئيس الإشراف": "supervision_head",
  "منسقة قيم": "supervision_coordinator",
  "موارد بشرية": "hr",
  "مسؤول مالي": "finance",
  "رئيس تنفيذي": "ceo",
  "رئيس المجلس": "chairman",
  "عضو المجلس": "council_member",
  "مساعدة المدير التنفيذي": "executive_assistant",
  "تمهير": "trainee",
  "حاضنة": "early_childhood_caregiver",
  "رعاية": "student_support",
  "مسؤولة رعاية": "student_support",
  "مرشدة طلابية": "student_support",
  "موجه طلابي": "students_mentor",
  "مراقبة": "school_monitor",
  "رائد نشاط": "activity_lead",
  "رائدة نشاط": "activity_lead",
  "إعلامية": "media_specialist",
  "اعلامي": "media_specialist",
  "مصممة": "designer",
  "محصل": "collector",
  "خدمات مساندة": "support_services",
  "مركز بناء بنات": "center_manager",
  "مركز بناء بنين": "center_manager",
};

const CONFIRMED_USER_OVERRIDES = {
  // Educational-supervision position; legacy placement fields still say school.
  FWViRfIOdkcZThXImV5XTyv12hh1: {
    orgUnitId: "supervision",
    positionCode: "educational_supervisor",
  },
  ndirQstA2NPkRZHIDj9ff3DWgoo2: {
    orgUnitId: "supervision",
    positionCode: "administrative_supervisor",
  },
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

function resolveOrgUnitId(data) {
  if (ORG_UNIT_BY_SCHOOL_KEY.has(data.schoolKey)) return data.schoolKey;
  if (data.unit === "executive") return "executive_admin";
  if (data.unit === "council") return "council";
  if (data.unit === "supervision") return "supervision";
  if (data.schoolKey === "school") return ORG_UNIT_BY_DEPARTMENT[data.department] ?? null;
  return null;
}

function resolveMapping(uid, data) {
  const override = CONFIRMED_USER_OVERRIDES[uid];
  if (override) return override;

  return {
    orgUnitId: resolveOrgUnitId(data),
    positionCode: POSITION_CODE_BY_POSITION[data.position] ?? null,
  };
}

async function run() {
  const db = getDb();
  const users = await db.collection("users").get();
  const changes = [];
  const skipped = [];
  let unchanged = 0;

  for (const user of users.docs) {
    const data = user.data();
    const mapping = resolveMapping(user.id, data);

    if (!mapping.orgUnitId || !mapping.positionCode) {
      skipped.push({
        uid: user.id,
        reason: !mapping.orgUnitId ? "unmapped orgUnitId" : "unmapped positionCode",
      });
      continue;
    }

    if (
      data.orgUnitId === mapping.orgUnitId &&
      data.positionCode === mapping.positionCode
    ) {
      unchanged += 1;
      continue;
    }

    changes.push({ uid: user.id, ...mapping });
  }

  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "EXECUTE"}`);
  if (DRY_RUN) {
    for (const change of changes) {
      console.log(
        `${change.uid}: orgUnitId=${change.orgUnitId}, positionCode=${change.positionCode}`
      );
    }
  }

  // In execute mode, fail before any write if the current data is no longer fully mappable.
  if (!DRY_RUN && skipped.length > 0) {
    console.error("Refusing to write because one or more users could not be mapped.");
  } else if (!DRY_RUN && changes.length > 0) {
    const batch = db.batch();
    for (const change of changes) {
      batch.update(db.collection("users").doc(change.uid), {
        orgUnitId: change.orgUnitId,
        positionCode: change.positionCode,
      });
    }
    await batch.commit();
  }

  const updated = !DRY_RUN && skipped.length === 0 ? changes.length : 0;
  console.log("Summary:");
  console.log(`  total users: ${users.size}`);
  console.log(`  mapped: ${users.size - skipped.length}`);
  console.log(`  unchanged: ${unchanged}`);
  console.log(`  updated: ${updated}`);
  console.log(`  skipped/errors: ${skipped.length}`);

  for (const item of skipped) {
    console.error(`  ${item.uid}: ${item.reason}`);
  }

  if (!DRY_RUN && skipped.length > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
