export const CUSTOM_TABS = [
  {
    id: "comment-capture",
    label: "Comment Capture"
  },
  {
    id: "topic-title",
    label: "Topic Title"
  }
] as const;

export type CustomTabId = (typeof CUSTOM_TABS)[number]["id"];
