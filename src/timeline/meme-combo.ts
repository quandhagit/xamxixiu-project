import type {
  ReactionAnimation,
  ReactionEmotion
} from "../types.js";
import type { TimelineClip } from "./project.js";

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export const BUILTIN_COMBO_IDS = [
  "punch",
  "cringe",
  "shock",
  "soft",
  "none"
] as const;

export type BuiltInComboId = (typeof BUILTIN_COMBO_IDS)[number];

export const CUSTOM_COMBO_ID = "custom";

export type ComboAnimation =
  | "none"
  | "zoom-in"
  | "shake"
  | "slide-up"
  | "slide-left"
  | "fade-in";

export interface MemeCombo {
  id: string;
  name: string;
  builtIn: boolean;
  animation: ComboAnimation;
  animationDuration: number;
  scale: number;
  x: number;
  y: number;
  fadeIn: number;
  sfxOffset: number;
  minDuration: number;
}

export const BUILTIN_COMBOS: MemeCombo[] = [
  {
    id: "punch",
    name: "Punch",
    builtIn: true,
    animation: "zoom-in",
    animationDuration: 0.18,
    scale: 0.72,
    x: 0.08,
    y: -0.12,
    fadeIn: 0.08,
    sfxOffset: 0.12,
    minDuration: 1.2
  },
  {
    id: "cringe",
    name: "Cringe",
    builtIn: true,
    animation: "slide-up",
    animationDuration: 0.28,
    scale: 0.7,
    x: -0.06,
    y: -0.08,
    fadeIn: 0.12,
    sfxOffset: 0,
    minDuration: 1.4
  },
  {
    id: "shock",
    name: "Shock",
    builtIn: true,
    animation: "shake",
    animationDuration: 0.25,
    scale: 0.75,
    x: 0,
    y: 0.04,
    fadeIn: 0.05,
    sfxOffset: 0,
    minDuration: 1
  },
  {
    id: "soft",
    name: "Soft",
    builtIn: true,
    animation: "fade-in",
    animationDuration: 0,
    scale: 0.65,
    x: 0.18,
    y: 0.14,
    fadeIn: 0.25,
    sfxOffset: 0.05,
    minDuration: 1.2
  },
  {
    id: "none",
    name: "None",
    builtIn: true,
    animation: "none",
    animationDuration: 0,
    scale: 1,
    x: 0,
    y: 0,
    fadeIn: 0.3,
    sfxOffset: 0,
    minDuration: 1
  }
];

export type ComboBake = {
  file?: string;
  comboId?: string;
  comboLocked?: boolean;
  animation?: string;
  animationDuration?: number;
  scale?: number;
  x?: number;
  y?: number;
  fadeIn?: number;
  sfxOffset?: number;
};

export function isBuiltInComboId(id: string): id is BuiltInComboId {
  return (BUILTIN_COMBO_IDS as readonly string[]).includes(id);
}

export function getBuiltinCombo(id: BuiltInComboId): MemeCombo {
  const combo = BUILTIN_COMBOS.find((item) => item.id === id);
  if (!combo) {
    return BUILTIN_COMBOS[4];
  }
  return combo;
}

export function findCombo(
  id: string | undefined,
  userCombos: MemeCombo[] = []
): MemeCombo | undefined {
  if (!id || id === CUSTOM_COMBO_ID) {
    return undefined;
  }
  return (
    BUILTIN_COMBOS.find((item) => item.id === id) ??
    userCombos.find((item) => item.id === id)
  );
}

export function comboFromEmotion(
  emotion: ReactionEmotion,
  options: { isVideo?: boolean; previousPunch?: boolean } = {}
): MemeCombo {
  if (options.isVideo) {
    return getBuiltinCombo("none");
  }
  let id: BuiltInComboId;
  switch (emotion) {
    case "laughing":
    case "angry":
      id = "punch";
      break;
    case "cringe":
    case "shy":
      id = "cringe";
      break;
    case "shocked":
    case "surprised":
    case "confused":
    case "scared":
      id = "shock";
      break;
    case "agree":
    case "happy":
      id = "soft";
      break;
    default:
      id = "none";
  }
  if (id === "punch" && options.previousPunch) {
    id = "soft";
  }
  return getBuiltinCombo(id);
}

