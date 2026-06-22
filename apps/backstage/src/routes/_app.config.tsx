import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Skeleton, EmptyState, Icon, Toast } from "@luminova/ui";
import { useSiteConfig } from "../features/site-config/hooks/use-site-config";
import { useUpdateSiteConfig } from "../features/site-config/hooks/use-update-site-config";
import {
  toSiteConfigInput,
  EMPTY_LINKTREE,
} from "../features/site-config/repositories/site-config-mapper";
import { SiteConfigForm } from "../features/site-config/components/site-config-form";
import { PageHeader } from "../components/page-header";
import type { SiteConfigInput } from "@luminova/types";

export const Route = createFileRoute("/_app/config")({
  component: ConfigPage,
});

const BLANK_CONFIG: SiteConfigInput = {
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
    links: [],
  },
  linktree: EMPTY_LINKTREE,
};

function ConfigPage() {
  const { data, isLoading, isError } = useSiteConfig();
  const updateSiteConfig = useUpdateSiteConfig();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(id);
  }, [toast]);

  const handleSubmit = async (formData: SiteConfigInput) => {
    await updateSiteConfig.mutateAsync({ data: formData, version: data?.version ?? 0 });
    setToast("Configuración guardada correctamente.");
  };

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
      {toast && <Toast message={toast} icon={Icon.check({ s: 18 })} />}
    </div>
  );
}
