export const BRANDING = {
  name: "ClawLink",
  version: "v0.1",
  shellLabel: "AI 一人公司",
  appTitle: "ClawLink · AI 一人公司",
  description: "ClawLink 是我的 AI 一人公司总控台：一个老板，带一群 AI 同事，把会话、日志、节点和任务全部收拢。",
  gatewayName: "任务网关",
  searchPlaceholder: "搜索模块、会话、日志（开发中）",
};

export function getGreeting(date = new Date()) {
  const hour = date.getHours();

  if (hour < 6) return { title: "夜深了，系统仍在值守", emoji: "🌙" };
  if (hour < 10) return { title: "早上好，开始今天的调度", emoji: "🌅" };
  if (hour < 14) return { title: "中午好，继续推进任务", emoji: "☀️" };
  if (hour < 18) return { title: "下午好，保持连接稳定", emoji: "⚡" };
  if (hour < 22) return { title: "晚上好，检查今天的执行情况", emoji: "🌆" };
  return { title: "夜间巡检中，继续保持在线", emoji: "🌃" };
}

export function formatDashboardDate(date = new Date()) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}
