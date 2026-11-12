export function isIgnorableStreamClosedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code =
    "code" in error && typeof error.code === "string"
      ? error.code
      : undefined;
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : String(error);
  return (
    code === "ERR_INVALID_STATE" &&
    message.includes("ReadableStream") &&
    message.includes("already closed")
  );
}
