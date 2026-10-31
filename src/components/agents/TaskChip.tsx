import { ICONS } from "@/components/ui/icons";
import { SERVICES } from "@/lib/services";
import type { Task, TaskStatus } from "@/lib/provision";
import { cn } from "@/lib/utils";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: "Queued",
  running: "Running",
  retry: "Retrying",
  done: "Done",
  waiting: "Paused · needs input",
  failed: "Failed",
  skipped: "Skipped",
  revoked: "Revoked",
};

/** Plain-language labels for the new joiner. */
export const SIMPLE_LABEL: Record<TaskStatus, string> = {
  queued: "Coming up",
  running: "In progress",
  retry: "In progress",
  done: "Done",
  waiting: "Waiting on you",
  failed: "The team is on it",
  skipped: "On hold",
  revoked: "Closed",
};

export const STATUS_TEXT: Record<TaskStatus, string> = {
  queued: "text-mute",
  running: "text-acc",
  retry: "text-acc",
  done: "text-ok",
  waiting: "text-[#a8620f]",
  failed: "text-bad",
  skipped: "text-mute",
  revoked: "text-[#7a4a8a]",
};

const TONE: Record<TaskStatus, string> = {
  done: "border-[#9fcfae] bg-[#dbeadf]",
  waiting: "border-[#e0b455] bg-[#fbefcf]",
  running: "border-acc bg-[#f8e3d6]",
  retry: "border-acc bg-[#fbefcf]",
  failed: "border-bad bg-[repeating-linear-gradient(135deg,#f6d6d2_0_6px,#f9e3e0_6px_12px)]",
  skipped: "border-dashed border-[#c4b99f] bg-[#eee8d8] opacity-70",
  revoked: "border-[#bfa6cc] bg-[#ece4f0] opacity-80",
  queued: "border-dashed border-[#c4b99f] bg-transparent opacity-60",
};

/** One service for one person as a small stamp: icon + a corner mark for its state. */
/** `simple` is the new joiner's view: the tooltip never carries system detail such as failure titles. */
export function TaskChip({ t, i, size = 32, simple }: { t: Task; i: number; size?: number; simple?: boolean }) {
  const sv = SERVICES[i];
  const Icon = ICONS[sv.icon] ?? ICONS.Box;
  return (
    <span
      title={simple ? `${sv.name} — ${SIMPLE_LABEL[t.status]}` : `${sv.name} — ${STATUS_LABEL[t.status]}${t.detail ? `: ${t.detail}` : ""}${t.failure ? `: ${t.failure.title}` : ""}`}
      className={cn("relative inline-grid flex-none place-items-center overflow-visible rounded-[10px] border text-ink", TONE[t.status], t.status === "running" && "animate-pulse")}
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.8} />
      {t.status === "done" && <Mark cls="bg-ok">✓</Mark>}
      {t.status === "waiting" && <Mark cls="bg-warn">!</Mark>}
      {t.status === "retry" && <Mark cls="bg-acc">↻</Mark>}
      {t.status === "failed" && <Mark cls="bg-bad">✕</Mark>}
      {t.status === "skipped" && <Mark cls="bg-[#9a8f78]">–</Mark>}
      {t.status === "running" && (
        <b className="absolute inset-x-1 bottom-0.5 h-[3px] overflow-hidden rounded-full bg-acc/20">
          <i className="block h-full bg-acc" style={{ width: `${(t.progress / t.dur) * 100}%` }} />
        </b>
      )}
    </span>
  );
}

function Mark({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <i className={cn("absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full text-[8px] font-bold not-italic text-white", cls)}>{children}</i>;
}
