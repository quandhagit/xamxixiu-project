"use client";

import {
  useEffect,
  useMemo,
  useState
} from "react";
import type {
  Asset,
  AssetType
} from "../../../src/assets/library";
import type {
  MatchedReaction
} from "../../../src/assets/matcher";
import type {
  ContentData,
  ReactionAnimation
} from "../../../src/types";
import type {
  ProjectState
} from "../../../src/project/store";

interface Props {
  projectId: string;
  content?: ContentData;
  reactions: MatchedReaction[];
  backgroundAssetId?: string | null;
  musicAssetId?: string | null;
  onSaved: (project: ProjectState) => void;
  onRematch: () => Promise<void>;
}

const TYPES: AssetType[] = [
  "meme",
  "sfx",
  "music",
  "background"
];
const ANIMATIONS: ReactionAnimation[] = [
  "none",
  "fade-in",
  "zoom-in",
  "zoom-out",
  "shake-1",
  "shake-2",
  "slide-down",
  "slide-up",
  "slide-right",
  "slide-left",
  "rotate",
  "flip"
];

function Preview({
  asset,
  source
}: {
  asset: Asset;
  source?: string;
}): React.ReactElement {
  if (!source) {
    return <div className="h-20 animate-pulse rounded bg-white/5" />;
  }
  if (asset.mediaKind === "audio") {
    return <audio controls preload="metadata" src={source} className="w-full" />;
  }
  if (asset.mediaKind === "video") {
    return <video controls preload="metadata" src={source} className="h-28 w-full rounded object-contain" />;
  }
  return <img src={source} alt={asset.category} className="h-28 w-full rounded object-contain" />;
}

