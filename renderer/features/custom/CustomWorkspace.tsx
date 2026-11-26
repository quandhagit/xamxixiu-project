"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import {
  clampCommentCaptureStyle,
  commentCaptureCardStyle,
  COMMENT_CAPTURE_LIMITS,
  COMMENT_CAPTURE_STYLE_CHANGED,
  DEFAULT_COMMENT_CAPTURE_STYLE,
  parseHexColor,
  type CommentCaptureStyle
} from "../../../src/capture-style";
import {
  clampTopicTitleStyle,
  DEFAULT_TOPIC_TITLE_STYLE,
  overlayCanvasPx,
  TOPIC_TITLE_FONTS,
  TOPIC_TITLE_PREVIEW_TEXT,
  TOPIC_TITLE_STYLE_CHANGED,
  TOPIC_TITLE_STYLE_LIMITS,
  topicTitleCardStyle,
  type TopicTitleStyle
} from "../../../src/topic-title-style";
import {
  clampMemeDefaultStyle,
  DEFAULT_MEME_STYLE,
  MEME_STYLE_CHANGED,
  MEME_STYLE_LIMITS,
  type MemeDefaultStyle
} from "../../../src/meme-style";
import {
  clampImageEffectStyle,
  DEFAULT_IMAGE_EFFECT,
  IMAGE_EFFECT_CHANGED,
  IMAGE_EFFECT_LABELS,
  IMAGE_EFFECT_LIMITS,
  IMAGE_ENTRANCES,
  imageEffectLeftPercent,
  imageEffectOpacity,
  imageEffectProgress,
  imageEffectScale,
  imageEffectTopPercent,
  type ImageEffectStyle
} from "../../../src/image-effect";
import {
  clampWatermarkStyle,
  DEFAULT_WATERMARK_STYLE,
  WATERMARK_CANVAS,
  WATERMARK_STYLE_CHANGED,
  WATERMARK_STYLE_LIMITS,
  watermarkOpacity,
  watermarkPoint,
  type WatermarkStyle
} from "../../../src/watermark-style";
import { TOPIC_TITLE_WIDTH_FRACTION } from "../../../src/timeline/topic-constants";
import {
  overlayRestLeftPercent,
  overlayRestTopPercent
} from "../../../src/timeline/clip-position";
import {
  previewStageBoxStyle,
  previewStageScale
} from "../preview/preview-chrome";
import { useErrorToast } from "../app/ErrorToast";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Panel } from "../ui/Panel";
import { Select } from "../ui/Select";
import { cn } from "../ui/cn";
import {
  CUSTOM_TABS,
  type CustomTabId
} from "./custom-tabs";
import { pickPreviewMeme } from "./preview-meme";

function NumberField({
  id,
  label,
  value,
  min,
  max,
  onChange,
  step = 1,
  suffix = "px"
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  step?: number;
  suffix?: string;
}): React.ReactElement {
  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1 flex items-center justify-between text-[11px] font-medium tracking-wide text-ink-3">
        {label}
        <span className="text-ink-2">
          {value}
          {suffix}
        </span>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-accent"
      />
      <Input
        className="mt-1.5"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          if (event.target.value === "") {
            onChange(min);
            return;
          }
          const next = Number(event.target.value);
          if (Number.isFinite(next)) {
            onChange(next);
          }
        }}
      />
    </label>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1 block text-[11px] font-medium tracking-wide text-ink-3">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-line bg-app p-0.5"
        />
        <Input
          value={text}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            const parsed = parseHexColor(next);
            if (parsed) {
              onChange(parsed);
            }
          }}
          onBlur={() => setText(value)}
        />
      </div>
    </label>
  );
}

const COMMENT_PREVIEW_WIDTH_FRACTION = 0.85;

const PREVIEW_ASSET_PATHS = [
  "processed/comment-01.png",
  "processed/topic.png"
];

