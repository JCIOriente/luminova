import { cn } from "../lib/cn";
import { Avatar } from "./avatar";

interface AvatarStackPerson {
  name: string;
  src?: string | null;
}

interface AvatarStackProps {
  people: AvatarStackPerson[];
  max?: number;
  size?: number;
  className?: string;
}

export function AvatarStack({ people, max = 3, size = 28, className }: AvatarStackProps) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const overflow = people.slice(max);
  return (
    <div className={cn("flex items-center", className)}>
      {shown.map((p, i) => (
        <span
          key={`${p.name}-${i}`}
          className="rounded-full ring-2 ring-surface"
          style={{ marginLeft: i === 0 ? 0 : -size / 3.5 }}
        >
          <Avatar src={p.src} name={p.name} size={size} />
        </span>
      ))}
      {overflow.length > 0 && (
        // -size/3.5 overlaps siblings; chip font scales at 0.36 of diameter
        <span
          role="img"
          aria-label={`${overflow.length} más: ${overflow.map((p) => p.name).join(", ")}`}
          className="flex items-center justify-center rounded-full bg-ink-1/[0.06] font-semibold text-ink-2 ring-2 ring-surface"
          style={{ width: size, height: size, marginLeft: -size / 3.5, fontSize: size * 0.36 }}
        >
          +{overflow.length}
        </span>
      )}
    </div>
  );
}
