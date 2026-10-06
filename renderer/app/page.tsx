"use client";

import {
  useEffect,
  useMemo,
  useState
} from "react";
import type {
  AudioFailureTarget,
  ContentData
} from "../../src/types";
import type {
  ProjectState,
  ProjectSummary
} from "../../src/project/store";

const steps = [
  "INPUT",
  "CAPTURE",
  "ANALYZE",
  "VOICE",
  "ASSETS",
  "TIMELINE",
  "CAPCUT"
] as const;

type Step = (typeof steps)[number];

function formatProjectId(
  project: ProjectSummary
): string {
  return project.id.replace(
    /-thread$/,
    ""
  );
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
  const [captureAssets, setCaptureAssets] =
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
        setDraftContent(
          project.content ?? project.thread
        );
        await loadCaptureAssets(project);
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
      setSelectedProject(project);
      setDraftContent(
        project.content ?? project.thread
      );
      await loadCaptureAssets(project);
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

  async function saveContent(): Promise<void> {
    if (!selectedProject || !draftContent) {
      return;
    }

    setError(undefined);
    setOperationLoading(true);

    try {
      const project =
        await window.xamxixiu.updateContent({
          projectId: selectedProject.id,
          content: draftContent
        });
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

  async function continueWorkflow(): Promise<void> {
    if (!selectedProject) {
      setError("Hãy capture hoặc chọn một project trước.");
      return;
    }

    setError(undefined);
    setOperationLoading(true);

    try {
      if (currentStep === "CAPTURE") {
        setCurrentStep("ANALYZE");
        setSelectedProject(
          await window.xamxixiu.analyzeProject(
            selectedProject.id
          )
        );
      } else if (currentStep === "ANALYZE") {
        setSelectedProject(
          await window.xamxixiu.generateAudio(
            selectedProject.id
          )
        );
        setCurrentStep("VOICE");
      } else if (currentStep === "VOICE") {
        setSelectedProject(
          await window.xamxixiu.matchReactions(
            selectedProject.id
          )
        );
        setCurrentStep("ASSETS");
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

  async function retryAudio(
    target: AudioFailureTarget
  ): Promise<void> {
    if (!selectedProject) {
      return;
    }

    setError(undefined);
    setOperationLoading(true);

    try {
      setSelectedProject(
        await window.xamxixiu.retryAudio(
          selectedProject.id,
          target
        )
      );
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

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex h-20 items-center justify-between border-b border-white/10 px-8">
        <div>
          <p className="text-xs font-semibold tracking-[0.35em] text-fuchsia-300">
            XÀM XÍ XIẾU
          </p>
          <h1 className="mt-1 text-lg font-semibold">
            Threads content workspace
          </h1>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-400">
          {projectLabel}
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="w-64 border-r border-white/10 p-5">
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

        <section className="flex flex-1 flex-col">
          <div className="flex-1 p-10">
            <div className="mx-auto max-w-5xl">
              <div className="mb-8">
                <p className="text-sm text-fuchsia-300">
                  0{currentIndex + 1} / 07
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
                    <div className="mt-4 space-y-2">
                      {projects.length === 0 ? (
                        <p className="text-sm text-zinc-500">
                          Chưa có project nào.
                        </p>
                      ) : (
                        projects.slice(0, 5).map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            onClick={() =>
                              void selectProject(project.id)
                            }
                            className="w-full rounded-xl border border-white/5 bg-black/10 px-3 py-3 text-left text-sm text-zinc-300 hover:border-fuchsia-400/30 hover:bg-fuchsia-400/5"
                          >
                            {formatProjectId(project)}
                          </button>
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

                  {draftContent && (
                    <>
                      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                        <div className="flex min-h-[360px] items-start justify-center rounded-2xl border border-white/10 bg-black/20 p-4">
                          {captureAssets.topic ? (
                            <img
                              src={captureAssets.topic}
                              alt="Threads topic screenshot"
                              className="max-h-[520px] max-w-full rounded-xl object-contain"
                            />
                          ) : (
                            <p className="py-20 text-sm text-zinc-500">
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
                            className="mt-4 min-h-[320px] w-full resize-y rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-zinc-200 outline-none focus:ring-2 focus:ring-fuchsia-400"
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-sm font-medium text-zinc-300">
                          Comments ({draftContent.comments.length})
                        </h3>
                        {draftContent.comments.map(
                          (comment, index) => (
                            <div
                              key={`${comment.containerIndex}-${index}`}
                              className="grid gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5 lg:grid-cols-[0.35fr_1fr]"
                            >
                              <div className="flex min-h-[180px] items-start justify-center rounded-xl bg-black/20 p-3">
                                {captureAssets[`comment-${index}`] ? (
                                  <img
                                    src={captureAssets[`comment-${index}`]}
                                    alt={`Comment ${index + 1} screenshot`}
                                    className="max-h-[260px] max-w-full rounded-lg object-contain"
                                  />
                                ) : (
                                  <p className="py-16 text-xs text-zinc-500">
                                    Đang tải...
                                  </p>
                                )}
                              </div>
                              <div>
                                <div className="flex justify-between text-xs text-zinc-500">
                                  <span>{comment.author}</span>
                                  <span>{comment.likes} likes</span>
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
                                  className="mt-3 min-h-[160px] w-full resize-y rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-200 outline-none focus:ring-2 focus:ring-fuchsia-400"
                                />
                              </div>
                            </div>
                          )
                        )}
                      </div>
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
                        <span className="rounded-full bg-fuchsia-400/10 px-3 py-1 text-xs text-fuchsia-200">
                          {selectedProject?.analysis?.tone ?? "Chưa chạy"}
                        </span>
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
                                className="grid gap-3 rounded-xl border border-white/10 bg-black/10 p-4 sm:grid-cols-4"
                              >
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
                                <div>
                                  <p className="text-xs text-zinc-500">
                                    Animation / duration
                                  </p>
                                  <p className="mt-1 text-sm text-zinc-300">
                                    {reaction.animation} / {reaction.duration}s
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
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                  <h3 className="font-medium">
                    Voice generation
                  </h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {selectedProject?.audioFiles.map(
                      (file) => (
                        <div
                          key={file}
                          className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-zinc-300"
                        >
                          <span className="mr-2 text-emerald-300">
                            ✓
                          </span>
                          {file}
                        </div>
                      )
                    )}
                  </div>
                  {(selectedProject?.audioFailures.length ?? 0) > 0 && (
                    <div className="mt-5 space-y-3">
                      <p className="text-sm font-medium text-red-300">
                        Voice failed — có thể retry từng item
                      </p>
                      {selectedProject?.audioFailures.map(
                        (failure) => (
                          <div
                            key={failure.target}
                            className="flex items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="text-red-200">
                                {failure.target}
                              </p>
                              <p className="truncate text-xs text-zinc-500">
                                {failure.message}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={operationLoading}
                              onClick={() =>
                                void retryAudio(failure.target)
                              }
                              className="shrink-0 rounded-lg border border-red-300/30 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-400/10 disabled:opacity-50"
                            >
                              Retry
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  )}
                  {selectedProject?.audioFiles.length === 0 && (
                    <p className="mt-4 text-sm text-zinc-500">
                      Chưa có audio. Bấm Next để generate toàn bộ voice.
                    </p>
                  )}
                </div>
              ) : currentStep === "ASSETS" ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">
                      Reaction assets
                    </h3>
                    <span className="text-xs text-zinc-500">
                      {selectedProject?.reactions?.length ?? 0} reactions
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    Đây là bước chọn và chỉnh meme, SFX, animation và
                    duration cho từng comment. Các asset đều lấy từ thư mục
                    assets đã scan, không tự tạo filename mới.
                  </p>
                  <div className="mt-5 space-y-3">
                    {selectedProject?.reactions?.map(
                      (reaction) => (
                        <div
                          key={reaction.commentIndex}
                          className="grid gap-3 rounded-xl border border-white/5 bg-black/10 p-4 md:grid-cols-4"
                        >
                          <span className="text-sm text-zinc-400">
                            Comment {reaction.commentIndex}
                          </span>
                          <span className="text-sm text-zinc-300">
                            Meme: {reaction.meme?.id ?? "none"}
                          </span>
                          <span className="text-sm text-zinc-300">
                            SFX: {reaction.sfx?.id ?? "none"}
                          </span>
                          <span className="text-sm text-zinc-400">
                            {reaction.animation} · {reaction.duration}s
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
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

          <footer className="flex items-center justify-between border-t border-white/10 px-10 py-5">
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
    </main>
  );
}
