/**
 * A counter the catalogue cache checks before serving a cached build.
 *
 * The catalogue is built once a minute (`CATALOGUE_FRESH_MS`), so a price
 * check stored by the sweep or by a buyer's quote reached lists only when
 * that minute ran out, while the agent's own page already said otherwise.
 * Whatever stores a price check bumps this, and the next read rebuilds.
 * Kept in its own module so the stores and the marketplace can both reach
 * it without importing each other.
 */
let version = 0;

export function catalogueChanged(): void {
  version += 1;
}

export function catalogueVersion(): number {
  return version;
}
