import { Link } from "react-router-dom";
import { ArrowUpRight, Bot, PlusCircle, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function TopNav() {
  return (
    <header className="app-grid relative z-20 py-6">
      <div className="page-hero panel-shine px-5 py-4 sm:px-6">
        <div className="floating-orb left-6 top-4 h-16 w-16 bg-sky-300/55" />
        <div className="floating-orb floating-orb-delayed right-16 top-2 h-20 w-20 bg-violet-300/45" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Link to="/" className="flex items-center gap-4">
            <div className="soft-ring flex h-12 w-12 items-center justify-center overflow-hidden rounded-[20px] bg-white/70">
              <img src="/logo-ai-app.svg" alt="AI应用生成器 Logo" className="h-12 w-12" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold text-slate-950">AI应用生成器</p>
                <span className="status-led" />
              </div>
              <p className="text-sm text-slate-500">
                从产品想法到可安装 APK 的专业级生成工作台
              </p>
            </div>
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              gpt-5.4
            </Badge>
            <Badge variant="outline" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              智能 PRD
            </Badge>
            <Link
              to="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-slate-950 px-4 text-sm font-medium text-white shadow-[0_14px_35px_-18px_rgba(15,23,42,0.8)] transition hover:-translate-y-0.5 hover:bg-slate-800"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              创建新应用
            </Link>
            <Badge variant="secondary" className="gap-1.5 px-3.5 py-1.5">
              高级生成工作流
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Badge>
          </div>
        </div>
      </div>
    </header>
  );
}
