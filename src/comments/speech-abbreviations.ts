import type {
  ThreadComment,
  ThreadData
} from "../types.js";

/**
 * One user-managed mapping: abbreviation -> spoken form.
 */
export interface SpeechAbbreviationEntry {
  abbreviation: string;
  spoken: string;
}

/**
 * Starter table. The real table is managed by the user in
 * Settings > Từ viết tắt (stored per machine); these entries are only the
 * initial content and what "Khôi phục mặc định" restores.
 *
 * Keys are matched as whole words, case-insensitive. A key is only replaced
 * when it stands alone: not inside another word, not glued to a digit
 * ("50k", "t12") and not next to - _ / & ' @ # ("K-pop"). Swear abbreviations
 * are spelled out letter by letter so the voice does not read them as a word.
 */
export const DEFAULT_SPEECH_ABBREVIATIONS: Record<string, string> = {
  k: "không",
  t: "tui",
  cmt: "còm men",
  vcl: "vờ cờ lờ",
  vl: "vờ lờ",
  vkl: "vờ ca lờ",
  clm: "cờ lờ mờ",
  cmm: "cờ mờ mờ",
  đm: "đờ mờ",
  đmm: "đờ mờ mờ",
  đcm: "đờ cờ mờ",
  dcm: "đờ cờ mờ",
  dmm: "đờ mờ mờ",
  ko: "không",
  k0: "không",
  hok: "không",
  khg: "không",
  đc: "được",
  vs: "với",
  vk: "vợ",
  ck: "chồng",
  bt: "bình thường",
  bth: "bình thường",
  mn: "mọi người",
  mng: "mọi người",
  ae: "anh em",
  ntn: "như thế nào",
  j: "gì",
  đt: "điện thoại",
  sdt: "số điện thoại",
  cty: "công ty",
  trc: "trước",
  hnay: "hôm nay",
  hqua: "hôm qua",
  tgian: "thời gian",
  ngta: "người ta",
  bik: "biết",
  wa: "quá",
  iu: "yêu",
  dth: "dễ thương",
  vde: "vấn đề",
  ng: "người",
  ngt: "người ta",
};

// Characters that mean a key is part of a larger token ("K-pop", "Q&A").
const WORD_CHAR = "\\p{L}\\p{N}\\-_/&'’@#";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPattern(
  table: Record<string, string>
): RegExp | undefined {
  const keys = Object.keys(table)
    .filter((key) => key.length > 0)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);

  if (keys.length === 0) {
    return undefined;
  }

  return new RegExp(
    `(?<![${WORD_CHAR}])(${keys.join("|")})(?![${WORD_CHAR}])(?!\\.[\\p{L}\\p{N}])`,
    "giu"
  );
}

function matchCase(
  source: string,
  replacement: string
): string {
  if (source.length > 1 && source === source.toUpperCase()) {
    return replacement.toUpperCase();
  }

  const first = source.charAt(0);

  if (first !== first.toLowerCase()) {
    return (
      replacement.charAt(0).toUpperCase() +
      replacement.slice(1)
    );
  }

  return replacement;
}

export function expandAbbreviations(
  text: string,
  table: Record<string, string> = DEFAULT_SPEECH_ABBREVIATIONS
): string {
  const pattern = buildPattern(table);

  if (!pattern) {
    return text;
  }

  const lookup = new Map(
    Object.entries(table).map(([key, value]) => [
      key.toLowerCase(),
      value
    ])
  );

  return text.replace(pattern, (match) => {
    const replacement = lookup.get(match.toLowerCase());

    return replacement
      ? matchCase(match, replacement)
      : match;
  });
}

function withExpandedText<T extends {
  text: string;
  originalText?: string;
}>(
  item: T,
  table: Record<string, string>
): T {
  const source = item.originalText ?? item.text;
  const expanded = expandAbbreviations(source, table);

  if (expanded === source) {
    return item;
  }

  return {
    ...item,
    text: expanded,
    originalText: source
  };
}

export function expandComment(
  comment: ThreadComment,
  table: Record<string, string> = DEFAULT_SPEECH_ABBREVIATIONS
): ThreadComment {
  return withExpandedText(comment, table);
}

/**
 * Returns a copy of the thread with the post text and every comment rewritten
 * for speech. The input (thread.json) is never modified.
 */
