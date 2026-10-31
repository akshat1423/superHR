import { BLOCKS } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export type Tone = "paper" | "ink" | "acc" | "amber";

const TONES: Record<Tone, string> = {
  paper: "border-[#d8cfba] bg-[#ece4d0] text-ink",
  ink: "border-ink bg-ink text-[#f4efe3]",
  acc: "border-[#e6b9a3] bg-[#f8e3d6] text-[#8a3615]",
  amber: "border-[#e0b455] bg-[#fbefcf] text-[#8a6200]",
};

/** Monogram tile for a block — a few warm tones by kind, never per-app rainbow colors. */
export function Glyph({ k, size = 30, tone = "paper", className }: { k: string; size?: number; tone?: Tone; className?: string }) {
  const b = BLOCKS[k];
  if (!b) return null;
  return <Mono text={b.mono} size={size} tone={tone} className={className} />;
}

export function Mono({ text, size = 30, tone = "paper", className }: { text: string; size?: number; tone?: Tone; className?: string }) {
  return (
    <i
      className={cn("inline-grid flex-none place-items-center border font-mono font-semibold not-italic", TONES[tone], className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), fontSize: Math.max(7, Math.round(size * 0.34)), letterSpacing: "-.04em" }}
    >
      {text}
    </i>
  );
}
