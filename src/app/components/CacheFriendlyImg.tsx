import type { ImgHTMLAttributes } from "react";
import {
  getCacheableImageProps,
  gridDisplayImageUrl,
  logoDisplayImageUrl,
} from "../utils/module-cache";

export type CacheFriendlyImgProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  /** Above-the-fold / LCP — eager load + high fetch priority */
  priority?: boolean;
  /** Header / avatar-sized logo (128px transform) */
  logo?: boolean;
};

function resolveDisplaySrc(src: string, priority: boolean, logo?: boolean): string {
  if (!src) return src;
  if (logo) return logoDisplayImageUrl(src);
  if (priority) return gridDisplayImageUrl(src, 960);
  return gridDisplayImageUrl(src);
}

/**
 * Storefront / storage-friendly <img>: resized Supabase URLs + fetch priority hints.
 */
export function CacheFriendlyImg({
  src,
  alt,
  className,
  priority = false,
  logo = false,
  loading,
  ...rest
}: CacheFriendlyImgProps) {
  const displaySrc = resolveDisplaySrc(src, priority, logo);
  const cache = getCacheableImageProps(displaySrc);
  return (
    <img
      {...cache}
      {...rest}
      src={displaySrc}
      alt={alt}
      className={className}
      loading={loading ?? (priority ? "eager" : "lazy")}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
    />
  );
}