export function expandThread(
  thread: ThreadData,
  table: Record<string, string> = DEFAULT_SPEECH_ABBREVIATIONS
): ThreadData {
  const expanded = withExpandedText(thread, table);

  return {
    ...expanded,
    comments: thread.comments.map((comment) =>
      expandComment(comment, table)
    )
  };
}

export const MAX_ABBREVIATION_LENGTH = 32;
export const MAX_SPOKEN_LENGTH = 200;
export const MAX_ABBREVIATION_ENTRIES = 2000;

export const DEFAULT_SPEECH_ABBREVIATION_ENTRIES: SpeechAbbreviationEntry[] =
  Object.entries(DEFAULT_SPEECH_ABBREVIATIONS).map(
    ([abbreviation, spoken]) => ({ abbreviation, spoken })
  );

/** Lookup table used by expandAbbreviations. Keys are lowercased. */
export function entriesToTable(
  entries: SpeechAbbreviationEntry[]
): Record<string, string> {
  const table: Record<string, string> = {};

  for (const entry of entries) {
    const key = entry.abbreviation.trim().toLowerCase();
    const spoken = entry.spoken.trim();

    if (key && spoken) {
      table[key] = spoken;
    }
  }

  return table;
}

/**
 * Describes what is wrong with the row at `index`, or undefined when it is
 * valid. Rows that are completely empty are valid (they are dropped on save).
 */
export function getAbbreviationIssue(
  entries: SpeechAbbreviationEntry[],
  index: number
): string | undefined {
  const entry = entries[index];

  if (!entry) {
    return undefined;
  }

  const abbreviation = entry.abbreviation.trim();
  const spoken = entry.spoken.trim();

  if (!abbreviation && !spoken) {
    return undefined;
  }

  if (!abbreviation) {
    return "Thiếu từ viết tắt.";
  }

  if (!spoken) {
    return "Thiếu cách đọc.";
  }

  if (/\s/u.test(abbreviation)) {
    return "Từ viết tắt không được chứa khoảng trắng.";
  }

  if (abbreviation.length > MAX_ABBREVIATION_LENGTH) {
    return `Từ viết tắt tối đa ${MAX_ABBREVIATION_LENGTH} ký tự.`;
  }

  if (spoken.length > MAX_SPOKEN_LENGTH) {
    return `Cách đọc tối đa ${MAX_SPOKEN_LENGTH} ký tự.`;
  }

  const key = abbreviation.toLowerCase();
  const first = entries.findIndex(
    (candidate) =>
      candidate.abbreviation.trim().toLowerCase() === key
  );

  if (first !== index) {
    return "Từ viết tắt này đã có ở dòng phía trên.";
  }

  return undefined;
}

/**
 * Validates untrusted input (settings file or IPC payload). Drops empty rows,
 * lowercases and trims abbreviations, and throws on the first invalid row.
 */
export function normalizeAbbreviationEntries(
  input: unknown
): SpeechAbbreviationEntry[] {
  if (!Array.isArray(input)) {
    throw new Error("Danh sách từ viết tắt không hợp lệ.");
  }

  if (input.length > MAX_ABBREVIATION_ENTRIES) {
    throw new Error(
      `Tối đa ${MAX_ABBREVIATION_ENTRIES} từ viết tắt.`
    );
  }

  const entries: SpeechAbbreviationEntry[] = input.map(
    (item) => {
      const record =
        typeof item === "object" && item !== null
          ? (item as Record<string, unknown>)
          : {};

      return {
        abbreviation:
          typeof record.abbreviation === "string"
            ? record.abbreviation
            : "",
        spoken:
          typeof record.spoken === "string"
            ? record.spoken
            : ""
      };
    }
  );

  for (let index = 0; index < entries.length; index++) {
    const issue = getAbbreviationIssue(entries, index);

    if (issue) {
      throw new Error(
        `Từ viết tắt dòng ${index + 1}: ${issue}`
      );
    }
  }

  return entries
    .filter(
      (entry) =>
        entry.abbreviation.trim() && entry.spoken.trim()
    )
    .map((entry) => ({
      abbreviation: entry.abbreviation.trim().toLowerCase(),
      spoken: entry.spoken.trim()
    }));
}
