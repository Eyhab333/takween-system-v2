import { getAdminServices } from "@/lib/server/firebaseAdmin";

import { POSITION_METADATA, isPositionCode } from "./position-metadata";
import { TARGETING_RULES } from "./rules";
import type {
  OrgUnitRelationship,
  PositionCode,
  RequestTarget,
  ResolvedPositionTarget,
  TargetingRule,
  TargetingUser,
  ValidatedTarget,
} from "./types";

const RELATED_UNIT_IDS: Record<
  Exclude<OrgUnitRelationship, "paired_center_unit">,
  string
> = {
  supervision_unit: "supervision",
  executive_unit: "executive_admin",
  council_unit: "council",
};

const PAIRED_CENTER_UNIT_IDS: Record<string, string> = {
  bena_center_girls: "bena_center_boys",
  bena_center_boys: "bena_center_girls",
};

export class RequestTargetingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestTargetingError";
  }
}

function asTargetingUser(uid: string, data: Record<string, unknown>): TargetingUser | null {
  const orgUnitId = data.orgUnitId;
  const positionCode = data.positionCode;

  if (typeof orgUnitId !== "string" || !orgUnitId || !isPositionCode(positionCode)) {
    return null;
  }

  return {
    uid,
    name: typeof data.name === "string" ? data.name : null,
    email: typeof data.email === "string" ? data.email : null,
    role: typeof data.role === "string" ? data.role : null,
    orgUnitId,
    positionCode,
    tags: Array.isArray(data.tags)
      ? data.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    requestRecipientKey:
      typeof data.requestRecipientKey === "string" && data.requestRecipientKey
        ? data.requestRecipientKey
        : null,
  };
}

function isActiveTargetingUser(data: Record<string, unknown>) {
  return (
    data.employmentStatus !== "inactive" &&
    data.active !== false &&
    data.disabled !== true &&
    data.status !== "inactive"
  );
}

async function loadTargetingUsers(): Promise<TargetingUser[]> {
  const { db } = getAdminServices();
  const snapshot = await db.collection("users").get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as Record<string, unknown> }))
    .filter(({ data }) => isActiveTargetingUser(data))
    .map(({ id, data }) => asTargetingUser(id, data))
    .filter((user): user is TargetingUser => user !== null);
}

function allowedUnitIds(sender: TargetingUser, rule: TargetingRule): string[] {
  if (rule.scope === "same_unit") return [sender.orgUnitId];
  if (rule.scope === "global") return [];
  if (!rule.relationship) {
    throw new RequestTargetingError(`Rule ${rule.id} is missing a relationship.`);
  }
  if (rule.relationship === "paired_center_unit") {
    const relatedUnitId = PAIRED_CENTER_UNIT_IDS[sender.orgUnitId];
    return relatedUnitId ? [relatedUnitId] : [];
  }
  return [RELATED_UNIT_IDS[rule.relationship]];
}

function recipientsForRule(
  sender: TargetingUser,
  rule: TargetingRule,
  users: TargetingUser[]
): TargetingUser[] {
  const unitIds = allowedUnitIds(sender, rule);

  const recipients = users.filter((candidate) => {
    if (!rule.targetPositions.includes(candidate.positionCode)) return false;
    if (rule.targetTags && !rule.targetTags.every((tag) => candidate.tags.includes(tag))) {
      return false;
    }
    if (!rule.allowSelf && candidate.uid === sender.uid) return false;
    if (rule.targetOrgUnitIds && !rule.targetOrgUnitIds.includes(candidate.orgUnitId)) {
      return false;
    }
    return rule.scope === "global" || unitIds.includes(candidate.orgUnitId);
  });

  for (const positionCode of rule.targetPositions) {
    if (POSITION_METADATA[positionCode].cardinality !== "single") continue;

    const holdersByUnit = new Map<string, number>();
    for (const candidate of recipients) {
      if (candidate.positionCode !== positionCode) continue;
      holdersByUnit.set(
        candidate.orgUnitId,
        (holdersByUnit.get(candidate.orgUnitId) ?? 0) + 1
      );
    }

    if ([...holdersByUnit.values()].some((holderCount) => holderCount > 1)) {
      throw new RequestTargetingError(
        `Rule ${rule.id} resolved multiple holders for single position ${positionCode} in one unit.`
      );
    }
  }

  return recipients;
}

