"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  AppSettings
} from "../../../src/electron/ipc-types";
import {
  DEFAULT_SPEECH_ABBREVIATION_ENTRIES,
  MAX_ABBREVIATION_LENGTH,
  MAX_SPOKEN_LENGTH,
  entriesToTable,
  expandAbbreviations,
  getAbbreviationIssue
} from "../../../src/comments/speech-abbreviations";
import type {
  SpeechAbbreviationEntry
} from "../../../src/comments/speech-abbreviations";
import { useErrorToast } from "./ErrorToast";

const EMPTY_SETTINGS: AppSettings = {
  deepseekApiKey: "",
  deepseekBaseUrl: "https://api.deepseek.com",
  deepseekModel: "deepseek-chat",
  vbeeAccessToken: "",
  vbeeAppId: "",
  vbeeWebhookPort: "3001",
  capcutDraftsDir: ""
};

type TabId =
  | "deepseek"
  | "vbee"
  | "capcut"
  | "threads"
  | "abbreviations";

const TABS: Array<{
  id: TabId;
  label: string;
  hint: string;
}> = [
  {
    id: "deepseek",
    label: "DeepSeek",
    hint: "API key, model"
  },
  {
    id: "vbee",
    label: "Vbee",
    hint: "Voice, webhook"
  },
  {
    id: "capcut",
    label: "CapCut",
    hint: "Thư mục drafts"
  },
  {
    id: "threads",
    label: "Threads",
    hint: "Đăng nhập trình duyệt"
  },
  {
    id: "abbreviations",
    label: "Từ viết tắt",
    hint: "Cách đọc khi tạo voice"
  }
];

interface AbbreviationRow extends SpeechAbbreviationEntry {
  id: number;
}

const fieldClassName = [
  "w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3",
  "text-sm text-zinc-100 outline-none ring-fuchsia-400 transition",
  "placeholder:text-zinc-600 focus:ring-2"
].join(" ");
const inputClassName = `mt-2 ${fieldClassName}`;

function entriesKey(
  entries: SpeechAbbreviationEntry[]
): string {
  return JSON.stringify(
    entries
      .filter(
        (entry) =>
          entry.abbreviation.trim() && entry.spoken.trim()
      )
      .map((entry) => [
        entry.abbreviation.trim().toLowerCase(),
        entry.spoken.trim()
      ])
  );
}

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

function SecretToggle({
  shown,
  onToggle
}: {
  shown: boolean;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-xs text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
    >
      {shown ? "Ẩn secret" : "Hiện secret"}
    </button>
  );
}

