"use client";

import { useEffect, useState } from "react";
import {
  clampWatermarkStyle,
  DEFAULT_WATERMARK_STYLE,
  WATERMARK_STYLE_CHANGED,
  type WatermarkStyle
} from "../../../src/watermark-style";

export function useWatermarkStyle(active = true): WatermarkStyle {
  const [style, setStyle] = useState(DEFAULT_WATERMARK_STYLE);

  useEffect(() => {
    function apply(value: unknown): void {
      setStyle(clampWatermarkStyle(value));
    }

    function load(): void {
      if (!window.xamxixiu?.getSettings) {
        return;
      }
      void window.xamxixiu
        .getSettings()
        .then((settings) => apply(settings.watermark))
        .catch(() => undefined);
    }

    function onChanged(event: Event): void {
      const detail = (event as CustomEvent<WatermarkStyle>).detail;
      if (detail) {
        apply(detail);
        return;
      }
      load();
    }

    window.addEventListener(WATERMARK_STYLE_CHANGED, onChanged);
    return () => {
      window.removeEventListener(WATERMARK_STYLE_CHANGED, onChanged);
    };
  }, []);

  useEffect(() => {
    if (!active || !window.xamxixiu?.getSettings) {
      return;
    }
    void window.xamxixiu
      .getSettings()
      .then((settings) => {
        setStyle(clampWatermarkStyle(settings.watermark));
      })
      .catch(() => undefined);
  }, [active]);

  return style;
}
