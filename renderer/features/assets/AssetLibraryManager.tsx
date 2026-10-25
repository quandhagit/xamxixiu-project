"use client";

import {
  useEffect,
  useMemo,
  useState
} from "react";
import type {
  Asset,
  AssetMediaKind,
  AssetType
} from "../../../src/assets/library";
import { AssetPreview } from "./AssetPreview";

type LibraryTab =
  | "meme-image"
  | "meme-video"
  | "sfx"
  | "music"
  | "background";

const TABS: Array<{
  id: LibraryTab;
  label: string;
  type: AssetType;
  mediaKind?: AssetMediaKind;
}> = [
  { id: "meme-image", label: "Meme ảnh", type: "meme", mediaKind: "image" },
  { id: "meme-video", label: "Meme video", type: "meme", mediaKind: "video" },
  { id: "sfx", label: "SFX", type: "sfx" },
  { id: "music", label: "Music", type: "music" },
  { id: "background", label: "Background", type: "background" }
];

function FieldLabel({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

const fieldClassName =
  "w-full rounded border border-white/10 bg-zinc-900 p-2 text-xs";

function matchesTab(asset: Asset, tab: (typeof TABS)[number]): boolean {
  if (asset.type !== tab.type) {
    return false;
  }
  return tab.mediaKind ? asset.mediaKind === tab.mediaKind : true;
}

export function AssetLibraryManager(): React.ReactElement {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tabId, setTabId] = useState<LibraryTab>("meme-image");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const tab = TABS.find((item) => item.id === tabId) ?? TABS[0];

  async function refresh(): Promise<void> {
    setLoading(true);
    try {
      setAssets(await window.xamxixiu.listAssets());
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Không thể tải asset library.");
    } finally {
      setLoading(false);
    }
  }

  async function ensurePreview(id: string): Promise<void> {
    if (!id || previews[id]) {
      return;
    }
    try {
      const source = await window.xamxixiu.getAssetPreview(id);
      setPreviews((current) => (
        current[id] ? current : { ...current, [id]: source }
      ));
    } catch {
      // Preview is optional; metadata editing still works.
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => assets.filter((asset) =>
    matchesTab(asset, tab) &&
    (!category || asset.category === category) &&
    (!query || `${asset.category} ${asset.tags.join(" ")} ${pathLabel(asset)}`
      .toLowerCase().includes(query.toLowerCase()))
  ), [assets, tab, category, query]);

  useEffect(() => {
    for (const asset of filtered) {
      if (asset.mediaKind !== "video") {
        void ensurePreview(asset.id);
      }
    }
  }, [filtered, previews]);

  const categories = [...new Set(
    assets.filter((asset) => matchesTab(asset, tab)).map((asset) => asset.category)
  )].sort();

  async function updateAsset(asset: Asset): Promise<void> {
    setError(undefined);
    try {
      await window.xamxixiu.updateAsset({
        id: asset.id,
        update: {
          category: asset.category,
          tags: asset.tags,
          intensity: asset.intensity,
          spec: asset.spec
        }
      });
      await refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Không thể cập nhật asset.");
    }
  }

  async function deleteAsset(asset: Asset): Promise<void> {
    setError(undefined);
    try {
      const result = await window.xamxixiu.deleteAsset(asset.id);
      if (!result.deleted) {
        setError(`Asset đang được dùng bởi: ${result.projectReferences.join(", ")}`);
        return;
      }
      await refresh();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Không thể xóa asset.");
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      {error && (
        <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Local asset library</h3>
          <p className="mt-1 text-xs text-zinc-500">
            Import, preview và sửa metadata. File trong thư mục assets/ của máy sẽ được index tự động.
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            setError(undefined);
            try {
              await window.xamxixiu.importAssets({
                type: tab.type,
                category: category || undefined,
                mediaKind: tab.mediaKind
              });
              await refresh();
            } catch (reason: unknown) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Không thể import asset."
              );
            }
          }}
          className="rounded-lg bg-fuchsia-500 px-4 py-2 text-xs font-medium text-white"
        >
          Import {tab.label}
        </button>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((item) => {
          const count = assets.filter((asset) => matchesTab(asset, item)).length;
          const active = item.id === tabId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTabId(item.id);
                setCategory("");
              }}
              className={[
                "rounded-full px-3 py-1.5 text-xs transition",
                active
                  ? "bg-fuchsia-500/20 text-fuchsia-100 ring-1 ring-fuchsia-400/40"
                  : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
              ].join(" ")}
            >
              {item.label} ({count})
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <FieldLabel label="Danh mục">
          <select value={category} onChange={(event) => setCategory(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-zinc-900 p-2 text-sm">
            <option value="">Tất cả</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </FieldLabel>
        <FieldLabel label="Tìm kiếm">
          <input value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Tags hoặc tên file"
            className="w-full rounded-lg border border-white/10 bg-black/20 p-2 text-sm" />
        </FieldLabel>
      </div>
      {loading ? (
        <p className="mt-4 text-sm text-zinc-400">Đang tải library...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-400">
          Chưa có asset trong tab này.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {filtered.map((asset) => (
            <div key={asset.id} className="rounded-xl border border-white/10 bg-black/10 p-4">
              <AssetPreview asset={asset} source={previews[asset.id]} />
              <p className="mt-2 truncate text-xs text-zinc-500">{pathLabel(asset)}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <FieldLabel label="Danh mục">
                  <input value={asset.category} onChange={(event) => setAssets((current) =>
                    current.map((item) => item.id === asset.id ? { ...item, category: event.target.value } : item)
                  )} className={fieldClassName} />
                </FieldLabel>
                <FieldLabel label="Tags">
                  <input value={asset.tags.join(", ")} onChange={(event) => setAssets((current) =>
                    current.map((item) => item.id === asset.id
                      ? { ...item, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) }
                      : item)
                  )} placeholder="Ngăn cách bằng dấu phẩy" className={fieldClassName} />
                </FieldLabel>
                <FieldLabel label="Cường độ (0–1)">
                  <input type="number" min="0" max="1" step="0.1" value={asset.intensity}
                    onChange={(event) => setAssets((current) => current.map((item) =>
                      item.id === asset.id ? { ...item, intensity: Number(event.target.value) } : item
                    ))} className={fieldClassName} />
                </FieldLabel>
              </div>
              {asset.type === "meme" && (
                <div className="mt-3">
                  <FieldLabel label="Spec">
                    <textarea value={asset.spec ?? ""}
                      onChange={(event) => setAssets((current) => current.map((item) =>
                        item.id === asset.id ? { ...item, spec: event.target.value } : item
                      ))} className="min-h-16 w-full rounded border border-white/10 bg-zinc-900 p-2 text-xs" />
                  </FieldLabel>
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => void updateAsset(asset)}
                  className="rounded border border-cyan-300/30 px-3 py-1 text-xs text-cyan-200">Save metadata</button>
                <button type="button" onClick={() => void deleteAsset(asset)}
                  className="rounded border border-red-300/30 px-3 py-1 text-xs text-red-200">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function pathLabel(asset: Asset): string {
  return asset.file.split(/[\\/]/).slice(-2).join("/");
}
