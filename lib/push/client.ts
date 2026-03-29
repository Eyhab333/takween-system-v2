"use client";

import { getMessaging, isSupported, onMessage } from "firebase/messaging";
import { app } from "@/lib/firebase";

export async function listenForegroundMessages(onPayload: (p: any) => void) {
  if (!(await isSupported())) return () => {};
  const messaging = getMessaging(app);
  return onMessage(messaging, (payload) => onPayload(payload));
}