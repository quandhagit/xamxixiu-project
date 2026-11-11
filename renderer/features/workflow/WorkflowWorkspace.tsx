"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import type {
  AudioFailureTarget,
  ContentData
} from "../../../src/types";
import type {
  ProjectState,
  ProjectSummary
} from "../../../src/project/store";
import {
  TimelineWorkspace
} from "../preview/TimelineWorkspace";
import {
  useErrorToast
} from "../app/ErrorToast";
import {
  TOPIC_TITLE_CARD_FILE,
  normalizeTopicTitle,
  resolveTopicTitleVoiceEnabled,
  shouldGenerateTopicTitleVoice
} from "../../../src/timeline/topic-constants";
import type { SpeechTextDiff } from "../../../src/comments/clean-speech-text";
import {
  isAnalysisStale
} from "../../../src/comments/analysis-stale";
import { Button } from "../ui/Button";
import {
  formatProjectId,
  identityImageSlots,
  withVoiceAssignment
} from "./project-helpers";
import {
  WORKFLOW_STEPS,
  type WorkflowStep
} from "./steps";
import { AnalyzeStep } from "./AnalyzeStep";
import { CaptureStep } from "./CaptureStep";
import { InputStep } from "./InputStep";
import { VoiceStep } from "./VoiceStep";
import { WorkflowFooter } from "./WorkflowFooter";
import { WorkflowSidebar } from "./WorkflowSidebar";

function cloneContent(
  content: ContentData
): ContentData {
  return JSON.parse(
    JSON.stringify(content)
  ) as ContentData;
}

