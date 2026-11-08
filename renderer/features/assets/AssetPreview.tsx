"use client";

import { useEffect, useRef, useState } from "react";
import type { Asset } from "../../../src/assets/library";
import { assetMediaSrc } from "../preview/asset-media";
import {
  getCachedVideoThumbnail,
  loadVideoThumbnail
} from "../preview/video-thumbnail";

function VideoPreview({
  asset
}: {
  asset: Asset;
}): React.ReactElement {
  const boxRef = useRef<HTMLDivElement>(null);
  const source = assetMediaSrc(asset.id);
  const [visible, setVisible] = useState(false);
  const [thumbnail, setThumbnail] = useState(
    () => getCachedVideoThumbnail(asset.id)
  );

  useEffect(() => {
    const node = boxRef.current;
    if (!node) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
        }
      },
      { rootMargin: "160px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || thumbnail) {
      return;
    }
    let cancelled = false;
    void loadVideoThumbnail(asset.id).then((dataUrl) => {
      if (!cancelled && dataUrl) {
        setThumbnail(dataUrl);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [asset.id, thumbnail, visible]);

  return (
    <div
      ref={boxRef}
      className="relative h-28 w-full overflow-hidden rounded-md bg-app"
    >
      {visible ? (
        <video
          controls
          playsInline
          crossOrigin="anonymous"
          preload="metadata"
          src={source}
          poster={thumbnail}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="h-full w-full animate-pulse bg-elevated" />
      )}
    </div>
  );
}

export function AssetPreview({
  asset,
  source
}: {
  asset: Asset;
  source?: string;
}): React.ReactElement {
  if (asset.mediaKind === "video") {
    return <VideoPreview asset={asset} />;
  }
  if (!source) {
    return <div className="h-20 animate-pulse rounded-md bg-elevated" />;
  }
  if (asset.mediaKind === "audio") {
    return <audio controls preload="metadata" src={source} className="w-full" />;
  }
  return (
    <img
      src={source}
      alt={asset.category}
      className="h-28 w-full rounded-md object-contain"
    />
  );
}
