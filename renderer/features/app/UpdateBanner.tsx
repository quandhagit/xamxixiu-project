"use client";

import {
  useEffect,
  useState
} from "react";

import type {
  UpdaterStatus
} from "../../../src/electron/ipc-types";

function statusMessage(status: UpdaterStatus): string {
  if (status.state === "available") {
    return `Đã có bản ${status.version}. Bấm Cập nhật để tải và cài.`;
  }
  if (status.state === "downloading") {
    return `Đang tải bản ${status.version}… ${status.percent}%`;
  }
  if (status.state === "ready") {
    return `Đã tải xong bản ${status.version}. App sẽ khởi động lại.`;
  }
  return status.message;
}

function actionLabel(status: UpdaterStatus): string | undefined {
  if (status.state === "available" || status.state === "error") {
    return status.state === "error" ? "Thử lại" : "Cập nhật";
  }
  if (status.state === "ready") {
    return "Khởi động lại";
  }
  return undefined;
}

export function UpdateBanner(): React.ReactElement | null {
  const [status, setStatus] = useState<UpdaterStatus | null>(null);
  const [hidden, setHidden] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!window.xamxixiu?.getUpdaterStatus) {
      return;
    }
    void window.xamxixiu.getUpdaterStatus().then((current) => {
      if (current) {
        setStatus(current);
      }
    });
    return window.xamxixiu.onUpdaterStatus((next) => {
      setHidden(false);
      setStarting(false);
      setStatus(next);
    });
  }, []);

  if (!status || hidden) {
    return null;
  }

  const label = actionLabel(status);
  const canStart =
    Boolean(label) &&
    !starting &&
    status.state !== "downloading";
  const percent =
    status.state === "downloading" ? status.percent : 0;

  async function onStart(): Promise<void> {
    if (!canStart) {
      return;
    }
    setStarting(true);
    try {
      await window.xamxixiu.startUpdate();
    } catch (reason: unknown) {
      setStarting(false);
      setStatus({
        state: "error",
        message: reason instanceof Error
          ? reason.message
          : "Không bắt đầu được bản cập nhật."
      });
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex justify-center p-3">
      <div
        role="status"
        className="pointer-events-auto flex w-full max-w-3xl items-center gap-3 overflow-hidden rounded-lg border border-line bg-elevated px-3 py-2"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-ink">
            {statusMessage(status)}
          </p>
          {status.state === "downloading" ? (
            <div className="mt-1.5 h-1 overflow-hidden rounded-sm bg-panel">
              <div
                className="h-full bg-accent transition-[width]"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
        </div>
        {label ? (
          <button
            type="button"
            disabled={!canStart}
            onClick={() => {
              void onStart();
            }}
            className="inline-flex h-7 shrink-0 items-center rounded-md bg-accent px-2.5 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-wait disabled:opacity-40"
          >
            {starting ? "Đang tải…" : label}
          </button>
        ) : null}
        {status.state === "available" || status.state === "error" ? (
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => setHidden(true)}
            className="shrink-0 text-ink-3 hover:text-ink"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}
