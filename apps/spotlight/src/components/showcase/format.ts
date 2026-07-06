const numberFormatter = new Intl.NumberFormat("es-BO");

export function formatES(n: number): string {
  return numberFormatter.format(n);
}
