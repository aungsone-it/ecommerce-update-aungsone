import React, { useState, useEffect, useRef } from 'react';
import { getCacheableImageProps } from '../utils/module-cache';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackSrc?: string;
}

export const LazyImage = React.memo(({ src, alt, className = '', fallbackSrc }: LazyImageProps) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!imgRef.current) return;

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
        rootMargin: '50px', // Start loading 50px before the image is visible
      }
    );

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, [src]);

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

  // Get cacheable props to prevent re-downloading
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
          fetchPriority="low"
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