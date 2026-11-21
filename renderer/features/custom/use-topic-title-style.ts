"use client";

import { useEffect, useState } from "react";
import {
  clampTopicTitleStyle,
  DEFAULT_TOPIC_TITLE_STYLE,
  TOPIC_TITLE_STYLE_CHANGED,
  type TopicTitleStyle
} from "../../../src/topic-title-style";

export function useTopicTitleStyle(active = true): TopicTitleStyle {
  const [style, setStyle] = useState(DEFAULT_TOPIC_TITLE_STYLE);

  useEffect(() => {
    function apply(value: unknown): void {
      setStyle(clampTopicTitleStyle(value));
    }

    function load(): void {
      if (!window.xamxixiu?.getSettings) {
        return;
      }
      void window.xamxixiu
        .getSettings()
        .then((settings) => apply(settings.topicTitle))
        .catch(() => undefined);
    }

    function onChanged(event: Event): void {
      const detail = (event as CustomEvent<TopicTitleStyle>).detail;
      if (detail) {
        apply(detail);
        return;
      }
      load();
    }

    window.addEventListener(TOPIC_TITLE_STYLE_CHANGED, onChanged);
    return () => {
      window.removeEventListener(TOPIC_TITLE_STYLE_CHANGED, onChanged);
    };
  }, []);

  useEffect(() => {
    if (!active || !window.xamxixiu?.getSettings) {
      return;
    }
    void window.xamxixiu
      .getSettings()
      .then((settings) => {
        setStyle(clampTopicTitleStyle(settings.topicTitle));
      })
      .catch(() => undefined);
  }, [active]);

  return style;
}
