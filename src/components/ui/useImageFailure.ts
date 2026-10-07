import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export interface ImageFailure {
  /** true when `src` is empty or the image at `src` is known not to load. */
  failed: boolean;
  /** Put this on the <img>. */
  ref: RefObject<HTMLImageElement | null>;
  /** Put this on the <img> as onError. */
  onError: () => void;
}

/**
 * useImageFailure — tells a component when its <img> could not be loaded, so it can show a
 * designed fallback instead of the browser's broken-image glyph.
 *
 * Two signals are needed. The `onError` prop covers images that fail after React attached.
 * On a prerendered page the browser starts (and may finish, or fail) the request while it
 * parses the HTML, long before hydration — that `error` event is gone by the time React
 * listens. So after mount the element itself is asked: an image whose request is settled
 * (`complete`) but that has no pixels is confirmed with `decode()`, which rejects for a broken
 * image and resolves for a loaded one that merely reports no intrinsic size (some SVGs).
 * Lazy images that have not started loading are not `complete`, so they are left to `onError`.
 *
 *   const image = useImageFailure(src);
 *   image.failed ? <Fallback /> : <img ref={image.ref} onError={image.onError} src={src} … />
 */
export function useImageFailure(src: string): ImageFailure {
  const ref = useRef<HTMLImageElement>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  useEffect(() => {
    const img = ref.current;
    if (!img || src === '' || !img.complete || img.naturalWidth > 0 || img.naturalHeight > 0) return;
    let cancelled = false;
    if (typeof img.decode !== 'function') {
      setFailedSrc(src);
      return;
    }
    img.decode().catch(() => {
      if (!cancelled) setFailedSrc(src);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const onError = useCallback(() => setFailedSrc(src), [src]);

  return { failed: src === '' || failedSrc === src, ref, onError };
}
