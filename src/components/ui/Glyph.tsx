import { BLOCKS } from "@/lib/catalog";
import { BRAND_ICONS } from "@/lib/brand-icons.generated";
import { cn } from "@/lib/utils";
import { ICONS } from "./icons";

export type Tone = "paper" | "ink" | "acc" | "amber";

const TONES: Record<Tone, string> = {
  paper: "border-[#d8cfba] bg-[#ece4d0] text-ink",
  ink: "border-ink bg-ink text-[#f4efe3]",
  acc: "border-[#e6b9a3] bg-[#f8e3d6] text-[#8a3615]",
  amber: "border-[#e0b455] bg-[#fbefcf] text-[#8a6200]",
};

/** Icon in a warm toned tile — used for generic steps (not a specific app). */
export function IconTile({ icon, size = 30, tone = "paper", className }: { icon: string; size?: number; tone?: Tone; className?: string }) {
  const Icon = ICONS[icon] ?? ICONS.Box;
  return (
    <i
      className={cn("inline-grid flex-none place-items-center border not-italic", TONES[tone], className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.8} />
    </i>
  );
}

/** A real company logo on a clean white tile. */
export function BrandTile({ brand, size = 30, className }: { brand: string; size?: number; className?: string }) {
  const logo = BRAND_ICONS[brand];
  if (!logo) return <IconTile icon="Box" size={size} className={className} />;
  const inner = Math.round(size * 0.6);
  return (
    <i
      className={cn("inline-grid flex-none place-items-center border border-[#e3dbc6] bg-[#fffdf7] not-italic shadow-[0_1px_0_#fff_inset]", className)}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3) }}
    >
      <svg viewBox={`0 0 ${logo.w} ${logo.h}`} width={inner} height={inner} aria-hidden dangerouslySetInnerHTML={{ __html: logo.body }} />
    </i>
  );
}

/** The icon for a catalog block: the company's logo if it is a specific app, otherwise a toned icon. */
export function Glyph({ k, size = 30, tone = "paper", className }: { k: string; size?: number; tone?: Tone; className?: string }) {
  const b = BLOCKS[k];
  if (!b) return null;
  return b.icon.brand ? <BrandTile brand={b.icon.brand} size={size} className={className} /> : <IconTile icon={b.icon.lucide ?? "Box"} size={size} tone={tone} className={className} />;
}
