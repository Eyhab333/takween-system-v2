export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  getRecipientByKey,
  type RequestRecipientKey,
} from "@/lib/internal-requests/recipients";
import {
  RequestTargetingError,
  resolveAllowedPositionTargets,
  validateRequestTarget,
} from "@/lib/internal-requests/targeting";
import type { RequestTarget } from "@/lib/internal-requests/targeting";
import { getAdminServices } from "@/lib/server/firebaseAdmin";

type ForwardTarget = {
  uid: string;
  role: string | null;
  recipientKey: RequestRecipientKey | null;
  recipientLabel: string;
};

async function getRequester(req: NextRequest) {
  const authorization = req.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;

  const { auth } = getAdminServices();
  const decoded = await auth.verifyIdToken(match[1], true);
  return {
    uid: decoded.uid,
    role: (decoded.role as string | undefined) ?? "employee",
    recipientKey:
      (decoded.requestRecipientKey as RequestRecipientKey | undefined) ?? null,
  };
}

function isRequestTarget(value: unknown): value is RequestTarget {
  if (!value || typeof value !== "object") return false;
  const target = value as Record<string, unknown>;
  return (
    (target.mode === "PERSON" && typeof target.uid === "string") ||
    (target.mode === "POSITION" &&
      typeof target.positionCode === "string" &&
      (target.orgUnitId === undefined || typeof target.orgUnitId === "string"))
  );
}

async function resolveEngineTarget(
  senderUid: string,
  target: RequestTarget
): Promise<ForwardTarget> {
  const { db } = getAdminServices();
  const validated = await validateRequestTarget(senderUid, target);
  if (validated.recipients.length !== 1) {
    throw new RequestTargetingError(
      "Forwarding requires one resolved recipient."
    );
  }

  const recipient = validated.recipients[0];
  const recipientKey = recipient.requestRecipientKey
    ? (recipient.requestRecipientKey as RequestRecipientKey)
    : null;
  const legacyRecipient = recipientKey ? getRecipientByKey(recipientKey) : undefined;

  const recipientDoc = await db.collection("users").doc(recipient.uid).get();
  return {
    uid: recipient.uid,
    role: recipientDoc.exists
      ? ((recipientDoc.data() as { role?: string }).role ?? null)
      : null,
    recipientKey,
    recipientLabel:
      legacyRecipient?.label || recipient.name || recipient.email || recipient.positionCode,
  };
}

export async function POST(req: NextRequest) {
  try {
    const requester = await getRequester(req);
    if (!requester) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const requestId = typeof body?.requestId === "string" ? body.requestId.trim() : "";
    const comment = typeof body?.comment === "string" ? body.comment.trim() : "";
    if (!requestId) {
      return Response.json({ error: "Missing requestId" }, { status: 400 });
    }

    const { db } = getAdminServices();
    const senderDoc = await db.collection("users").doc(requester.uid).get();
    const senderData = senderDoc.exists
      ? (senderDoc.data() as { requestRecipientKey?: string })
      : null;
    const senderKey =
      (senderData?.requestRecipientKey as RequestRecipientKey | undefined) ??
      requester.recipientKey ??
      null;

    try {
      await resolveAllowedPositionTargets(requester.uid);
    } catch (error) {
      if (!(error instanceof RequestTargetingError)) throw error;
      return Response.json({ error: error.message }, { status: 422 });
    }

    let target: ForwardTarget | null = null;
    if (!isRequestTarget(body?.target)) {
      return Response.json({ error: "Invalid forward target" }, { status: 400 });
    }

    try {
      target = await resolveEngineTarget(requester.uid, body.target);
    } catch (error) {
      if (error instanceof RequestTargetingError) {
        return Response.json({ error: error.message }, { status: 403 });
      }
      throw error;
    }

    if (!target) {
      return Response.json({ error: "Forward target is unavailable" }, { status: 422 });
    }

    const resolvedTarget = target;
    const requestRef = db.collection("internalRequests").doc(requestId);
    const now = Timestamp.now();
    await db.runTransaction(async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) throw new Error("Request not found");

      const requestData = requestSnap.data() as Record<string, unknown>;
      const status = typeof requestData.status === "string" ? requestData.status : "open";
      if (["approved", "rejected", "closed", "cancelled"].includes(status)) {
        throw new Error("Request is no longer actionable");
      }

      const currentAssigneeUid = requestData.currentAssigneeUid;
      const currentAssigneeKey = requestData.currentAssigneeKey;
      if (
        currentAssigneeUid !== requester.uid &&
        (!senderKey || currentAssigneeKey !== senderKey)
      ) {
        throw new Error("Only the current assignee can forward this request");
      }

      const actions = Array.isArray(requestData.actions) ? requestData.actions : [];
      transaction.update(requestRef, {
        status: "in_progress",
        currentAssignee: { uid: resolvedTarget.uid, role: resolvedTarget.role },
        currentAssigneeUid: resolvedTarget.uid,
        currentAssigneeKey: resolvedTarget.recipientKey,
        currentAssigneeLabel: resolvedTarget.recipientLabel,
        actions: [
          ...actions,
          {
            at: now,
            fromUid: requester.uid,
            fromRole: requester.role,
            toUid: resolvedTarget.uid,
            toRole: resolvedTarget.role,
            toRecipientKey: resolvedTarget.recipientKey,
            actionType: "forwarded",
            comment,
          },
        ],
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return Response.json({ ok: true, recipientKey: resolvedTarget.recipientKey });
  } catch (error) {
    console.error("internal request forwarding failed:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Forwarding failed" },
      { status: 500 }
    );
  }
}
