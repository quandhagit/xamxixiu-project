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
import { useErrorToast } from "../app/ErrorToast";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Textarea } from "../ui/Textarea";
import { cn } from "../ui/cn";

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
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-ink-3">
        {label}
      </span>
      {children}
    </label>
  );
}


function matchesTab(asset: Asset, tab: (typeof TABS)[number]): boolean {
  if (asset.type !== tab.type) {
    return false;
  }
  return tab.mediaKind ? asset.mediaKind === tab.mediaKind : true;
}

export function AssetLibraryManager({
  visible = true
}: {
  visible?: boolean;
}): React.ReactElement {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tabId, setTabId] = useState<LibraryTab>("meme-image");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const setError = useErrorToast();
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
    if (!visible) {
      return;
    }
    void refresh();
  }, [visible]);

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
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-ink">Asset library</h2>
          <p className="mt-0.5 text-[12px] text-ink-3">
            Import, sửa metadata và xóa meme, SFX, music, background.
            Gán asset cho project bằng cách click clip trên Timeline.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
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
        >
          Import {tab.label}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1 border-b border-line pb-2">
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
              className={cn(
                "rounded-md px-2.5 py-1 text-[12px] transition",
                active
                  ? "bg-accent/15 text-ink"
                  : "text-ink-2 hover:bg-elevated hover:text-ink"
              )}
            >
              {item.label} ({count})
            </button>
          );
        })}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <FieldLabel label="Danh mục">
          <Select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Tất cả</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </Select>
        </FieldLabel>
        <FieldLabel label="Tìm kiếm">
          <Input value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Tags hoặc tên file" />
        </FieldLabel>
      </div>
      {loading ? (
        <p className="mt-3 text-[13px] text-ink-2">Đang tải library...</p>
      ) : filtered.length === 0 ? (
        <p className="mt-3 text-[13px] text-ink-2">
          Chưa có asset trong tab này.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {filtered.map((asset) => (
            <div key={asset.id} className="rounded-lg border border-line bg-panel p-3">
              <AssetPreview asset={asset} source={previews[asset.id]} />
              <p className="mt-2 truncate text-[12px] text-ink-3">{pathLabel(asset)}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <FieldLabel label="Danh mục">
                  <Input value={asset.category} onChange={(event) => setAssets((current) =>
                    current.map((item) => item.id === asset.id ? { ...item, category: event.target.value } : item)
                  )} />
                </FieldLabel>
                <FieldLabel label="Tags">
                  <Input value={asset.tags.join(", ")} onChange={(event) => setAssets((current) =>
                    current.map((item) => item.id === asset.id
                      ? { ...item, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) }
                      : item)
                  )} placeholder="Ngăn cách bằng dấu phẩy" />
                </FieldLabel>
                <FieldLabel label="Cường độ (0–1)">
                  <Input type="number" min="0" max="1" step="0.1" value={asset.intensity}
                    onChange={(event) => setAssets((current) => current.map((item) =>
                      item.id === asset.id ? { ...item, intensity: Number(event.target.value) } : item
                    ))} />
                </FieldLabel>
              </div>
              {(asset.type === "meme" || asset.type === "sfx") && (
                <div className="mt-2">
                  <FieldLabel label="Spec">
                    <Textarea value={asset.spec ?? ""}
                      onChange={(event) => setAssets((current) => current.map((item) =>
                        item.id === asset.id ? { ...item, spec: event.target.value } : item
                      ))} className="min-h-16" />
                  </FieldLabel>
                </div>
              )}
              <div className="mt-2 flex gap-1.5">
                <Button size="sm" onClick={() => void updateAsset(asset)}>
                  Save metadata
                </Button>
                <Button variant="danger" size="sm" onClick={() => void deleteAsset(asset)}>
                  Delete
                </Button>
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
