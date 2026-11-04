import { isAddress, getAddress } from 'viem';
import { CATEGORIES } from '@/lib/agents/categories';

export type ServiceStatus = 'active' | 'paused' | 'archived';
export type ServiceContent = {
  title: string;
  description: string;
  buyerProvides: string;
  delivers: string;
  category: string;
  chainId: 56 | 97;
  tokenId: string;
  status: ServiceStatus;
};
export type Service = ServiceContent & { id: string; builder: string; revision: number; createdAt: string; updatedAt: string };

export function parseService(value: unknown): ServiceContent | null {
  if (!value || typeof value !== 'object') return null;
  const x = value as Record<string, unknown>;
  if (typeof x.title !== 'string' || x.title.trim().length < 4 || x.title.length > 100 ||
      typeof x.description !== 'string' || x.description.trim().length < 20 || x.description.length > 800 ||
      typeof x.buyerProvides !== 'string' || !x.buyerProvides.trim() || x.buyerProvides.length > 500 ||
      typeof x.delivers !== 'string' || !x.delivers.trim() || x.delivers.length > 500 ||
      !CATEGORIES.some((c) => c.id === x.category) ||
      (x.chainId !== 56 && x.chainId !== 97) ||
      typeof x.tokenId !== 'string' || !/^\d{1,12}$/.test(x.tokenId) ||
      !['active', 'paused', 'archived'].includes(String(x.status))) return null;
  return { title: x.title.trim(), description: x.description.trim(), buyerProvides: x.buyerProvides.trim(), delivers: x.delivers.trim(), category: String(x.category), chainId: x.chainId as 56 | 97, tokenId: x.tokenId, status: x.status as ServiceStatus };
}

export function serviceMessage(builder: string, challengeSuffix: string, id: string | null, content: ServiceContent): string {
  if (!isAddress(builder)) throw new Error('Invalid builder');
  const canonical = parseService(content);
  if (!canonical) throw new Error('Invalid service details');
  return `Pokter service\nBuilder: ${getAddress(builder)}\nService: ${id ?? 'new'}\nContent: ${JSON.stringify(canonical)}${challengeSuffix}`;
}

export function serviceBrief(service: ServiceContent, inputs: string): string {
  return `Service: ${service.title}\n\nScope: ${service.description}\n\nBuyer provides: ${service.buyerProvides}\n\nExpected output: ${service.delivers}\n\nMy inputs: ${inputs.trim()}`;
}
