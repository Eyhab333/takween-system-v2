import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

admin.initializeApp();

type UserNotif = {
  title?: string;
  body?: string;
  url?: string;
  read?: boolean;
};

async function getUserTokens(uid: string): Promise<string[]> {
  const snap = await admin.firestore().collection(`users/${uid}/fcmTokens`).get();
  const tokens: string[] = [];
  snap.forEach((doc) => {
    const data = doc.data() as any;
    const t = (typeof data.token === "string" && data.token) || doc.id;
    if (t && !tokens.includes(t)) tokens.push(t);
  });
  return tokens;
}

async function getUnreadCount(uid: string): Promise<number> {
  const q = await admin
    .firestore()
    .collection(`users/${uid}/notifications`)
    .where("read", "==", false)
    .get();
  return q.size;
}

function isInvalidTokenError(code?: string) {
  return (
    code === "messaging/registration-token-not-registered" ||
    code === "messaging/invalid-registration-token"
  );
}

export const pushOnUserNotificationCreate = onDocumentCreated(
  {
    document: "users/{uid}/notifications/{notifId}",
    region: "me-west1", // 2nd gen only :contentReference[oaicite:4]{index=4}
  },
  async (event) => {
    const uid = event.params.uid as string;
    const notifId = event.params.notifId as string;

    const data = (event.data?.data() || {}) as UserNotif;

    const title = data.title?.toString().trim() || "إشعار جديد";
    const body = data.body?.toString().trim() || "";
    const url = data.url?.toString().trim() || "/";

    const tokens = await getUserTokens(uid);
    if (!tokens.length) return;

    const unreadCount = await getUnreadCount(uid);

    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      data: {
        title,
        body,
        url,
        unreadCount: String(unreadCount),
        notifId,
      },
      webpush: {
        notification: {
          title,
          body,
          icon: "/icons/icon-192.png",
        },
        fcmOptions: { link: url },
      },
    });

    const badTokens: string[] = [];
    res.responses.forEach((r, idx) => {
      if (!r.success && isInvalidTokenError((r.error as any)?.code)) {
        badTokens.push(tokens[idx]);
      }
    });

    if (badTokens.length) {
      const batch = admin.firestore().batch();
      badTokens.forEach((t) =>
        batch.delete(admin.firestore().doc(`users/${uid}/fcmTokens/${t}`))
      );
      await batch.commit();
    }

    // اختياري: توثيق نتيجة الإرسال داخل نفس notification doc
    await event.data?.ref.set(
      {
        push: {
          at: admin.firestore.FieldValue.serverTimestamp(),
          successCount: res.successCount,
          failureCount: res.failureCount,
          unreadCount,
          cleanedBadTokens: badTokens.length,
        },
      },
      { merge: true }
    );
  }
);