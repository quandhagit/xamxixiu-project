"use client";

import {
  useCallback,
  useEffect,
  useState
} from "react";

import { cleanErrorMessage } from "./format-error";

interface ToastItem {
  id: number;
  message: string;
}

const TOAST_DURATION_MS = 20000;
const listeners = new Set<(item: ToastItem) => void>();
let nextId = 1;

export function showErrorToast(message: string): void {
  const item = {
    id: nextId++,
    message: cleanErrorMessage(message)
  };

  for (const listener of listeners) {
    listener(item);
  }
}

/**
 * Drop-in replacement for the old `setError` state setter:
 * a string shows a toast, `undefined` is a no-op.
 */
export function useErrorToast(): (
  message: string | undefined
) => void {
  return useCallback((message) => {
    if (message) {
      showErrorToast(message);
    }
  }, []);
}

export function ErrorToastHost(): React.ReactElement {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const listener = (item: ToastItem): void => {
      setItems((current) => [...current.slice(-3), item]);
      window.setTimeout(() => {
        setItems((current) =>
          current.filter((entry) => entry.id !== item.id)
        );
      }, TOAST_DURATION_MS);
    };

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed right-3 top-12 z-[100] flex w-[360px] max-w-[calc(100vw-1.5rem)] flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          role="alert"
          className="pointer-events-auto flex items-start gap-3 rounded-lg border border-danger/30 bg-elevated px-3 py-2 text-[13px] text-danger"
        >
          <span className="flex-1 break-words">
            {item.message}
          </span>
          <button
            type="button"
            aria-label="Đóng"
            onClick={() =>
              setItems((current) =>
                current.filter(
                  (entry) => entry.id !== item.id
                )
              )
            }
            className="text-ink-3 hover:text-ink"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
