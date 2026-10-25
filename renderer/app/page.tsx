"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  AudioFailureTarget,
  ContentData,
  ThreadAnalysis
} from "../../src/types";
import type {
  ProjectState,
  ProjectSummary
} from "../../src/project/store";
import {
  CaptureComments
} from "../features/capture/CaptureComments";
import {
  TimelineWorkspace
} from "../features/preview/TimelineWorkspace";
import {
  AppChrome
} from "../features/app/AppChrome";
import {
  TOPIC_TITLE_CARD_FILE,
  shouldGenerateTopicTitleVoice
} from "../../src/timeline/topic-constants";
import {
  VoiceSelect
} from "../features/voice/VoiceSelect";

const steps = [
  "INPUT",
  "CAPTURE",
  "ANALYZE",
  "VOICE",
  "TIMELINE"
] as const;

type Step = (typeof steps)[number];

function identityImageSlots(
  count: number
): number[] {
  return Array.from(
    { length: count },
    (_value, index) => index
  );
}

function cloneContent(
  content: ContentData
): ContentData {
  return JSON.parse(
    JSON.stringify(content)
  ) as ContentData;
}

function formatProjectId(
  project: ProjectSummary
): string {
  return project.id.replace(
    /-thread$/,
    ""
  );
}

function withVoiceAssignment(
  analysis: ThreadAnalysis,
  target: AudioFailureTarget,
  voiceId: string
): ThreadAnalysis {
  if (target === "topic") {
    return {
      ...analysis,
      topicVoiceId: voiceId
    };
  }

  if (target === "topic-title") {
    return {
      ...analysis,
      topicTitleVoiceId: voiceId
    };
  }

  return {
    ...analysis,
    reactions: analysis.reactions.map(
      (reaction) =>
        `comment-${reaction.commentIndex}` === target
          ? {
              ...reaction,
              voiceId
            }
          : reaction
    )
  };
}

