import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SiteConfigInput } from "@luminova/types";
import { SiteConfigRepository } from "../repositories/site-config-repository";
import { siteConfigKeys } from "./site-config-keys";

export function useUpdateSiteConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ data, version }: { data: SiteConfigInput; version: number }) =>
      new SiteConfigRepository().update(data, version),
    onSettled: () => queryClient.invalidateQueries({ queryKey: siteConfigKeys.current }),
  });
}
