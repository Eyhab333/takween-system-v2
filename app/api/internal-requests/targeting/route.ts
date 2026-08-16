export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getRecipientByKey } from "@/lib/internal-requests/recipients";
import {
  RequestTargetingError,
  resolveAllowedPositionTargets,
} from "@/lib/internal-requests/targeting";
import { getAdminServices } from "@/lib/server/firebaseAdmin";

async function getRequesterUid(req: NextRequest): Promise<string | null> {
  const authorization = req.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;

  const { auth } = getAdminServices();
  const decoded = await auth.verifyIdToken(match[1], true);
  return decoded.uid;
}

export async function GET(req: NextRequest) {
  try {
    const senderUid = await getRequesterUid(req);
    if (!senderUid) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const targets = await resolveAllowedPositionTargets(senderUid);
    const recipients = new Map<
      string,
      {
        uid: string;
        label: string;
        role: string | null;
        orgUnitId: string;
        positionCode: string;
        legacyRecipientKey: string | null;
        legacyRecipientNumber: number | null;
        personTarget: { mode: "PERSON"; uid: string };
        positionTargets: Array<{
          mode: "POSITION";
          orgUnitId: string;
          positionCode: string;
          cardinality: "single" | "multiple";
        }>;
      }
    >();

    for (const target of targets) {
      for (const user of target.recipients) {
        const legacyRecipient = user.requestRecipientKey
          ? getRecipientByKey(user.requestRecipientKey)
          : undefined;
        const existing = recipients.get(user.uid);
        const positionTarget = {
          mode: "POSITION" as const,
          orgUnitId: target.orgUnitId,
          positionCode: target.positionCode,
          cardinality: target.cardinality,
        };

        if (existing) {
          if (
            !existing.positionTargets.some(
              (value) =>
                value.orgUnitId === positionTarget.orgUnitId &&
                value.positionCode === positionTarget.positionCode
            )
          ) {
            existing.positionTargets.push(positionTarget);
          }
          continue;
        }

        recipients.set(user.uid, {
          uid: user.uid,
          label: legacyRecipient?.label || user.name || user.email || user.positionCode,
          role: user.role,
          orgUnitId: user.orgUnitId,
          positionCode: user.positionCode,
          legacyRecipientKey: legacyRecipient?.key ?? null,
          legacyRecipientNumber: legacyRecipient?.number ?? null,
          personTarget: { mode: "PERSON", uid: user.uid },
          positionTargets: [positionTarget],
        });
      }
    }

    return Response.json({
      source: "engine",
      recipients: [...recipients.values()],
    });
  } catch (error) {
    if (error instanceof RequestTargetingError) {
      return Response.json(
        { error: error.message, code: "TARGETING_UNAVAILABLE" },
        { status: 422 }
      );
    }

    console.error("internal request targeting lookup failed:", error);
    return Response.json({ error: "Targeting lookup failed" }, { status: 500 });
  }
}
