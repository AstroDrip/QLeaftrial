import "./photo-crossfade.css";
import { useEffect, useLayoutEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { ProductImage } from "../../components/ProductImage";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import type { ProductMedia } from "./product-types";

// Shows one photograph of a product and changes to another with a crossfade: the new photograph is put on a layer
// above the current one while invisible, and only once it has fully loaded and decoded does it fade in. The old
// photograph stays fully visible underneath until the fade has finished, so there is never a blank or half-loaded
// frame, and the box keeps the size of the first photograph, so nothing around it moves.
export const FADE_MS = 650;

type Layer = { key: number; photo: number; shown: boolean };

type Props = {
  photos: ProductMedia[][];
  index: number;
  alt: string;
  preferredPurpose?: "catalog" | "detail";
  sizes?: string;
  loading?: "eager" | "lazy";
  fetchPriority?: ImgHTMLAttributes<HTMLImageElement>["fetchPriority"];
  className?: string;
  imageClassName?: string;
  testId?: string;
};

function FadeLayer({ layer, photo, onReady, ...image }: { layer: Layer; photo: ProductMedia[]; onReady: (key: number) => void } & Omit<Props, "photos" | "index" | "className">) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (layer.shown) return;
    const img = box.current?.querySelector("img");
    if (!img) return;
    let cancelled = false;
    const reveal = () => {
      if (cancelled) return;
      // decode() resolves once the picture can be painted in full; a failure still reveals (the browser shows what it has).
      const ready = typeof img.decode === "function" ? img.decode().catch(() => undefined) : Promise.resolve();
      void ready.then(() => { if (!cancelled) requestAnimationFrame(() => onReady(layer.key)); });
    };
    if (img.complete && img.naturalWidth > 0) reveal();
    else {
      img.addEventListener("load", reveal, { once: true });
      img.addEventListener("error", reveal, { once: true });
    }
    return () => {
      cancelled = true;
      img.removeEventListener("load", reveal);
      img.removeEventListener("error", reveal);
    };
  }, [layer.key, layer.shown, onReady]);

  return (
    <div ref={box} className="photo-crossfade__layer" data-shown={layer.shown ? "" : undefined} aria-hidden={layer.shown ? undefined : true}>
      <ProductImage
        media={photo}
        alt={image.alt}
        preferredPurpose={image.preferredPurpose}
        sizes={image.sizes}
        loading={image.loading}
        fetchPriority={image.fetchPriority}
        className={image.imageClassName}
        data-testid={image.testId}
        decoding="async"
      />
    </div>
  );
}

export function PhotoCrossfade({ photos, index, className, ...image }: Props) {
  const reduced = useReducedMotion();
  const counter = useRef(0);
  const [layers, setLayers] = useState<Layer[]>(() => [{ key: 0, photo: index, shown: true }]);

  // A new photograph: a hidden layer on top. A layer still waiting to load is replaced, never stacked.
  useLayoutEffect(() => {
    setLayers((current) => {
      if (current[current.length - 1].photo === index) return current;
      counter.current += 1;
      return [...current.filter((layer) => layer.shown), { key: counter.current, photo: index, shown: false }];
    });
  }, [index]);

  const onReady = useRef((key: number) => setLayers((current) => current.map((layer) => (layer.key === key ? { ...layer, shown: true } : layer)))).current;

  // Once the top layer has faded in, the ones underneath are no longer seen and are removed.
  useEffect(() => {
    const top = layers[layers.length - 1];
    if (!top.shown || layers.length === 1) return;
    const timer = window.setTimeout(() => setLayers((current) => current.slice(current.findIndex((layer) => layer.key === top.key))), reduced ? 0 : FADE_MS + 60);
    return () => window.clearTimeout(timer);
  }, [layers, reduced]);

  const newest = layers[layers.length - 1].key;
  return (
    <div className={["photo-crossfade", className].filter(Boolean).join(" ")} data-photo={layers.filter((layer) => layer.shown).at(-1)?.photo ?? 0}>
      {layers.map((layer) => (
        <FadeLayer
          key={layer.key}
          layer={layer}
          photo={photos[layer.photo] ?? photos[0]}
          onReady={onReady}
          {...image}
          // Only the first photograph follows the page's loading choice; a later one is wanted now.
          loading={layer.key === 0 ? image.loading : "eager"}
          fetchPriority={layer.key === 0 ? image.fetchPriority : undefined}
          testId={layer.key === newest ? image.testId : undefined}
        />
      ))}
    </div>
  );
}
