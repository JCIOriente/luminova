import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Icon, IconButton, Popover, EmptyState, Skeleton } from "@luminova/ui";
import { relativeTimeEs } from "@luminova/utils/datetime";
import type { InboxDoc } from "@luminova/types";
import { QueryErrorState } from "../../../components/query-error-state";
import { useInbox, unreadCount } from "../hooks/use-inbox";
import { useMarkRead } from "../hooks/use-mark-read";

/** Author-supplied urls are validated as full URLs at compose (`z.string().url()`),
 *  so in practice a notification url is absolute. The in-app branch stays defensive. */
function isAbsoluteUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useInbox();
  const markRead = useMarkRead();

  const unread = unreadCount(data);

  const onItemClick = (item: InboxDoc) => {
    if (!item.read) markRead.mutate(item.id);
    setOpen(false);
    if (!item.url) {
      // No link → take the reader to the notifications page (their full history).
      void navigate({ to: "/notificaciones" });
      return;
    }
    if (isAbsoluteUrl(item.url)) {
      // External link → open in a new tab so the backstage PWA isn't replaced.
      window.open(item.url, "_blank", "noopener,noreferrer");
    } else {
      // Author-supplied in-app path — not a statically known route, so the typed
      // router `to` needs a cast. Absolute urls take the branch above.
      void navigate({ to: item.url as Parameters<typeof navigate>[0]["to"] });
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="end"
      contentClassName="w-[360px] max-w-[calc(100vw-2rem)] p-0"
      trigger={
        <IconButton
          as="button"
          variant="subtle"
          size="md"
          aria-label={unread > 0 ? `Notificaciones, ${unread} sin leer` : "Notificaciones"}
          className="relative"
        >
          {Icon.bell({ s: 20 })}
          {unread > 0 && (
            <span className="absolute top-1 right-1 grid min-w-[16px] place-items-center rounded-full bg-jci-blue px-1 text-ui-2xs font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </IconButton>
      }
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-ui-sm font-semibold text-ink-1">Notificaciones</span>
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        {isLoading ? (
          <div role="status" aria-label="Cargando notificaciones" className="space-y-3 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : isError ? (
          <QueryErrorState error={error} onRetry={() => void refetch()} />
        ) : !data || data.length === 0 ? (
          <EmptyState icon={Icon.bell({ s: 24 })} title="Sin notificaciones" />
        ) : (
          <ul>
            {data.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onItemClick(item)}
                  className="flex w-full flex-col gap-1 border-b border-line px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-ink-1/[0.04]"
                >
                  <span className="flex items-start gap-2">
                    {!item.read && (
                      <span
                        aria-hidden="true"
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-jci-blue"
                      />
                    )}
                    <span
                      className={`min-w-0 flex-1 truncate text-ui-sm ${item.read ? "font-medium text-ink-2" : "font-semibold text-ink-1"}`}
                    >
                      {item.title}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-ui-xs text-ink-3">{item.body}</span>
                  <span className="text-ui-2xs text-ink-3">
                    {relativeTimeEs(item.createdAt.toDate(), new Date())}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Popover>
  );
}
