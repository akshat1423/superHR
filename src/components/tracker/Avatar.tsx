import { hash01 } from "@/lib/utils";
import type { Person } from "@/lib/people";

/** Generative line-art portrait (superconnect-style) — replaced by a real photo when the ATS provides a URL. */
export function Avatar({ person, large }: { person: Pick<Person, "name" | "photoUrl">; large?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (person.photoUrl) return <img src={person.photoUrl} alt={person.name} />;
  const r = hash01(person.name);
  const ini = person.name.split(" ").map((w) => w[0]).join("").slice(0, 2);
  const ang = Math.floor(r * 360);
  return (
    <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" role="img" aria-label={person.name}>
      <rect width="200" height="200" fill="#f1e6e4" />
      {Array.from({ length: 11 }, (_, i) => (
        <circle key={i} cx={100 + Math.sin(i * 1.7 + r * 9) * i * 1.3} cy={100 + Math.cos(i * 1.3 + r * 5) * i * 1.1} r={58 + i * 3.2}
          fill="none" stroke="#17130e" strokeWidth={i % 3 ? 0.5 : 1.3} opacity={1 - i * 0.07} />
      ))}
      <circle cx="100" cy="100" r="46" fill="#17130e" transform={`rotate(${ang} 100 100)`} />
      <path d="M100 54 A46 46 0 0 1 146 100 L100 100Z" fill="#c4572f" transform={`rotate(${ang} 100 100)`} />
      <text x="100" y={large ? 114 : 112} textAnchor="middle" fontFamily="Inter Tight, sans-serif" fontWeight="800" fontSize={large ? 38 : 36} fill="#fff" letterSpacing="-2">{ini}</text>
    </svg>
  );
}
