export interface Persona {
  id: string;
  name: string;
  giving: string;
  age: string | null;
  dimensions: Record<string, string>;
}

export interface Variants {
  labelA: string;
  labelB: string;
  copyA: string;
  copyB: string;
}

export type IntentChoice =
  | "delete_unread"
  | "read_no_action"
  | "save_for_later"
  | "give_small"
  | "give_suggested"
  | "give_more";

export interface PersonaResult {
  personaId: string;
  personaName: string;
  giving: string;
  intentA: IntentChoice;
  intentB: IntentChoice;
  resonanceA: number; // 1-5
  resonanceB: number; // 1-5
  trust: "version_a" | "version_b" | "both_equal" | "neither";
  winner: "send_a" | "send_b" | "either" | "neither";
  rationale: string;
  baselineIntent: number; // 1-5
  error?: string;
}

export const INTENT_LABELS: Record<IntentChoice, string> = {
  delete_unread: "Delete unread",
  read_no_action: "Read, no action",
  save_for_later: "Save for later",
  give_small: "Give under $25",
  give_suggested: "Give $25–$100",
  give_more: "Give $100+",
};

export const INTENT_ORDER: IntentChoice[] = [
  "delete_unread",
  "read_no_action",
  "save_for_later",
  "give_small",
  "give_suggested",
  "give_more",
];

export const GIVING_ORDER = ["Regular donor", "Occasional", "Rare", "Never"];