export function memeCategoryForEmotion(
  emotion: ReactionEmotion
): string | null {
  switch (emotion) {
    case "laughing":
    case "angry":
    case "cringe":
    case "shy":
    case "shocked":
    case "confused":
    case "scared":
    case "agree":
    case "happy":
      return emotion;
    case "surprised":
      return "shocked";
    default:
      return null;
  }
}

export function comboToReactionAnimation(
  animation: ComboAnimation
): ReactionAnimation {
  if (animation === "shake") {
    return "shake-1";
  }
  return animation;
}

export function assignReactionCombos<
  T extends {
    emotion: ReactionEmotion;
    comboId?: string;
    animation?: string;
    duration?: number;
    memeAssetId?: string | null;
    memeCategory?: string | null;
  }
>(
  reactions: T[],
  isVideo: (item: T) => boolean = () => false
): T[] {
  let previousPunch = false;
  return reactions.map((reaction) => {
    const hasMeme = Boolean(reaction.memeAssetId || reaction.memeCategory);
    if (!hasMeme || isVideo(reaction)) {
      if (hasMeme) {
        previousPunch = false;
      }
      return {
        ...reaction,
        comboId: "none",
        animation: "none" as T["animation"]
      };
    }
    const combo = isBuiltInComboId(reaction.comboId ?? "")
      ? reaction.comboId === "punch" && previousPunch
        ? getBuiltinCombo("soft")
        : getBuiltinCombo(reaction.comboId as BuiltInComboId)
      : comboFromEmotion(reaction.emotion, { previousPunch });
    previousPunch = combo.id === "punch";
    return {
      ...reaction,
      comboId: combo.id,
      animation: comboToReactionAnimation(combo.animation) as T["animation"],
      duration: Math.max(reaction.duration ?? 1, combo.minDuration)
    };
  });
}

type AppliedCombo<T extends ComboBake> = T & {
  comboId: string;
  animation: string | undefined;
  animationDuration: number;
  scale: number;
  x: number;
  y: number;
  fadeIn: number;
  sfxOffset: number;
};

export function applyCombo<T extends ComboBake>(
  clip: T,
  combo: MemeCombo
): AppliedCombo<T> {
  return {
    ...clip,
    comboId: combo.id,
    animation: combo.animation === "none" ? undefined : combo.animation,
    animationDuration: combo.animationDuration,
    scale: combo.scale,
    x: combo.x,
    y: combo.y,
    fadeIn: combo.fadeIn,
    sfxOffset: combo.sfxOffset
  };
}

export function clearCombo<T extends ComboBake>(
  clip: T
): AppliedCombo<T> & { comboLocked: false } {
  return {
    ...applyCombo(clip, getBuiltinCombo("none")),
    comboLocked: false
  };
}

function near(left: number | undefined, right: number, epsilon = 0.02): boolean {
  return Math.abs((left ?? 0) - right) <= epsilon;
}

function normalizeAnimation(animation?: string): string {
  if (animation === "shake-1" || animation === "shake-2") {
    return "shake";
  }
  return animation ?? "none";
}

export function comboMatchesBake(
  clip: ComboBake,
  combo: MemeCombo
): boolean {
  const animation = normalizeAnimation(clip.animation);
  const expected =
    combo.animation === "none" ? "none" : combo.animation;
  return (
    animation === expected &&
    near(clip.animationDuration ?? 0, combo.animationDuration) &&
    near(clip.scale ?? 1, combo.scale) &&
    near(clip.x ?? 0, combo.x) &&
    near(clip.y ?? 0, combo.y) &&
    near(clip.fadeIn ?? 0, combo.fadeIn) &&
    near(clip.sfxOffset ?? 0, combo.sfxOffset)
  );
}

export function isCustomCombo(
  clip: ComboBake,
  userCombos: MemeCombo[] = []
): boolean {
  const combo = findCombo(clip.comboId, userCombos);
  if (!combo) {
    return Boolean(
      clip.comboId &&
        clip.comboId !== "none" &&
        clip.comboId !== CUSTOM_COMBO_ID
    );
  }
  return !comboMatchesBake(clip, combo);
}

