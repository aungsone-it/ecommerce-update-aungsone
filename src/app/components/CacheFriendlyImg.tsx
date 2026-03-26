import type { ImgHTMLAttributes } from "react";
import { getCacheableImageProps } from "../utils/module-cache";

export type CacheFriendlyImgProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  /** Hero image on product detail — eager load + high fetch priority */
  priority?: boolean;
};

/**
 * Storefront / storage-friendly <img>: anonymous CORS + lazy loading + fetchPriority hints
 * so browsers reuse cache and defer below-the-fold work (fewer duplicate Storage reads).
 */
export function CacheFriendlyImg({
  src,
  alt,
  className,
  priority = false,
  loading,
  ...rest
}: CacheFriendlyImgProps) {
  const cache = getCacheableImageProps(src);
  return (
    <img
      {...cache}
      {...rest}
      src={src}
      alt={alt}
      className={className}
      loading={loading ?? (priority ? "eager" : "lazy")}
      decoding="async"
      fetchPriority={priority ? "high" : "low"}
    />
  );
}
