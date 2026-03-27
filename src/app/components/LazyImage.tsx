import React, { useState, useEffect, useRef } from 'react';
import { getCacheableImageProps } from '../utils/module-cache';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackSrc?: string;
  /** Above-the-fold / LCP: load immediately, higher fetch priority */
  priority?: boolean;
}

export const LazyImage = React.memo(({ src, alt, className = '', fallbackSrc, priority = false }: LazyImageProps) => {
  const [imageSrc, setImageSrc] = useState<string | null>(priority ? src : null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (priority) {
      setImageSrc(src);
      setIsLoading(true);
      setHasError(false);
      return;
    }

    setImageSrc(null);
    setIsLoading(true);
    setHasError(false);

    const el = imgRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setImageSrc(src);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px',
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [src, priority]);

  const handleLoad = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
    if (fallbackSrc) {
      setImageSrc(fallbackSrc);
    }
  };

  const imageProps = imageSrc ? getCacheableImageProps(imageSrc) : {};

  return (
    <div className={`relative ${className}`} ref={imgRef}>
      {isLoading && (
        <div className="absolute inset-0 bg-slate-200 animate-pulse" />
      )}
      {imageSrc && (
        <img
          {...imageProps}
          alt={alt}
          decoding="async"
          fetchPriority={priority ? 'high' : 'low'}
          loading={priority ? 'eager' : 'lazy'}
          className={`${className} ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity duration-150`}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
      {hasError && !fallbackSrc && (
        <div className="absolute inset-0 bg-slate-100 flex items-center justify-center text-slate-400">
          <span className="text-sm">Image not available</span>
        </div>
      )}
    </div>
  );
});

LazyImage.displayName = 'LazyImage';
