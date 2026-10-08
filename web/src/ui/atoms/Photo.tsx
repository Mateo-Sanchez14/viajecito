import type { ReactEventHandler } from "react";
import { photoImage, type Photo as PhotoData } from "@/ui/photos/photos";

type PhotoProps = {
  photo: PhotoData;
  /** Empty for a photo whose caption already names the subject (the usual case). */
  alt?: string;
  /** The first thing on screen: loaded eagerly and ahead of other images. Everything else is lazy. */
  priority?: boolean;
  /** Only the smallest variant, for people who asked to save data. */
  small?: boolean;
  /** Display width hint for the srcset; ignored when only the smallest variant is used. */
  sizes?: string;
  className?: string;
  onError?: ReactEventHandler<HTMLImageElement>;
};

/**
 * A licensed destination photo: WebP with a width/height pair (no layout shift), a srcset of its two
 * sizes, async decoding and lazy loading unless it is the first thing on screen. The focal point
 * of a cropped portrait comes from the manifest.
 */
export function Photo({ photo, alt = "", priority = false, small = false, sizes, className, onError }: PhotoProps) {
  const image = photoImage(photo, { small });
  return (
    // eslint-disable-next-line @next/next/no-img-element -- self-hosted, content-hashed static files with their own srcset
    <img
      src={image.src}
      srcSet={image.srcSet}
      sizes={image.srcSet ? sizes : undefined}
      width={image.width}
      height={image.height}
      alt={alt}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      data-photo={photo.id}
      className={className}
      style={photo.position ? { objectPosition: photo.position } : undefined}
      onError={onError}
    />
  );
}
