declare module "virtual:luminova-brand" {
  export const name: string;
  export const shortName: string;
  export const legalName: string;
  export const movementName: string;
  export const description: string;
  export const locality: {
    readonly city: string;
    readonly cityFormal: string;
    readonly region: string;
    readonly country: string;
  };
  export const foundedYear: number;
  export const stats: { readonly nationalOrganizations: number };
  export const parentOrganization: { readonly name: string; readonly url: string };
  export const broadcastChannelName: string;
  export const locale: string;
  export const qrPrefix: string;
  /** Resolved for this build: production origins, or localhost in dev and emulator builds. */
  export const urls: { readonly spotlight: string; readonly backstage: string };
  export const emailPlaceholder: string;

  export const logos: {
    readonly main: string;
    readonly onDark: string;
    readonly onPrimary: string;
    readonly width: number;
    readonly height: number;
  };
}
