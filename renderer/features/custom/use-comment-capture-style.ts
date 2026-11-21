"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject
} from "react";
import {
  clampCommentCaptureStyle,
  COMMENT_CAPTURE_DESIGN_WIDTH,
  COMMENT_CAPTURE_STYLE_CHANGED,
  commentCaptureDisplayScale,
  DEFAULT_COMMENT_CAPTURE_STYLE,
  type CommentCaptureStyle
} from "../../../src/capture-style";

export function useCommentCaptureStyle(
  active = true
): CommentCaptureStyle {
  const [style, setStyle] = useState(DEFAULT_COMMENT_CAPTURE_STYLE);

  useEffect(() => {
    function apply(value: unknown): void {
      setStyle(clampCommentCaptureStyle(value));
    }

    function load(): void {
      if (!window.xamxixiu?.getSettings) {
        return;
      }
      void window.xamxixiu
        .getSettings()
        .then((settings) => apply(settings.commentCapture))
        .catch(() => undefined);
    }

    function onChanged(event: Event): void {
      const detail = (event as CustomEvent<CommentCaptureStyle>).detail;
      if (detail) {
        apply(detail);
        return;
      }
      load();
    }

    window.addEventListener(COMMENT_CAPTURE_STYLE_CHANGED, onChanged);
    return () => {
      window.removeEventListener(COMMENT_CAPTURE_STYLE_CHANGED, onChanged);
    };
  }, []);

  useEffect(() => {
    if (!active || !window.xamxixiu?.getSettings) {
      return;
    }
    void window.xamxixiu
      .getSettings()
      .then((settings) => {
        setStyle(clampCommentCaptureStyle(settings.commentCapture));
      })
      .catch(() => undefined);
  }, [active]);

  return style;
}

export function useCommentCaptureDisplayScale(
  target: RefObject<HTMLElement | null>,
  designWidth = COMMENT_CAPTURE_DESIGN_WIDTH,
  resync?: unknown
): number {
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const element = target.current;
    if (!element) {
      return;
    }

    function update(): void {
      const node = target.current;
      if (!node) {
        return;
      }
      setScale(
        commentCaptureDisplayScale(node.clientWidth, designWidth)
      );
    }

    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [target, designWidth, resync]);

  return scale;
}
