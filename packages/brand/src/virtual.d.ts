declare module "virtual:luminova-brand" {
  export const brand: {
    readonly name: string;
    readonly shortName: string;
    readonly legalName: string;
    readonly movementName: string;
    readonly description: string;
    readonly locality: {
      readonly city: string;
      readonly cityFormal: string;
      readonly region: string;
      readonly country: string;
    };
    readonly foundedYear: number;
    readonly stats: { readonly nationalOrganizations: number };
    readonly parentOrganization: { readonly name: string; readonly url: string };
    readonly broadcastChannelName: string;
    readonly locale: string;
    readonly qrPrefix: string;
    readonly urls: { readonly spotlight: string; readonly backstage: string };
    readonly emailPlaceholder: string;
  };

  export const logos: {
    readonly main: string;
    readonly onDark: string;
    readonly onPrimary: string;
    readonly width: number;
    readonly height: number;
  };
}
