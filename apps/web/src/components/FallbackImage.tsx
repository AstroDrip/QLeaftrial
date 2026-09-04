import type { ImgHTMLAttributes, SyntheticEvent } from "react";

type FallbackImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fallbackSrc?: string;
};

const DEFAULT_FALLBACK = "/images/hero/leaf-1.svg";

export function FallbackImage({
  fallbackSrc = DEFAULT_FALLBACK,
  onError,
  ...props
}: FallbackImageProps) {
  function handleError(event: SyntheticEvent<HTMLImageElement>) {
    onError?.(event);
    const image = event.currentTarget;
    if (image.getAttribute("src") === fallbackSrc) return;
    image.src = fallbackSrc;
  }

  return <img {...props} onError={handleError} />;
}
