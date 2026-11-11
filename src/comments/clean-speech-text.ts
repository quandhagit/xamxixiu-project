const EMOJI_PATTERN =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;

const EXTRA_ICON_PATTERN =
  /[★☆♥♡❤💕💖💗💙💚💛💜💞💓💀🔥😭😂🤣😊😍🥰😎🥺😡💀✨✅❌⚠️▶️◀️]/gu;

export function cleanSpeechText(text: string): string {
  return text
    .replace(EMOJI_PATTERN, " ")
    .replace(EXTRA_ICON_PATTERN, " ")
    .replace(/([\p{L}\p{N}])\1{2,}/gu, "$1")
    .replace(/([.!?…,~;:\-–—])\1+/g, "$1")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+([,.!?…;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export interface SpeechTextDiff {
  index: number;
  before: string;
  after: string;
}

export function diffCleanedSpeechText(
  items: Array<{ text: string }>,
  clean: (text: string) => string = cleanSpeechText
): SpeechTextDiff[] {
  const diffs: SpeechTextDiff[] = [];
  items.forEach((item, index) => {
    const after = clean(item.text);
    if (after !== item.text) {
      diffs.push({
        index,
        before: item.text,
        after
      });
    }
  });
  return diffs;
}

export function applySpeechTextDiffs<T extends { text: string }>(
  items: T[],
  diffs: SpeechTextDiff[],
  acceptedIndexes: number[]
): T[] {
  const accepted = new Set(acceptedIndexes);
  const byIndex = new Map(
    diffs.map((diff) => [diff.index, diff])
  );
  return items.map((item, index) => {
    const diff = byIndex.get(index);
    if (!diff || !accepted.has(index)) {
      return item;
    }
    return {
      ...item,
      text: diff.after
    };
  });
}

export function needsAiSpeechCleanup(text: string): boolean {
  const cleaned = cleanSpeechText(text);
  if (cleaned !== text) {
    return true;
  }
  return /[^\p{L}\p{N}\s.,!?…:;'’"()\-\/]/u.test(text);
}
