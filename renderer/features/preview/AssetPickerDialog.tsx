"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "../../../src/assets/library";
import type { TimelineAssetTarget } from "../../../src/electron/ipc-types";
import { assetFileName, assetMediaSrc } from "./asset-media";
import {
  getCachedVideoThumbnail,
  loadVideoThumbnail
} from "./video-thumbnail";

interface AssetPickerDialogProps {
  open: boolean;
  title: string;
  assets: Asset[];
  selectedId?: string;
  onClose: () => void;
  onSelect: (asset: Asset) => void;
  onRemove?: () => void;
}

export function assetsForTarget(
  assets: Asset[],
  target: TimelineAssetTarget
): Asset[] {
  if (target.kind === "topic-title") {
    return [];
  }
  if (target.kind === "background") {
    return assets.filter((asset) => asset.type === "background");
  }
  if (target.kind === "music") {
    return assets.filter((asset) => asset.type === "music");
  }
  if (target.kind === "sfx") {
    return assets.filter((asset) => asset.type === "sfx");
  }
  if (target.kind === "video") {
    return assets.filter(
      (asset) => asset.type === "meme" && asset.mediaKind === "video"
    );
  }
  return assets.filter((asset) => {
    if (asset.type !== "meme") {
      return false;
    }
    return target.kind === "topic-meme" || asset.mediaKind === "image";
  });
}

export function pickerTitle(target: TimelineAssetTarget): string {
  if (target.kind === "topic-title") {
    return "Topic title";
  }
  if (target.kind === "background") {
    return "Chọn background";
  }
  if (target.kind === "music") {
    return "Chọn music";
  }
  if (target.kind === "sfx") {
    return "Chọn sound effect";
  }
  if (target.kind === "video") {
    return `Chọn video meme${"commentIndex" in target ? ` · comment #${target.commentIndex}` : ""}`;
  }
  if (target.kind === "topic-meme") {
    return "Chọn topic meme";
  }
  return `Chọn meme · comment #${target.commentIndex}`;
}

function assetSearchText(asset: Asset): string {
  return [
    asset.category,
    asset.tags.join(" "),
    assetFileName(asset.file),
    asset.spec ?? "",
    asset.id
  ].join(" ").toLowerCase();
}

function PickerImage({
  asset
}: {
  asset: Asset;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const root = node.closest("[data-picker-scroll]");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
        }
      },
      {
        root: root instanceof Element ? root : null,
        rootMargin: "120px"
      }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="flex h-36 items-center justify-center overflow-hidden rounded bg-black/40"
    >
      {visible ? (
        <img
          src={assetMediaSrc(asset.id)}
          alt={asset.category}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="h-full w-full animate-pulse bg-white/5" />
      )}
    </div>
  );
}

function PickerVideo({
  asset,
  playing,
  onTogglePlay
}: {
  asset: Asset;
  playing: boolean;
  onTogglePlay: () => void;
}): React.ReactElement {
  const boxRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [thumbnail, setThumbnail] = useState(
    () => getCachedVideoThumbnail(asset.id)
  );
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  useEffect(() => {
    const node = boxRef.current;
    if (!node) {
      return;
    }
    const root = node.closest("[data-picker-scroll]");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
        }
      },
      {
        root: root instanceof Element ? root : null,
        rootMargin: "160px"
      }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || playing || thumbnail) {
      return;
    }
    let cancelled = false;
    void loadVideoThumbnail(asset.id).then((source) => {
      if (cancelled) {
        return;
      }
      if (source) {
        setThumbnail(source);
        return;
      }
      setThumbnailFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [asset.id, playing, thumbnail, visible]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playing) {
      return;
    }
    const play = (): void => {
      void video.play().catch(() => undefined);
    };
    if (video.readyState >= 2) {
      play();
      return;
    }
    video.addEventListener("canplay", play, { once: true });
    return () => video.removeEventListener("canplay", play);
  }, [playing]);

  return (
    <div
      ref={boxRef}
      className="relative flex h-36 items-center justify-center overflow-hidden rounded bg-black/40"
    >
      {playing ? (
        <video
          ref={videoRef}
          src={assetMediaSrc(asset.id)}
          poster={thumbnail}
          playsInline
          crossOrigin="anonymous"
          preload="auto"
          className="h-full w-full object-contain"
          onEnded={onTogglePlay}
        />
      ) : thumbnail ? (
        <img
          src={thumbnail}
          alt={asset.category}
          className="h-full w-full object-contain"
        />
      ) : thumbnailFailed ? (
        <video
          src={assetMediaSrc(asset.id)}
          muted
          playsInline
          crossOrigin="anonymous"
          preload="metadata"
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="h-full w-full animate-pulse bg-white/5" />
      )}
      <button
        type="button"
        onClick={onTogglePlay}
        className="absolute bottom-2 right-2 rounded-full bg-cyan-400 px-3 py-1 text-[11px] font-semibold text-cyan-950"
      >
        {playing ? "Pause" : "Play"}
      </button>
    </div>
  );
}

