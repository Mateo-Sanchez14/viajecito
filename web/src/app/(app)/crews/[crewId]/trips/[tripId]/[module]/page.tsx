import { ComingSoon } from "@/features/trips/containers/ComingSoon";

/**
 * Fallback for trip modules that have no page yet. A milestone ships its own static
 * `<section>/page.tsx` next to this folder, and the static segment wins over `[module]`.
 */
export default async function ModulePlaceholderPage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module: moduleKey } = await params;
  return <ComingSoon moduleKey={moduleKey} />;
}