function rulesForSender(sender: TargetingUser): TargetingRule[] {
  const matchingRules = TARGETING_RULES.filter((rule) => {
    if (!rule.senderPositions.includes(sender.positionCode)) return false;
    if (rule.senderTags && !rule.senderTags.every((tag) => sender.tags.includes(tag))) {
      return false;
    }
    if (rule.sourceOrgUnitIds && !rule.sourceOrgUnitIds.includes(sender.orgUnitId)) {
      return false;
    }
    return !rule.excludedSourceOrgUnitIds?.includes(sender.orgUnitId);
  });

  const tagRules = matchingRules.filter((rule) => rule.senderTags?.length);
  return tagRules.length > 0
    ? tagRules
    : matchingRules.filter((rule) => !rule.senderTags?.length);
}

function findSender(users: TargetingUser[], senderUid: string): TargetingUser {
  const sender = users.find((user) => user.uid === senderUid);
  if (!sender) {
    throw new RequestTargetingError(
      "Sender lacks valid orgUnitId and positionCode targeting fields."
    );
  }
  return sender;
}

export async function resolveAllowedPositionTargets(
  senderUid: string
): Promise<ResolvedPositionTarget[]> {
  const users = await loadTargetingUsers();
  const sender = findSender(users, senderUid);
  const resolved: ResolvedPositionTarget[] = [];

  for (const rule of rulesForSender(sender)) {
    if (!rule.allowedTargetModes.includes("POSITION")) continue;
    const recipients = recipientsForRule(sender, rule, users);
    for (const positionCode of rule.targetPositions) {
      const positionRecipients = recipients.filter(
        (candidate) => candidate.positionCode === positionCode
      );

      for (const orgUnitId of new Set(positionRecipients.map((user) => user.orgUnitId))) {
        resolved.push({
          mode: "POSITION",
          ruleId: rule.id,
          orgUnitId,
          positionCode,
          cardinality: POSITION_METADATA[positionCode].cardinality,
          recipients: positionRecipients.filter((user) => user.orgUnitId === orgUnitId),
        });
      }
    }
  }

  return resolved;
}

export async function resolveAllowedPersonTargets(senderUid: string) {
  const users = await loadTargetingUsers();
  const sender = findSender(users, senderUid);
  const resolved: Array<{ ruleId: string; recipient: TargetingUser }> = [];

  for (const rule of rulesForSender(sender)) {
    if (!rule.allowedTargetModes.includes("PERSON")) continue;
    for (const recipient of recipientsForRule(sender, rule, users)) {
      resolved.push({ ruleId: rule.id, recipient });
    }
  }

  return resolved;
}

export async function validateRequestTarget(
  senderUid: string,
  target: RequestTarget
): Promise<ValidatedTarget> {
  const users = await loadTargetingUsers();
  const sender = findSender(users, senderUid);

  for (const rule of rulesForSender(sender)) {
    if (!rule.allowedTargetModes.includes(target.mode)) continue;
    const recipients = recipientsForRule(sender, rule, users);

    if (target.mode === "PERSON") {
      const recipient = recipients.find((candidate) => candidate.uid === target.uid);
      if (recipient) return { target, ruleId: rule.id, recipients: [recipient] };
      continue;
    }

    if (!rule.targetPositions.includes(target.positionCode)) continue;
    const positionRecipients = recipients.filter(
      (candidate) =>
        candidate.positionCode === target.positionCode &&
        (!target.orgUnitId || candidate.orgUnitId === target.orgUnitId)
    );

    if (positionRecipients.length > 0) {
      return { target, ruleId: rule.id, recipients: positionRecipients };
    }
  }

  throw new RequestTargetingError("Target is outside the sender's permitted scope.");
}

export function getPositionCardinality(positionCode: PositionCode) {
  return POSITION_METADATA[positionCode].cardinality;
}
