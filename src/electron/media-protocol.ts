import {
  createReadStream
} from "node:fs";
import {
  stat
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { AssetLibrary } from "../assets/library.js";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm"
};

function mimeTypeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()]
    ?? "application/octet-stream";
}

function byteRange(
  header: string | null,
  size: number
): { start: number; end: number; status: 200 | 206 } | { status: 416 } {
  if (!header) {
    return { start: 0, end: Math.max(0, size - 1), status: 200 };
  }
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) {
    return { start: 0, end: Math.max(0, size - 1), status: 200 };
  }
  const rawStart = match[1] ?? "";
  const rawEnd = match[2] ?? "";
  let start: number;
  let end: number;
  if (rawStart === "" && rawEnd !== "") {
    const suffix = Number(rawEnd);
    if (!Number.isInteger(suffix) || suffix <= 0) {
      return { status: 416 };
    }
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = rawStart === "" ? 0 : Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
  }
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return { status: 416 };
  }
  return {
    start,
    end: Math.min(end, size - 1),
    status: 206
  };
}

export async function handleAssetMediaRequest(
  request: Request,
  library: AssetLibrary
): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return new Response("Missing asset id", { status: 400 });
  }
  const asset = await library.get(id);
  if (!asset) {
    return new Response("Asset not found", { status: 404 });
  }

  const { size } = await stat(asset.file);
  const mimeType = mimeTypeFor(asset.file);
  const corsHeaders = {
    "Content-Type": mimeType,
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*"
  };

  if (size <= 0) {
    return new Response(null, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Length": "0"
      }
    });
  }

  const range = byteRange(request.headers.get("range"), size);
  if (range.status === 416) {
    return new Response(null, {
      status: 416,
      headers: {
        ...corsHeaders,
        "Content-Range": `bytes */${size}`
      }
    });
  }

  const { start, end, status } = range;
  const body = fileRangeBody(asset.file, start, end, request.signal);
  if (!body) {
    return new Response(null, {
      status: 499,
      headers: corsHeaders
    });
  }

  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      "Content-Length": String(end - start + 1),
      ...(status === 206
        ? { "Content-Range": `bytes ${start}-${end}/${size}` }
        : {})
    }
  });
}

function fileRangeBody(
  file: string,
  start: number,
  end: number,
  signal: AbortSignal
): ReadableStream<Uint8Array> | undefined {
  if (signal.aborted) {
    return undefined;
  }
  const stream = createReadStream(file, { start, end });
  stream.on("error", () => {
    if (!stream.destroyed) {
      stream.destroy();
    }
  });
  const abort = (): void => {
    if (!stream.destroyed) {
      stream.destroy();
    }
  };
  signal.addEventListener("abort", abort, { once: true });
  stream.once("close", () => {
    signal.removeEventListener("abort", abort);
  });
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}
