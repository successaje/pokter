import type { Erc8004RegistrationFile } from '@altananetwork/sdk';

type Service = Erc8004RegistrationFile['services'][number];

/**
 * A registration's service entry after its owner edits the endpoint.
 *
 * A service's `version` describes its endpoint: the A2A version that card
 * speaks. Left alone while the endpoint is unchanged. When the endpoint
 * moves, the old version goes with it, and the version the check of the new
 * endpoint read from its card takes its place; none is written when the
 * check read none, because an absent version is better than a wrong one.
 */
export function serviceAt(service: Service, endpoint: string, checkedVersion: string | null): Service {
  if (service.endpoint === endpoint) return service;
  const next: Service = { ...service, endpoint };
  delete next.version;
  return checkedVersion ? { ...next, version: checkedVersion } : next;
}
