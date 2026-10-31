import { BLOCKS } from "@/lib/catalog";
import { cn } from "@/lib/utils";

/** Neutral monogram tile for a block — one quiet style everywhere, no per-app colors. */
export function Glyph({ k, size = 30, className }: { k: string; size?: number; className?: string }) {
  const b = BLOCKS[k];
  if (!b) return null;
  return <Mono text={b.mono} size={size} className={className} />;
}

export function Mono({ text, size = 30, className }: { text: string; size?: number; className?: string }) {
  return (
    <i
      className={cn("inline-grid flex-none place-items-center border border-[#d8cfba] bg-[#ece4d0] font-mono font-semibold not-italic text-ink", className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), fontSize: Math.max(7, Math.round(size * 0.34)), letterSpacing: "-.04em" }}
    >
      {text}
    </i>
  );
}
