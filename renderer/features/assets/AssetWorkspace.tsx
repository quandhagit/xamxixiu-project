"use client";

import {
  useEffect,
  useState
} from "react";
import type { Asset } from "../../../src/assets/library";
import type { MatchedReaction } from "../../../src/assets/matcher";
import type {
  ContentData,
  ReactionAnimation
} from "../../../src/types";
import type { ProjectState } from "../../../src/project/store";
import { AssetPreview } from "./AssetPreview";
import { useErrorToast } from "../app/ErrorToast";

interface Props {
  projectId: string;
  content?: ContentData;
  reactions: MatchedReaction[];
  backgroundAssetId?: string | null;
  musicAssetId?: string | null;
  onSaved: (project: ProjectState) => void;
  onRematch: () => Promise<void>;
}

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
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const setError = useErrorToast();

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
      // Preview is optional.
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

  useEffect(() => {
    const ids = [
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
  }, [draft, backgroundId, musicId, previews]);

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

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">Assets flow editor</h3>
          <p className="mt-1 text-xs text-zinc-500">
            {dirty ? "Có thay đổi chưa lưu." : "Đã đồng bộ."}
            {" "}
            Import hoặc sửa thư viện ở trang{" "}
            <a href="/library/" className="text-fuchsia-300 underline">
              Library
            </a>.
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
      {loading ? (
        <p className="mt-4 text-sm text-zinc-400">Đang tải asset...</p>
      ) : (
        <>
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
                    <optgroup label="Meme ảnh">
                      {memeAssets.filter((asset) => asset.mediaKind === "image").map((asset) =>
                        <option key={asset.id} value={asset.id}>{asset.category} · {asset.file.split(/[\\/]/).pop()}</option>
                      )}
                    </optgroup>
                    <optgroup label="Meme video">
                      {memeAssets.filter((asset) => asset.mediaKind === "video").map((asset) =>
                        <option key={asset.id} value={asset.id}>{asset.category} · {asset.file.split(/[\\/]/).pop()}</option>
                      )}
                    </optgroup>
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
                  {reaction.meme && <AssetPreview asset={reaction.meme} source={previews[reaction.meme.id]} />}
                  {reaction.sfx && <AssetPreview asset={reaction.sfx} source={previews[reaction.sfx.id]} />}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