export function SettingsDialog({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}): React.ReactElement | null {
  const [activeTab, setActiveTab] =
    useState<TabId>("deepseek");
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const [showSecrets, setShowSecrets] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [choosingDirectory, setChoosingDirectory] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const setError = useErrorToast();
  const [status, setStatus] = useState<string>();
  const [rows, setRows] = useState<AbbreviationRow[]>([]);
  const [savedKey, setSavedKey] = useState(entriesKey([]));
  const [filter, setFilter] = useState("");
  const [newAbbreviation, setNewAbbreviation] = useState("");
  const [newSpoken, setNewSpoken] = useState("");
  const [addError, setAddError] = useState<string>();
  const [sample, setSample] = useState(
    "Ko biết dc ko, đọc cmt k hết luôn"
  );
  const nextRowId = useRef(0);

  function toRows(
    entries: SpeechAbbreviationEntry[]
  ): AbbreviationRow[] {
    return entries.map((entry) => {
      nextRowId.current += 1;

      return { id: nextRowId.current, ...entry };
    });
  }

  const entries = useMemo<SpeechAbbreviationEntry[]>(
    () =>
      rows.map(({ abbreviation, spoken }) => ({
        abbreviation,
        spoken
      })),
    [rows]
  );
  const issues = useMemo(
    () =>
      entries.map((_entry, index) =>
        getAbbreviationIssue(entries, index)
      ),
    [entries]
  );
  const abbreviationsDirty = entriesKey(entries) !== savedKey;
  const sampleResult = useMemo(
    () => expandAbbreviations(sample, entriesToTable(entries)),
    [sample, entries]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setError(undefined);
    setStatus(undefined);
    setActiveTab("deepseek");

    if (!window.xamxixiu?.getSettings) {
      setSettings(EMPTY_SETTINGS);
      setError("Settings chỉ dùng trong app desktop.");
      setLoading(false);
      return;
    }

    setLoading(true);

    void Promise.all([
      window.xamxixiu.getSettings(),
      window.xamxixiu.getSpeechAbbreviations
        ? window.xamxixiu.getSpeechAbbreviations()
        : Promise.resolve(DEFAULT_SPEECH_ABBREVIATION_ENTRIES)
    ])
      .then(([loaded, loadedEntries]) => {
        if (!cancelled) {
          setSettings(loaded);
          setRows(toRows(loadedEntries));
          setSavedKey(entriesKey(loadedEntries));
          setFilter("");
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

  function requestClose(): void {
    if (
      abbreviationsDirty &&
      !window.confirm(
        "Danh sách từ viết tắt chưa được lưu. Đóng và bỏ thay đổi?"
      )
    ) {
      return;
    }

    onClose();
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && !saving) {
        requestClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, saving, abbreviationsDirty]);

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

  async function openLogin(): Promise<void> {
    setLoginOpen(true);
    setError(undefined);
    try {
      await window.xamxixiu.openLoginBrowser();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không mở được trình duyệt đăng nhập."
      );
    } finally {
      setLoginOpen(false);
    }
  }

  function updateRow(
    id: number,
    field: "abbreviation" | "spoken",
    value: string
  ): void {
    setRows((current) =>
      current.map((row) =>
        row.id === id ? { ...row, [field]: value } : row
      )
    );
  }

  function removeRow(id: number): void {
    setRows((current) =>
      current.filter((row) => row.id !== id)
    );
  }

  function addRow(): void {
    const abbreviation = newAbbreviation.trim();
    const spoken = newSpoken.trim();

    if (!abbreviation || !spoken) {
      setAddError("Nhập cả từ viết tắt và cách đọc.");
      return;
    }

    if (/\s/u.test(abbreviation)) {
      setAddError("Từ viết tắt không được chứa khoảng trắng.");
      return;
    }

    if (
      rows.some(
        (row) =>
          row.abbreviation.trim().toLowerCase() ===
          abbreviation.toLowerCase()
      )
    ) {
      setAddError("Từ viết tắt này đã có trong danh sách.");
      return;
    }

    setRows((current) => [
      ...toRows([{ abbreviation, spoken }]),
      ...current
    ]);
    setNewAbbreviation("");
    setNewSpoken("");
    setAddError(undefined);
    setFilter("");
  }

  function resetToDefaults(): void {
    if (
      !window.confirm(
        "Khôi phục danh sách mặc định? Các từ bạn đã thêm hoặc sửa sẽ mất (chỉ áp dụng sau khi bấm Lưu)."
      )
    ) {
      return;
    }

    setRows(toRows(DEFAULT_SPEECH_ABBREVIATION_ENTRIES));
  }

  async function onSubmit(
    event: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setError(undefined);
    setStatus(undefined);

    const issueIndex = issues.findIndex(Boolean);
    if (issueIndex >= 0) {
      setActiveTab("abbreviations");
      setError(
        `Từ viết tắt dòng ${issueIndex + 1}: ${issues[issueIndex]}`
      );
      return;
    }

    setSaving(true);

    try {
      let abbreviationsSaved = false;

      if (abbreviationsDirty) {
        const saved =
          await window.xamxixiu.saveSpeechAbbreviations(entries);
        setRows(toRows(saved));
        setSavedKey(entriesKey(saved));
        abbreviationsSaved = true;
      }

      const result = await window.xamxixiu.saveSettings(settings);
      setSettings(result.settings);
      const abbreviationNote = abbreviationsSaved
        ? " Đã lưu từ viết tắt (áp dụng cho lần capture sau)."
        : "";

      if (result.tunnelError) {
        setError(
          `Đã lưu settings. Webhook chưa khởi động lại: ${result.tunnelError}${abbreviationNote}`
        );
        return;
      }
      setStatus(
        `${
          result.tunnelRestarted
            ? "Đã lưu. Webhook đã được khởi động lại."
            : "Đã lưu settings trên máy này."
        }${abbreviationNote}`
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
  const needle = filter.trim().toLowerCase();
  const visibleRows = rows
    .map((row, index) => ({ row, index }))
    .filter(
      ({ row }) =>
        !needle ||
        row.abbreviation.toLowerCase().includes(needle) ||
        row.spoken.toLowerCase().includes(needle)
    );
  const disabled = loading || saving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onSubmit={(event) => void onSubmit(event)}
        className="flex h-[94vh] w-[96vw] flex-col overflow-hidden rounded-2xl border border-white/15 bg-zinc-950 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-4">
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
            onClick={requestClose}
            disabled={saving}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40"
          >
            Đóng
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Settings tabs"
            className="w-60 shrink-0 space-y-1 overflow-y-auto border-r border-white/10 p-4"
          >
            {TABS.map((tab) => {
              const active = tab.id === activeTab;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    "block w-full rounded-xl px-4 py-3 text-left transition",
                    active
                      ? "bg-fuchsia-400/15 text-fuchsia-100 ring-1 ring-fuchsia-400/40"
                      : "text-zinc-300 hover:bg-white/5"
                  ].join(" ")}
                >
                  <span className="flex items-center justify-between text-sm font-medium">
                    {tab.label}
                    {tab.id === "abbreviations" &&
                    abbreviationsDirty ? (
                      <span
                        title="Chưa lưu"
                        className="h-2 w-2 rounded-full bg-amber-300"
                      />
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {tab.hint}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="min-w-0 flex-1 overflow-y-auto p-8">
            {activeTab === "deepseek" ? (
              <section className="mx-auto max-w-2xl space-y-4">
                <h4 className="text-xs font-semibold tracking-[0.2em] text-fuchsia-300">
                  DEEPSEEK
                </h4>
                <Field label="API key">
                  <input
                    type={secretType}
                    autoComplete="off"
                    value={settings.deepseekApiKey}
                    disabled={disabled}
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
                    disabled={disabled}
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
                    disabled={disabled}
                    onChange={(event) =>
                      update("deepseekModel", event.target.value)
                    }
                    className={inputClassName}
                  />
                </Field>
                <SecretToggle
                  shown={showSecrets}
                  onToggle={() =>
                    setShowSecrets((current) => !current)
                  }
                />
              </section>
            ) : null}

            {activeTab === "vbee" ? (
              <section className="mx-auto max-w-2xl space-y-4">
                <h4 className="text-xs font-semibold tracking-[0.2em] text-fuchsia-300">
                  VBEE
                </h4>
                <Field label="Access token">
                  <input
                    type={secretType}
                    autoComplete="off"
                    value={settings.vbeeAccessToken}
                    disabled={disabled}
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
                    disabled={disabled}
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
                    disabled={disabled}
                    onChange={(event) =>
                      update("vbeeWebhookPort", event.target.value)
                    }
                    className={inputClassName}
                  />
                </Field>
                <SecretToggle
                  shown={showSecrets}
                  onToggle={() =>
                    setShowSecrets((current) => !current)
                  }
                />
              </section>
            ) : null}

            {activeTab === "capcut" ? (
              <section className="mx-auto max-w-2xl space-y-4">
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
                      disabled={disabled}
                      onChange={(event) =>
                        update("capcutDraftsDir", event.target.value)
                      }
                      className={fieldClassName}
                    />
                    <button
                      type="button"
                      disabled={disabled || choosingDirectory}
                      onClick={() => void chooseDirectory()}
                      className="shrink-0 rounded-xl border border-white/15 px-4 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-40"
                    >
                      Chọn
                    </button>
                  </div>
                </Field>
              </section>
            ) : null}

            {activeTab === "threads" ? (
              <section className="mx-auto max-w-2xl space-y-4">
                <h4 className="text-xs font-semibold tracking-[0.2em] text-fuchsia-300">
                  THREADS
                </h4>
                <p className="text-sm leading-6 text-zinc-400">
                  Mở trình duyệt capture để đăng nhập Threads. Đăng nhập
                  xong hãy đóng cửa sổ trình duyệt; phiên đăng nhập được
                  lưu lại cho các lần capture sau. Không thể capture khi
                  cửa sổ này đang mở.
                </p>
                <button
                  type="button"
                  disabled={loginOpen}
                  onClick={() => void openLogin()}
                  className="rounded-xl border border-white/15 px-4 py-3 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-40"
                >
                  {loginOpen
                    ? "Đang mở... đóng cửa sổ trình duyệt khi đăng nhập xong"
                    : "Mở trình duyệt để đăng nhập"}
                </button>
              </section>
            ) : null}

            {activeTab === "abbreviations" ? (
              <section className="flex h-full min-h-0 flex-col gap-5">
                <div>
                  <h4 className="text-xs font-semibold tracking-[0.2em] text-fuchsia-300">
                    TỪ VIẾT TẮT
                  </h4>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                    Khi capture, các từ viết tắt trong comment được đổi
                    thành cách đọc bên dưới (đó là chữ Vbee sẽ đọc). Chỉ
                    đổi khi từ đứng riêng, không phân biệt hoa thường; các
                    chuỗi như <code>50k</code>, <code>t12</code> hay{" "}
                    <code>K-pop</code> được giữ nguyên. Thay đổi chỉ áp
                    dụng cho lần capture sau, không đổi project đã có.
                  </p>
                </div>

                <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
                  <div className="flex min-h-0 flex-col gap-4">
                    <div className="flex flex-wrap items-start gap-2">
                      <input
                        type="text"
                        value={newAbbreviation}
                        maxLength={MAX_ABBREVIATION_LENGTH}
                        disabled={disabled}
                        placeholder="Viết tắt (vd: ko)"
                        onChange={(event) =>
                          setNewAbbreviation(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addRow();
                          }
                        }}
                        className={`${fieldClassName} w-44 shrink-0`}
                      />
                      <input
                        type="text"
                        value={newSpoken}
                        maxLength={MAX_SPOKEN_LENGTH}
                        disabled={disabled}
                        placeholder="Đọc thành (vd: không)"
                        onChange={(event) =>
                          setNewSpoken(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addRow();
                          }
                        }}
                        className={`${fieldClassName} min-w-48 flex-1`}
                      />
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={addRow}
                        className="shrink-0 rounded-xl bg-fuchsia-400 px-5 py-3 text-sm font-semibold text-fuchsia-950 hover:bg-fuchsia-300 disabled:opacity-40"
                      >
                        Thêm
                      </button>
                    </div>
                    {addError ? (
                      <p className="-mt-2 text-xs text-red-300">
                        {addError}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="search"
                        value={filter}
                        placeholder="Tìm trong danh sách..."
                        onChange={(event) =>
                          setFilter(event.target.value)
                        }
                        className={`${fieldClassName} max-w-xs`}
                      />
                      <span className="text-xs text-zinc-500">
                        {needle
                          ? `${visibleRows.length}/${rows.length} từ`
                          : `${rows.length} từ`}
                      </span>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={resetToDefaults}
                        className="ml-auto rounded-xl border border-white/15 px-4 py-2 text-xs text-zinc-300 hover:bg-white/5 disabled:opacity-40"
                      >
                        Khôi phục mặc định
                      </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10">
                      {visibleRows.length === 0 ? (
                        <p className="px-4 py-10 text-center text-sm text-zinc-500">
                          {rows.length === 0
                            ? "Chưa có từ viết tắt nào. Thêm ở ô phía trên."
                            : "Không có từ nào khớp."}
                        </p>
                      ) : (
                        <ul className="divide-y divide-white/5">
                          {visibleRows.map(({ row, index }) => {
                            const issue = issues[index];

                            return (
                              <li
                                key={row.id}
                                className="flex flex-wrap items-start gap-2 px-3 py-2"
                              >
                                <input
                                  type="text"
                                  value={row.abbreviation}
                                  maxLength={MAX_ABBREVIATION_LENGTH}
                                  disabled={disabled}
                                  aria-label="Từ viết tắt"
                                  onChange={(event) =>
                                    updateRow(
                                      row.id,
                                      "abbreviation",
                                      event.target.value
                                    )
                                  }
                                  className={`${fieldClassName} w-44 shrink-0 ${
                                    issue
                                      ? "border-red-400/60"
                                      : ""
                                  }`}
                                />
                                <span
                                  aria-hidden
                                  className="py-3 text-zinc-600"
                                >
                                  →
                                </span>
                                <input
                                  type="text"
                                  value={row.spoken}
                                  maxLength={MAX_SPOKEN_LENGTH}
                                  disabled={disabled}
                                  aria-label="Cách đọc"
                                  onChange={(event) =>
                                    updateRow(
                                      row.id,
                                      "spoken",
                                      event.target.value
                                    )
                                  }
                                  className={`${fieldClassName} min-w-48 flex-1 ${
                                    issue
                                      ? "border-red-400/60"
                                      : ""
                                  }`}
                                />
                                <button
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => removeRow(row.id)}
                                  className="shrink-0 rounded-xl border border-white/10 px-3 py-3 text-xs text-zinc-400 hover:bg-red-400/10 hover:text-red-200 disabled:opacity-40"
                                >
                                  Xóa
                                </button>
                                {issue ? (
                                  <p className="basis-full pl-1 text-xs text-red-300">
                                    {issue}
                                  </p>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>

                  <aside className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                    <h5 className="text-sm font-medium text-zinc-200">
                      Thử nhanh
                    </h5>
                    <p className="text-xs leading-5 text-zinc-500">
                      Dùng danh sách đang sửa (kể cả chưa lưu) để xem
                      kết quả.
                    </p>
                    <textarea
                      value={sample}
                      onChange={(event) =>
                        setSample(event.target.value)
                      }
                      rows={5}
                      className={fieldClassName}
                    />
                    <p className="text-xs text-zinc-500">Kết quả</p>
                    <p className="min-h-[7rem] whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-zinc-100">
                      {sampleResult}
                    </p>
                  </aside>
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-white/10 px-6 py-4">
          <div className="min-w-0 flex-1 text-sm">
            {status ? (
              <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-emerald-200">
                {status}
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={disabled}
            className="shrink-0 rounded-full bg-fuchsia-400 px-6 py-2 text-sm font-semibold text-fuchsia-950 hover:bg-fuchsia-300 disabled:opacity-40"
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </button>
        </div>
      </form>
    </div>
  );
}
