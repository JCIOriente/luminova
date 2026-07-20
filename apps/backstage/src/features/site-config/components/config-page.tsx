import { Skeleton, EmptyState, Icon, Toast } from "@luminova/ui";
import { useDismissingToast } from "../../../lib/use-dismissing-toast";
import { useSiteConfig } from "../hooks/use-site-config";
import { useUpdateSiteConfig } from "../hooks/use-update-site-config";
import { toSiteConfigInput, EMPTY_LINKTREE } from "../repositories/site-config-mapper";
import { SiteConfigForm } from "./site-config-form";
import { PageHeader } from "../../../components/page-header";
import { useCan } from "../../../lib/authz/use-can";
import type { SiteConfigInput } from "@luminova/types";

const BLANK_CONFIG: SiteConfigInput = {
  hero: { motto: "", submotto: "" },
  stats: {
    programCount: 0,
    countries: "",
    membersWorldwide: "",
    nationalAwards: 0,
    efficiencyPct: 0,
    standoutOrg: { year: "", title: "" },
  },
  timeline: [],
  mvv: { mision: "", vision: "", valores: "" },
  reasons: [],
  contact: {
    email: "",
    location: "",
    meetingSchedule: "",
    mapUrl: "",
    whatsapp: "",
    broadcastChannel: "",
    socials: { instagram: "", facebook: "", tiktok: "", linkedin: "" },
    links: [],
  },
  linktree: EMPTY_LINKTREE,
};

export function ConfigPage() {
  const { isAdmin } = useCan();
  const { data, isLoading, isError } = useSiteConfig();
  const updateSiteConfig = useUpdateSiteConfig();
  const [toast, setToast] = useDismissingToast<{ message: string; ok: boolean }>();

  const handleSubmit = async (formData: SiteConfigInput) => {
    try {
      await updateSiteConfig.mutateAsync({ data: formData, version: data?.version ?? 0 });
      setToast({ message: "Configuración guardada correctamente.", ok: true });
    } catch {
      setToast({ message: "No se pudo guardar la configuración.", ok: false });
    }
  };

  // siteConfig write is Admin-role-only (firestore.rules); don't render an editor
  // whose Save can only ever be denied. Read is world-public, so no query to skip.
  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Capítulo JCI Oriente"
          title="Configuración"
          subtitle="Edita los datos del sitio público."
        />
        <p role="alert" className="text-ink-3">
          Solo un administrador puede editar la configuración del sitio.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-[200px]" />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={Icon.settings({ s: 40 })}
        title="Error al cargar la configuración"
        description="No se pudo obtener la configuración del sitio. Intenta de nuevo."
      />
    );
  }

  const defaultValues = data ? toSiteConfigInput(data) : BLANK_CONFIG;
  const lastSaved = data?.updatedAt?.toDate?.() ?? new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Capítulo JCI Oriente"
        title="Configuración"
        subtitle="Edita los datos del sitio público."
      />
      <SiteConfigForm defaultValues={defaultValues} lastSaved={lastSaved} onSubmit={handleSubmit} />
      {toast && (
        <Toast
          message={toast.message}
          icon={toast.ok ? Icon.check({ s: 18 }) : Icon.close({ s: 18 })}
        />
      )}
    </div>
  );
}
