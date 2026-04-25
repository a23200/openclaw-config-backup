import { useEffect, useMemo, useRef } from "react";
import { Code2, FileCode2, RadioTower, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface LiveCodeConsoleProps {
  activeFile?: string | null;
  codePreview?: string;
  generatedFiles?: string[];
  generatedFileCount?: number;
  streamState?: "idle" | "streaming" | "complete";
  progress?: number;
  progressLabel?: string;
  status?: string;
}

export default function LiveCodeConsole({
  activeFile,
  codePreview,
  generatedFiles = [],
  generatedFileCount = 0,
  streamState = "idle",
  progress = 0,
  progressLabel = "等待代码生成任务启动",
  status = "draft",
}: LiveCodeConsoleProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = contentRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [codePreview, activeFile]);

  const previewLines = useMemo(() => {
    const source = codePreview?.trimEnd() || "";
    if (!source) {
      return [];
    }

    return source.split("\n");
  }, [codePreview]);

  const visibleFiles = generatedFiles.slice(-8);

  return (
    <div className="terminal-surface overflow-hidden">
      <div className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
              Realtime Progress
            </p>
            <p className="mt-1 text-sm font-medium text-slate-100">
              {progressLabel}
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5 border-white/10 bg-white/5 text-slate-200",
              status === "failed" && "border-rose-400/20 bg-rose-400/10 text-rose-200",
              status === "ready" && "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
            )}
          >
            {Math.round(progress)}%
          </Badge>
        </div>
        <div className="mt-3 rounded-full border border-white/10 bg-slate-950/60 p-1">
          <div
            className={cn(
              "h-2.5 rounded-full transition-[width] duration-500 ease-out",
              status === "failed"
                ? "bg-[linear-gradient(90deg,rgba(244,63,94,0.95),rgba(251,146,60,0.95),rgba(251,113,133,0.95))]"
                : status === "ready"
                  ? "bg-[linear-gradient(90deg,rgba(16,185,129,0.95),rgba(56,189,248,0.95),rgba(34,211,238,0.95))]"
                  : "bg-[linear-gradient(90deg,rgba(168,85,247,0.95),rgba(59,130,246,0.95),rgba(45,212,191,0.95))] shadow-[0_0_24px_rgba(59,130,246,0.35)]",
              status !== "ready" && status !== "failed" && "animate-pulse",
            )}
            style={{ width: `${Math.max(6, Math.min(progress, 100))}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-400">
          <span className="truncate">
            {activeFile ? `当前文件：${activeFile}` : "等待模型输出文件结构…"}
          </span>
          <span>
            {streamState === "streaming"
              ? "实时刷新中"
              : streamState === "complete"
                ? "已完成本阶段"
                : "准备中"}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 bg-white/10 text-white">
            <Code2 className="h-3.5 w-3.5" />
            AI Code Stream
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5 border-white/10 bg-white/5 text-slate-200",
              streamState === "streaming" && "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
            )}
          >
            <RadioTower className="h-3.5 w-3.5" />
            {streamState === "streaming"
              ? "Streaming"
              : streamState === "complete"
                ? "Completed"
                : "Waiting"}
          </Badge>
        </div>
      </div>

      <div className="border-b border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
              Active File
            </p>
            <div className="mt-2 flex items-center gap-2 text-slate-100">
              <FileCode2 className="h-4 w-4 text-sky-300" />
              <span className="truncate text-sm font-medium">
                {activeFile || "等待模型开始输出文件结构..."}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-200">
              已识别文件 {generatedFileCount}
            </Badge>
            <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-300">
              最近文件 {visibleFiles.length}
            </Badge>
          </div>
        </div>
        <div className="-mx-1 mt-3 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max gap-2">
            {visibleFiles.length > 0 ? (
              visibleFiles.map((file) => (
                <Badge
                  key={file}
                  variant="outline"
                  className="max-w-[260px] truncate border-white/10 bg-white/5 text-slate-300"
                >
                  {file}
                </Badge>
              ))
            ) : (
              <Badge variant="outline" className="border-white/10 bg-white/5 text-slate-400">
                暂无代码片段
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div
        ref={contentRef}
        className="h-[360px] overflow-auto bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.10),transparent_30%),linear-gradient(180deg,rgba(15,23,42,0.6),rgba(2,6,23,0.92))] px-0 py-0 font-mono text-xs text-slate-100"
      >
        {previewLines.length > 0 ? (
          previewLines.map((line, index) => (
            <div
              key={`${index}-${line}`}
              className="grid grid-cols-[56px_1fr] border-b border-white/5"
            >
              <div className="select-none border-r border-white/5 px-4 py-1.5 text-right text-slate-500">
                {index + 1}
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words px-4 py-1.5 text-slate-100">
                {line || " "}
              </pre>
            </div>
          ))
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center text-slate-400">
            <div className="soft-ring flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-sky-300">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200">
                正在等待 AI 代码流
              </p>
              <p className="mt-2 max-w-md text-xs leading-6 text-slate-400">
                一旦模型开始输出 `文件路径 + 代码块`，这里会像高级 IDE 一样实时刷新当前文件内容。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