function PickerAudio({
  asset,
  playing,
  onTogglePlay
}: {
  asset: Asset;
  playing: boolean;
  onTogglePlay: () => void;
}): React.ReactElement {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playing) {
      return;
    }
    const play = (): void => {
      void audio.play().catch(() => undefined);
    };
    if (audio.readyState >= 2) {
      play();
      return;
    }
    audio.addEventListener("canplay", play, { once: true });
    return () => audio.removeEventListener("canplay", play);
  }, [playing]);

  return (
    <div className="relative flex h-24 items-center justify-center overflow-hidden rounded bg-black/40">
      {playing && (
        <audio
          ref={audioRef}
          src={assetMediaSrc(asset.id)}
          preload="auto"
          onEnded={onTogglePlay}
        />
      )}
      <p className="px-3 text-center text-[11px] leading-4 text-zinc-400">
        {assetFileName(asset.file)}
      </p>
      <button
        type="button"
        onClick={onTogglePlay}
        className="absolute bottom-2 right-2 rounded-full bg-cyan-400 px-3 py-1 text-[11px] font-semibold text-cyan-950"
      >
        {playing ? "Pause" : "Play"}
      </button>
    </div>
  );
}

export function AssetPickerDialog({
  open,
  title,
  assets,
  selectedId,
  onClose,
  onSelect,
  onRemove
}: AssetPickerDialogProps): React.ReactElement | null {
  const [playingId, setPlayingId] = useState<string>();
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleAssets = useMemo(
    () =>
      normalizedQuery
        ? assets.filter((asset) =>
          assetSearchText(asset).includes(normalizedQuery)
        )
        : assets,
    [assets, normalizedQuery]
  );

  useEffect(() => {
    setPlayingId(undefined);
    setQuery("");
    if (open) {
      searchRef.current?.focus();
    }
  }, [open, title]);

  function togglePlay(assetId: string): void {
    setPlayingId((current) =>
      current === assetId ? undefined : assetId
    );
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="flex max-h-[80vh] w-full max-w-4xl flex-col rounded-2xl border border-white/15 bg-zinc-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h3 className="font-medium">{title}</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Bấm Play để xem/nghe, sau đó bấm Chọn.
            </p>
          </div>
          <div className="flex gap-2">
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs text-red-200 hover:bg-red-400/10"
              >
                Gỡ khỏi timeline
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5"
            >
              Đóng
            </button>
          </div>
        </div>
        <div className="border-b border-white/10 px-5 py-3">
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên file, category, tag..."
            className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-cyan-400/50"
          />
          <p className="mt-2 text-xs text-zinc-500">
            {visibleAssets.length}/{assets.length}
          </p>
        </div>
        <div data-picker-scroll className="overflow-y-auto p-5">
          {assets.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Chưa có asset phù hợp. Import trong Library.
            </p>
          ) : visibleAssets.length === 0 ? (
            <p className="text-sm text-zinc-400">
              Không thấy asset khớp “{query.trim()}”.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleAssets.map((asset) => {
                const playing = playingId === asset.id;
                return (
                  <div
                    key={asset.id}
                    className={[
                      "rounded-xl border p-3",
                      selectedId === asset.id
                        ? "border-cyan-400 bg-cyan-400/10"
                        : "border-white/10 bg-white/[0.03]"
                    ].join(" ")}
                  >
                    {asset.mediaKind === "video" ? (
                      <PickerVideo
                        asset={asset}
                        playing={playing}
                        onTogglePlay={() => togglePlay(asset.id)}
                      />
                    ) : asset.mediaKind === "audio" ? (
                      <PickerAudio
                        asset={asset}
                        playing={playing}
                        onTogglePlay={() => togglePlay(asset.id)}
                      />
                    ) : (
                      <PickerImage asset={asset} />
                    )}
                    <p className="mt-2 truncate text-xs text-zinc-200">
                      {asset.category} · {assetFileName(asset.file)}
                    </p>
                    <button
                      type="button"
                      onClick={() => onSelect(asset)}
                      className="mt-3 w-full rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-cyan-950 hover:bg-cyan-300"
                    >
                      Chọn
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
