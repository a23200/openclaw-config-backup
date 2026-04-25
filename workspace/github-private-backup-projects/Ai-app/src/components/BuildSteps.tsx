import { CheckCircle2, ClipboardList, Code2, Hammer, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface BuildStepsProps {
  currentStep: "analysis" | "codegen" | "compile" | "complete" | "failed";
  status?: string;
}

const steps = [
  {
    key: "analysis",
    label: "分析需求",
    description: "解析最终 PRD，整理页面结构与功能边界。",
    icon: ClipboardList,
  },
  {
    key: "codegen",
    label: "生成代码",
    description: "输出 Kotlin + Compose + MVVM 工程源码。",
    icon: Code2,
  },
  {
    key: "compile",
    label: "编译APK",
    description: "执行 Gradle wrapper 并产出可下载安装包。",
    icon: Hammer,
  },
] as const;

function getStepState(
  stepKey: (typeof steps)[number]["key"],
  currentStep: BuildStepsProps["currentStep"],
  status?: string,
) {
  if (status === "failed") {
    const failedIndex = steps.findIndex((step) => step.key === currentStep);
    const stepIndex = steps.findIndex((step) => step.key === stepKey);

    if (failedIndex === -1) {
      return "failed";
    }

    if (stepIndex < failedIndex) {
      return "done";
    }

    if (stepIndex === failedIndex) {
      return "failed";
    }

    return "pending";
  }

  const currentIndex = steps.findIndex((step) => step.key === currentStep);
  const stepIndex = steps.findIndex((step) => step.key === stepKey);

  if (currentStep === "complete") {
    return "done";
  }

  if (stepIndex < currentIndex) {
    return "done";
  }

  if (stepIndex === currentIndex) {
    return "active";
  }

  return "pending";
}

export default function BuildSteps({ currentStep, status }: BuildStepsProps) {
  return (
    <div className="space-y-4">
      {steps.map((step, index) => {
        const state = getStepState(step.key, currentStep, status);
        const Icon = step.icon;
        return (
          <div
            key={step.key}
            className={cn(
              "relative overflow-hidden rounded-[26px] border p-4 transition-all duration-200",
              state === "done" &&
                "border-emerald-200 bg-emerald-50/80 shadow-[0_18px_38px_-28px_rgba(16,185,129,0.55)]",
              state === "active" &&
                "border-primary/30 bg-[linear-gradient(135deg,rgba(37,99,235,0.10),rgba(124,58,237,0.08))] shadow-[0_20px_40px_-30px_rgba(59,130,246,0.65)]",
              state === "failed" &&
                "border-rose-200 bg-rose-50/80 shadow-[0_18px_38px_-28px_rgba(244,63,94,0.45)]",
              state === "pending" && "border-white/80 bg-white/70",
            )}
          >
            <div className="relative flex gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-2xl border text-sm font-semibold",
                    state === "done" && "border-emerald-500 bg-emerald-500 text-white",
                    state === "active" && "border-primary bg-white text-primary",
                    state === "failed" && "border-rose-300 bg-white text-rose-600",
                    state === "pending" && "border-slate-200 bg-white text-slate-400",
                  )}
                >
                  {state === "done" ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : state === "active" ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                {index < steps.length - 1 ? (
                  <div className="mt-3 h-12 w-px bg-gradient-to-b from-slate-200 to-transparent" />
                ) : null}
              </div>
              <div className="pt-0.5">
                <p className="font-semibold text-slate-900">{step.label}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {step.description}
                </p>
              </div>
            </div>
            <div className="relative mt-4 pl-[3.75rem]">
              <Badge
                variant={
                  state === "done"
                    ? "success"
                    : state === "active"
                      ? "default"
                      : state === "failed"
                        ? "destructive"
                        : "outline"
                }
                className="mt-2"
              >
                {state === "done"
                  ? "已完成"
                  : state === "active"
                    ? "执行中"
                    : state === "failed"
                      ? "失败"
                      : "等待中"}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
