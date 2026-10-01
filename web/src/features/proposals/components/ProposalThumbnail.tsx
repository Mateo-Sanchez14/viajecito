import { Skeleton } from "@/ui/atoms/Skeleton";
import { thumbnailPath, type LinkPreview } from "../api/proposals";

type ProposalThumbnailProps = { proposalId: string; preview: LinkPreview | null };

/**
 * Decorative preview image (the title sits next to it, so `alt` is empty). Only requests the
 * authorized thumbnail endpoint when the api says one exists; a pending unfurl shows a skeleton.
 */
export function ProposalThumbnail({ proposalId, preview }: ProposalThumbnailProps) {
  if (preview?.fetch_status === "pending") {
    return <Skeleton data-thumbnail="pending" className="h-20 w-20 shrink-0" />;
  }
  if (!preview?.has_thumbnail) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- same-origin, cookie-authorized endpoint: next/image cannot forward the session
    <img
      src={thumbnailPath(proposalId)}
      alt=""
      loading="lazy"
      className="h-20 w-20 shrink-0 rounded-xl object-cover"
    />
  );
}
