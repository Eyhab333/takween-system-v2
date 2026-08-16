export const POSITION_CODES = [
  "teacher",
  "administrative_staff",
  "principal",
  "deputy_principal",
  "supervisor",
  "educational_supervisor",
  "administrative_supervisor",
  "supervision_head",
  "supervision_coordinator",
  "hr",
  "finance",
  "ceo",
  "chairman",
  "council_member",
  "executive_assistant",
  "trainee",
  "early_childhood_caregiver",
  "student_support",
  "students_mentor",
  "school_monitor",
  "activity_lead",
  "media_specialist",
  "designer",
  "collector",
  "secretary",
  "platforms_specialist",
  "projects",
  "maintenance",
  "media_manager",
  "athar_center_manager",
  "support_services",
  "center_manager",
] as const;

export type PositionCode = (typeof POSITION_CODES)[number];
export type PositionCardinality = "single" | "multiple";
export type TargetMode = "POSITION" | "PERSON";
export type TargetScope = "same_unit" | "related_unit" | "global";
export type OrgUnitRelationship =
  | "supervision_unit"
  | "executive_unit"
  | "council_unit"
  | "paired_center_unit";

export type PositionMetadata = {
  cardinality: PositionCardinality;
};

export type TargetingRule = {
  id: string;
  senderPositions: readonly PositionCode[];
  targetPositions: readonly PositionCode[];
  scope: TargetScope;
  relationship?: OrgUnitRelationship;
  sourceOrgUnitIds?: readonly string[];
  excludedSourceOrgUnitIds?: readonly string[];
  targetOrgUnitIds?: readonly string[];
  allowedTargetModes: readonly TargetMode[];
  allowSelf?: boolean;
};

export type PositionTarget = {
  mode: "POSITION";
  positionCode: PositionCode;
  orgUnitId?: string;
};

export type PersonTarget = {
  mode: "PERSON";
  uid: string;
};

export type RequestTarget = PositionTarget | PersonTarget;

export type TargetingUser = {
  uid: string;
  name: string | null;
  email: string | null;
  role: string | null;
  orgUnitId: string;
  positionCode: PositionCode;
  requestRecipientKey: string | null;
};

export type ResolvedPositionTarget = {
  mode: "POSITION";
  ruleId: string;
  orgUnitId: string;
  positionCode: PositionCode;
  cardinality: PositionCardinality;
  recipients: TargetingUser[];
};

export type ValidatedTarget = {
  target: RequestTarget;
  ruleId: string;
  recipients: TargetingUser[];
};
