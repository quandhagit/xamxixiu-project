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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex justify-center p-4">
      <div
        role="status"
        className="pointer-events-auto flex w-full max-w-3xl items-center gap-4 overflow-hidden rounded-2xl border border-fuchsia-400/30 bg-zinc-900/95 px-4 py-3 shadow-2xl backdrop-blur"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm text-zinc-100">
            {statusMessage(status)}
          </p>
          {status.state === "downloading" ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-fuchsia-400 transition-[width]"
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
            className="shrink-0 rounded-full bg-fuchsia-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-fuchsia-400 disabled:cursor-wait disabled:bg-fuchsia-500/50"
          >
            {starting ? "Đang tải…" : label}
          </button>
        ) : null}
        {status.state === "available" || status.state === "error" ? (
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => setHidden(true)}
            className="shrink-0 text-lg leading-none text-zinc-500 hover:text-zinc-200"
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  );
}
