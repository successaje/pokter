'use client';
import Link from 'next/link';
import { useActiveSigner } from '@/lib/wallet/use-active-signer';

export function ServiceOwnerAction({ builder, serviceId }: { builder: string; serviceId: string }) {
  const { address } = useActiveSigner();
  if (!address || address.toLowerCase() !== builder.toLowerCase()) return null;
  return <Link href={`/build/services/new?service=${serviceId}`} className="text-xs font-medium underline">Edit or pause this service</Link>;
}
