export interface Persona {
  id: string;
  name: string;
  giving: string;
  age: string | null;
  dimensions: Record<string, string>;
}

export type AssetType = "email" | "direct_mail" | "website";

export interface Variants {
  assetType: AssetType;
  labelA: string;
  labelB: string;
  copyA: string;
  copyB: string;
  imageA?: string; // data URL — website asset type only
  imageB?: string;
}

export type IntentChoice =
  | "dismiss"
  | "engage_no_gift"
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
  model?: string; // persona-agent model this trial ran under
  order?: "ab" | "ba"; // presentation order shown to this persona
  error?: string;
}

export const ASSET_LABELS: Record<AssetType, string> = {
  email: "Email",
  direct_mail: "Direct mail",
  website: "Website UI",
};

export const INTENT_LABELS: Record<AssetType, Record<IntentChoice, string>> = {
  email: {
    dismiss: "Delete unread",
    engage_no_gift: "Read, no action",
    save_for_later: "Save for later",
    give_small: "Give under $25",
    give_suggested: "Give $25–$100",
    give_more: "Give $100+",
  },
  direct_mail: {
    dismiss: "Toss unopened",
    engage_no_gift: "Read, no action",
    save_for_later: "Set aside",
    give_small: "Give under $25",
    give_suggested: "Give $25–$100",
    give_more: "Give $100+",
  },
  website: {
    dismiss: "Leave the page",
    engage_no_gift: "Browse, no gift",
    save_for_later: "Come back later",
    give_small: "Give under $25",
    give_suggested: "Give $25–$100",
    give_more: "Give $100+",
  },
};

export const INTENT_ORDER: IntentChoice[] = [
  "dismiss",
  "engage_no_gift",
  "save_for_later",
  "give_small",
  "give_suggested",
  "give_more",
];

export const GIVING_ORDER = ["Regular donor", "Occasional", "Rare", "Never"];

// Neutral display labels for the panel's engagement segments (the underlying
// persona attribute is prior giving/engagement frequency).
export const SEGMENT_LABELS: Record<string, string> = {
  "Regular donor": "Regular",
  Occasional: "Occasional",
  Rare: "Rare",
  Never: "Never",
};

export function segmentLabel(g: string): string {
  return SEGMENT_LABELS[g] ?? g;
}
