"use client";

import { useEffect, useState } from "react";
import type {
  AppSettings
} from "../../../src/electron/ipc-types";

const EMPTY_SETTINGS: AppSettings = {
  deepseekApiKey: "",
  deepseekBaseUrl: "https://api.deepseek.com",
  deepseekModel: "deepseek-chat",
  vbeeAccessToken: "",
  vbeeAppId: "",
  vbeeWebhookPort: "3001",
  capcutDraftsDir: ""
};

const fieldClassName = [
  "w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3",
  "text-sm text-zinc-100 outline-none ring-fuchsia-400 transition",
  "placeholder:text-zinc-600 focus:ring-2"
].join(" ");
const inputClassName = `mt-2 ${fieldClassName}`;

function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="block">
      <span className="text-sm text-zinc-200">{label}</span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs text-zinc-500">{hint}</span>
      ) : null}
    </label>
  );
}

export function SettingsDialog({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}): React.ReactElement | null {
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const [showSecrets, setShowSecrets] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [choosingDirectory, setChoosingDirectory] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setError(undefined);
    setStatus(undefined);

    if (!window.xamxixiu?.getSettings) {
      setSettings(EMPTY_SETTINGS);
      setError("Settings chỉ dùng trong app desktop.");
      setLoading(false);
      return;
    }

    setLoading(true);

    void window.xamxixiu.getSettings()
      .then((loaded) => {
        if (!cancelled) {
          setSettings(loaded);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setSettings(EMPTY_SETTINGS);
          setError(
            reason instanceof Error
              ? reason.message
              : "Không đọc được settings."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && !saving) {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, saving]);

  if (!open) {
    return null;
  }

  function update(field: keyof AppSettings, value: string): void {
    setSettings((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function chooseDirectory(): Promise<void> {
    setChoosingDirectory(true);
    setError(undefined);
    try {
      const directory = await window.xamxixiu.chooseSettingsDirectory();
      if (directory) {
        update("capcutDraftsDir", directory);
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không chọn được thư mục."
      );
    } finally {
      setChoosingDirectory(false);
    }
  }

  async function onSubmit(
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setStatus(undefined);

    try {
      const result = await window.xamxixiu.saveSettings(settings);
      setSettings(result.settings);
      if (result.tunnelError) {
        setError(
          `Đã lưu settings. Webhook chưa khởi động lại: ${result.tunnelError}`
        );
        return;
      }
      setStatus(
        result.tunnelRestarted
          ? "Đã lưu. Webhook đã được khởi động lại."
          : "Đã lưu settings trên máy này."
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không lưu được settings."
      );
    } finally {
      setSaving(false);
    }
  }

  const secretType = showSecrets ? "text" : "password";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onSubmit={(event) => void onSubmit(event)}
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl border border-white/15 bg-zinc-950 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h3 id="settings-title" className="font-medium">
              Settings
            </h3>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Giá trị đã lưu nằm trên máy này và được dùng thay cho file .env.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40"
          >
            Đóng
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-5 py-5">
          <section className="space-y-4">
            <h4 className="text-xs font-semibold tracking-[0.2em] text-fuchsia-300">
              DEEPSEEK
            </h4>
            <Field label="API key">
              <input
                type={secretType}
                autoComplete="off"
                value={settings.deepseekApiKey}
                disabled={loading || saving}
                onChange={(event) =>
                  update("deepseekApiKey", event.target.value)
                }
                className={inputClassName}
              />
            </Field>
            <Field
              label="Base URL"
              hint="Để trống khi lưu sẽ dùng https://api.deepseek.com."
            >
              <input
                type="url"
                value={settings.deepseekBaseUrl}
                disabled={loading || saving}
                onChange={(event) =>
                  update("deepseekBaseUrl", event.target.value)
                }
                className={inputClassName}
              />
            </Field>
            <Field label="Model" hint="Mặc định deepseek-chat.">
              <input
                type="text"
                value={settings.deepseekModel}
                disabled={loading || saving}
                onChange={(event) =>
                  update("deepseekModel", event.target.value)
                }
                className={inputClassName}
              />
            </Field>
          </section>

          <section className="space-y-4">
            <h4 className="text-xs font-semibold tracking-[0.2em] text-fuchsia-300">
              VBEE
            </h4>
            <Field label="Access token">
              <input
                type={secretType}
                autoComplete="off"
                value={settings.vbeeAccessToken}
                disabled={loading || saving}
                onChange={(event) =>
                  update("vbeeAccessToken", event.target.value)
                }
                className={inputClassName}
              />
            </Field>
            <Field label="App ID">
              <input
                type="text"
                autoComplete="off"
                value={settings.vbeeAppId}
                disabled={loading || saving}
                onChange={(event) =>
                  update("vbeeAppId", event.target.value)
                }
                className={inputClassName}
              />
            </Field>
            <Field
              label="Webhook port"
              hint="App tự chạy cloudflared đi kèm và tạo URL webhook. Không cần cài cloudflared hay điền URL."
            >
              <input
                type="number"
                min={1}
                max={65535}
                value={settings.vbeeWebhookPort}
                disabled={loading || saving}
                onChange={(event) =>
                  update("vbeeWebhookPort", event.target.value)
                }
                className={inputClassName}
              />
            </Field>
          </section>

          <section className="space-y-4">
            <h4 className="text-xs font-semibold tracking-[0.2em] text-fuchsia-300">
              CAPCUT
            </h4>
            <Field
              label="Thư mục drafts"
              hint="CapCut chỉ hiện project nằm trong thư mục drafts của nó. Để trống khi lưu sẽ dùng thư mục mặc định."
            >
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={settings.capcutDraftsDir}
                  disabled={loading || saving}
                  onChange={(event) =>
                    update("capcutDraftsDir", event.target.value)
                  }
                  className={fieldClassName}
                />
                <button
                  type="button"
                  disabled={loading || saving || choosingDirectory}
                  onClick={() => void chooseDirectory()}
                  className="shrink-0 rounded-xl border border-white/15 px-4 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-40"
                >
                  Chọn
                </button>
              </div>
            </Field>
          </section>

          <button
            type="button"
            onClick={() => setShowSecrets((current) => !current)}
            className="text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
          >
            {showSecrets ? "Ẩn secret" : "Hiện secret"}
          </button>

          {error ? (
            <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}
          {status ? (
            <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              {status}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end border-t border-white/10 px-5 py-4">
          <button
            type="submit"
            disabled={loading || saving}
            className="rounded-full bg-fuchsia-400 px-5 py-2 text-sm font-semibold text-fuchsia-950 hover:bg-fuchsia-300 disabled:opacity-40"
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </form>
    </div>
  );
}
