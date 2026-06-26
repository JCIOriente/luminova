import type { ReactNode } from "react";
import { Badge, Icon, ImageUploader } from "@luminova/ui";
import { useMemberPhoto } from "../hooks/use-member-photo";

const CHAPTER = "JCI Oriente";
const CITY = "Santa Cruz de la Sierra, Bolivia";

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3.5 border-t border-line py-3 text-[14px]">
      <span className="flex shrink-0 text-ink-3">{icon}</span>
      <span className="w-[112px] shrink-0 text-[12.5px] text-ink-3">{label}</span>
      <span className="min-w-0 font-medium text-ink-1">{children}</span>
    </div>
  );
}

export function MemberCredentialCard({
  memberId,
  name,
  src,
  joinYear,
  role,
}: {
  memberId: string;
  name: string;
  src: string | null;
  joinYear: number | null;
  role: string;
}) {
  const { onUpload, onRemove } = useMemberPhoto(memberId);

  return (
    <section className="flex flex-col rounded-card border border-line bg-surface">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <div>
          <h2 className="text-[15px] font-semibold text-ink-1">Tu credencial</h2>
          <div className="mt-0.5 text-[12px] text-ink-3">Identidad de miembro · {CHAPTER}</div>
        </div>
        <span className="text-ink-3">{Icon.user({ s: 20 })}</span>
      </header>

      <div className="px-6 py-5">
        <div className="flex items-center gap-4">
          <ImageUploader currentSrc={src} name={name} onUpload={onUpload} onRemove={onRemove} />
          <div className="min-w-0">
            <div className="text-[20px] leading-tight font-semibold tracking-[-0.015em] text-ink-1">
              {name}
            </div>
            <div className="mt-2">
              <Badge tone="blue">{role}</Badge>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col">
          <Row icon={Icon.target({ s: 17 })} label="Capítulo">
            {CHAPTER}
          </Row>
          <Row icon={Icon.user({ s: 17 })} label="Rol actual">
            {role}
          </Row>
          <Row icon={Icon.calendar({ s: 17 })} label="Miembro desde">
            {joinYear ?? "—"}
          </Row>
          <Row icon={Icon.pin({ s: 17 })} label="Ciudad">
            {CITY}
          </Row>
        </div>
      </div>
    </section>
  );
}
