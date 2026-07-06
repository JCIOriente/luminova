import type { ReactElement } from "react";
import type { Activity } from "@luminova/types";
import { Card, Icon } from "@luminova/ui";
import { CATEGORY_LABELS } from "../category-labels";
import { formatDate, formatTime } from "@luminova/utils/datetime";

interface ActivityDetailsProps {
  activity: Activity;
}

function Row({ icon, label, value }: { icon: ReactElement; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="text-ink-3">{icon}</span>
      <span className="text-ui-sm text-ink-3">{label}</span>
      <span className="ml-auto text-right text-ui-sm font-semibold text-ink-1">{value}</span>
    </div>
  );
}

export function ActivityDetails({ activity }: ActivityDetailsProps) {
  return (
    <Card as="aside" padding="none" className="px-5 py-4">
      <h2 className="font-mono text-ui-2xs tracking-[0.12em] text-ink-3 uppercase">Detalles</h2>
      <div className="mt-2 divide-y divide-line">
        <Row icon={Icon.calendar({ s: 17 })} label="Fecha" value={formatDate(activity.startAt)} />
        <Row
          icon={Icon.clock({ s: 17 })}
          label="Hora"
          value={`${formatTime(activity.startAt)} hrs`}
        />
        <Row icon={Icon.pin({ s: 17 })} label="Lugar" value={activity.location ?? "Por definir"} />
        <Row
          icon={Icon.target({ s: 17 })}
          label="Tipo"
          value={CATEGORY_LABELS[activity.category]}
        />
      </div>
    </Card>
  );
}
