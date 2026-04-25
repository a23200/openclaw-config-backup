import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Bot,
  FileText,
  PanelRight,
  PenSquare,
  PlusCircle,
  RefreshCw,
  Rocket,
  Save,
  Sparkles,
} from "lucide-react";
import PrdEditor from "@/components/PrdEditor";
import TopNav from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getProject, assistProject, startBuild, updateProject, type Project } from "@/lib/api";

export default function ProjectEditorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [featureRequest, setFeatureRequest] = useState("");
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toolLoading, setToolLoading] = useState<"" | "regenerate" | "optimize" | "add-feature">("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProject() {
      setPageLoading(true);
      setError("");
      try {
        const nextProject = await getProject(id);
        setProject(nextProject);
        setMarkdown(nextProject.prd);
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "加载项目失败");
      } finally {
        setPageLoading(false);
      }
    }

    void loadProject();
  }, [id]);

  const wordCount = useMemo(() => markdown.trim().split(/\s+/).filter(Boolean).length, [markdown]);
  const paragraphCount = useMemo(
    () => markdown.split(/\n{2,}/).filter((section) => section.trim()).length,
    [markdown],
  );

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const updated = await updateProject(id, { prd: markdown });
      setProject(updated);
      setMarkdown(updated.prd);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssist(action: "regenerate" | "optimize" | "add-feature") {
    if (action === "add-feature" && !featureRequest.trim()) {
      setError("请先输入要补充的新功能。");
      return;
    }

    setToolLoading(action);
    setError("");
    try {
      const updated = await assistProject(id, {
        action,
        feature: action === "add-feature" ? featureRequest : undefined,
      });
      setProject(updated);
      setMarkdown(updated.prd);
      if (action === "add-feature") {
        setFeatureRequest("");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "AI 辅助失败");
    } finally {
      setToolLoading("");
    }
  }

  async function handleBuild() {
    setSaving(true);
    setError("");
    try {
      await updateProject(id, { prd: markdown });
      await startBuild(id);
      navigate(`/builds/${id}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "启动构建失败");
    } finally {
      setSaving(false);
    }
  }

  if (pageLoading) {
    return (
      <div className="min-h-screen">
        <TopNav />
        <main className="app-grid py-10">
          <Card className="glass-card">
            <CardContent className="py-24 text-center text-muted-foreground">
              正在加载项目内容...
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="app-grid space-y-6 pb-10 pt-2">
        <section className="page-hero panel-shine px-6 py-6 sm:px-7">
          <div className="floating-orb left-8 top-8 h-20 w-20 bg-sky-300/50" />
          <div className="floating-orb floating-orb-delayed bottom-8 right-10 h-24 w-24 bg-violet-300/45" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="gap-1.5 px-4 py-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  PRD 编辑工作台
                </Badge>
                <Badge variant="outline" className="gap-1.5 px-4 py-1.5">
                  <Bot className="h-3.5 w-3.5" />
                  AI 辅助增强
                </Badge>
              </div>
              <div>
                <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
                  {project?.name}
                </h1>
                <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
                  在这里精修需求文档，补充功能范围与表达质量，然后一键进入
                  Kotlin + Compose APK 生成流程。
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="metric-tile p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Project ID
                </p>
                <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900">
                  {id}
                </p>
              </div>
              <div className="metric-tile p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Words
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{wordCount}</p>
              </div>
              <div className="metric-tile p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Sections
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {paragraphCount}
                </p>
              </div>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-[24px] border border-rose-200 bg-rose-50/90 px-5 py-4 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.65fr_0.75fr]">
          <section className="space-y-4">
            <Card className="glass-card panel-shine overflow-hidden">
              <CardHeader className="border-b border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.4))]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-2xl">需求文档编辑器</CardTitle>
                    <CardDescription className="mt-2 leading-6">
                      TipTap 富文本编辑，内容会保存为 Markdown 并用于后续 Android
                      项目生成。
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="gap-1.5">
                      <PenSquare className="h-3.5 w-3.5" />
                      在线编辑
                    </Badge>
                    <Badge variant="outline" className="gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      AI 协作
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: "文档状态", value: "可编辑 PRD" },
                    { label: "输出目标", value: "Android APK" },
                    { label: "技术预期", value: "Compose / MVVM" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[22px] border border-white/80 bg-white/70 p-4"
                    >
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        {item.label}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
                <PrdEditor markdown={markdown} onChange={setMarkdown} />
              </CardContent>
            </Card>
          </section>

          <aside className="space-y-4">
            <Card className="glass-card panel-shine">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>AI辅助工具栏</CardTitle>
                    <CardDescription className="mt-2 leading-6">
                      快速重构需求、优化表达，或扩展新的功能模块。
                    </CardDescription>
                  </div>
                  <div className="soft-ring flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(37,99,235,0.14),rgba(124,58,237,0.16))] text-primary">
                    <PanelRight className="h-5 w-5" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  className="h-auto w-full justify-between rounded-[24px] px-5 py-4"
                  variant="secondary"
                  onClick={() => handleAssist("regenerate")}
                  disabled={toolLoading !== ""}
                >
                  <div className="text-left">
                    <p className="font-semibold">重新生成需求</p>
                    <p className="mt-1 text-xs text-slate-500">
                      基于应用名称与描述重做完整结构。
                    </p>
                  </div>
                  <RefreshCw className="h-4 w-4 shrink-0" />
                </Button>
                <Button
                  className="h-auto w-full justify-between rounded-[24px] px-5 py-4"
                  variant="outline"
                  onClick={() => handleAssist("optimize")}
                  disabled={toolLoading !== ""}
                >
                  <div className="text-left">
                    <p className="font-semibold">优化需求文案</p>
                    <p className="mt-1 text-xs text-slate-500">
                      保持章节结构，提升专业表达与实现可行性。
                    </p>
                  </div>
                  <Sparkles className="h-4 w-4 shrink-0" />
                </Button>
                <div className="rounded-[26px] border border-white/80 bg-white/70 p-4 shadow-[0_18px_48px_-30px_rgba(15,23,42,0.35)]">
                  <div className="flex items-center gap-3">
                    <div className="soft-ring flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(37,99,235,0.12),rgba(124,58,237,0.15))] text-primary">
                      <PlusCircle className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">添加功能</p>
                      <p className="text-xs text-slate-500">
                        把新需求并入当前 PRD 结构中。
                      </p>
                    </div>
                  </div>
                  <Input
                    className="mt-4"
                    placeholder="例如：增加推送通知与数据导出功能"
                    value={featureRequest}
                    onChange={(event) => setFeatureRequest(event.target.value)}
                  />
                  <Button
                    className="mt-3 w-full"
                    onClick={() => handleAssist("add-feature")}
                    disabled={toolLoading !== ""}
                  >
                    {toolLoading === "add-feature" ? "正在补充..." : "添加功能按钮"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card panel-shine">
              <CardHeader>
                <CardTitle>生成准备</CardTitle>
                <CardDescription>
                  保存最终 PRD 后，系统会启动 Android 项目生成与 Gradle 编译。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-[24px] border border-white/80 bg-white/75 p-4 text-sm text-slate-600">
                  <div className="flex items-center gap-2 text-slate-900">
                    <FileText className="h-4 w-4" />
                    <p className="font-semibold">应用简介</p>
                  </div>
                  <p className="mt-3 leading-6">
                    {project?.description || "暂无描述"}
                  </p>
                </div>
                <div className="rounded-[24px] bg-slate-950 p-4 text-white shadow-[0_20px_60px_-30px_rgba(2,6,23,0.9)]">
                  <div className="flex items-center gap-2">
                    <Rocket className="h-4 w-4 text-sky-300" />
                    <p className="text-sm font-semibold">构建将执行</p>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-300">
                    <p>• AI 生成 Kotlin + Compose 工程</p>
                    <p>• 写入临时目录并复制 Gradle Wrapper</p>
                    <p>• 执行 `assembleDebug` 并输出 APK</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <span>{saving ? "正在保存..." : "保存需求文档"}</span>
                  <Save className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </aside>
        </div>

        <div className="sticky bottom-4 z-20 rounded-[30px] border border-white/10 bg-[linear-gradient(135deg,rgba(2,6,23,0.96),rgba(15,23,42,0.94),rgba(67,56,202,0.9))] p-5 text-white shadow-[0_30px_100px_-40px_rgba(2,6,23,0.9)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="status-led" />
                <p className="text-lg font-semibold">确认需求后即可生成 APK</p>
              </div>
              <p className="mt-1 text-sm text-slate-300">
                系统将自动生成 Kotlin + Jetpack Compose 项目并触发 Gradle 编译。
              </p>
            </div>
            <Button
              size="lg"
              className="bg-white text-slate-900 hover:bg-slate-100"
              onClick={handleBuild}
              disabled={saving || toolLoading !== ""}
            >
              <span>{saving ? "正在启动构建..." : "确认并生成APK"}</span>
              <Rocket className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
