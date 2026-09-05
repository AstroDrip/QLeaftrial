import type { ImgHTMLAttributes } from "react";
import { FallbackImage } from "./FallbackImage";
import type { ProductMedia } from "../features/catalog/product-types";

type ProductImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "srcSet" | "width" | "height"
> & {
  media: ProductMedia[] | ProductMedia | null;
  alt: string;
  preferredPurpose?: "catalog" | "detail";
  fallbackSrc?: string;
};

function hasDimensions(media: ProductMedia | undefined): media is ProductMedia & { width: number; height: number } {
  return Boolean(media && media.width && media.height);
}

export function ProductImage({
  media,
  alt,
  preferredPurpose = "catalog",
  fallbackSrc,
  sizes,
  ...imageProps
}: ProductImageProps) {
  const items = (Array.isArray(media) ? media : media ? [media] : []);
  const preferred = items.find((item) => item.purpose === preferredPurpose) ?? items[0];
  const catalog = items.find((item) => item.purpose === "catalog");
  const detail = items.find((item) => item.purpose === "detail");
  const responsive = hasDimensions(catalog) && hasDimensions(detail);
  const sourceSet = responsive
    ? `${catalog.url} ${catalog.width}w, ${detail.url} ${detail.width}w`
    : undefined;

  const image = (
    <FallbackImage
      {...imageProps}
      fallbackSrc={fallbackSrc}
      src={preferred?.url ?? fallbackSrc ?? "/images/hero/leaf-1.svg"}
      alt={preferred?.altText || alt}
      width={hasDimensions(preferred) ? preferred.width : undefined}
      height={hasDimensions(preferred) ? preferred.height : undefined}
      sizes={responsive ? sizes : undefined}
      decoding={imageProps.decoding ?? "async"}
    />
  );

  if (!responsive) return image;
  return (
    <picture>
      <source srcSet={sourceSet} sizes={sizes} />
      {image}
    </picture>
  );
}
