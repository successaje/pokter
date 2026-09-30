import { redirect } from 'next/navigation';

/**
 * Keep old links and bookmarks working while the diagnostic is now part of
 * the complete Builder Studio journey.
 */
export default function CompatibilityPage() {
  redirect('/build');
}
