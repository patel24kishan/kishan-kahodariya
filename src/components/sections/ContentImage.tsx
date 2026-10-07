import type { ImgHTMLAttributes, ReactNode } from 'react';
import { useImageFailure } from '@/components/ui';

export interface ContentImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'onError' | 'width' | 'height'> {
  /** Already passed through assetUrl(). "" renders the fallback. */
  src: string;
  alt: string;
  /** Intrinsic (or nominal) size, so the box is stable before the image arrives. */
  width: number;
  height: number;
  /** What to show when there is no image or it fails to load. `null` renders nothing. */
  fallback: ReactNode;
  /**
   * Wrap the <img> in a <picture>. Use it for an eager, above-the-fold image: React 19's server
   * renderer otherwise hoists a <link rel="preload"> for it to the start of the output, ahead of
   * the page root (see logs/issues/pages-03); images inside <picture> are left alone.
   */
  picture?: boolean;
}

/**
 * ContentImage — an image that comes from content (logos, badges, screenshots): lazy by
 * default, `referrerpolicy="no-referrer"` because most of them are hot-linked from other
 * sites, and a designed fallback when the image is missing or does not load.
 */
export function ContentImage({ src, alt, width, height, fallback, picture = false, loading = 'lazy', decoding = 'async', ...rest }: ContentImageProps) {
  const image = useImageFailure(src);
  if (image.failed) return <>{fallback}</>;
  const element = (
    <img
      ref={image.ref}
      onError={image.onError}
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      referrerPolicy="no-referrer"
      {...rest}
    />
  );
  return picture ? <picture>{element}</picture> : element;
}
