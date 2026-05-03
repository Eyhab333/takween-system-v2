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
  
  { key: "edu_platforms",       label: "المنصات التعليمية",       number: 26, email: "m.alfaraj@qz.org.sa" },

{ key: "alshaya_supervisor",        label: "مشرف الإنجليزي",      number: 144, email: "n-alshaya@qz.org.sa" },


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
