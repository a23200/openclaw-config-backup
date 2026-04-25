import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Activity,
  Clock3,
  CodeXml,
  Cpu,
  Download,
  Files,
  RefreshCw,
  Rocket,
  TerminalSquare,
  Waves,
} from "lucide-react";
import BuildSteps from "@/components/BuildSteps";
import LiveCodeConsole from "@/components/LiveCodeConsole";
import TopNav from "@/components/TopNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getBuildStatus, startBuild, type BuildStatusPayload } from "@/lib/api";

export default function BuildProgressPage() {
  const { id = "" } = useParams();
  const [buildStatus, setBuildStatus] = useState<BuildStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [transport, setTransport] = useState<"sse" | "polling">("sse");
  const [restarting, setRestarting] = useState(false);
  const [streamVersion, setStreamVersion] = useState(0);
  const [progressValue, setProgressValue] = useState(8);
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let eventSource: EventSource | null = null;

    async function poll() {
      try {
        const nextStatus = await getBuildStatus(id);
        if (cancelled) {
          return;
        }
        setBuildStatus(nextStatus);
        setError("");

        if (!["ready", "failed"].includes(nextStatus.status)) {
          timer = window.setTimeout(poll, 2500);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "获取状态失败");
          timer = window.setTimeout(poll, 3500);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    function startPolling() {
      setTransport("polling");
      void poll();
    }

    if (typeof EventSource !== "undefined") {
      eventSource = new EventSource(`/api/builds/${id}/stream`);

      eventSource.onmessage = (event) => {
        if (cancelled) {
          return;
        }

        try {
          const nextStatus = JSON.parse(event.data) as BuildStatusPayload;
          setBuildStatus(nextStatus);
          setError("");
          setLoading(false);

          if (["ready", "failed"].includes(nextStatus.status)) {
            eventSource?.close();
          }
        } catch (parseError) {
          console.error("解析构建流失败", parseError);
        }
      };

      eventSource.onerror = () => {
        if (cancelled) {
          return;
        }

        eventSource?.close();
        startPolling();
      };
    } else {
      startPolling();
    }

    return () => {
      cancelled = true;
      eventSource?.close();
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [id, streamVersion]);

  useEffect(() => {
    const node = logContainerRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [buildStatus?.logs]);

  const step = useMemo(() => buildStatus?.step ?? "analysis", [buildStatus?.step]);
  const logCount = buildStatus?.logs.length ?? 0;
  const currentStatus = buildStatus?.status ?? "initializing";
  const generatedFileCount = buildStatus?.generatedFileCount ?? 0;
  const progressTarget = useMemo(() => {
    if (!buildStatus) {
      return 8;
    }

    const files = buildStatus.generatedFileCount ?? 0;
    const logs = buildStatus.logs.length;

    if (buildStatus.status === "ready") {
      return 100;
    }

    if (buildStatus.status === "failed") {
      if (buildStatus.step === "compile") {
        return 92;
      }

      if (buildStatus.step === "codegen") {
        return Math.max(42, Math.min(72, 44 + files * 4));
      }

      return 18;
    }

    switch (buildStatus.step) {
      case "analysis":
        return 18;
      case "codegen":
        return Math.min(
          74,
          34 + files * 5 + (buildStatus.streamState === "streaming" ? 8 : 0),
        );
      case "compile":
        return Math.min(96, 78 + Math.max(logs - 8, 0) * 1.6);
      case "complete":
        return 100;
      case "failed":
        return 18;
      default:
        return 8;
    }
  }, [buildStatus]);
  const progressLabel = useMemo(() => {
    if (!buildStatus) {
      return "正在连接构建服务";
    }

    if (buildStatus.status === "ready") {
      return "APK 已生成完成，构建链路全部通过";
    }

    if (buildStatus.status === "failed") {
      return buildStatus.error ?? "流程已中断，请查看下方构建日志";
    }

    switch (buildStatus.step) {
      case "analysis":
        return "正在分析需求文档与应用页面结构";
      case "codegen":
        return buildStatus.activeFile
          ? `正在输出 ${buildStatus.activeFile}`
          : "正在连续生成 Android 工程文件";
      case "compile":
        return "正在执行 Gradle assembleDebug 编译 APK";
      case "complete":
        return "构建已完成";
      case "failed":
        return buildStatus.error ?? "流程已中断";
      default:
        return "准备构建";
    }
  }, [buildStatus]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgressValue((current) => {
        const delta = progressTarget - current;
        if (Math.abs(delta) < 0.5) {
          return progressTarget;
        }

        return current + Math.max(0.8, Math.abs(delta) * 0.16) * Math.sign(delta);
      });
    }, 120);

    return () => window.clearInterval(timer);
  }, [progressTarget]);

  async function handleRestartBuild() {
    setRestarting(true);
    setError("");
    try {
      await startBuild(id);
      setLoading(true);
      setBuildStatus(null);
      setTransport("sse");
      setStreamVersion((value) => value + 1);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "重新触发构建失败");
    } finally {
      setRestarting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="app-grid space-y-6 pb-10 pt-2">
        <section className="page-hero panel-shine px-6 py-6 sm:px-7">
          <div className="floating-orb left-8 top-8 h-20 w-20 bg-sky-300/50" />
          <div className="floating-orb floating-orb-delayed right-10 top-10 h-24 w-24 bg-violet-300/45" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="gap-1.5 px-4 py-1.5">
                  <Rocket className="h-3.5 w-3.5" />
                  构建控制台
                </Badge>
                <Badge variant="outline" className="gap-1.5 px-4 py-1.5">
                  <CodeXml className="h-3.5 w-3.5" />
                  实时代码输出
                </Badge>
              </div>
              <div>
                <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
                  APK构建进度
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                  左侧看阶段推进，右侧同时查看 AI 代码流和编译终端，完成后立即下载 APK。
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="metric-tile p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Status
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{currentStatus}</p>
              </div>
              <div className="metric-tile p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Logs
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{logCount}</p>
              </div>
              <div className="metric-tile p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Files
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {generatedFileCount}
                </p>
              </div>
              <div className="metric-tile p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Step
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{step}</p>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-[24px] border border-rose-200 bg-rose-50/90 px-5 py-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <Card className="glass-card panel-shine">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>构建步骤</CardTitle>
                  <CardDescription className="mt-2">
                    垂直步骤条实时反映当前执行阶段。
                  </CardDescription>
                </div>
                <Badge
                  variant={
                    buildStatus?.status === "ready"
                      ? "success"
                      : buildStatus?.status === "failed"
                        ? "destructive"
                        : buildStatus?.status === "building"
                          ? "warning"
                          : "default"
                  }
                  className="gap-1.5 px-3.5 py-1.5"
                >
                  <Cpu className="h-3.5 w-3.5" />
                  {currentStatus}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[22px] border border-white/80 bg-white/70 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    当前引擎
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    OpenAI + Gradle
                  </p>
                </div>
                <div className="rounded-[22px] border border-white/80 bg-white/70 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    实时传输
                  </p>
                  <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {transport === "sse" ? (
                      <Waves className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Clock3 className="h-4 w-4 text-slate-500" />
                    )}
                    {transport === "sse" ? "SSE Live Stream" : "Fallback Polling"}
                  </p>
                </div>
              </div>
              <BuildSteps currentStep={step} status={buildStatus?.status} />
              <div className="rounded-[24px] border border-white/80 bg-white/70 p-4 text-sm text-slate-600">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Project ID
                </p>
                <p className="mt-2 break-all font-medium text-slate-900">{id}</p>
              </div>
              {buildStatus?.status === "ready" && buildStatus.apkUrl ? (
                <Button asChild size="lg" className="w-full justify-between">
                  <a href={buildStatus.apkUrl} download>
                    <span>下载APK</span>
                    <Download className="h-4 w-4" />
                  </a>
                </Button>
              ) : null}
              {buildStatus?.status === "failed" ? (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full justify-between"
                  onClick={handleRestartBuild}
                  disabled={restarting}
                >
                  <span>{restarting ? "正在重新启动..." : "重新触发构建"}</span>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              ) : null}
              {buildStatus?.status === "failed" ? (
                <div className="rounded-[24px] border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-700">
                  {buildStatus.error ?? "构建失败，请查看日志排查。"}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-rows-[0.95fr_1.05fr]">
            <Card className="glass-card panel-shine">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>实时 AI 代码流</CardTitle>
                    <CardDescription className="mt-2">
                      直接查看模型当前正在输出的文件和代码内容。
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="gap-1.5 px-3.5 py-1.5">
                    <Activity className="h-3.5 w-3.5" />
                    Live Code
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <LiveCodeConsole
                  activeFile={buildStatus?.activeFile}
                  codePreview={buildStatus?.codePreview}
                  generatedFiles={buildStatus?.generatedFiles}
                  generatedFileCount={buildStatus?.generatedFileCount}
                  streamState={buildStatus?.streamState}
                  progress={progressValue}
                  progressLabel={progressLabel}
                  status={buildStatus?.status}
                />
              </CardContent>
            </Card>

            <Card className="glass-card panel-shine">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>实时构建日志</CardTitle>
                    <CardDescription className="mt-2">
                      代码生成、文件写入和 Gradle 编译日志会同步滚动刷新。
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1.5 px-3.5 py-1.5">
                      <Files className="h-3.5 w-3.5" />
                      已识别 {generatedFileCount} 个文件
                    </Badge>
                    <Badge variant="secondary" className="gap-1.5 px-3.5 py-1.5">
                      <TerminalSquare className="h-3.5 w-3.5" />
                      Build Terminal
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="terminal-surface overflow-hidden">
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </div>
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">
                      Build terminal
                    </p>
                  </div>
                  <ScrollArea className="h-[320px] text-slate-100">
                    <div
                      ref={logContainerRef}
                      className="h-[320px] overflow-auto px-4 py-4 font-mono text-xs leading-6"
                    >
                      {loading ? <p>正在连接构建服务...</p> : null}
                      {buildStatus?.logs?.length ? (
                        buildStatus.logs.map((logLine, index) => (
                          <div
                            key={`${logLine}-${index}`}
                            className="border-b border-white/5 py-1 last:border-b-0"
                          >
                            {logLine}
                          </div>
                        ))
                      ) : (
                        <p className="text-slate-400">构建尚未输出日志。</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
