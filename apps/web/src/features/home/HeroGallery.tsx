import { useEffect, useRef, useState } from "react";

type HeroImage = { src: string; alt: string; altAr: string };

// Bundled catalogue photos, so the hero never waits on the API.
export const HERO_POOL: HeroImage[] = [
  { src: "/media/plants/areca-palm-110-cm-640.webp", alt: "Areca palm in a grey pot", altAr: "نخلة الأريكا في أصيص رمادي" },
  { src: "/media/plants/orchid-640.webp", alt: "Flowering orchid", altAr: "أوركيد مزهر" },
  { src: "/media/plants/zamioculcas-zamiifolia-640.webp", alt: "ZZ plant", altAr: "نبات زد زد" },
  { src: "/media/plants/monstera-deliciosa-big-size-120-cm-640.webp", alt: "Large monstera deliciosa", altAr: "مونستيرا ديليسيوزا كبيرة" },
  { src: "/media/plants/bird-of-paradise-150-cm-640.webp", alt: "Bird of paradise", altAr: "عصفور الجنة" },
  { src: "/media/plants/anthurium-red-55-cm-640.webp", alt: "Red anthurium", altAr: "أنثوريوم أحمر" },
  { src: "/media/plants/kentia-palm-big-size-120-cm-640.webp", alt: "Kentia palm", altAr: "نخلة الكنتيا" },
  { src: "/media/plants/peace-lily-big-size-640.webp", alt: "Peace lily in bloom", altAr: "زنبق السلام المزهر" },
  { src: "/media/plants/calathea-makoyana-70-cm-640.webp", alt: "Calathea makoyana", altAr: "كالاثيا ماكويانا" },
  { src: "/media/plants/bougainvillea-pink-640.webp", alt: "Pink bougainvillea", altAr: "جهنمية وردية" },
  { src: "/media/plants/schefflera-640.webp", alt: "Schefflera umbrella plant", altAr: "شيفليرا" },
  { src: "/media/plants/monstera-adansonii-640.webp", alt: "Monstera adansonii", altAr: "مونستيرا أدانسوني" },
];

const SLOTS = 3;
export const ROTATE_MS = 5000;

export function pickRandom(pool: HeroImage[], count: number, random = Math.random): HeroImage[] {
  const copy = [...pool];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy.slice(0, count);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

export function HeroGallery({ isArabic }: { isArabic: boolean }) {
  const [images, setImages] = useState(() => pickRandom(HERO_POOL, SLOTS));
  const shown = useRef(images);
  shown.current = images;

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let slot = 0;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      // Phones show only the first photo, so that is the one that changes there.
      const target = window.matchMedia?.("(max-width: 860px)").matches ? 0 : slot;
      slot = (slot + 1) % SLOTS;
      const next = pickRandom(HERO_POOL.filter((image) => !shown.current.some((current) => current.src === image.src)), 1)[0];
      if (!next) return;
      // Load first so the fade-in never shows a blank frame.
      const loader = new Image();
      loader.onload = () => setImages((current) => current.map((image, index) => (index === target ? next : image)));
      loader.src = next.src;
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="home-hero__gallery">
      {images.map((image, index) => (
        <img
          key={image.src}
          className="home-hero__photo"
          src={image.src}
          alt={isArabic ? image.altAr : image.alt}
          width={640}
          height={640}
          loading={index === 0 ? "eager" : "lazy"}
          fetchPriority={index === 0 ? "high" : undefined}
          decoding="async"
        />
      ))}
    </div>
  );
}