export function AssetWorkspace({
  projectId,
  content,
  reactions,
  backgroundAssetId,
  musicAssetId,
  onSaved,
  onRematch
}: Props): React.ReactElement {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [draft, setDraft] = useState(reactions);
  const [backgroundId, setBackgroundId] = useState(backgroundAssetId ?? "");
  const [musicId, setMusicId] = useState(musicAssetId ?? "");
  const [type, setType] = useState<AssetType>("meme");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string>();

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

  useEffect(() => {
    setDraft(reactions);
    setBackgroundId(backgroundAssetId ?? "");
    setMusicId(musicAssetId ?? "");
    setDirty(false);
  }, [reactions, backgroundAssetId, musicAssetId]);

  const filtered = useMemo(() => assets.filter((asset) =>
    asset.type === type &&
    (!category || asset.category === category) &&
    (!query || `${asset.category} ${asset.tags.join(" ")} ${asset.usage ?? ""}`
      .toLowerCase().includes(query.toLowerCase()))
  ), [assets, type, category, query]);

  useEffect(() => {
    const ids = [
      ...filtered.map((asset) => asset.id),
      ...draft.flatMap((reaction) => [
        reaction.meme?.id,
        reaction.sfx?.id
      ]),
      backgroundId,
      musicId
    ].filter((id): id is string => Boolean(id));
    for (const id of [...new Set(ids)]) {
      void ensurePreview(id);
    }
  }, [filtered, draft, backgroundId, musicId, previews]);
  const categories = [...new Set(
    assets.filter((asset) => asset.type === type).map((asset) => asset.category)
  )].sort();
  const memeAssets = assets.filter((asset) => asset.type === "meme");
  const sfxAssets = assets.filter((asset) => asset.type === "sfx");

  function updateReaction(
    index: number,
    update: (reaction: MatchedReaction) => MatchedReaction
  ): void {
    setDraft((current) => current.map((reaction, itemIndex) =>
      itemIndex === index ? update(reaction) : reaction
    ));
    setDirty(true);
  }

  async function save(): Promise<void> {
    setSaving(true);
    setError(undefined);
    try {
      const invalid = draft.find((reaction) =>
        reaction.meme?.mediaKind === "image" && !reaction.sfx
      );
      if (invalid) {
        throw new Error(`Comment #${invalid.commentIndex}: meme ảnh cần SFX.`);
      }
      const project = await window.xamxixiu.saveAssetAssignments({
        projectId,
        reactions: draft,
        backgroundAssetId: backgroundId || null,
        musicAssetId: musicId || null
      });
      setDirty(false);
      onSaved(project);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Không thể lưu asset.");
    } finally {
      setSaving(false);
    }
  }

  async function updateAsset(asset: Asset): Promise<void> {
    setError(undefined);
    try {
      await window.xamxixiu.updateAsset({
        id: asset.id,
        update: {
          category: asset.category,
          tags: asset.tags,
          intensity: asset.intensity,
          usage: asset.usage,
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
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-medium">Local asset library</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Import, preview và sửa metadata trong thư viện writable.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              setError(undefined);
              try {
                await window.xamxixiu.importAssets({
                  type,
                  category: category || undefined
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
            Import {type}
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <select value={type} onChange={(event) => {
            setType(event.target.value as AssetType);
            setCategory("");
          }} className="rounded-lg border border-white/10 bg-zinc-900 p-2 text-sm">
            {TYPES.map((item) => <option key={item}>{item}</option>)}
          </select>
          <select value={category} onChange={(event) => setCategory(event.target.value)}
            className="rounded-lg border border-white/10 bg-zinc-900 p-2 text-sm">
            <option value="">All categories</option>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
          <input value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter tags / usage"
            className="rounded-lg border border-white/10 bg-black/20 p-2 text-sm" />
        </div>
        {loading ? (
          <p className="mt-4 text-sm text-zinc-400">Đang tải library...</p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {filtered.map((asset) => (
              <div key={asset.id} className="rounded-xl border border-white/10 bg-black/10 p-4">
                <Preview asset={asset} source={previews[asset.id]} />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input value={asset.category} onChange={(event) => setAssets((current) =>
                    current.map((item) => item.id === asset.id ? { ...item, category: event.target.value } : item)
                  )} className="rounded border border-white/10 bg-zinc-900 p-2 text-xs" />
                  <input value={asset.tags.join(", ")} onChange={(event) => setAssets((current) =>
                    current.map((item) => item.id === asset.id
                      ? { ...item, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) }
                      : item)
                  )} className="rounded border border-white/10 bg-zinc-900 p-2 text-xs" />
                  <input type="number" min="0" max="1" step="0.1" value={asset.intensity}
                    onChange={(event) => setAssets((current) => current.map((item) =>
                      item.id === asset.id ? { ...item, intensity: Number(event.target.value) } : item
                    ))} className="rounded border border-white/10 bg-zinc-900 p-2 text-xs" />
                  <input value={asset.usage ?? ""} placeholder="Usage"
                    onChange={(event) => setAssets((current) => current.map((item) =>
                      item.id === asset.id ? { ...item, usage: event.target.value } : item
                    ))} className="rounded border border-white/10 bg-zinc-900 p-2 text-xs" />
                </div>
                {asset.type === "meme" && (
                  <textarea value={asset.spec ?? ""} placeholder="Spec"
                    onChange={(event) => setAssets((current) => current.map((item) =>
                      item.id === asset.id ? { ...item, spec: event.target.value } : item
                    ))} className="mt-2 min-h-16 w-full rounded border border-white/10 bg-zinc-900 p-2 text-xs" />
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

      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-medium">Assets flow editor</h3>
            <p className="mt-1 text-xs text-zinc-500">
              {dirty ? "Có thay đổi chưa lưu." : "Đã đồng bộ."}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={() => void onRematch()}
              className="rounded-lg border border-white/20 px-4 py-2 text-xs">Rematch</button>
            <button type="button" disabled={!dirty || saving} onClick={() => void save()}
              className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-cyan-950 disabled:opacity-50">
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-400">Background
            <select value={backgroundId} onChange={(event) => {
              setBackgroundId(event.target.value);
              setDirty(true);
            }} className="mt-1 w-full rounded bg-zinc-900 p-2">
              <option value="">Default / none</option>
              {assets.filter((asset) => asset.type === "background").map((asset) =>
                <option key={asset.id} value={asset.id}>{asset.category} · {asset.id}</option>
              )}
            </select>
          </label>
          <label className="text-xs text-zinc-400">Music
            <select value={musicId} onChange={(event) => {
              setMusicId(event.target.value);
              setDirty(true);
            }} className="mt-1 w-full rounded bg-zinc-900 p-2">
              <option value="">Default / none</option>
              {assets.filter((asset) => asset.type === "music").map((asset) =>
                <option key={asset.id} value={asset.id}>{asset.category} · {asset.id}</option>
              )}
            </select>
          </label>
        </div>
        <div className="mt-5 space-y-4">
          {draft.map((reaction, index) => (
            <div key={reaction.commentIndex} className="rounded-xl border border-white/10 bg-black/10 p-4">
              <p className="text-sm text-zinc-200">
                #{reaction.commentIndex} · {content?.comments[reaction.commentIndex]?.text ?? "Không tìm thấy text"}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <select value={reaction.meme?.id ?? ""} onChange={(event) => {
                  const meme = memeAssets.find((asset) => asset.id === event.target.value) ?? null;
                  updateReaction(index, (current) => ({
                    ...current,
                    meme,
                    sfx: meme?.mediaKind === "video" ? null : current.sfx,
                    animation: meme?.mediaKind === "video" || !meme ? "none" : current.animation
                  }));
                }} className="rounded bg-zinc-900 p-2 text-xs">
                  <option value="">No meme</option>
                  {memeAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.category} · {asset.id}</option>)}
                </select>
                <select value={reaction.sfx?.id ?? ""} disabled={reaction.meme?.mediaKind === "video"}
                  onChange={(event) => updateReaction(index, (current) => ({
                    ...current,
                    sfx: sfxAssets.find((asset) => asset.id === event.target.value) ?? null
                  }))} className="rounded bg-zinc-900 p-2 text-xs disabled:opacity-50">
                  <option value="">No SFX</option>
                  {sfxAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.category} · {asset.id}</option>)}
                </select>
                <select value={reaction.animation} disabled={reaction.meme?.mediaKind !== "image"}
                  onChange={(event) => updateReaction(index, (current) => ({
                    ...current,
                    animation: event.target.value as ReactionAnimation
                  }))} className="rounded bg-zinc-900 p-2 text-xs disabled:opacity-50">
                  {ANIMATIONS.map((animation) => <option key={animation}>{animation}</option>)}
                </select>
                <input type="number" min="0.25" max="10" step="0.05" value={reaction.duration}
                  onChange={(event) => updateReaction(index, (current) => ({
                    ...current,
                    duration: Number(event.target.value)
                  }))} className="rounded bg-zinc-900 p-2 text-xs" />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {reaction.meme && <Preview asset={reaction.meme} source={previews[reaction.meme.id]} />}
                {reaction.sfx && <Preview asset={reaction.sfx} source={previews[reaction.sfx.id]} />}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
