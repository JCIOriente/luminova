import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Field,
  Input,
  Textarea,
  Select,
  Icon,
  Toast,
  EmptyState,
  Skeleton,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@luminova/ui";
import {
  notificationCreateSchema,
  type Audience,
  type NotificationCreate,
  type NotificationDoc,
  type RoleDefinition,
} from "@luminova/types";
import { formatDateTime } from "@luminova/utils/datetime";
import { PageHeader } from "../../../components/page-header";
import { QueryErrorState } from "../../../components/query-error-state";
import { useCan } from "../../../lib/authz/use-can";
import { useDismissingToast } from "../../../lib/use-dismissing-toast";
import { useRoles } from "../../permissions/hooks/use-roles";
import { useSentNotifications } from "../hooks/use-sent-notifications";
import { useComposeNotification } from "../hooks/use-compose-notification";

const NO_NOTIFICATIONS: NotificationDoc[] = [];
const NO_ROLES: RoleDefinition[] = [];

/** Encode an audience as the flat option value the native <select> carries. */
function audienceToValue(audience: Audience): string {
  return audience.type === "role" ? `role:${audience.roleId}` : audience.type;
}

/** Decode a <select> value back into the discriminated Audience. */
function valueToAudience(value: string): Audience {
  if (value === "members") return { type: "members" };
  if (value.startsWith("role:")) return { type: "role", roleId: value.slice("role:".length) };
  return { type: "everyone" };
}

function audienceLabel(audience: Audience, roleName: (id: string) => string): string {
  if (audience.type === "everyone") return "Todos";
  if (audience.type === "members") return "Miembros";
  return roleName(audience.roleId);
}

export function NotificationsPage() {
  const gate = useCan();
  const canCompose = gate.can("create", "Notification");
  const canReadHistory = gate.can("read", "Notification");

  if (!canCompose && !canReadHistory) {
    return (
      <EmptyState
        icon={Icon.lock({ s: 40 })}
        title="Acceso restringido"
        description="No tienes permiso para las notificaciones. Pídele acceso a un administrador."
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Gestión"
        title="Notificaciones"
        subtitle="Envía un aviso a los miembros o a todos los instaladores de la app."
      />
      {canCompose && <ComposeForm />}
      {canReadHistory && <SentHistory />}
    </div>
  );
}

function ComposeForm() {
  const compose = useComposeNotification();
  const { data: roles } = useRoles({ enabled: true });
  const activeRoles = roles ?? NO_ROLES;
  const [successToast, setSuccessToast] = useDismissingToast();
  const [errorToast, setErrorToast] = useDismissingToast();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NotificationCreate>({
    resolver: zodResolver(notificationCreateSchema),
    defaultValues: { title: "", body: "", url: "", audience: { type: "everyone" } },
  });

  const audienceValue = audienceToValue(watch("audience"));

  const submit = handleSubmit((data) => {
    compose.mutate(data, {
      onSuccess: () => {
        setSuccessToast("Notificación enviada.");
        reset();
      },
      onError: () => setErrorToast("No se pudo enviar la notificación."),
    });
  });

  return (
    <form onSubmit={submit} noValidate className="flex max-w-2xl flex-col gap-4">
      <Field label="Título" htmlFor="title" required error={errors.title?.message}>
        <Input id="title" maxLength={120} {...register("title")} />
      </Field>
      <Field label="Mensaje" htmlFor="body" required error={errors.body?.message}>
        <Textarea id="body" maxLength={1000} {...register("body")} />
      </Field>
      <Field
        label="Enlace (opcional)"
        htmlFor="url"
        hint="Se abre al tocar la notificación."
        error={errors.url?.message}
      >
        <Input
          id="url"
          type="url"
          inputMode="url"
          placeholder="https://…"
          {...register("url", { setValueAs: (v) => (v === "" ? null : v) })}
        />
      </Field>
      <Field label="Audiencia" htmlFor="audience" error={errors.audience?.message}>
        <Select
          id="audience"
          value={audienceValue}
          onChange={(e) =>
            setValue("audience", valueToAudience(e.target.value), { shouldValidate: true })
          }
        >
          <option value="everyone">Todos</option>
          <option value="members">Miembros</option>
          {activeRoles.map((role) => (
            <option key={role.id} value={`role:${role.id}`}>
              {role.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button
        as="button"
        type="submit"
        className="mt-1 w-full justify-center sm:w-auto sm:self-start"
      >
        {isSubmitting ? "Enviando…" : "Enviar notificación"}
      </Button>

      {successToast && <Toast message={successToast} icon={Icon.check({ s: 18 })} />}
      {errorToast && <Toast message={errorToast} icon={Icon.close({ s: 18 })} />}
    </form>
  );
}

function SentHistory() {
  const { data, isLoading, isError, error, refetch } = useSentNotifications({ enabled: true });
  const { data: roles } = useRoles({ enabled: true });
  const roleName = useMemo(() => {
    const byId = new Map((roles ?? NO_ROLES).map((r) => [r.id, r.name]));
    return (id: string) => byId.get(id) ?? id;
  }, [roles]);

  const sent = data ?? NO_NOTIFICATIONS;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[19px] font-normal tracking-[-0.01em] text-ink-1">Enviadas</h2>
      {isError ? (
        <QueryErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : sent.length === 0 ? (
        <EmptyState
          icon={Icon.bell({ s: 40 })}
          title="Sin notificaciones todavía"
          description="Las notificaciones que envíes aparecerán aquí."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Audiencia</TableHead>
              <TableHead className="hidden md:table-cell">Enviada</TableHead>
              <TableHead className="text-right">Entregadas</TableHead>
              <TableHead className="text-right">Fallidas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sent.map((n) => (
              <TableRow key={n.id}>
                <TableCell>
                  <div className="font-semibold text-ink-1">{n.title}</div>
                  <p className="m-0 line-clamp-1 max-w-md text-ui-xs text-ink-3" title={n.body}>
                    {n.body}
                  </p>
                </TableCell>
                <TableCell className="text-ui-sm text-ink-2">
                  {audienceLabel(n.audience, roleName)}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-ui-xs text-ink-3 md:table-cell">
                  {formatDateTime(n.createdAt)}
                </TableCell>
                <TableCell className="text-right text-ui-sm text-ink-2">
                  {n.stats ? n.stats.pushSent : "—"}
                </TableCell>
                <TableCell className="text-right text-ui-sm text-ink-2">
                  {n.stats ? n.stats.pushFailed : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
