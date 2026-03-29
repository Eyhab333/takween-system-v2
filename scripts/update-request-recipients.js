// scripts/update-request-recipients.js
// تشغيله من التيرمنال:
// node scripts/update-request-recipients.js
require("dotenv").config({ path: ".env.local" }); 

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

// ===== 1) تهيئة Firebase Admin من env =====
function getAdminServices() {
  if (!getApps().length) {
    const rawProjectId =
      process.env.FIREBASE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      "";

    const projectId = rawProjectId.replace(/["',\s]/g, "");
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) {
      console.error("❌ Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
      process.exit(1);
    }

    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  return {
    auth: getAuth(),
    db: getFirestore(),
  };
}

const RECIPIENTS = [
  { key: "chairman",            label: "رئيس المجلس",             number: 1,  email: "pres.tk@qz.org.sa" },
  { key: "ceo",                 label: "المدير التنفيذي",         number: 2,  email: "asalfayez@qz.org.sa" },
  { key: "finance",             label: "المالية",                 number: 3,  email: "a.alhrbi@qz.org.sa" },
  { key: "projects",            label: "المشاريع",                number: 4,  email: "aldawish@qz.org.sa" },
  { key: "maintenance",         label: "الصيانة",                 number: 5,  email: "a.almunifi@qz.org.sa" },
  { key: "hr",                  label: "الموارد البشرية",         number: 6,  email: "kh.alamer@qz.org.sa" },
  { key: "platforms",           label: "المنصات",                 number: 7,  email: "aa.alshaya@qz.org.sa" },
  { key: "collector",           label: "المحصل المالي",           number: 8,  email: "n.alamer@qz.org.sa" },
  { key: "secretary",           label: "السكرتارية",              number: 9,  email: "e.ahmad@qz.org.sa" },
  { key: "media_manager",       label: "مدير الإعلام",            number: 10, email: "m.albahr@qz.org.sa" },
  { key: "designer",            label: "المصممة",                 number: 11, email: "a.aljasir@qz.org.sa" },
  { key: "supervision_head",    label: "رئيس قسم الإشراف",        number: 12, email: "h-alnasser@qz.org.sa" },
  { key: "executive_assistant", label: "مساعدة المدير التنفيذي",  number: 13, email: "halfahad@qz.org.sa" },
  { key: "admin_supervisor",    label: "المشرفة الإدارية",        number: 14, email: "a-almansur@qz.org.sa" },
  { key: "edu_supervisor",      label: "المشرفة التعليمية",       number: 15, email: "f-alhamaad@qz.org.sa" },
  { key: "athar_center",        label: "مركز أثر",                number: 16, email: "bader-a-albader@qz.org.sa" },
  { key: "binaa_center_boys",   label: "مركز بناء بنين",          number: 17, email: "aa.alhumidi@qz.org.sa" },
  { key: "binaa_center_girls",  label: "مركز بناء بنات",          number: 18, email: "t.alamer@qz.org.sa" },
  { key: "mnar_boys_ceo",       label: "مدير منار الريادة بنين",  number: 19, email: "a-s-alkmays@qz.org.sa" },
  { key: "mnar_girls_ceo",      label: "مديرة منار الريادة بنات", number: 20, email: "n.albader@qz.org.sa" },
  { key: "rawda1_ceo",          label: "مديرة الروضة الأولى",     number: 21, email: "a.alhomidi@qz.org.sa" },
  { key: "rawda2_ceo",          label: "مديرة الروضة الثانية",    number: 22, email: "s.alturiqe@qz.org.sa" },
  { key: "rawda3_ceo",          label: "مديرة الروضة الثالثة",    number: 23, email: "s.alnafea@qz.org.sa" },
  { key: "rawda4_ceo",          label: "مديرة الروضة الرابعة",    number: 24, email: "n.alhamiyn@qz.org.sa" },
  { key: "media_programs",      label: "البرامج المصورة",         number: 25, email: "m.alfrraj@qz.org.sa" },
];

// ===== 3) الدالة الأساسية =====
async function run() {
  const { auth, db } = getAdminServices();

  console.log("🔧 بدء تحديث بيانات الجهات (request recipients)...");
  let successCount = 0;
  let notFoundCount = 0;
  const notFoundList = [];

  for (const r of RECIPIENTS) {
    const { email, key, label, number } = r;
    console.log(`\n➡️ معالجة الجهة: ${label} (${key}) — ${email}`);

    if (!email) {
      console.warn("  ⚠️ لا يوجد إيميل معرف لهذه الجهة، سيتم تخطيها.");
      continue;
    }

    try {
      // 1) البحث عن المستخدم في Auth
      const userRecord = await auth.getUserByEmail(email);
      const uid = userRecord.uid;
      console.log(`  ✅ تم العثور على المستخدم (uid = ${uid})`);

      // 2) تحديث custom claims (مع الحفاظ على الموجود)
      const existingClaims = userRecord.customClaims || {};
      const newClaims = {
  ...existingClaims,
  requestRecipientKey: key,
  requestRecipientLabel: label,
  requestRecipientNumber: number,
};


      await auth.setCustomUserClaims(uid, newClaims);
      console.log("  ✅ تم تحديث custom claims بـ requestRecipientKey");

      // 3) تحديث وثيقة /users/{uid}
      const userDocRef = db.collection("users").doc(uid);
      await userDocRef.set(
        {
          email: userRecord.email || email,
          requestRecipientKey: key,
          requestRecipientLabel: label,
          requestRecipientNumber: number,
          // تقدر تضيف حقول أخرى لو حابب
        },
        { merge: true }
      );
      console.log("  ✅ تم تحديث/إنشاء وثيقة المستخدم في /users");

      successCount++;
    } catch (e) {
      console.error(`  ❌ خطأ أثناء معالجة ${email}:`, e.message || e);
      notFoundCount++;
      notFoundList.push({ email, key, label });
    }
  }

  console.log("\n===== ملخص التنفيذ =====");
  console.log(`✅ عدد الجهات التي تم ربطها بنجاح: ${successCount}`);
  console.log(`⚠️ عدد الإيميلات التي لم يتم العثور عليها أو فشلت: ${notFoundCount}`);

  if (notFoundList.length > 0) {
    console.log("\n📌 قائمة لم يتم العثور عليهم / حدث خطأ معهم:");
    for (const nf of notFoundList) {
      console.log(`- ${nf.label} (${nf.key}) — ${nf.email}`);
    }
    console.log("\n💡 راجع هذه الإيميلات في Firebase Console أو أنشئ لهم حسابات ثم أعد تشغيل السكربت.");
  }

  console.log("\n🎉 انتهى السكربت.");
}

// تشغيل الدالة
run().catch((err) => {
  console.error("❌ سكربت فشل بخطأ عام:", err);
  process.exit(1);
});