export function shouldPreserveCombo(
  clip: ComboBake,
  userCombos: MemeCombo[] = []
): boolean {
  return Boolean(
    clip.comboLocked || isCustomCombo(clip, userCombos)
  );
}

export function copyComboBake<T extends ComboBake>(
  target: T,
  source: ComboBake
): T {
  return {
    ...target,
    comboId: source.comboId,
    comboLocked: source.comboLocked,
    animation: source.animation,
    animationDuration: source.animationDuration,
    scale: source.scale,
    x: source.x,
    y: source.y,
    fadeIn: source.fadeIn,
    sfxOffset: source.sfxOffset
  };
}

export function stampComboFromClips<
  T extends { commentIndex: number; comboId?: string; comboLocked?: boolean }
>(reactions: T[], clips: TimelineClip[]): T[] {
  return reactions.map((reaction) => {
    const clip = clips.find(
      (item) =>
        (item.trackId === "meme" || item.trackId === "video") &&
        item.commentIndex === reaction.commentIndex
    );
    if (!clip) {
      return reaction;
    }
    return {
      ...reaction,
      comboId: clip.comboId ?? reaction.comboId,
      comboLocked: clip.comboLocked ?? reaction.comboLocked
    };
  });
}

export function persistBuiltInComboIds<
  T extends { commentIndex: number; comboId?: string }
>(events: T[], reactions: Array<{ commentIndex: number; comboId?: string }>): T[] {
  return events.map((event) => {
    const matched = reactions.find(
      (item) => item.commentIndex === event.commentIndex
    );
    if (
      !matched?.comboId ||
      matched.comboId === "none" ||
      !isBuiltInComboId(matched.comboId)
    ) {
      return event;
    }
    return { ...event, comboId: matched.comboId };
  });
}

export function preserveComboClips(
  next: TimelineClip[],
  previous: TimelineClip[]
): TimelineClip[] {
  return next.map((clip) => {
    if (clip.trackId !== "meme" && clip.trackId !== "video") {
      return clip;
    }
    const prior = previous.find(
      (item) =>
        item.trackId === clip.trackId &&
        item.commentIndex === clip.commentIndex &&
        item.commentIndex !== undefined &&
        item.commentIndex !== null
    );
    if (!prior || !(prior.locked || shouldPreserveCombo(prior))) {
      return clip;
    }
    return copyComboBake(clip, prior);
  });
}

export function normalizeUserCombo(input: unknown): MemeCombo | undefined {
  if (typeof input !== "object" || input === null) {
    return undefined;
  }
  const value = input as Partial<MemeCombo>;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name) {
    return undefined;
  }
  const animation = (
    [
      "none",
      "zoom-in",
      "shake",
      "slide-up",
      "slide-left",
      "fade-in"
    ] as ComboAnimation[]
  ).includes(value.animation as ComboAnimation)
    ? (value.animation as ComboAnimation)
    : "none";
  const id =
    typeof value.id === "string" && value.id.trim() && !isBuiltInComboId(value.id)
      ? value.id.trim()
      : `user-${Date.now()}`;
  return {
    id,
    name,
    builtIn: false,
    animation,
    animationDuration: roundTime(Math.max(0, Number(value.animationDuration) || 0)),
    scale: Math.max(0.2, Math.min(1.2, Number(value.scale) || 1)),
    x: Math.max(-1, Math.min(1, Number(value.x) || 0)),
    y: Math.max(-1, Math.min(1, Number(value.y) || 0)),
    fadeIn: roundTime(Math.max(0, Number(value.fadeIn) || 0)),
    sfxOffset: roundTime(Math.max(0, Number(value.sfxOffset) || 0)),
    minDuration: roundTime(Math.max(0.25, Number(value.minDuration) || 1))
  };
}

export function comboFromClip(clip: ComboBake, name: string): MemeCombo | undefined {
  return normalizeUserCombo({
    name,
    animation: clip.animation ?? "none",
    animationDuration: clip.animationDuration ?? 0,
    scale: clip.scale ?? 1,
    x: clip.x ?? 0,
    y: clip.y ?? 0,
    fadeIn: clip.fadeIn ?? 0,
    sfxOffset: clip.sfxOffset ?? 0,
    minDuration: 1
  });
}