export default function Home(): React.ReactElement {
  const [currentStep, setCurrentStep] =
    useState<Step>("INPUT");
  const [projects, setProjects] =
    useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] =
    useState<ProjectState>();
  const [draftContent, setDraftContent] =
    useState<ContentData>();
  const [imageSlots, setImageSlots] =
    useState<number[]>([]);
  const [addCommentLoading, setAddCommentLoading] =
    useState(false);
  const [captureAssets, setCaptureAssets] =
    useState<Record<string, string>>({});
  const [audioAssets, setAudioAssets] =
    useState<Record<string, string>>({});
  const [previewAssets, setPreviewAssets] =
    useState<Record<string, string>>({});
  const [url, setUrl] = useState("");
  const [loading, setLoading] =
    useState(true);
  const [captureLoading, setCaptureLoading] =
    useState(false);
  const [operationLoading, setOperationLoading] =
    useState(false);
  const [error, setError] =
    useState<string>();
  const pendingVoiceSave = useRef(
    Promise.resolve()
  );

  const currentIndex = steps.indexOf(
    currentStep
  );
  const canUseBridge =
    typeof window !== "undefined" &&
    Boolean(window.xamxixiu);

  useEffect(() => {
    if (!canUseBridge) {
      setLoading(false);
      setError(
        "Electron bridge chưa sẵn sàng. Hãy chạy yarn dev để mở desktop app."
      );
      return;
    }

    void window.xamxixiu
      .getProjects()
      .then(setProjects)
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "Không thể tải project."
        );
      })
      .finally(() => setLoading(false));
  }, [canUseBridge]);

  const projectLabel = useMemo(
    () =>
      selectedProject
        ? formatProjectId(selectedProject)
        : "Chưa chọn project",
    [selectedProject]
  );

  async function loadCaptureAssets(
    project: ProjectState
  ): Promise<void> {
    const thread =
      project.content ?? project.thread;

    if (!thread) {
      return;
    }

    const entries = await Promise.all([
      window.xamxixiu
        .getProjectAsset(
          project.id,
          "processed/topic.png"
        )
        .then((url) => ["topic", url] as const),
      ...thread.comments.map(
        (_comment, index) =>
          window.xamxixiu
            .getProjectAsset(
              project.id,
              `processed/comment-${String(
                index + 1
              ).padStart(2, "0")}.png`
            )
            .then(
              (url) =>
                [`comment-${index}`, url] as const
            )
      )
    ]);

    setCaptureAssets(
      Object.fromEntries(entries)
    );
  }

  async function loadAudioAssets(
    project: ProjectState
  ): Promise<void> {
    const files = project.audioFiles;
    if (files.length === 0) {
      setAudioAssets({});
      return;
    }

    const entries = await Promise.all(
      files.map(async (file) => {
        try {
          return [
            file,
            await window.xamxixiu.getProjectAsset(
              project.id,
              `audio/${file}`
            )
          ] as const;
        } catch {
          return null;
        }
      })
    );

    setAudioAssets(
      Object.fromEntries(
        entries.filter(
          (entry): entry is readonly [string, string] =>
            entry !== null
        )
      )
    );
  }

  async function loadPreviewAssets(
    project: ProjectState
  ): Promise<void> {
    if (!project.timeline) {
      setPreviewAssets({});
      return;
    }
    const sources = [
      project.timeline.backgroundFile,
      project.timeline.musicFile,
      project.timeline.topicIntro?.case === "long"
        ? project.timeline.topicIntro.titleVoiceFile
        : undefined,
      project.timeline.topicIntro?.openSfxFile,
      project.timeline.topicIntro?.titleCardFile,
      project.timeline.topicIntro?.memeFile,
      TOPIC_TITLE_CARD_FILE,
      ...project.timeline.scenes.flatMap(
        (scene) =>
          (scene.blocks ?? [scene]).flatMap(
            (block) => [
              block.imageFile,
              block.audioFile,
              ...block.overlays.map(
                (overlay) => overlay.file
              )
            ]
          )
      )
    ].filter(
      (source): source is string =>
        Boolean(source)
    );
    const entries = await Promise.all(
      [...new Set(sources)].map(async (source) => {
        try {
          const dataUrl =
            await window.xamxixiu.getPreviewAsset(
              project.id,
              source
            );
          if (!dataUrl) {
            return null;
          }
          return [source, dataUrl] as const;
        } catch {
          return null;
        }
      })
    );
    setPreviewAssets(
      Object.fromEntries(
        entries.filter(
          (entry): entry is readonly [string, string] =>
            entry !== null
        )
      )
    );
  }

  function clearSelectedProject(): void {
    setSelectedProject(undefined);
    setDraftContent(undefined);
    setImageSlots([]);
    setCaptureAssets({});
    setAudioAssets({});
    setPreviewAssets({});
    setCurrentStep("INPUT");
  }

  async function deleteProject(
    projectId: string
  ): Promise<void> {
    const label = projectId.replace(
      /-thread$/,
      ""
    );
    const confirmed = window.confirm(
      `Xóa project ${label}? Toàn bộ file trong thư mục project sẽ bị xóa và không thể hoàn tác.`
    );

    if (!confirmed) {
      return;
    }

    if (
      typeof window.xamxixiu.deleteProject !==
      "function"
    ) {
      setError(
        "Hãy khởi động lại desktop app để dùng chức năng xóa project."
      );
      return;
    }

    setError(undefined);
    setOperationLoading(true);

    try {
      await window.xamxixiu.deleteProject(
        projectId
      );
      setProjects(
        await window.xamxixiu.getProjects()
      );
      if (selectedProject?.id === projectId) {
        clearSelectedProject();
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không thể xóa project."
      );
    } finally {
      setOperationLoading(false);
    }
  }

  async function selectProject(
    projectId: string
  ): Promise<void> {
    setError(undefined);
    setLoading(true);

    try {
      const project =
        await window.xamxixiu.getProject(
          projectId
        );
      setSelectedProject(project);
      if (project) {
        const content =
          project.content ?? project.thread;
        setDraftContent(content);
        setImageSlots(
          identityImageSlots(
            content?.comments.length ?? 0
          )
        );
        await loadCaptureAssets(project);
        await loadAudioAssets(project);
        await loadPreviewAssets(project);
        setCurrentStep("CAPTURE");
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không thể mở project."
      );
    } finally {
      setLoading(false);
    }
  }

  async function capture(): Promise<void> {
    if (!url.trim()) {
      return;
    }

    setError(undefined);
    setCaptureLoading(true);

    try {
      const project =
        await window.xamxixiu.captureThread(url);
      const content =
        project.content ?? project.thread;
      setSelectedProject(project);
      setDraftContent(content);
      setImageSlots(
        identityImageSlots(
          content?.comments.length ?? 0
        )
      );
      await loadCaptureAssets(project);
      await loadAudioAssets(project);
      await loadPreviewAssets(project);
      setProjects(
        await window.xamxixiu.getProjects()
      );
      setCurrentStep("CAPTURE");
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Capture thất bại."
      );
    } finally {
      setCaptureLoading(false);
    }
  }

  async function persistDraft(): Promise<
    ProjectState | undefined
  > {
    if (!selectedProject || !draftContent) {
      return undefined;
    }

    const project =
      await window.xamxixiu.updateContent({
        projectId: selectedProject.id,
        content: draftContent,
        imageOrder: imageSlots
      });
    const saved =
      project.content ?? draftContent;

    setImageSlots(
      identityImageSlots(saved.comments.length)
    );
    await loadCaptureAssets(project);

    return project;
  }

  async function saveContent(): Promise<void> {
    if (!selectedProject || !draftContent) {
      return;
    }

    setError(undefined);
    setOperationLoading(true);

    try {
      const project = await persistDraft();

      if (!project) {
        return;
      }

      setSelectedProject(project);
      setDraftContent(
        project.content ?? draftContent
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không thể lưu nội dung."
      );
    } finally {
      setOperationLoading(false);
    }
  }

  async function resetContent(): Promise<void> {
    if (!selectedProject) {
      return;
    }

    const confirmed = window.confirm(
      "Khôi phục nội dung đã lưu? Thứ tự kéo thả, comment thêm và sửa chưa lưu sẽ bị hủy."
    );

    if (!confirmed) {
      return;
    }

    setError(undefined);
    setOperationLoading(true);

    try {
      let project = selectedProject;
      if (
        typeof window.xamxixiu.resetContent ===
        "function"
      ) {
        project =
          await window.xamxixiu.resetContent(
            selectedProject.id
          );
      } else {
        project =
          (await window.xamxixiu.getProject(
            selectedProject.id
          )) ?? selectedProject;
      }
      const saved =
        project.content ?? project.thread;

      setSelectedProject(project);
      setDraftContent(
        saved ? cloneContent(saved) : undefined
      );
      setImageSlots(
        identityImageSlots(
          saved?.comments.length ?? 0
        )
      );
      await loadCaptureAssets(project);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không thể reset nội dung."
      );
    } finally {
      setOperationLoading(false);
    }
  }

  async function addComment(
    replyUrl: string
  ): Promise<void> {
    if (!selectedProject || !draftContent) {
      return;
    }

    const projectId = selectedProject.id;
    const imageIndex = draftContent.comments.length;
    const existing = draftContent.comments.map(
      (item) => ({
        author: item.author,
        text: item.text
      })
    );

    setError(undefined);
    setAddCommentLoading(true);

    try {
      const comment =
        await window.xamxixiu.captureComment({
          projectId,
          url: replyUrl,
          imageIndex,
          existing
        });

      setDraftContent((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          comments: [
            ...current.comments,
            comment
          ]
        };
      });
      setImageSlots(
        (slots) => [...slots, imageIndex]
      );

      const assetUrl =
        await window.xamxixiu.getProjectAsset(
          projectId,
          `processed/comment-${String(
            imageIndex + 1
          ).padStart(2, "0")}.png`
        );

      setCaptureAssets((assets) => ({
        ...assets,
        [`comment-${imageIndex}`]: assetUrl
      }));
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không thể thêm comment."
      );
    } finally {
      setAddCommentLoading(false);
    }
  }

  async function continueWorkflow(): Promise<void> {
    if (!selectedProject) {
      setError("Hãy capture hoặc chọn một project trước.");
      return;
    }

    setError(undefined);
    if (currentStep === "CAPTURE") {
      setCurrentStep("ANALYZE");
      return;
    }
    if (currentStep === "ANALYZE") {
      setCurrentStep("VOICE");
      return;
    }
    setOperationLoading(true);

    try {
      if (currentStep === "VOICE") {
        await window.xamxixiu.matchReactions(
          selectedProject.id
        );
        const project =
          await window.xamxixiu.createTimeline(
            selectedProject.id
          );
        setSelectedProject(project);
        await loadPreviewAssets(project);
        setCurrentStep("TIMELINE");
      } else {
        nextStep();
      }
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không thể chạy bước tiếp theo."
      );
    } finally {
      setOperationLoading(false);
    }
  }

  async function analyzeProject(): Promise<void> {
    if (!selectedProject) {
      return;
    }

    setError(undefined);
    setOperationLoading(true);

    try {
      let project = selectedProject;
      if (draftContent) {
        const saved = await persistDraft();

        if (saved) {
          project = saved;
        }
      }
      setSelectedProject(
        await window.xamxixiu.analyzeProject(
          project.id
        )
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Analyze thất bại."
      );
    } finally {
      setOperationLoading(false);
    }
  }

  async function generateAllAudio(): Promise<void> {
    if (!selectedProject) {
      return;
    }

    setError(undefined);
    setOperationLoading(true);

    try {
      await pendingVoiceSave.current;
      let project = selectedProject;
      if (draftContent) {
        const saved = await persistDraft();

        if (saved) {
          project = saved;
        }
      }
      const generatedProject =
        await window.xamxixiu.generateAudio(
          project.id
        );
      setSelectedProject(generatedProject);
      await loadAudioAssets(generatedProject);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Generate voice thất bại."
      );
    } finally {
      setOperationLoading(false);
    }
  }

  async function createTimeline(): Promise<void> {
    if (!selectedProject) {
      return;
    }

    setError(undefined);
    setOperationLoading(true);

    try {
      const project =
        await window.xamxixiu.createTimeline(
          selectedProject.id
        );
      setSelectedProject(project);
      await loadPreviewAssets(project);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Tạo timeline thất bại."
      );
    } finally {
      setOperationLoading(false);
    }
  }

  async function rematchAssets(): Promise<void> {
    if (!selectedProject) {
      return;
    }
    setOperationLoading(true);
    setError(undefined);
    try {
      await window.xamxixiu.matchReactions(
        selectedProject.id
      );
      const project =
        await window.xamxixiu.createTimeline(
          selectedProject.id
        );
      setSelectedProject(project);
      await loadPreviewAssets(project);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Rematch asset thất bại."
      );
    } finally {
      setOperationLoading(false);
    }
  }

  async function retryAudio(
    target: AudioFailureTarget
  ): Promise<void> {
    if (!selectedProject) {
      return;
    }

    setError(undefined);
    setOperationLoading(true);

    try {
      await pendingVoiceSave.current;
      let project = selectedProject;
      if (draftContent) {
        const saved = await persistDraft();

        if (saved) {
          project = saved;
          setSelectedProject(project);
        }
      }
      const generatedProject =
        await window.xamxixiu.retryAudio(
          project.id,
          target
        );
      setSelectedProject(generatedProject);
      await loadAudioAssets(generatedProject);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Retry voice thất bại."
      );
    } finally {
      setOperationLoading(false);
    }
  }

  function updateVoice(
    target: AudioFailureTarget,
    voiceId: string
  ): void {
    if (!selectedProject?.analysis) {
      setError(
        "Chưa có analysis. Hãy Analyze trước khi chọn voice."
      );
      return;
    }

    if (
      typeof window.xamxixiu.updateVoice !==
      "function"
    ) {
      setError(
        "Cần restart app để chọn lại voice."
      );
      return;
    }

    const projectId = selectedProject.id;
    setSelectedProject((current) => {
      if (!current?.analysis) {
        return current;
      }

      return {
        ...current,
        analysis: withVoiceAssignment(
          current.analysis,
          target,
          voiceId
        )
      };
    });
    setError(undefined);

    const task = window.xamxixiu
      .updateVoice({
        projectId,
        target,
        voiceId
      })
      .catch(async (reason: unknown) => {
        try {
          const project =
            await window.xamxixiu.getProject(
              projectId
            );
          if (project) {
            setSelectedProject(project);
          }
        } catch {
          // Keep the optimistic value if reload fails.
        }
        setError(
          reason instanceof Error
            ? reason.message
            : "Không lưu được voice."
        );
      })
      .then(() => undefined);

    pendingVoiceSave.current =
      pendingVoiceSave.current.then(
        () => task,
        () => task
      );
  }

  function nextStep(): void {
    const next = steps[currentIndex + 1];
    if (next) {
      setCurrentStep(next);
    }
  }

  function previousStep(): void {
    const previous = steps[currentIndex - 1];
    if (previous) {
      setCurrentStep(previous);
    }
  }

  const topicText =
    draftContent?.text ??
    selectedProject?.content?.text ??
    selectedProject?.thread?.text;
  const skipTopicTitleVoice =
    Boolean(topicText) &&
    !shouldGenerateTopicTitleVoice(topicText);

  return (
    <AppChrome active="workflow" projectLabel={projectLabel}>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 border-r border-white/10 p-5">
          <p className="mb-4 text-xs font-medium uppercase tracking-widest text-zinc-500">
            Workflow
          </p>
          <nav className="space-y-2">
            {steps.map((step, index) => {
              const active = step === currentStep;
              const completed =
                index < currentIndex;

              return (
                <button
                  key={step}
                  type="button"
                  onClick={() => setCurrentStep(step)}
                  className={[
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition",
                    active
                      ? "bg-fuchsia-500/15 text-fuchsia-200 ring-1 ring-fuchsia-400/30"
                      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  ].join(" ")}
                >
                  <span
                    className={[
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs",
                      active
                        ? "bg-fuchsia-400 text-fuchsia-950"
                        : completed
                          ? "bg-emerald-400/20 text-emerald-300"
                          : "bg-white/10 text-zinc-500"
                    ].join(" ")}
                  >
                    {completed ? "✓" : index + 1}
                  </span>
                  {step}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-10">
            <div className={currentStep === "TIMELINE" ? "mx-auto max-w-6xl" : "mx-auto max-w-5xl"}>
              <div className="mb-8 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-fuchsia-300">
                    {String(currentIndex + 1).padStart(2, "0")} /{" "}
                    {String(steps.length).padStart(2, "0")}
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold">
                    {currentStep}
                  </h2>
                  <p className="mt-2 text-zinc-400">
                    {selectedProject
                      ? "Project đã được lưu cục bộ."
                      : "Bắt đầu một project mới hoặc mở project hiện có."}
                  </p>
                </div>
                {selectedProject ? (
                  <button
                    type="button"
                    onClick={() =>
                      void deleteProject(
                        selectedProject.id
                      )
                    }
                    disabled={
                      operationLoading ||
                      captureLoading
                    }
                    className="rounded-xl border border-red-400/20 px-4 py-2 text-sm text-red-200 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Xóa project
                  </button>
                ) : null}
              </div>

              {currentStep === "INPUT" ? (
                <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                    <label
                      htmlFor="threads-url"
                      className="text-sm font-medium text-zinc-200"
                    >
                      Threads URL
                    </label>
                    <input
                      id="threads-url"
                      value={url}
                      onChange={(event) =>
                        setUrl(event.target.value)
                      }
                      placeholder="https://www.threads.com/@..."
                      className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-100 outline-none ring-fuchsia-400 transition placeholder:text-zinc-600 focus:ring-2"
                    />
                    <button
                      type="button"
                      onClick={() => void capture()}
                      disabled={
                        !url.trim() ||
                        captureLoading
                      }
                      className="mt-4 rounded-xl bg-fuchsia-400 px-5 py-3 text-sm font-semibold text-fuchsia-950 transition hover:bg-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {captureLoading
                        ? "Đang capture..."
                        : "Capture →"}
                    </button>
                    <p className="mt-3 text-xs text-zinc-500">
                      Playwright sẽ mở Threads, lấy nội dung và xử lý ảnh.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium">
                        Recent projects
                      </h3>
                      <span className="text-xs text-zinc-500">
                        {projects.length}
                      </span>
                    </div>
                    <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
                      {projects.length === 0 ? (
                        <p className="text-sm text-zinc-500">
                          Chưa có project nào.
                        </p>
                      ) : (
                        projects.map((project) => (
                          <div
                            key={project.id}
                            className="flex items-center gap-2"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                void selectProject(
                                  project.id
                                )
                              }
                              className="min-w-0 flex-1 rounded-xl border border-white/5 bg-black/10 px-3 py-3 text-left text-sm text-zinc-300 hover:border-fuchsia-400/30 hover:bg-fuchsia-400/5"
                            >
                              {formatProjectId(project)}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void deleteProject(
                                  project.id
                                )
                              }
                              disabled={
                                operationLoading ||
                                captureLoading
                              }
                              aria-label={`Xóa project ${formatProjectId(project)}`}
                              className="shrink-0 rounded-xl border border-red-400/20 px-3 py-3 text-xs text-red-200 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Xóa
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              ) : currentStep === "CAPTURE" ? (
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-zinc-400">
                      Screenshot bên trái · Nội dung có thể sửa bên phải
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void resetContent()}
                        disabled={
                          !selectedProject ||
                          operationLoading
                        }
                        className="rounded-xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5 disabled:opacity-40"
                      >
                        Reset mặc định
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveContent()}
                        disabled={
                          !draftContent ||
                          operationLoading
                        }
                        className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-300 disabled:opacity-40"
                      >
                        Lưu nội dung
                      </button>
                    </div>
                  </div>

                  {draftContent && (
                    <>
                      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                        <div className="flex min-h-[180px] items-start justify-center rounded-2xl border border-white/10 bg-black/20 p-4">
                          {captureAssets.topic ? (
                            <img
                              src={captureAssets.topic}
                              alt="Threads topic screenshot"
                              className="max-h-[260px] max-w-full rounded-xl object-contain"
                            />
                          ) : (
                            <p className="py-10 text-sm text-zinc-500">
                              Đang tải screenshot...
                            </p>
                          )}
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                          <div className="flex justify-between text-xs text-zinc-500">
                            <span>{draftContent.author}</span>
                            <span>{draftContent.likes} likes</span>
                          </div>
                          <textarea
                            value={draftContent.text}
                            onChange={(event) =>
                              setDraftContent({
                                ...draftContent,
                                text: event.target.value
                              })
                            }
                            className="mt-4 min-h-[160px] w-full resize-y rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-zinc-200 outline-none focus:ring-2 focus:ring-fuchsia-400"
                          />
                        </div>
                      </div>

                      <CaptureComments
                        comments={draftContent.comments}
                        imageSlots={imageSlots}
                        assets={captureAssets}
                        addLoading={addCommentLoading}
                        onChange={(comments, slots) => {
                          setDraftContent({
                            ...draftContent,
                            comments
                          });
                          setImageSlots(slots);
                        }}
                        onAdd={(url) => {
                          void addComment(url);
                        }}
                      />
                    </>
                  )}
                </div>
              ) : currentStep === "ANALYZE" ? (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-medium">
                          AI analysis
                        </h3>
                        <p className="mt-1 text-sm text-zinc-400">
                          AI phân tích nội dung, tone và chọn voice cho từng phần.
                        </p>
                      </div>
                      {operationLoading ? (
                        <span className="flex items-center gap-2 rounded-full bg-fuchsia-400/10 px-3 py-1 text-xs text-fuchsia-200">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-fuchsia-300" />
                          Đang analyze...
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={operationLoading}
                          onClick={() => void analyzeProject()}
                          className="rounded-lg bg-fuchsia-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-fuchsia-400 disabled:opacity-50"
                        >
                          {selectedProject?.analysis
                            ? "Analyze lại"
                            : "Analyze"}
                        </button>
                      )}
                    </div>
                    {operationLoading && (
                      <div className="mt-6 space-y-3">
                        <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
                        <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
                        <div className="h-20 animate-pulse rounded-xl bg-white/5" />
                      </div>
                    )}
                  </div>

                  {selectedProject?.analysis && !operationLoading && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          ["Tone", selectedProject.analysis.tone],
                          ["Topic type", selectedProject.analysis.topicType],
                          [
                            "Intensity",
                            `${selectedProject.analysis.intensity}/10`
                          ],
                          ["Music", selectedProject.analysis.musicType]
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
                          >
                            <p className="text-xs text-zinc-500">
                              {label}
                            </p>
                            <p className="mt-2 text-sm font-medium capitalize text-zinc-200">
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                        <p className="text-xs uppercase tracking-wider text-zinc-500">
                          Topic title
                        </p>
                        <p className="mt-2 text-sm text-fuchsia-200">
                          {selectedProject.analysis.topicTitle ??
                            "Chưa có title — hãy Analyze lại"}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                        <p className="text-xs uppercase tracking-wider text-zinc-500">
                          Topic voice
                        </p>
                        <p className="mt-2 text-sm text-fuchsia-200">
                          {selectedProject.analysis.topicVoiceId ??
                            "Chưa được chọn"}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                        <div className="flex items-center justify-between">
                          <h3 className="font-medium">
                            Comment analysis
                          </h3>
                          <span className="text-xs text-zinc-500">
                            {selectedProject.analysis.reactions.length} comments
                          </span>
                        </div>
                        <div className="mt-4 space-y-3">
                          {selectedProject.analysis.reactions.map(
                            (reaction) => (
                              <div
                                key={reaction.commentIndex}
                                className="grid gap-3 rounded-xl border border-white/10 bg-black/10 p-4 sm:grid-cols-3"
                              >
                                <div className="sm:col-span-3">
                                  <p className="text-xs text-zinc-500">
                                    Text
                                  </p>
                                  <p className="mt-1 text-sm leading-6 text-zinc-200">
                                    {draftContent?.comments[
                                      reaction.commentIndex
                                    ]?.text ?? "Không tìm thấy text"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-zinc-500">
                                    Comment
                                  </p>
                                  <p className="mt-1 text-sm text-zinc-200">
                                    #{reaction.commentIndex}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-zinc-500">
                                    Voice
                                  </p>
                                  <p className="mt-1 text-sm text-fuchsia-200">
                                    {reaction.voiceId ?? "Chưa chọn"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-zinc-500">
                                    Emotion
                                  </p>
                                  <p className="mt-1 text-sm capitalize text-zinc-300">
                                    {reaction.emotion}
                                  </p>
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : currentStep === "VOICE" ? (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-medium">
                          Voice generation
                        </h3>
                        <p className="mt-1 text-sm text-zinc-400">
                          Chỉnh text bên trái. Chọn lại voice ở bên phải rồi Generate.
                        </p>
                      </div>
                      {operationLoading && (
                        <span className="flex items-center gap-2 rounded-full bg-amber-400/10 px-3 py-1 text-xs text-amber-200">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" />
                          Đang generate voice...
                        </span>
                      )}
                      {!operationLoading && (
                        <button
                          type="button"
                          onClick={() => void generateAllAudio()}
                          className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-medium text-black transition hover:bg-amber-400"
                        >
                          Generate all
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    className={`rounded-2xl border p-5 ${
                      skipTopicTitleVoice
                        ? "border-white/10 bg-white/[0.03] opacity-70"
                        : "border-fuchsia-400/20 bg-fuchsia-400/5"
                    }`}
                  >
                    <p className="text-xs uppercase tracking-wider text-fuchsia-300">
                      Topic title voice
                    </p>
                    <p className="mt-2 rounded-xl bg-black px-4 py-3 text-sm text-white">
                      {selectedProject?.analysis?.topicTitle ??
                        "Chưa có topic title"}
                    </p>
                    {skipTopicTitleVoice ? (
                      <p className="mt-3 text-xs text-amber-200">
                        Topic text ngắn nên không generate topic title voice.
                      </p>
                    ) : (
                      <>
                        <p className="mt-3 text-xs text-zinc-500">
                          Voice
                        </p>
                        <VoiceSelect
                          value={
                            selectedProject?.analysis
                              ?.topicTitleVoiceId ??
                            "ngoc-huyen"
                          }
                          disabled={
                            operationLoading ||
                            !selectedProject?.analysis
                          }
                          onChange={(voiceId) =>
                            updateVoice(
                              "topic-title",
                              voiceId
                            )
                          }
                        />
                        {audioAssets["topic-title.mp3"] ? (
                          <audio
                            className="mt-4 w-full"
                            controls
                            preload="metadata"
                            src={audioAssets["topic-title.mp3"]}
                          >
                            Trình duyệt không hỗ trợ audio.
                          </audio>
                        ) : (
                          <p className="mt-3 text-xs text-amber-200">
                            Chưa có audio. Bấm Generate all để tạo.
                          </p>
                        )}
                      </>
                    )}
                    <button
                      type="button"
                      disabled={
                        operationLoading ||
                        skipTopicTitleVoice ||
                        !selectedProject?.analysis?.topicTitle
                      }
                      onClick={() =>
                        void retryAudio("topic-title")
                      }
                      className="mt-4 rounded-lg border border-fuchsia-300/30 px-3 py-2 text-xs text-fuchsia-200 transition hover:bg-fuchsia-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {skipTopicTitleVoice
                        ? "Không generate topic title voice"
                        : operationLoading
                          ? "Đang tạo..."
                          : audioAssets["topic-title.mp3"]
                            ? "Generate lại title voice"
                            : "Generate topic title voice"}
                    </button>
                  </div>

                  {draftContent && (
                    <div className="space-y-4">
                      <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 lg:grid-cols-[1fr_0.45fr]">
                        <div>
                          <p className="text-xs uppercase tracking-wider text-zinc-500">
                            Topic text
                          </p>
                          <textarea
                            value={draftContent.text}
                            onChange={(event) =>
                              setDraftContent({
                                ...draftContent,
                                text: event.target.value
                              })
                            }
                            className="mt-3 min-h-[130px] w-full resize-y rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-200 outline-none focus:ring-2 focus:ring-fuchsia-400"
                          />
                        </div>
                        <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-4">
                          {(() => {
                            const topicFailure =
                              selectedProject?.audioFailures.find(
                                (item) => item.target === "topic"
                              );

                            return (
                              <>
                          <p className="text-xs uppercase tracking-wider text-zinc-500">
                            Topic voice
                          </p>
                          <VoiceSelect
                            value={
                              selectedProject?.analysis
                                ?.topicVoiceId
                            }
                            disabled={
                              operationLoading ||
                              !selectedProject?.analysis
                            }
                            onChange={(voiceId) =>
                              updateVoice(
                                "topic",
                                voiceId
                              )
                            }
                          />
                          <p className="mt-3 text-xs text-zinc-500">
                            {selectedProject?.audioFiles.includes("topic.mp3")
                              ? "✓ Audio generated"
                              : operationLoading
                                ? "Đang xử lý..."
                                : topicFailure?.message ??
                                  "Chưa có audio"}
                          </p>
                          {audioAssets["topic.mp3"] && (
                            <audio
                              className="mt-4 w-full"
                              controls
                              preload="metadata"
                              src={audioAssets["topic.mp3"]}
                            >
                              Trình duyệt không hỗ trợ audio.
                            </audio>
                          )}
                          <button
                            type="button"
                            disabled={operationLoading}
                            onClick={() =>
                              void retryAudio("topic")
                            }
                            className="mt-4 rounded-lg border border-amber-300/30 px-3 py-1.5 text-xs text-amber-200 transition hover:bg-amber-400/10 disabled:opacity-50"
                          >
                            {topicFailure
                              ? "Retry"
                              : "Generate"}
                          </button>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {draftContent.comments
                        .map((comment, index) => ({
                          comment,
                          index
                        }))
                        .filter(
                          ({ comment }) =>
                            !comment.excluded
                        )
                        .map(
                          ({ comment, index }) => {
                          const target: AudioFailureTarget =
                            `comment-${index}`;
                          const failure =
                            selectedProject?.audioFailures.find(
                              (item) => item.target === target
                            );
                          const audioFile =
                            `comment-${index}.mp3`;
                          const reaction =
                            selectedProject?.analysis?.reactions.find(
                              (item) =>
                                item.commentIndex === index
                            );

                          return (
                            <div
                              key={`${comment.containerIndex}-${index}`}
                              className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-5 lg:grid-cols-[1fr_0.45fr]"
                            >
                              <div>
                                <div className="flex items-center justify-between">
                                  <p className="text-xs uppercase tracking-wider text-zinc-500">
                                    Comment {index}
                                  </p>
                                  <span className="text-xs text-zinc-500">
                                    {comment.author}
                                  </span>
                                </div>
                                <textarea
                                  value={comment.text}
                                  onChange={(event) =>
                                    setDraftContent({
                                      ...draftContent,
                                      comments: draftContent.comments.map(
                                        (item, itemIndex) =>
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                text: event.target.value
                                              }
                                            : item
                                      )
                                    })
                                  }
                                  className="mt-3 min-h-[120px] w-full resize-y rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-200 outline-none focus:ring-2 focus:ring-fuchsia-400"
                                />
                              </div>
                              <div className="rounded-xl border border-white/10 bg-black/10 p-4">
                                <p className="text-xs uppercase tracking-wider text-zinc-500">
                                  Selected voice
                                </p>
                                <VoiceSelect
                                  value={reaction?.voiceId}
                                  disabled={
                                    operationLoading ||
                                    !reaction
                                  }
                                  onChange={(voiceId) =>
                                    updateVoice(
                                      target,
                                      voiceId
                                    )
                                  }
                                />
                                <p className="mt-3 text-xs text-zinc-500">
                                  {selectedProject?.audioFiles.includes(
                                    audioFile
                                  )
                                    ? "✓ Audio generated"
                                    : failure
                                      ? failure.message
                                      : operationLoading
                                        ? "Đang xử lý..."
                                        : "Chưa có audio"}
                                </p>
                                {audioAssets[audioFile] && (
                                  <audio
                                    className="mt-4 w-full"
                                    controls
                                    preload="metadata"
                                    src={audioAssets[audioFile]}
                                  >
                                    Trình duyệt không hỗ trợ audio.
                                  </audio>
                                )}
                                <button
                                  type="button"
                                  disabled={
                                    operationLoading ||
                                    comment.excluded === true
                                  }
                                  onClick={() =>
                                    void retryAudio(target)
                                  }
                                  className="mt-4 rounded-lg border border-amber-300/30 px-3 py-1.5 text-xs text-amber-200 transition hover:bg-amber-400/10 disabled:opacity-50"
                                >
                                  {comment.excluded
                                    ? "Excluded"
                                    : failure
                                    ? "Retry"
                                    : "Generate"}
                                </button>
                              </div>
                            </div>
                          );
                          }
                        )}
                    </div>
                  )}
                </div>
              ) : currentStep === "TIMELINE" ? (
                selectedProject ? (
                  <TimelineWorkspace
                    projectId={selectedProject.id}
                    timeline={selectedProject.timeline}
                    previewAssets={previewAssets}
                    analysis={selectedProject.analysis}
                    reactions={selectedProject.reactions}
                    loading={operationLoading}
                    onProjectUpdated={async (project) => {
                      setSelectedProject(project);
                      await loadPreviewAssets(project);
                    }}
                    onCreateTimeline={createTimeline}
                    onRematch={rematchAssets}
                  />
                ) : null
              ) : (
                <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-12 text-center">
                  <p className="text-lg font-medium">
                    {currentStep} workspace
                  </p>
                  <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-500">
                    UI shell đã sẵn sàng. Chức năng của bước này sẽ được nối
                    vào pipeline Node ở phase tương ứng.
                  </p>
                </div>
              )}

              {loading && (
                <p className="mt-5 text-sm text-zinc-500">
                  Đang tải project...
                </p>
              )}
              {error && (
                <p className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </p>
              )}
            </div>
          </div>

          <footer className="flex shrink-0 items-center justify-between border-t border-white/10 px-10 py-5">
            <button
              type="button"
              onClick={previousStep}
              disabled={currentIndex === 0}
              className="rounded-xl border border-white/10 px-5 py-2.5 text-sm text-zinc-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => void continueWorkflow()}
              disabled={
                currentIndex === steps.length - 1 ||
                operationLoading
              }
              className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {operationLoading
                ? "Đang xử lý..."
                : currentStep === "CAPTURE" ||
                    currentStep === "ANALYZE" ||
                    currentStep === "VOICE"
                  ? "Chạy bước tiếp →"
                  : "Next →"}
            </button>
          </footer>
        </section>
      </div>
    </AppChrome>
  );
}
