"use client";

import { useEffect, useState } from "react";
import {
  clampImageEffectStyle,
  DEFAULT_IMAGE_EFFECT,
  IMAGE_EFFECT_CHANGED,
  type ImageEffectStyle
} from "../../../src/image-effect";

export function useImageEffect(active = true): ImageEffectStyle {
  const [style, setStyle] = useState(DEFAULT_IMAGE_EFFECT);

  useEffect(() => {
    function apply(value: unknown): void {
      setStyle(clampImageEffectStyle(value));
    }

    function load(): void {
      if (!window.xamxixiu?.getSettings) {
        return;
      }
      void window.xamxixiu
        .getSettings()
        .then((settings) => apply(settings.imageEffect))
        .catch(() => undefined);
    }

    function onChanged(event: Event): void {
      const detail = (event as CustomEvent<ImageEffectStyle>).detail;
      if (detail) {
        apply(detail);
        return;
      }
      load();
    }

    window.addEventListener(IMAGE_EFFECT_CHANGED, onChanged);
    return () => {
      window.removeEventListener(IMAGE_EFFECT_CHANGED, onChanged);
    };
  }, []);

  useEffect(() => {
    if (!active || !window.xamxixiu?.getSettings) {
      return;
    }
    void window.xamxixiu
      .getSettings()
      .then((settings) => {
        setStyle(clampImageEffectStyle(settings.imageEffect));
      })
      .catch(() => undefined);
  }, [active]);

  return style;
}
