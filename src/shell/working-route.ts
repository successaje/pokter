/**
 * Hiring, Building and Settings: the working pages, as opposed to the public
 * site. The header keeps its rule on them and the footer is left off. The
 * integration guide sits under /build but is a document, so it is not one.
 */
const WORKING = /^\/(workspace|account)(\/|$)|^\/build(\/(?!integration)|$)/;

export function isWorkingRoute(pathname: string): boolean {
  return WORKING.test(pathname);
}
