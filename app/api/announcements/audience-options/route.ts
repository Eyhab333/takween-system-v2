export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import { isActiveAudienceUser } from "@/lib/audience-tokens";
import { SCHOOL_OPTIONS } from "@/lib/announcements/audience";
import { POSITION_LABELS } from "@/lib/internal-requests/creator-label";
import { getAdminServices } from "@/lib/server/firebaseAdmin";

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function orgUnitLabel(data: Record<string, unknown>): string {
  const orgUnitId = asString(data.orgUnitId);
  const schoolKey = asString(data.schoolKey);
  const knownUnit = SCHOOL_OPTIONS.find(
    (option) => option.key === orgUnitId || option.key === schoolKey,
  );
  return knownUnit?.label || asString(data.department) || orgUnitId || schoolKey;
}

function personLabel(data: Record<string, unknown>): string {
  const name = asString(data.name) || "موظف";
  const positionCode = asString(data.positionCode);
  const position = POSITION_LABELS[positionCode] || asString(data.position) || "موظف";
  const organization = orgUnitLabel(data) || "جهة غير محددة";
  return `${name} — ${position} — ${organization}`;
}

async function getSuperadminUid(req: NextRequest): Promise<string | null> {
  const authorization = req.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return null;

  try {
    const { auth } = getAdminServices();
    const decoded = await auth.verifyIdToken(match[1], true);
    return decoded.role === "superadmin" ? decoded.uid : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const requesterUid = await getSuperadminUid(req);
    if (!requesterUid) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { db } = getAdminServices();
    const snapshot = await db.collection("users").get();
    const activeUsers = snapshot.docs.flatMap((document) => {
      const data = document.data() as Record<string, unknown>;
      const positionCode = asString(data.positionCode);
      if (!isActiveAudienceUser(data)) return [];

      return [
        {
          uid: document.id,
          label: personLabel(data),
          positionCode,
          schoolType: asString(data.schoolType),
        },
      ];
    });

    const positionCodes = Array.from(
      new Set(activeUsers.map((user) => user.positionCode).filter(Boolean)),
    ).sort((a, b) => (POSITION_LABELS[a] || a).localeCompare(POSITION_LABELS[b] || b, "ar"));

    const managementGroups = [
      { id: "kindergarten-managers", label: "مديرات الروضات", schoolType: "kg", positionCode: "principal" },
      { id: "school-principals", label: "مديرو المدارس", schoolType: "primary", positionCode: "principal" },
    ].filter((group) =>
      activeUsers.some(
        (user) =>
          user.schoolType === group.schoolType &&
          user.positionCode === group.positionCode,
      ),
    );

    return Response.json({
      positions: positionCodes.map((key) => ({
        key,
        label: POSITION_LABELS[key] || key,
      })),
      managementGroups,
      people: activeUsers
        .map(({ uid, label }) => ({ uid, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "ar")),
    });
  } catch (error) {
    console.error("announcement audience options error:", error);
    return Response.json(
      { error: "Unable to load announcement audience options" },
      { status: 500 },
    );
  }
}
