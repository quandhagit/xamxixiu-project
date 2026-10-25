import "dotenv/config";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type {
  TimelineCommentBlock,
  TimelineOverlay,
  TimelineScene,
  VideoTimeline
} from "../types.js";
import {
  getSceneBlocks,
  getSceneDuration
} from "../timeline/timing.js";
import { readMediaDuration } from "../media-duration.js";

type JsonPrimitive =
  | boolean
  | number
  | string
  | null;
type JsonValue =
  | JsonPrimitive
  | JsonObject
  | JsonValue[];
type JsonObject = {
  [key: string]: JsonValue;
};

interface CapCutProject {
  main_timeline_id: string;
}

let pathPlaceholder =
  `##_draftpath_placeholder_${crypto.randomUUID().toUpperCase()}_##`;

function asObject(
  value: JsonValue,
  description: string
): JsonObject {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      `Invalid CapCut ${description}`
    );
  }

  return value;
}

function asArray(
  value: JsonValue,
  description: string
): JsonValue[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid CapCut ${description}`
    );
  }

  return value;
}

async function readJson(
  file: string
): Promise<JsonObject> {
  const raw = await fs.readFile(
    file,
    "utf-8"
  );
  return asObject(
    JSON.parse(raw) as JsonValue,
    file
  );
}

async function writeJson(
  file: string,
  value: JsonObject
): Promise<void> {
  await fs.writeFile(
    file,
    JSON.stringify(value, null, 2),
    "utf-8"
  );
}

function getRequiredString(
  object: JsonObject,
  key: string
): string {
  const value = object[key];
  if (typeof value !== "string") {
    throw new Error(
      `Missing CapCut string field: ${key}`
    );
  }
  return value;
}

function getProjectRoot(): string {
  const localAppData =
    process.env.LOCALAPPDATA;
  const defaultTemplate =
    localAppData
      ? path.join(
          localAppData,
          "CapCut",
          "User Data",
          "Projects",
          "com.lveditor.draft",
          "0514"
        )
      : "";

  return (
    process.env.CAPCUT_TEMPLATE_DIR ??
    defaultTemplate
  );
}

function getOutputRoot(
  templateDirectory: string
): string {
  return (
    process.env.CAPCUT_OUTPUT_DIR ??
    path.dirname(templateDirectory)
  );
}

function microseconds(
  seconds: number
): number {
  return Math.max(
    1,
    Math.round(seconds * 1_000_000)
  );
}

function cloneObject(
  value: JsonObject
): JsonObject {
  return JSON.parse(
    JSON.stringify(value)
  ) as JsonObject;
}

function setTimerange(
  segment: JsonObject,
  start: number,
  duration: number,
  sourceStart = 0
): void {
  segment.source_timerange = {
    start: sourceStart,
    duration
  };
  segment.target_timerange = {
    start,
    duration
  };
  segment.id = crypto.randomUUID();
}

function setMaterialPath(
  material: JsonObject,
  sourceFile: string,
  outputFileName: string,
  duration: number
): void {
  material.path =
    `${pathPlaceholder}/Resources/local/${outputFileName}`;
  material.material_name =
    path.basename(sourceFile);
  material.duration = duration;
}

async function copyMedia(
  source: string,
  outputDirectory: string,
  counter: number
): Promise<string> {
  const sourceFile = path.resolve(
    process.cwd(),
    source
  );
  await fs.access(sourceFile);

  const extension =
    path.extname(sourceFile);
  const outputFileName =
    `${counter}-${crypto.randomUUID()}${extension}`;
  await fs.copyFile(
    sourceFile,
    path.join(
      outputDirectory,
      outputFileName
    )
  );
  return outputFileName;
}

function findTrack(
  tracks: JsonObject[],
  type: string,
  index: number
): JsonObject {
  const matches = tracks.filter(
    (track) => track.type === type
  );
  const track = matches[index];
  if (!track) {
    throw new Error(
      `CapCut ${type} track ${index} not found`
    );
  }
  return track;
}

function getSegmentTemplate(
  track: JsonObject
): JsonObject {
  const segments = asArray(
    track.segments ?? [],
    "segments"
  );
  const segment = segments[0];
  if (!segment) {
    throw new Error(
      "CapCut track has no segment template"
    );
  }
  return asObject(
    segment,
    "segment template"
  );
}

function addMaterial(
  materials: JsonObject[],
  template: JsonObject,
  source: string,
  outputFileName: string,
  duration: number
): string {
  const material = cloneObject(template);
  const id = crypto.randomUUID();
  const localMaterialId =
    crypto.randomUUID();
  material.id = id;
  material.local_material_id =
    localMaterialId;
  setMaterialPath(
    material,
    source,
    outputFileName,
    duration
  );
  materials.push(material);
  return id;
}

function createSegment(
  template: JsonObject,
  materialId: string,
  start: number,
  duration: number,
  sourceStart = 0
): JsonObject {
  const segment = cloneObject(template);
  segment.material_id = materialId;
  segment.visible = true;
  setTimerange(
    segment,
    start,
    duration,
    sourceStart
  );
  return segment;
}

function getLocalFileName(
  material: JsonObject
): string {
  const materialPath =
    typeof material.path === "string"
      ? material.path
      : "";
  const marker =
    "Resources/local/";
  const markerIndex =
    materialPath.indexOf(marker);

  if (markerIndex < 0) {
    throw new Error(
      "Generated CapCut material has no local path"
    );
  }

  return materialPath.slice(
    markerIndex + marker.length
  );
}

function toMetaMaterial(
  material: JsonObject
): JsonObject {
  const fileName =
    getLocalFileName(material);
  const extension =
    path.extname(fileName).toLowerCase();
  const isAudio =
    [".mp3", ".wav", ".m4a", ".aac"].includes(
      extension
    );
  const isVideo =
    [".mp4", ".mov", ".webm", ".mkv"].includes(
      extension
    );
  const now =
    Math.floor(Date.now() / 1000);
  const duration =
    typeof material.duration === "number"
      ? material.duration
      : 0;
  const width =
    typeof material.width === "number"
      ? material.width
      : 0;
  const height =
    typeof material.height === "number"
      ? material.height
      : 0;

  return {
    ai_group_type: "",
    create_time: now,
    duration,
    enter_from: 0,
    extra_info:
      typeof material.material_name === "string"
        ? material.material_name
        : fileName,
    file_Path:
      `./Resources/local/${fileName}`,
    height,
    id:
      typeof material.local_material_id === "string"
        ? material.local_material_id
        : material.id,
    import_time: now,
    import_time_ms: Date.now(),
    item_source: 1,
    md5: "",
    metetype: isAudio
      ? "music"
      : isVideo
        ? "video"
        : "photo",
    roughcut_time_range: {
      duration,
      start: 0
    },
    sub_time_range: {
      duration: -1,
      start: -1
    },
    type: 0,
    width
  };
}

async function updateDraftMeta(
  outputDirectory: string,
  videoMaterials: JsonObject[],
  audioMaterials: JsonObject[]
): Promise<void> {
  const metaPath =
    path.join(
      outputDirectory,
      "draft_meta_info.json"
    );
  const meta =
    await readJson(metaPath);
  const draftMaterials =
    asArray(
      meta.draft_materials ?? [],
      "draft materials"
    ).map((item) =>
      asObject(item, "draft material")
    );
  const mediaGroup =
    draftMaterials.find(
      (item) => item.type === 0
    );
  const existingMediaValues =
    mediaGroup
      ? asArray(
          mediaGroup.value ?? [],
          "draft media values"
        ).map((item) =>
          asObject(item, "draft media value")
        )
      : [];
  const generatedMediaValues = [
    ...videoMaterials,
    ...audioMaterials
  ].map(toMetaMaterial);
  const mediaValues = [
    ...existingMediaValues,
    ...generatedMediaValues
  ];

  if (mediaGroup) {
    mediaGroup.value = mediaValues;
  } else {
    draftMaterials.push({
      type: 0,
      value: mediaValues
    });
  }

  meta.draft_materials =
    draftMaterials;
  meta.draft_materials_copied_info =
    generatedMediaValues.map((material) => ({
      dst_path: material.file_Path,
      src_path: material.file_Path
    }));
  await writeJson(metaPath, meta);
}

async function updateKeyValue(
  outputDirectory: string,
  materials: JsonObject[],
  tracks: JsonObject[]
): Promise<void> {
  const keyValuePath =
    path.join(outputDirectory, "key_value.json");
  let keyValue: JsonObject;

  try {
    keyValue = await readJson(keyValuePath);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }

  const templateEntry = Object.values(keyValue)
    .map((value) =>
      asObject(value, "key value entry")
    )
    .find(
      (value) => value.materialCategory === "media"
    );

  if (!templateEntry) {
    return;
  }

  const segments = tracks.flatMap((track) =>
    asArray(
      track.segments ?? [],
      "track segments"
    ).map((value) =>
      asObject(value, "track segment")
    )
  );

  for (const material of materials) {
    const materialId = getRequiredString(
      material,
      "id"
    );
    const fileName =
      getLocalFileName(material);
    const materialKey = crypto
      .createHash("md5")
      .update(fileName)
      .digest("hex");
    const materialName =
      typeof material.material_name === "string"
        ? material.material_name
        : fileName;
    const materialEntry =
      cloneObject(templateEntry);
    materialEntry.materialId = materialKey;
    materialEntry.materialName = materialName;
    materialEntry.materialSubcategory =
      "local";
    materialEntry.segmentId = "";
    keyValue[materialKey] = materialEntry;

    for (const segment of segments.filter(
      (value) => value.material_id === materialId
    )) {
      const segmentId = getRequiredString(
        segment,
        "id"
      );
      const segmentEntry =
        cloneObject(templateEntry);
      segmentEntry.materialId = materialKey;
      segmentEntry.materialName = materialName;
      segmentEntry.materialSubcategory =
        "local";
      segmentEntry.segmentId = segmentId;
      keyValue[segmentId] = segmentEntry;
    }
  }

  await writeJson(keyValuePath, keyValue);
}

async function getDirectorySize(
  directory: string
): Promise<number> {
  const entries = await fs.readdir(
    directory,
    { withFileTypes: true }
  );
  let total = 0;

  for (const entry of entries) {
    const entryPath =
      path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySize(
        entryPath
      );
    } else {
      total += (
        await fs.stat(entryPath)
      ).size;
    }
  }

  return total;
}

async function registerDraft(
  outputDirectory: string,
  draftId: string,
  duration: number
): Promise<void> {
  const rootDirectory =
    path.dirname(outputDirectory);
  const rootMetaPath =
    path.join(
      rootDirectory,
      "root_meta_info.json"
    );
  let rootMeta: JsonObject;

  try {
    rootMeta =
      await readJson(rootMetaPath);
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      rootMeta = {
        all_draft_store: [],
        draft_ids: 0,
        root_path: rootDirectory
      };
    } else {
      throw error;
    }
  }

  const stores =
    asArray(
      rootMeta.all_draft_store ?? [],
      "root draft store"
    ).map((item) =>
      asObject(item, "root draft")
    );
  const normalizedOutput =
    outputDirectory.replaceAll(
      "\\",
      "/"
    );
  const draftName =
    path.basename(outputDirectory);
  const existingIndex =
    stores.findIndex(
      (store) =>
        store.draft_id === draftId ||
        store.draft_fold_path === outputDirectory
    );
  const now = Date.now();
  const store: JsonObject = {
    cloud_draft_cover: false,
    cloud_draft_sync: false,
    draft_cloud_last_action_download: false,
    draft_cloud_purchase_info: "",
    draft_cloud_template_id: "",
    draft_cloud_tutorial_info: "",
    draft_cloud_videocut_purchase_info: "",
    draft_cover:
      `${normalizedOutput}/draft_cover.jpg`,
    draft_fold_path: outputDirectory,
    draft_id: draftId,
    draft_is_ai_shorts: false,
    draft_is_cloud_temp_draft: false,
    draft_is_infinite_canvas_draft: false,
    draft_is_invisible: false,
    draft_is_pippit_draft: false,
    draft_is_web_article_video: false,
    draft_json_file:
      `${normalizedOutput}/draft_content.json`,
    draft_name: draftName,
    draft_new_version: "",
    draft_root_path: rootDirectory,
    draft_timeline_materials_size:
      await getDirectorySize(outputDirectory),
    draft_type: "",
    draft_web_article_video_enter_from: "",
    pippit_avatar_url: "",
    pippit_extra_info: "",
    pippit_id: "",
    pippit_user_name: "",
    streaming_edit_draft_ready: true,
    tm_draft_cloud_completed: "",
    tm_draft_cloud_entry_id: -1,
    tm_draft_cloud_modified: 0,
    tm_draft_cloud_parent_entry_id: -1,
    tm_draft_cloud_space_id: -1,
    tm_draft_cloud_user_id: -1,
    tm_draft_create: now,
    tm_draft_modified: now,
    tm_draft_removed: 0,
    tm_duration: duration
  };

  if (existingIndex >= 0) {
    stores[existingIndex] = store;
  } else {
    stores.push(store);
  }

  rootMeta.all_draft_store = stores;
  rootMeta.draft_ids =
    typeof rootMeta.draft_ids === "number"
      ? Math.max(
          rootMeta.draft_ids,
          stores.length
        )
      : stores.length;
  rootMeta.root_path =
    rootDirectory.replaceAll(
      "\\",
      "/"
    );
  await writeJson(
    rootMetaPath,
    rootMeta
  );
}

async function syncDraftCopies(
  outputDirectory: string,
  timelineId: string,
  draft: JsonObject
): Promise<void> {
  const copies = [
    path.join(
      outputDirectory,
      "draft_content.json.bak"
    ),
    path.join(
      outputDirectory,
      "template-2.tmp"
    ),
    path.join(
      outputDirectory,
      "Timelines",
      timelineId,
      "draft_content.json.bak"
    ),
    path.join(
      outputDirectory,
      "Timelines",
      timelineId,
      "template-2.tmp"
    )
  ];

  for (const file of copies) {
    try {
      await writeJson(
        file,
        cloneObject(draft)
      );
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }
      throw error;
    }
  }
}

async function addSceneMedia(
  scene: TimelineScene,
  sceneStart: number,
  imageTrack: JsonObject,
  overlayTrack: JsonObject,
  voiceTrack: JsonObject,
  sfxTrack: JsonObject,
  videoMaterials: JsonObject[],
  audioMaterials: JsonObject[],
  imageTemplate: JsonObject,
  overlayTemplate: JsonObject,
  audioTemplate: JsonObject,
  outputDirectory: string,
  counter: { value: number }
): Promise<void> {
  for (const block of getSceneBlocks(scene)) {
    await addBlockMedia(
      block,
      sceneStart,
      imageTrack,
      overlayTrack,
      voiceTrack,
      sfxTrack,
      videoMaterials,
      audioMaterials,
      imageTemplate,
      overlayTemplate,
      audioTemplate,
      outputDirectory,
      counter
    );
  }
}

async function addBlockMedia(
  block: TimelineCommentBlock,
  sceneStart: number,
  imageTrack: JsonObject,
  overlayTrack: JsonObject,
  voiceTrack: JsonObject,
  sfxTrack: JsonObject,
  videoMaterials: JsonObject[],
  audioMaterials: JsonObject[],
  imageTemplate: JsonObject,
  overlayTemplate: JsonObject,
  audioTemplate: JsonObject,
  outputDirectory: string,
  counter: { value: number }
): Promise<void> {
  const imageFileName =
    await copyMedia(
      block.imageFile,
      outputDirectory,
      counter.value++
    );
  const imageMaterialId =
    addMaterial(
      videoMaterials,
      imageTemplate,
      block.imageFile,
      imageFileName,
      microseconds(block.imageDuration)
    );
  const imageSegments = asArray(
    imageTrack.segments ?? [],
    "image segments"
  );
  imageSegments.push(
    createSegment(
      imageTemplate,
      imageMaterialId,
      microseconds(sceneStart + block.imageStart),
      microseconds(block.imageDuration)
    )
  );
  imageTrack.segments = imageSegments;

  const audioFileName =
    await copyMedia(
      block.audioFile,
      outputDirectory,
      counter.value++
    );
  const audioMaterialId =
    addMaterial(
      audioMaterials,
      audioTemplate,
      block.audioFile,
      audioFileName,
      microseconds(block.audioDuration)
    );
  const voiceSegments = asArray(
    voiceTrack.segments ?? [],
    "voice segments"
  );
  voiceSegments.push(
    createSegment(
      audioTemplate,
      audioMaterialId,
      microseconds(sceneStart + block.audioStart),
      microseconds(block.audioDuration)
    )
  );
  voiceTrack.segments = voiceSegments;

  for (const overlay of block.overlays) {
    await addOverlay(
      overlay,
      sceneStart,
      overlayTrack,
      sfxTrack,
      videoMaterials,
      audioMaterials,
      overlayTemplate,
      audioTemplate,
      outputDirectory,
      counter
    );
  }
}

async function addOverlay(
  overlay: TimelineOverlay,
  sceneStart: number,
  overlayTrack: JsonObject,
  sfxTrack: JsonObject,
  videoMaterials: JsonObject[],
  audioMaterials: JsonObject[],
  videoTemplate: JsonObject,
  audioTemplate: JsonObject,
  outputDirectory: string,
  counter: { value: number }
): Promise<void> {
  const isAudio =
    overlay.type === "sfx";
  const fileName =
    await copyMedia(
      overlay.file,
      outputDirectory,
      counter.value++
    );
  const duration =
    microseconds(overlay.duration);
  const materialId =
    isAudio
      ? addMaterial(
          audioMaterials,
          audioTemplate,
          overlay.file,
          fileName,
          duration
        )
      : addMaterial(
          videoMaterials,
          videoTemplate,
          overlay.file,
          fileName,
          duration
        );
  const track =
    isAudio ? sfxTrack : overlayTrack;
  const segments = asArray(
    track.segments ?? [],
    "overlay segments"
  );
  segments.push(
    createSegment(
      isAudio
        ? audioTemplate
        : videoTemplate,
      materialId,
      microseconds(
        sceneStart + overlay.start
      ),
      duration
    )
  );
  track.segments = segments;
}

export async function generateCapCutProject(
  projectDirectory: string
): Promise<string> {
  const templateDirectory =
    getProjectRoot();
  if (!templateDirectory) {
    throw new Error(
      "CAPCUT_TEMPLATE_DIR is not configured"
    );
  }

  const projectTimeline =
    await readJson(
      path.join(
        projectDirectory,
        "timeline.json"
      )
    ) as unknown as VideoTimeline;
  const templateProject =
    await readJson(
      path.join(
        templateDirectory,
        "Timelines",
        "project.json"
      )
    );
  const templateTimelineId =
    getRequiredString(
      templateProject,
      "main_timeline_id"
    );
  const outputRoot =
    getOutputRoot(templateDirectory);
  const finalOutputDirectory =
    path.join(
      outputRoot,
      `${path.basename(projectDirectory)}-${Date.now()}`
    );
  const outputDirectory =
    path.join(
      os.tmpdir(),
      `xamxixiu-capcut-${crypto.randomUUID()}`
    );
  await fs.mkdir(outputDirectory, {
    recursive: true
  });
  await fs.cp(
    templateDirectory,
    outputDirectory,
    { recursive: true }
  );

  const timelineId =
    crypto.randomUUID();
  await fs.rename(
    path.join(
      outputDirectory,
      "Timelines",
      templateTimelineId
    ),
    path.join(
      outputDirectory,
      "Timelines",
      timelineId
    )
  );

  const draftPath =
    path.join(
      outputDirectory,
      "Timelines",
      timelineId,
      "draft_content.json"
    );
  const draft =
    await readJson(draftPath);
  const generatedDraftId =
    crypto.randomUUID();
  draft.id = timelineId;
  const tracks = asArray(
    draft.tracks ?? [],
    "tracks"
  ).map((track) =>
    asObject(track, "track")
  );
  for (const track of tracks) {
    track.id = crypto
      .randomUUID()
      .toUpperCase();
  }
  const videoTracks = tracks.filter(
    (track) => track.type === "video"
  );
  const audioTracks = tracks.filter(
    (track) => track.type === "audio"
  );
  const backgroundTrack =
    findTrack(videoTracks, "video", 0);
  const imageTrack =
    findTrack(videoTracks, "video", 1);
  const overlayTrack =
    findTrack(videoTracks, "video", 2);
  const voiceTrack =
    findTrack(audioTracks, "audio", 0);
  const sfxTrack =
    findTrack(audioTracks, "audio", 1);
  const musicTrack =
    findTrack(audioTracks, "audio", 2);

  const imageTemplate =
    getSegmentTemplate(
      findTrack(videoTracks, "video", 1)
    );
  const backgroundTemplate =
    getSegmentTemplate(
      findTrack(videoTracks, "video", 0)
    );
  const overlayTemplate =
    getSegmentTemplate(
      findTrack(videoTracks, "video", 2)
    );
  const audioTemplate =
    getSegmentTemplate(
      findTrack(audioTracks, "audio", 0)
    );
  const musicTemplate =
    getSegmentTemplate(
      findTrack(audioTracks, "audio", 2)
    );

  for (const track of tracks) {
    track.segments = [];
  }
  const materials =
    asObject(
      draft.materials ?? {},
      "materials"
    );
  const existingVideoMaterials =
    asArray(
      materials.videos ?? [],
      "video materials"
    ).map((item) =>
      asObject(item, "video material")
    );
  const existingAudioMaterials =
    asArray(
      materials.audios ?? [],
      "audio materials"
    ).map((item) =>
      asObject(item, "audio material")
    );
  const videoMaterials: JsonObject[] = [];
  const audioMaterials: JsonObject[] = [];
  const templateMaterial =
    [
      ...existingVideoMaterials,
      ...existingAudioMaterials
    ].find((material) => {
      const materialPath =
        typeof material.path === "string"
          ? material.path
          : "";
      return materialPath.includes(
        "##_draftpath_placeholder_"
      );
    });
  if (templateMaterial) {
    const materialPath =
      templateMaterial.path as string;
    const markerIndex =
      materialPath.indexOf(
        "/Resources/local/"
      );
    if (markerIndex >= 0) {
      pathPlaceholder =
        materialPath.slice(0, markerIndex);
    }
  }
  const outputMediaDirectory =
    path.join(
      outputDirectory,
      "Resources",
      "local"
    );
  const counter = { value: 0 };
  const totalDuration =
    microseconds(
      projectTimeline.totalDuration
    );

  if (projectTimeline.backgroundFile) {
    const fileName =
      await copyMedia(
        projectTimeline.backgroundFile,
        outputMediaDirectory,
        counter.value++
      );
    const materialId =
      addMaterial(
        videoMaterials,
        backgroundTemplate,
        projectTimeline.backgroundFile,
        fileName,
        totalDuration
      );
    const sourceStartUs = Math.max(
      0,
      Math.round(
        (projectTimeline.backgroundStart ?? 0) * 1_000_000
      )
    );
    let sourceDurationUs = totalDuration;
    let loopBackground = false;
    try {
      const fileDurationUs = Math.round(
        (await readMediaDuration(
          projectTimeline.backgroundFile
        )) * 1_000_000
      );
      const remainingUs = Math.max(
        1,
        fileDurationUs - sourceStartUs
      );
      if (remainingUs < totalDuration) {
        sourceDurationUs = remainingUs;
        loopBackground = true;
      }
    } catch {
      loopBackground = true;
    }
    const segment =
      createSegment(
        backgroundTemplate,
        materialId,
        0,
        totalDuration,
        sourceStartUs
      );
    segment.source_timerange = {
      start: sourceStartUs,
      duration: sourceDurationUs
    };
    segment.is_loop = loopBackground;
    backgroundTrack.segments = [segment];
  }

  if (projectTimeline.musicFile) {
    const fileName =
      await copyMedia(
        projectTimeline.musicFile,
        outputMediaDirectory,
        counter.value++
      );
    const materialId =
      addMaterial(
        audioMaterials,
        musicTemplate,
        projectTimeline.musicFile,
        fileName,
        totalDuration
      );
    const segment =
      createSegment(
        musicTemplate,
        materialId,
        0,
        totalDuration
      );
    segment.is_loop = false;
    musicTrack.segments = [segment];
  }

  let sceneStart = 0;

  for (const scene of projectTimeline.scenes) {
    await addSceneMedia(
      scene,
      sceneStart,
      imageTrack,
      overlayTrack,
      voiceTrack,
      sfxTrack,
      videoMaterials,
      audioMaterials,
      imageTemplate,
      overlayTemplate,
      audioTemplate,
      outputMediaDirectory,
      counter
    );
    sceneStart += getSceneDuration(scene);
  }

  materials.videos = [
    ...existingVideoMaterials,
    ...videoMaterials
  ];
  materials.audios = [
    ...existingAudioMaterials,
    ...audioMaterials
  ];
  draft.materials = materials;
  draft.tracks = tracks;
  draft.duration =
    microseconds(projectTimeline.totalDuration);
  draft.update_time = Date.now();
  await writeJson(draftPath, draft);

  const rootDraftPath =
    path.join(
      outputDirectory,
      "draft_content.json"
    );
  try {
    await writeJson(
      rootDraftPath,
      draft
    );
  } catch {
    // The timeline copy is the source CapCut opens.
  }
  await syncDraftCopies(
    outputDirectory,
    timelineId,
    draft
  );

  const metaPath =
    path.join(
      outputDirectory,
      "draft_meta_info.json"
    );
  const meta =
    await readJson(metaPath);
  meta.draft_id = generatedDraftId;
  meta.draft_name =
    path.basename(outputDirectory);
  meta.draft_fold_path =
    outputDirectory;
  meta.draft_root_path =
    path.dirname(outputDirectory);
  meta.tm_duration =
    microseconds(
      projectTimeline.totalDuration
    );
  await writeJson(metaPath, meta);
  await updateDraftMeta(
    outputDirectory,
    videoMaterials,
    audioMaterials
  );
  await updateKeyValue(
    outputDirectory,
    [...videoMaterials, ...audioMaterials],
    tracks
  );

  const outputProjectPath =
    path.join(
      outputDirectory,
      "Timelines",
      "project.json"
    );
  const outputProject =
    await readJson(outputProjectPath);
  outputProject.id =
    crypto.randomUUID();
  outputProject.main_timeline_id =
    timelineId;
  if (
    Array.isArray(outputProject.timelines)
  ) {
    outputProject.timelines =
      outputProject.timelines.map(
        (value) => {
          const timeline =
            asObject(
              value,
              "timeline"
            );
          timeline.id = timelineId;
          return timeline;
        }
      );
  }
  outputProject.update_time =
    Date.now();
  await writeJson(
    outputProjectPath,
    outputProject
  );
  await writeJson(
    path.join(
      outputDirectory,
      "Timelines",
      "project.json.bak"
    ),
    cloneObject(outputProject)
  );

  await fs.mkdir(outputRoot, {
    recursive: true
  });
  try {
    await fs.rename(
      outputDirectory,
      finalOutputDirectory
    );
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "EXDEV"
    ) {
      await fs.cp(
        outputDirectory,
        finalOutputDirectory,
        { recursive: true }
      );
      await fs.rm(
        outputDirectory,
        {
          recursive: true,
          force: true
        }
      );
    } else {
      throw error;
    }
  }

  await registerDraft(
    finalOutputDirectory,
    generatedDraftId,
    microseconds(
      projectTimeline.totalDuration
    )
  );

  return finalOutputDirectory;
}