const PREVIEW_CHECKERBOARD = {
  backgroundColor: "#dcdcdc",
  backgroundImage: [
    "linear-gradient(45deg, #c4c4c4 25%, transparent 25%)",
    "linear-gradient(-45deg, #c4c4c4 25%, transparent 25%)",
    "linear-gradient(45deg, transparent 75%, #c4c4c4 75%)",
    "linear-gradient(-45deg, transparent 75%, #c4c4c4 75%)"
  ].join(", "),
  backgroundSize: "20px 20px",
  backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px"
} as const;

async function loadPreviewCapture(): Promise<string | undefined> {
  if (!window.xamxixiu?.getProjects || !window.xamxixiu.getProjectAsset) {
    return undefined;
  }

  const projects = await window.xamxixiu.getProjects();
  for (const project of projects) {
    for (const relativePath of PREVIEW_ASSET_PATHS) {
      try {
        const source = await window.xamxixiu.getProjectAsset(
          project.id,
          relativePath
        );
        if (source) {
          return source;
        }
      } catch {
        // Try the next capture file or project.
      }
    }
  }

  return undefined;
}

async function loadPreviewMeme(): Promise<string | undefined> {
  if (!window.xamxixiu?.listAssets || !window.xamxixiu.getAssetPreview) {
    return undefined;
  }

  const assets = await window.xamxixiu.listAssets();
  const meme = pickPreviewMeme(assets);
  if (!meme) {
    return undefined;
  }
  try {
    return await window.xamxixiu.getAssetPreview(meme.id);
  } catch {
    return undefined;
  }
}

