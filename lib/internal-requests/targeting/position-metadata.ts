import {
  POSITION_CODES,
  type PositionCode,
  type PositionMetadata,
} from "./types";

export const POSITION_METADATA: Record<PositionCode, PositionMetadata> = {
  teacher: { cardinality: "multiple" },
  administrative_staff: { cardinality: "multiple" },
  principal: { cardinality: "single" },
  deputy_principal: { cardinality: "multiple" },
  supervisor: { cardinality: "multiple" },
  educational_supervisor: { cardinality: "single" },
  administrative_supervisor: { cardinality: "single" },
  supervision_head: { cardinality: "single" },
  supervision_coordinator: { cardinality: "multiple" },
  hr: { cardinality: "single" },
  finance: { cardinality: "single" },
  ceo: { cardinality: "single" },
  chairman: { cardinality: "single" },
  council_member: { cardinality: "multiple" },
  executive_assistant: { cardinality: "single" },
  trainee: { cardinality: "multiple" },
  early_childhood_caregiver: { cardinality: "multiple" },
  student_support: { cardinality: "multiple" },
  students_mentor: { cardinality: "multiple" },
  school_monitor: { cardinality: "multiple" },
  activity_lead: { cardinality: "single" },
  media_specialist: { cardinality: "multiple" },
  designer: { cardinality: "multiple" },
  collector: { cardinality: "single" },
  secretary: { cardinality: "single" },
  platforms_specialist: { cardinality: "single" },
  projects: { cardinality: "single" },
  maintenance: { cardinality: "single" },
  media_manager: { cardinality: "single" },
  athar_center_manager: { cardinality: "single" },
  support_services: { cardinality: "multiple" },
  center_manager: { cardinality: "single" },
};

export function isPositionCode(value: unknown): value is PositionCode {
  return typeof value === "string" && POSITION_CODES.includes(value as PositionCode);
}
