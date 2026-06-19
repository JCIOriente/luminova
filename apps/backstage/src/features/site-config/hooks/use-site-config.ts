import { useQuery } from "@tanstack/react-query";
import { SiteConfigRepository } from "../repositories/site-config-repository";
import { siteConfigKeys } from "./site-config-keys";

export function useSiteConfig() {
  return useQuery({
    queryKey: siteConfigKeys.current,
    queryFn: () => new SiteConfigRepository().get(),
  });
}