function CommentCapturePanel({
  visible
}: {
  visible: boolean;
}): React.ReactElement {
  const setError = useErrorToast();
  const [style, setStyle] = useState<CommentCaptureStyle>(
    DEFAULT_COMMENT_CAPTURE_STYLE
  );
  const [saved, setSaved] = useState<CommentCaptureStyle>(
    DEFAULT_COMMENT_CAPTURE_STYLE
  );
  const [effect, setEffect] = useState<ImageEffectStyle>(DEFAULT_IMAGE_EFFECT);
  const [savedEffect, setSavedEffect] = useState<ImageEffectStyle>(
    DEFAULT_IMAGE_EFFECT
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string>();
  const [previewTime, setPreviewTime] = useState(0);
  const styleRef = useRef(style);
  styleRef.current = style;
  const effectRef = useRef(effect);
  effectRef.current = effect;
  const dirtyRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const dirty =
    JSON.stringify(clampCommentCaptureStyle(style)) !==
      JSON.stringify(saved) ||
    JSON.stringify(clampImageEffectStyle(effect)) !==
      JSON.stringify(savedEffect);
  dirtyRef.current = dirty;
  const progress = imageEffectProgress(previewTime, effect.duration);
  const restLeft = overlayRestLeftPercent(style.x);
  const restTop = overlayRestTopPercent(style.y);
  const left = imageEffectLeftPercent(effect.entrance, restLeft, progress);
  const top = imageEffectTopPercent(effect.entrance, restTop, progress);
  const scale = imageEffectScale(effect.entrance, progress);
  const opacity = imageEffectOpacity(effect.entrance, progress);

  function update(partial: Partial<CommentCaptureStyle>): void {
    setStyle((current) =>
      clampCommentCaptureStyle({ ...current, ...partial })
    );
  }

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (!window.xamxixiu?.getSettings) {
      setError("Custom chỉ dùng trong app desktop.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void window.xamxixiu
      .getSettings()
      .then((settings) => {
        if (cancelled) {
          return;
        }
        const nextStyle = clampCommentCaptureStyle(settings.commentCapture);
        const nextEffect = clampImageEffectStyle(settings.imageEffect);
        setSaved(nextStyle);
        setSavedEffect(nextEffect);
        if (!dirtyRef.current) {
          setStyle(nextStyle);
          setEffect(nextEffect);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Không đọc được style capture."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible, setError]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let cancelled = false;
    void loadPreviewCapture()
      .then((source) => {
        if (!cancelled) {
          setPreviewSrc(source);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewSrc(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible) {
      return;
    }
    const stage = stageRef.current;
    function update(): void {
      setDisplayScale(
        previewStageScale(stageRef.current?.clientWidth ?? 0)
      );
    }
    update();
    if (!stage) {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || effect.entrance === "none") {
      setPreviewTime(effect.duration);
      return;
    }
    let frame = 0;
    const started = performance.now();
    const cycle = effect.duration + 0.8;
    function tick(now: number): void {
      const elapsed = ((now - started) / 1000) % cycle;
      setPreviewTime(elapsed);
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, effect.entrance, effect.duration]);

  function updateEffect(partial: Partial<ImageEffectStyle>): void {
    setEffect((current) => clampImageEffectStyle({ ...current, ...partial }));
  }

  async function save(): Promise<void> {
    if (!window.xamxixiu?.getSettings || !window.xamxixiu.saveSettings) {
      setError("Custom chỉ dùng trong app desktop.");
      return;
    }

    const nextStyle = clampCommentCaptureStyle(styleRef.current);
    const nextEffect = clampImageEffectStyle(effectRef.current);
    setSaving(true);
    setError(undefined);
    try {
      const current = await window.xamxixiu.getSettings();
      await window.xamxixiu.saveSettings({
        ...current,
        commentCapture: nextStyle,
        imageEffect: nextEffect
      });
      setStyle(nextStyle);
      setSaved(nextStyle);
      setEffect(nextEffect);
      setSavedEffect(nextEffect);
      window.dispatchEvent(
        new CustomEvent(COMMENT_CAPTURE_STYLE_CHANGED, {
          detail: nextStyle
        })
      );
      window.dispatchEvent(
        new CustomEvent(IMAGE_EFFECT_CHANGED, {
          detail: nextEffect
        })
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không lưu được style capture."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <Panel>
        <div className="space-y-3">
          <NumberField
            id="capture-radius"
            label="Radius"
            value={style.radius}
            min={COMMENT_CAPTURE_LIMITS.radius.min}
            max={COMMENT_CAPTURE_LIMITS.radius.max}
            onChange={(radius) => update({ radius })}
          />
          <NumberField
            id="capture-border"
            label="Border"
            value={style.border}
            min={COMMENT_CAPTURE_LIMITS.border.min}
            max={COMMENT_CAPTURE_LIMITS.border.max}
            onChange={(border) => update({ border })}
          />
          <ColorField
            id="capture-border-color"
            label="Border color"
            value={style.borderColor}
            onChange={(borderColor) => update({ borderColor })}
          />
          <NumberField
            id="capture-shadow"
            label="Shadow"
            value={style.shadow}
            min={COMMENT_CAPTURE_LIMITS.shadow.min}
            max={COMMENT_CAPTURE_LIMITS.shadow.max}
            onChange={(shadow) => update({ shadow })}
          />
          <ColorField
            id="capture-shadow-color"
            label="Shadow color"
            value={style.shadowColor}
            onChange={(shadowColor) => update({ shadowColor })}
          />
          <NumberField
            id="capture-x"
            label="X"
            value={style.x}
            min={COMMENT_CAPTURE_LIMITS.x.min}
            max={COMMENT_CAPTURE_LIMITS.x.max}
            step={0.05}
            suffix=""
            onChange={(x) => update({ x })}
          />
          <NumberField
            id="capture-y"
            label="Y"
            value={style.y}
            min={COMMENT_CAPTURE_LIMITS.y.min}
            max={COMMENT_CAPTURE_LIMITS.y.max}
            step={0.05}
            suffix=""
            onChange={(y) => update({ y })}
          />
          <label className="block" htmlFor="image-entrance">
            <span className="mb-1 block text-[11px] font-medium tracking-wide text-ink-3">
              Effect
            </span>
            <Select
              id="image-entrance"
              value={effect.entrance}
              onChange={(event) =>
                updateEffect({
                  entrance: event.target.value as ImageEffectStyle["entrance"]
                })
              }
            >
              {IMAGE_ENTRANCES.map((entrance) => (
                <option key={entrance} value={entrance}>
                  {IMAGE_EFFECT_LABELS[entrance]}
                </option>
              ))}
            </Select>
          </label>
          <NumberField
            id="image-duration"
            label="Duration"
            value={effect.duration}
            min={IMAGE_EFFECT_LIMITS.duration.min}
            max={IMAGE_EFFECT_LIMITS.duration.max}
            step={0.01}
            suffix="s"
            onChange={(duration) => updateEffect({ duration })}
          />
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="primary"
            onClick={() => {
              void save();
            }}
            disabled={loading || saving || !dirty}
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </Panel>
      <Panel className="flex min-h-[320px] flex-col">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">
          Preview
        </p>
        <div className="mt-3 flex min-h-[280px] flex-1 items-center justify-center rounded-lg p-4">
          <div
            ref={stageRef}
            className="relative mx-auto aspect-[9/16] h-[min(52vh,480px)] w-auto overflow-hidden rounded-lg border border-line"
            style={PREVIEW_CHECKERBOARD}
          >
            {previewSrc ? (
              <div style={previewStageBoxStyle(displayScale)}>
                <img
                  src={previewSrc}
                  alt="Preview comment capture"
                  style={{
                    position: "absolute",
                    width: `${COMMENT_PREVIEW_WIDTH_FRACTION * 100}%`,
                    maxHeight: "100%",
                    left: `${left}%`,
                    top: `${top}%`,
                    transform: `translate(-50%, -50%) scale(${scale})`,
                    objectFit: "contain",
                    opacity,
                    ...commentCaptureCardStyle(style)
                  }}
                />
              </div>
            ) : (
              <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-[13px] text-neutral-600">
                Chưa có ảnh capture. Hãy capture một project để xem preview thật.
              </p>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function TopicTitlePanel({
  visible
}: {
  visible: boolean;
}): React.ReactElement {
  const setError = useErrorToast();
  const [style, setStyle] = useState<TopicTitleStyle>(
    DEFAULT_TOPIC_TITLE_STYLE
  );
  const [saved, setSaved] = useState<TopicTitleStyle>(
    DEFAULT_TOPIC_TITLE_STYLE
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const styleRef = useRef(style);
  styleRef.current = style;
  const dirtyRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const dirty =
    JSON.stringify(clampTopicTitleStyle(style)) !==
    JSON.stringify(saved);
  dirtyRef.current = dirty;

  function update(partial: Partial<TopicTitleStyle>): void {
    setStyle((current) =>
      clampTopicTitleStyle({ ...current, ...partial })
    );
  }

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (!window.xamxixiu?.getSettings) {
      setError("Custom chỉ dùng trong app desktop.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void window.xamxixiu
      .getSettings()
      .then((settings) => {
        if (cancelled) {
          return;
        }
        const next = clampTopicTitleStyle(settings.topicTitle);
        setSaved(next);
        if (!dirtyRef.current) {
          setStyle(next);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Không đọc được style title."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible, setError]);

  useLayoutEffect(() => {
    if (!visible) {
      return;
    }
    const stage = stageRef.current;
    function update(): void {
      setDisplayScale(
        previewStageScale(stageRef.current?.clientWidth ?? 0)
      );
    }
    update();
    if (!stage) {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [visible]);

  async function save(): Promise<void> {
    if (!window.xamxixiu?.getSettings || !window.xamxixiu.saveSettings) {
      setError("Custom chỉ dùng trong app desktop.");
      return;
    }

    const next = clampTopicTitleStyle(styleRef.current);
    setSaving(true);
    setError(undefined);
    try {
      const current = await window.xamxixiu.getSettings();
      await window.xamxixiu.saveSettings({
        ...current,
        topicTitle: next
      });
      setStyle(next);
      setSaved(next);
      window.dispatchEvent(
        new CustomEvent(TOPIC_TITLE_STYLE_CHANGED, {
          detail: next
        })
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không lưu được style title."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <Panel>
        <div className="space-y-3">
          <ColorField
            id="title-background"
            label="Background"
            value={style.background}
            onChange={(background) => update({ background })}
          />
          <NumberField
            id="title-border"
            label="Border"
            value={style.border}
            min={TOPIC_TITLE_STYLE_LIMITS.border.min}
            max={TOPIC_TITLE_STYLE_LIMITS.border.max}
            onChange={(border) => update({ border })}
          />
          <ColorField
            id="title-border-color"
            label="Border color"
            value={style.borderColor}
            onChange={(borderColor) => update({ borderColor })}
          />
          <NumberField
            id="title-radius"
            label="Radius"
            value={style.radius}
            min={TOPIC_TITLE_STYLE_LIMITS.radius.min}
            max={TOPIC_TITLE_STYLE_LIMITS.radius.max}
            onChange={(radius) => update({ radius })}
          />
          <NumberField
            id="title-padding"
            label="Padding"
            value={style.padding}
            min={TOPIC_TITLE_STYLE_LIMITS.padding.min}
            max={TOPIC_TITLE_STYLE_LIMITS.padding.max}
            onChange={(padding) => update({ padding })}
          />
          <label className="block" htmlFor="title-font-family">
            <span className="mb-1 block text-[11px] font-medium tracking-wide text-ink-3">
              Font
            </span>
            <Select
              id="title-font-family"
              value={style.fontFamily}
              onChange={(event) =>
                update({ fontFamily: event.target.value })
              }
            >
              {TOPIC_TITLE_FONTS.map((font) => (
                <option key={font.css} value={font.css}>
                  {font.label}
                </option>
              ))}
            </Select>
          </label>
          <NumberField
            id="title-font-size"
            label="Font size"
            value={style.fontSize}
            min={TOPIC_TITLE_STYLE_LIMITS.fontSize.min}
            max={TOPIC_TITLE_STYLE_LIMITS.fontSize.max}
            onChange={(fontSize) => update({ fontSize })}
          />
          <ColorField
            id="title-color"
            label="Color"
            value={style.color}
            onChange={(color) => update({ color })}
          />
          <NumberField
            id="title-x"
            label="X"
            value={style.x}
            min={TOPIC_TITLE_STYLE_LIMITS.x.min}
            max={TOPIC_TITLE_STYLE_LIMITS.x.max}
            step={0.05}
            suffix=""
            onChange={(x) => update({ x })}
          />
          <NumberField
            id="title-y"
            label="Y"
            value={style.y}
            min={TOPIC_TITLE_STYLE_LIMITS.y.min}
            max={TOPIC_TITLE_STYLE_LIMITS.y.max}
            step={0.05}
            suffix=""
            onChange={(y) => update({ y })}
          />
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="primary"
            onClick={() => {
              void save();
            }}
            disabled={loading || saving || !dirty}
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </Panel>
      <Panel className="flex min-h-[320px] flex-col">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">
          Preview
        </p>
        <div className="mt-3 flex min-h-[280px] flex-1 items-center justify-center rounded-lg p-4">
          <div
            ref={stageRef}
            className="relative mx-auto aspect-[9/16] h-[min(52vh,480px)] w-auto overflow-hidden rounded-lg border border-line"
            style={PREVIEW_CHECKERBOARD}
          >
            <div style={previewStageBoxStyle(displayScale)}>
              <div
                style={{
                  position: "absolute",
                  width: `${TOPIC_TITLE_WIDTH_FRACTION * 100}%`,
                  maxHeight: "100%",
                  left: `${overlayRestLeftPercent(style.x)}%`,
                  top: `${overlayRestTopPercent(style.y)}%`,
                  transform: "translate(-50%, -50%)",
                  ...topicTitleCardStyle(style)
                }}
              >
                {TOPIC_TITLE_PREVIEW_TEXT}
              </div>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function MemePanel({
  visible
}: {
  visible: boolean;
}): React.ReactElement {
  const setError = useErrorToast();
  const [style, setStyle] = useState<MemeDefaultStyle>(DEFAULT_MEME_STYLE);
  const [saved, setSaved] = useState<MemeDefaultStyle>(DEFAULT_MEME_STYLE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string>();
  const styleRef = useRef(style);
  styleRef.current = style;
  const dirtyRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const dirty =
    JSON.stringify(clampMemeDefaultStyle(style)) !== JSON.stringify(saved);
  dirtyRef.current = dirty;

  function update(partial: Partial<MemeDefaultStyle>): void {
    setStyle((current) => clampMemeDefaultStyle({ ...current, ...partial }));
  }

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (!window.xamxixiu?.getSettings) {
      setError("Custom chỉ dùng trong app desktop.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void window.xamxixiu
      .getSettings()
      .then((settings) => {
        if (cancelled) {
          return;
        }
        const next = clampMemeDefaultStyle(settings.meme);
        setSaved(next);
        if (!dirtyRef.current) {
          setStyle(next);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Không đọc được style meme."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible, setError]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let cancelled = false;
    void loadPreviewMeme()
      .then((source) => {
        if (!cancelled) {
          setPreviewSrc(source);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewSrc(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible) {
      return;
    }
    const stage = stageRef.current;
    function updateScale(): void {
      setDisplayScale(
        previewStageScale(stageRef.current?.clientWidth ?? 0)
      );
    }
    updateScale();
    if (!stage) {
      return;
    }
    const observer = new ResizeObserver(updateScale);
    observer.observe(stage);
    window.addEventListener("resize", updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [visible]);

  async function save(): Promise<void> {
    if (!window.xamxixiu?.getSettings || !window.xamxixiu.saveSettings) {
      setError("Custom chỉ dùng trong app desktop.");
      return;
    }

    const next = clampMemeDefaultStyle(styleRef.current);
    setSaving(true);
    setError(undefined);
    try {
      const current = await window.xamxixiu.getSettings();
      await window.xamxixiu.saveSettings({
        ...current,
        meme: next
      });
      setStyle(next);
      setSaved(next);
      window.dispatchEvent(
        new CustomEvent(MEME_STYLE_CHANGED, {
          detail: next
        })
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không lưu được style meme."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <Panel>
        <div className="space-y-3">
          <NumberField
            id="meme-x"
            label="X"
            value={style.x}
            min={MEME_STYLE_LIMITS.x.min}
            max={MEME_STYLE_LIMITS.x.max}
            step={0.05}
            suffix=""
            onChange={(x) => update({ x })}
          />
          <NumberField
            id="meme-y"
            label="Y"
            value={style.y}
            min={MEME_STYLE_LIMITS.y.min}
            max={MEME_STYLE_LIMITS.y.max}
            step={0.05}
            suffix=""
            onChange={(y) => update({ y })}
          />
          <NumberField
            id="meme-scale"
            label="Scale"
            value={style.scale}
            min={MEME_STYLE_LIMITS.scale.min}
            max={MEME_STYLE_LIMITS.scale.max}
            step={0.05}
            suffix=""
            onChange={(scale) => update({ scale })}
          />
          <NumberField
            id="meme-fade-in"
            label="Fade in"
            value={style.fadeIn}
            min={MEME_STYLE_LIMITS.fadeIn.min}
            max={MEME_STYLE_LIMITS.fadeIn.max}
            step={0.05}
            suffix=""
            onChange={(fadeIn) => update({ fadeIn })}
          />
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="primary"
            onClick={() => {
              void save();
            }}
            disabled={loading || saving || !dirty}
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </Panel>
      <Panel className="flex min-h-[320px] flex-col">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">
          Preview
        </p>
        <div className="mt-3 flex min-h-[280px] flex-1 items-center justify-center rounded-lg p-4">
          <div
            ref={stageRef}
            className="relative mx-auto aspect-[9/16] h-[min(52vh,480px)] w-auto overflow-hidden rounded-lg border border-line"
            style={PREVIEW_CHECKERBOARD}
          >
            {previewSrc ? (
              <div style={previewStageBoxStyle(displayScale)}>
                <img
                  src={previewSrc}
                  alt="Preview meme"
                  style={{
                    position: "absolute",
                    width: `${style.scale * 100}%`,
                    maxHeight: "100%",
                    left: `${overlayRestLeftPercent(style.x)}%`,
                    top: `${overlayRestTopPercent(style.y)}%`,
                    transform: "translate(-50%, -50%)",
                    objectFit: "contain"
                  }}
                />
              </div>
            ) : (
              <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-[13px] text-neutral-600">
                Chưa có meme trong library. Hãy import một ảnh meme để xem preview.
              </p>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function WatermarkPanel({
  visible
}: {
  visible: boolean;
}): React.ReactElement {
  const setError = useErrorToast();
  const [style, setStyle] = useState<WatermarkStyle>(DEFAULT_WATERMARK_STYLE);
  const [saved, setSaved] = useState<WatermarkStyle>(DEFAULT_WATERMARK_STYLE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const styleRef = useRef(style);
  styleRef.current = style;
  const dirtyRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [displayScale, setDisplayScale] = useState(1);
  const dirty =
    JSON.stringify(clampWatermarkStyle(style)) !== JSON.stringify(saved);
  dirtyRef.current = dirty;
  const point = watermarkPoint(previewTime, style, WATERMARK_CANVAS);

  function update(partial: Partial<WatermarkStyle>): void {
    setStyle((current) => clampWatermarkStyle({ ...current, ...partial }));
  }

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (!window.xamxixiu?.getSettings) {
      setError("Custom chỉ dùng trong app desktop.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void window.xamxixiu
      .getSettings()
      .then((settings) => {
        if (cancelled) {
          return;
        }
        const next = clampWatermarkStyle(settings.watermark);
        setSaved(next);
        if (!dirtyRef.current) {
          setStyle(next);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Không đọc được watermark."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible, setError]);

  useLayoutEffect(() => {
    if (!visible) {
      return;
    }
    const stage = stageRef.current;
    function updateScale(): void {
      setDisplayScale(previewStageScale(stageRef.current?.clientWidth ?? 0));
    }
    updateScale();
    if (!stage) {
      return;
    }
    const observer = new ResizeObserver(updateScale);
    observer.observe(stage);
    window.addEventListener("resize", updateScale);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScale);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !style.text.trim()) {
      setPreviewTime(0);
      return;
    }
    let frame = 0;
    const started = performance.now();
    function tick(now: number): void {
      setPreviewTime((now - started) / 1000);
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, style.text, style.speed, style.fontSize]);

  async function save(): Promise<void> {
    if (!window.xamxixiu?.getSettings || !window.xamxixiu.saveSettings) {
      setError("Custom chỉ dùng trong app desktop.");
      return;
    }

    const next = clampWatermarkStyle(styleRef.current);
    setSaving(true);
    setError(undefined);
    try {
      const current = await window.xamxixiu.getSettings();
      await window.xamxixiu.saveSettings({
        ...current,
        watermark: next
      });
      setStyle(next);
      setSaved(next);
      window.dispatchEvent(
        new CustomEvent(WATERMARK_STYLE_CHANGED, {
          detail: next
        })
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không lưu được watermark."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
      <Panel>
        <div className="space-y-3">
          <label className="block" htmlFor="watermark-text">
            <span className="mb-1 block text-[11px] font-medium tracking-wide text-ink-3">
              Text
            </span>
            <Input
              id="watermark-text"
              value={style.text}
              maxLength={WATERMARK_STYLE_LIMITS.text.max}
              onChange={(event) => update({ text: event.target.value })}
            />
          </label>
          <label className="block" htmlFor="watermark-font-family">
            <span className="mb-1 block text-[11px] font-medium tracking-wide text-ink-3">
              Font
            </span>
            <Select
              id="watermark-font-family"
              value={style.fontFamily}
              onChange={(event) => update({ fontFamily: event.target.value })}
            >
              {TOPIC_TITLE_FONTS.map((font) => (
                <option key={font.css} value={font.css}>
                  {font.label}
                </option>
              ))}
            </Select>
          </label>
          <NumberField
            id="watermark-font-size"
            label="Size"
            value={style.fontSize}
            min={WATERMARK_STYLE_LIMITS.fontSize.min}
            max={WATERMARK_STYLE_LIMITS.fontSize.max}
            onChange={(fontSize) => update({ fontSize })}
          />
          <ColorField
            id="watermark-color"
            label="Color"
            value={style.color}
            onChange={(color) => update({ color })}
          />
          <NumberField
            id="watermark-blur"
            label="Blur"
            value={style.blur}
            min={WATERMARK_STYLE_LIMITS.blur.min}
            max={WATERMARK_STYLE_LIMITS.blur.max}
            suffix=""
            onChange={(blur) => update({ blur })}
          />
          <NumberField
            id="watermark-speed"
            label="Speed"
            value={style.speed}
            min={WATERMARK_STYLE_LIMITS.speed.min}
            max={WATERMARK_STYLE_LIMITS.speed.max}
            suffix="px/s"
            onChange={(speed) => update({ speed })}
          />
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            variant="primary"
            onClick={() => {
              void save();
            }}
            disabled={loading || saving || !dirty}
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </Panel>
      <Panel className="flex min-h-[320px] flex-col">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-3">
          Preview
        </p>
        <div className="mt-3 flex min-h-[280px] flex-1 items-center justify-center rounded-lg p-4">
          <div
            ref={stageRef}
            className="relative mx-auto aspect-[9/16] h-[min(52vh,480px)] w-auto overflow-hidden rounded-lg border border-line bg-black"
          >
            <div style={previewStageBoxStyle(displayScale)}>
              {style.text.trim() ? (
                <div
                  style={{
                    position: "absolute",
                    left: `${point.x}px`,
                    top: `${point.y}px`,
                    fontFamily: style.fontFamily,
                    fontSize: `${overlayCanvasPx(style.fontSize)}px`,
                    fontWeight: 700,
                    color: style.color,
                    whiteSpace: "nowrap",
                    lineHeight: 1.25,
                    opacity: watermarkOpacity(style),
                    pointerEvents: "none"
                  }}
                >
                  {style.text}
                </div>
              ) : (
                <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-[13px] text-neutral-500">
                  Nhập chữ để xem watermark trôi trong khung.
                </p>
              )}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export function CustomWorkspace({
  visible = true
}: {
  visible?: boolean;
}): React.ReactElement {
  const [tabId, setTabId] = useState<CustomTabId>("comment-capture");

  return (
    <section>
      <div>
        <h2 className="text-sm font-medium text-ink">Custom</h2>
        <p className="mt-0.5 text-[12px] text-ink-3">
          Tùy chỉnh title topic, comment capture, meme và watermark. Style đã lưu áp dụng live trên Timeline và export, không ghi vào file ảnh.
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1 border-b border-line pb-2">
        {CUSTOM_TABS.map((item) => {
          const active = item.id === tabId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTabId(item.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[12px] transition",
                active
                  ? "bg-accent/15 text-ink"
                  : "text-ink-2 hover:bg-elevated hover:text-ink"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {tabId === "comment-capture" ? (
        <CommentCapturePanel visible={visible} />
      ) : null}
      {tabId === "topic-title" ? (
        <TopicTitlePanel visible={visible} />
      ) : null}
      {tabId === "meme" ? <MemePanel visible={visible} /> : null}
      {tabId === "watermark" ? <WatermarkPanel visible={visible} /> : null}
    </section>
  );
}