export function WorkflowWorkspace({
  visible,
  onProjectLabelChange
}: {
  visible: boolean;
  onProjectLabelChange: (label: string) => void;
}): React.ReactElement {
  const [currentStep, setCurrentStep] =
    useState<WorkflowStep>("INPUT");
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
  const [draftTopicTitle, setDraftTopicTitle] =
    useState("");
  const [titleSuggestions, setTitleSuggestions] =
    useState<string[]>([]);
  const [textDiffs, setTextDiffs] =
    useState<SpeechTextDiff[]>([]);
  const setError = useErrorToast();
  const pendingVoiceSave = useRef(
    Promise.resolve()
  );
  const pendingTopicTitleSave = useRef(
    Promise.resolve()
  );
  const draftTopicTitleRef = useRef(draftTopicTitle);
  draftTopicTitleRef.current = draftTopicTitle;

  const currentIndex = WORKFLOW_STEPS.indexOf(
    currentStep
  );
  const canUseBridge =
    typeof window !== "undefined" &&
    Boolean(window.xamxixiu);

  useEffect(() => {
    setDraftTopicTitle(
      selectedProject?.content?.topicTitle ??
        selectedProject?.analysis?.topicTitle ??
        ""
    );
  }, [
    selectedProject?.id,
    selectedProject?.content?.topicTitle,
    selectedProject?.analysis?.topicTitle
  ]);

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

  useEffect(() => {
    onProjectLabelChange(projectLabel);
  }, [onProjectLabelChange, projectLabel]);

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
    if (!project.timeline && !project.timelineProject) {
      setPreviewAssets({});
      return;
    }
    const sources = [
      project.timeline?.backgroundFile,
      project.timeline?.musicFile,
      project.timeline?.topicIntro?.case === "long"
        ? project.timeline.topicIntro.titleVoiceFile
        : undefined,
      project.timeline?.topicIntro?.openSfxFile,
      project.timeline?.topicIntro?.titleCardFile,
      project.timeline?.topicIntro?.memeFile,
      TOPIC_TITLE_CARD_FILE,
      ...project.timeline?.scenes.flatMap(
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
      ) ?? [],
      ...(project.timelineProject?.clips.map((clip) => clip.file) ?? [])
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

  async function persistTopicTitle(): Promise<
    ProjectState | undefined
  > {
    if (!selectedProject) {
      return undefined;
    }

    const next = normalizeTopicTitle(
      draftTopicTitleRef.current
    );
    const current =
      selectedProject.content?.topicTitle ??
      selectedProject.analysis?.topicTitle ??
      "";
    if (next === current) {
      return selectedProject;
    }

    if (selectedProject.analysis) {
      if (typeof window.xamxixiu.updateTopicIntro !== "function") {
        setError("Cần restart app để sửa topic title.");
        return undefined;
      }
      const project = await window.xamxixiu.updateTopicIntro({
        projectId: selectedProject.id,
        topicTitle: next
      });
      setSelectedProject(project);
      setDraftTopicTitle(project.analysis?.topicTitle ?? next);
      if (project.timeline) {
        await loadPreviewAssets(project);
      }
      return project;
    }

    if (typeof window.xamxixiu.saveContentTopicTitle !== "function") {
      setError("Cần restart app để lưu topic title ở bước Capture.");
      return undefined;
    }
    const project = await window.xamxixiu.saveContentTopicTitle(
      selectedProject.id,
      next
    );
    setSelectedProject(project);
    setDraftTopicTitle(project.content?.topicTitle ?? next);
    return project;
  }

  function queueTopicTitleSave(): void {
    pendingTopicTitleSave.current =
      pendingTopicTitleSave.current
        .catch(() => undefined)
        .then(async () => {
          try {
            await persistTopicTitle();
          } catch (reason: unknown) {
            setError(
              reason instanceof Error
                ? reason.message
                : "Không lưu được topic title."
            );
          }
        });
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
        text: item.originalText ?? item.text
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

  async function curateProject(): Promise<void> {
    if (!selectedProject) {
      return;
    }

    setError(undefined);
    setOperationLoading(true);

    try {
      if (draftContent) {
        await persistDraft();
      }

      const curated =
        await window.xamxixiu.curateComments(
          selectedProject.id
        );
      const content =
        curated.content ?? curated.thread;

      setSelectedProject(curated);

      if (content) {
        setDraftContent(cloneContent(content));
        setImageSlots(
          identityImageSlots(content.comments.length)
        );
      }

      // Curate may reorder comments, which renames their image/audio files.
      await loadCaptureAssets(curated);
      await loadAudioAssets(curated);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "AI chọn comment thất bại."
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
      await pendingTopicTitleSave.current;
      let project = selectedProject;
      if (draftContent) {
        const saved = await persistDraft();

        if (saved) {
          project = saved;
        }
      }
      const savedTitle = await persistTopicTitle();
      if (savedTitle) {
        project = savedTitle;
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
      await pendingTopicTitleSave.current;
      await persistTopicTitle();
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
      await pendingTopicTitleSave.current;
      let project = selectedProject;
      if (draftContent) {
        const saved = await persistDraft();

        if (saved) {
          project = saved;
          setSelectedProject(project);
        }
      }
      const savedTitle = await persistTopicTitle();
      if (savedTitle) {
        project = savedTitle;
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
    queueTopicTitleSave();
    const next = WORKFLOW_STEPS[currentIndex + 1];
    if (next) {
      setCurrentStep(next);
    }
  }

  function previousStep(): void {
    const previous = WORKFLOW_STEPS[currentIndex - 1];
    if (previous) {
      setCurrentStep(previous);
    }
  }

  async function cleanCommentText(): Promise<void> {
    if (!selectedProject || !draftContent) {
      return;
    }
    setOperationLoading(true);
    setError(undefined);
    try {
      const texts = [
        draftContent.text,
        ...draftContent.comments.map((comment) => comment.text)
      ];
      const diffs = await window.xamxixiu.cleanCommentText({
        projectId: selectedProject.id,
        texts
      });
      setTextDiffs(
        diffs.map((diff) => ({
          ...diff,
          index: diff.index - 1
        }))
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Làm sạch text thất bại."
      );
    } finally {
      setOperationLoading(false);
    }
  }

  function acceptTextDiff(index: number): void {
    if (!draftContent) {
      return;
    }
    const diff = textDiffs.find((item) => item.index === index);
    if (!diff) {
      return;
    }
    if (index === -1) {
      setDraftContent({ ...draftContent, text: diff.after });
    } else {
      setDraftContent({
        ...draftContent,
        comments: draftContent.comments.map((comment, commentIndex) =>
          commentIndex === index ? { ...comment, text: diff.after } : comment
        )
      });
    }
    setTextDiffs((current) => current.filter((item) => item.index !== index));
  }

  function rejectTextDiff(index: number): void {
    setTextDiffs((current) => current.filter((item) => item.index !== index));
  }

  async function suggestTitles(): Promise<void> {
    if (!selectedProject) {
      return;
    }
    setOperationLoading(true);
    setError(undefined);
    try {
      if (draftContent) {
        await persistDraft();
      }
      setTitleSuggestions(
        await window.xamxixiu.suggestTopicTitles(selectedProject.id)
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Gợi ý title thất bại."
      );
    } finally {
      setOperationLoading(false);
    }
  }

  async function assignProjectVoices(): Promise<void> {
    if (!selectedProject) {
      return;
    }
    setOperationLoading(true);
    setError(undefined);
    try {
      if (draftContent) {
        await persistDraft();
      }
      await persistTopicTitle();
      setSelectedProject(
        await window.xamxixiu.assignVoices(selectedProject.id)
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "AI chọn voice thất bại."
      );
    } finally {
      setOperationLoading(false);
    }
  }

  async function updateTitleVoiceMode(
    mode: "auto" | "on" | "off"
  ): Promise<void> {
    if (!selectedProject?.analysis) {
      setError("Hãy chạy Quick AI hoặc AI chọn voice trước.");
      return;
    }
    try {
      const project = await window.xamxixiu.updateTopicIntro({
        projectId: selectedProject.id,
        topicTitleVoiceMode: mode
      });
      setSelectedProject(project);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không lưu được tùy chọn title voice."
      );
    }
  }

  const topicText =
    draftContent?.text ??
    selectedProject?.content?.text ??
    selectedProject?.thread?.text;
  const skipTopicTitleVoice = !resolveTopicTitleVoiceEnabled(
    selectedProject?.analysis,
    topicText
  );
  const commentsForAnalysis =
    draftContent ??
    selectedProject?.content ??
    selectedProject?.thread;
  const analysisStale = Boolean(
    commentsForAnalysis &&
      selectedProject?.analysis &&
      isAnalysisStale(
        commentsForAnalysis,
        selectedProject.analysis
      )
  );

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
        <WorkflowSidebar
          steps={WORKFLOW_STEPS}
          currentStep={currentStep}
          currentIndex={currentIndex}
          onSelectStep={setCurrentStep}
          projects={projects}
          selectedProjectId={selectedProject?.id}
          onSelectProject={(projectId) => {
            void selectProject(projectId);
          }}
          onDeleteProject={(projectId) => {
            void deleteProject(projectId);
          }}
          projectBusy={operationLoading || captureLoading}
          formatProjectId={formatProjectId}
        />

        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-app">
          <div
            className={
              currentStep === "TIMELINE"
                ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                : "min-h-0 flex-1 overflow-y-auto p-4"
            }
          >
            {currentStep !== "TIMELINE" ? (
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium text-ink">
                  {currentStep}
                </h2>
                {selectedProject ? (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() =>
                      void deleteProject(selectedProject.id)
                    }
                    disabled={operationLoading || captureLoading}
                  >
                    Xóa project
                  </Button>
                ) : null}
              </div>
            ) : null}

              {currentStep === "INPUT" ? (
                <InputStep
                  url={url}
                  captureLoading={captureLoading}
                  onUrlChange={setUrl}
                  onCapture={() => {
                    void capture();
                  }}
                />
              ) : currentStep === "CAPTURE" ? (
                <CaptureStep
                  draftContent={draftContent}
                  captureAssets={captureAssets}
                  imageSlots={imageSlots}
                  addCommentLoading={addCommentLoading}
                  operationLoading={operationLoading}
                  hasProject={Boolean(selectedProject)}
                  draftTopicTitle={draftTopicTitle}
                  titleSuggestions={titleSuggestions}
                  textDiffs={textDiffs}
                  onReset={() => {
                    void resetContent();
                  }}
                  onCurate={() => {
                    void curateProject();
                  }}
                  onSave={() => {
                    void saveContent();
                  }}
                  onTopicTextChange={(text) => {
                    if (!draftContent) {
                      return;
                    }
                    setDraftContent({
                      ...draftContent,
                      text
                    });
                  }}
                  onCommentsChange={(comments, slots) => {
                    if (!draftContent) {
                      return;
                    }
                    setDraftContent({
                      ...draftContent,
                      comments
                    });
                    setImageSlots(slots);
                  }}
                  onAddComment={(commentUrl) => {
                    void addComment(commentUrl);
                  }}
                  onTopicTitleChange={setDraftTopicTitle}
                  onCleanText={() => {
                    void cleanCommentText();
                  }}
                  onAcceptDiff={acceptTextDiff}
                  onRejectDiff={rejectTextDiff}
                  onSuggestTitles={() => {
                    void suggestTitles();
                  }}
                  onPickTitle={(title) => {
                    setDraftTopicTitle(title);
                    draftTopicTitleRef.current = title;
                    void persistTopicTitle();
                  }}
                />
              ) : currentStep === "ANALYZE" ? (
                <AnalyzeStep
                  project={selectedProject}
                  draftContent={draftContent}
                  draftTopicTitle={draftTopicTitle}
                  operationLoading={operationLoading}
                  analysisStale={analysisStale}
                  onAnalyze={() => {
                    void analyzeProject();
                  }}
                  onTopicTitleChange={setDraftTopicTitle}
                  onTopicTitleBlur={queueTopicTitleSave}
                />
              ) : currentStep === "VOICE" ? (
                <VoiceStep
                  project={selectedProject}
                  draftContent={draftContent}
                  draftTopicTitle={draftTopicTitle}
                  audioAssets={audioAssets}
                  skipTopicTitleVoice={skipTopicTitleVoice}
                  titleVoiceMode={
                    selectedProject?.analysis?.topicTitleVoiceMode ?? "auto"
                  }
                  defaultTitleVoiceEnabled={shouldGenerateTopicTitleVoice(topicText)}
                  operationLoading={operationLoading}
                  onGenerateAll={() => {
                    void generateAllAudio();
                  }}
                  onTopicTitleChange={setDraftTopicTitle}
                  onTopicTitleBlur={queueTopicTitleSave}
                  onTopicTextChange={(text) => {
                    if (!draftContent) {
                      return;
                    }
                    setDraftContent({
                      ...draftContent,
                      text
                    });
                  }}
                  onCommentTextChange={(index, text) => {
                    if (!draftContent) {
                      return;
                    }
                    setDraftContent({
                      ...draftContent,
                      comments: draftContent.comments.map(
                        (item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, text }
                            : item
                      )
                    });
                  }}
                  onVoiceChange={updateVoice}
                  onRetryAudio={(target) => {
                    void retryAudio(target);
                  }}
                  onTitleVoiceModeChange={(mode) => {
                    void updateTitleVoiceMode(mode);
                  }}
                  onAssignVoices={() => {
                    void assignProjectVoices();
                  }}
                />
              ) : currentStep === "TIMELINE" ? (
                selectedProject ? (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <TimelineWorkspace
                      projectId={selectedProject.id}
                      timeline={selectedProject.timeline}
                      timelineProject={selectedProject.timelineProject}
                      previewAssets={previewAssets}
                      analysis={selectedProject.analysis}
                      reactions={selectedProject.reactions}
                      visible={visible}
                      loading={operationLoading}
                      onProjectUpdated={async (project) => {
                        setSelectedProject(project);
                        await loadPreviewAssets(project);
                      }}
                      onCreateTimeline={createTimeline}
                      onRematch={rematchAssets}
                    />
                  </div>
                ) : null
              ) : (
                <p className="text-[13px] text-ink-3">
                  {currentStep} workspace
                </p>
              )}

              {loading && (
                <p className="mt-3 text-[12px] text-ink-3">
                  Đang tải project...
                </p>
              )}
          </div>

          <WorkflowFooter
            currentIndex={currentIndex}
            stepCount={WORKFLOW_STEPS.length}
            currentStep={currentStep}
            operationLoading={operationLoading}
            onBack={previousStep}
            onNext={() => {
              void continueWorkflow();
            }}
          />
        </section>
      </div>
  );
}
