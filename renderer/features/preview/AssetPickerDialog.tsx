"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Asset } from "../../../src/assets/library";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";
import { cn } from "../ui/cn";
import { assetFileName, assetMediaSrc } from "./asset-media";
import {
  assetsForTarget,
  pickerTitle
} from "./asset-picker";
import {
  getCachedVideoThumbnail,
  loadVideoThumbnail
} from "./video-thumbnail";

export { assetsForTarget, pickerTitle };

interface AssetPickerDialogProps {
  open: boolean;
  title: string;
  assets: Asset[];
  selectedId?: string;
  onClose: () => void;
  onSelect: (asset: Asset) => void;
  onRemove?: () => void;
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
      className="flex h-36 items-center justify-center overflow-hidden rounded-md bg-app"
    >
      {visible ? (
        <img
          src={assetMediaSrc(asset.id)}
          alt={asset.category}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="h-full w-full animate-pulse bg-elevated" />
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
      className="relative flex h-36 items-center justify-center overflow-hidden rounded-md bg-app"
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
        <div className="h-full w-full animate-pulse bg-elevated" />
      )}
      <button
        type="button"
        onClick={onTogglePlay}
        className="absolute bottom-2 right-2 rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-white"
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
    <div className="relative flex h-24 items-center justify-center overflow-hidden rounded-md bg-app">
      {playing && (
        <audio
          ref={audioRef}
          src={assetMediaSrc(asset.id)}
          preload="auto"
          onEnded={onTogglePlay}
        />
      )}
      <p className="px-3 text-center text-[11px] leading-4 text-ink-2">
        {assetFileName(asset.file)}
      </p>
      <button
        type="button"
        onClick={onTogglePlay}
        className="absolute bottom-2 right-2 rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-white"
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

  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="max-h-[80vh] max-w-4xl"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <h3 className="text-sm font-medium text-ink">{title}</h3>
          <p className="mt-0.5 text-[12px] text-ink-3">
            Bấm Play để xem/nghe, sau đó bấm Chọn.
          </p>
        </div>
        <div className="flex gap-1.5">
          {onRemove ? (
            <Button variant="danger" size="sm" onClick={onRemove}>
              Gỡ khỏi timeline
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
      <div className="border-b border-line px-4 py-2.5">
        <Input
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm theo tên file, category, tag..."
        />
        <p className="mt-1.5 text-[11px] text-ink-3">
          {visibleAssets.length}/{assets.length}
        </p>
      </div>
      <div data-picker-scroll className="overflow-y-auto p-4">
        {assets.length === 0 ? (
          <p className="text-[13px] text-ink-2">
            Chưa có asset phù hợp. Import trong Library.
          </p>
        ) : visibleAssets.length === 0 ? (
          <p className="text-[13px] text-ink-2">
            Không thấy asset khớp “{query.trim()}”.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visibleAssets.map((asset) => {
              const playing = playingId === asset.id;
              return (
                <div
                  key={asset.id}
                  className={cn(
                    "rounded-lg border p-2.5",
                    selectedId === asset.id
                      ? "border-accent bg-accent/10"
                      : "border-line bg-panel"
                  )}
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
                  <p className="mt-2 truncate text-[12px] text-ink">
                    {asset.category} · {assetFileName(asset.file)}
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-2 w-full"
                    onClick={() => onSelect(asset)}
                  >
                    Chọn
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Dialog>
  );
}
