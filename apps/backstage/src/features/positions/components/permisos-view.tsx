import { Card, Skeleton } from "@luminova/ui";
import { PERMISSION_ROLE_INFO } from "../lib/permission-labels";
import type { PermissionRow } from "../lib/permissions-overview";

interface PermisosViewProps {
  rows: PermissionRow[];
  isLoading: boolean;
}

export function PermisosView({ rows, isLoading }: PermisosViewProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => {
        const info = PERMISSION_ROLE_INFO[row.role];
        return (
          <Card as="article" key={row.role}>
            <h2 className="text-[15px] font-semibold text-ink-1">{info.label}</h2>
            <p className="mt-1 text-[13.5px] text-ink-3">{info.description}</p>
            <dl className="mt-4 flex flex-col gap-2 text-[13.5px]">
              <div className="flex gap-2">
                <dt className="text-ink-3">Otorgado por:</dt>
                <dd className="text-ink-2">
                  {row.grantingCargos.length > 0 ? row.grantingCargos.join(", ") : "—"}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-ink-3">Lo tienen:</dt>
                <dd className="text-ink-2">
                  {row.holders.length > 0 ? row.holders.map((h) => h.name).join(", ") : "Nadie aún"}
                </dd>
              </div>
            </dl>
          </Card>
        );
      })}
    </div>
  );
}
