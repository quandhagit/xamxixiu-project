"use client";

import { useRef } from "react";
import {
  commentCaptureCardStyle,
  DEFAULT_COMMENT_CAPTURE_STYLE,
  type CommentCaptureStyle
} from "../../../src/capture-style";
import { useCommentCaptureDisplayScale } from "./use-comment-capture-style";

export function CaptureStyleImage({
  src,
  alt,
  captureStyle = DEFAULT_COMMENT_CAPTURE_STYLE,
  className,
  draggable
}: {
  src: string;
  alt: string;
  captureStyle?: CommentCaptureStyle;
  className?: string;
  draggable?: boolean;
}): React.ReactElement {
  const ref = useRef<HTMLImageElement>(null);
  const scale = useCommentCaptureDisplayScale(ref);

  return (
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={className}
      style={commentCaptureCardStyle(captureStyle, scale)}
      draggable={draggable}
    />
  );
}
