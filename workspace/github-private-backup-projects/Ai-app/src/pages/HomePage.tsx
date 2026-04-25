import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  FileText,
  Rocket,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { createProject } from "@/lib/api";

export default function HomePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const project = await createProject({ name, description });
      navigate(`/projects/${project.id}/edit`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "创建项目失败");
    } finally {
      setLoading(false);
    }
  }

  const workflow = [
    {
      title: "智能需求拆解",
      description: "从一句描述出发，自动生成结构化 Android PRD。",
      icon: FileText,
    },
    {
      title: "专业级代码生成",
      description: "按 Kotlin + Compose + MVVM 输出完整项目结构。",
      icon: Bot,
    },
    {
      title: "自动编译与交付",
      description: "调用 Gradle 构建并提供 APK 下载安装。",
      icon: Rocket,
    },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden">
      <TopNav />
      <main className="app-grid relative z-10 pb-16 pt-4">
        <div className="grid gap-8">
          <section className="space-y-6 pt-6">
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="gap-1.5 px-4 py-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  一次输入，自动输出 PRD、代码与 APK
                </Badge>
                <Badge variant="outline" className="gap-1.5 px-4 py-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Kotlin + Compose + MVVM
                </Badge>
              </div>

              <div className="space-y-4">
                <h1 className="max-w-3xl text-balance text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
                  把你的应用想法，
                  <span className="gradient-text">升级成专业级安卓交付界面</span>
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-slate-600">
                  从产品想法、结构化需求文档、富文本编辑，到 AI 生成 Android
                  项目代码与 Gradle 编译 APK，全程在一个精致工作台内完成。
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {workflow.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="metric-tile panel-shine">
                    <div className="relative flex flex-col gap-4">
                      <div className="soft-ring flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(37,99,235,0.12),rgba(124,58,237,0.14))] text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="page-hero panel-shine p-6 sm:p-7">
              <div className="floating-orb bottom-6 right-10 h-24 w-24 bg-sky-300/45" />
              <div className="relative grid gap-6 lg:grid-cols-[1fr_0.85fr]">
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="status-led" />
                    <p className="text-sm font-medium text-slate-500">
                      高级 AI 生成流水线
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: "需求文档", value: "Markdown + 富文本" },
                      { label: "安卓技术", value: "Kotlin / Compose" },
                      { label: "交付结果", value: "Debug APK 下载" },
                    ].map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-[24px] border border-white/70 bg-white/75 p-4"
                      >
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                          {metric.label}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">
                          {metric.value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-[28px] bg-slate-950 p-5 text-white shadow-[0_24px_70px_-34px_rgba(2,6,23,0.9)]">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-300">
                        工作流预览
                      </p>
                      <Badge variant="secondary" className="bg-white/10 text-white">
                        Production-grade UI
                      </Badge>
                    </div>
                    <div className="mt-5 grid gap-3">
                      {[
                        "输入应用名称和描述",
                        "AI 输出结构化 PRD",
                        "在线编辑并确认需求",
                        "触发代码生成与 APK 编译",
                      ].map((item, index) => (
                        <div
                          key={item}
                          className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-xs font-semibold text-white">
                              0{index + 1}
                            </div>
                            <span className="text-sm text-slate-200">{item}</span>
                          </div>
                          <ArrowRight className="h-4 w-4 text-slate-500" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <Card className="glass-card panel-shine overflow-hidden">
                  <CardHeader className="space-y-3 border-b border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.65),rgba(255,255,255,0.35))]">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="gap-1.5 px-3.5 py-1.5">
                        <Bot className="h-3.5 w-3.5" />
                        创建新的 AI 应用项目
                      </Badge>
                      <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                        Launchpad
                      </p>
                    </div>
                    <div>
                      <CardTitle className="text-2xl">开始生成你的应用</CardTitle>
                      <CardDescription className="mt-2 text-sm leading-6">
                        输入核心想法，系统将自动生成专业 PRD，并进入高级编辑工作台。
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <form className="space-y-5" onSubmit={handleSubmit}>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                          应用名称
                        </label>
                        <Input
                          placeholder="例如：习惯打卡助手"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">
                          应用描述
                        </label>
                        <Textarea
                          placeholder="例如：帮助用户记录每日习惯、可视化连续打卡天数，并支持提醒通知。"
                          value={description}
                          onChange={(event) => setDescription(event.target.value)}
                          required
                          className="min-h-[160px]"
                        />
                      </div>
                      {error ? (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-600">
                          {error}
                        </div>
                      ) : null}
                      <Button
                        type="submit"
                        size="lg"
                        className="w-full justify-between px-6"
                        disabled={loading}
                      >
                        <span>{loading ? "正在生成需求文档..." : "开始生成"}</span>
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
