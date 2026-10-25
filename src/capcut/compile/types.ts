export interface CompileItem {
  path?: string;
  start: number;
  duration: number;
  sourceStart?: number;
  type?: "video" | "photo";
  ref?: string;
  volume?: number;
  opacity?: number;
  scale?: number;
  x?: number;
  y?: number;
  fadeIn?: number;
  flyUp?: boolean;
  animationDuration?: number;
  text?: string;
  fontSize?: number;
  color?: string;
  width?: number;
  height?: number;
}

export interface CompileTrack {
  type: "video" | "audio" | "text";
  name: string;
  items: CompileItem[];
}

export interface CompileSpec {
  name: string;
  width: number;
  height: number;
  fps: number;
  ratio: string;
  tracks: CompileTrack[];
  operations?: Array<Record<string, unknown>>;
}

export interface CapCutSegment {
  id: string;
  start_us: number;
  label?: string;
}
