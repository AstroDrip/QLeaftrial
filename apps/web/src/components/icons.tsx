import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = { viewBox: "0 0 24 24", "aria-hidden": true, focusable: false } as const;

export function SearchIcon(props: IconProps) {
  return <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;
}

export function EyeIcon(props: IconProps) {
  return <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
}

export function EyeOffIcon(props: IconProps) {
  return <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M9.9 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.3M6.2 7.2C3.9 8.9 2.5 12 2.5 12S6 18.5 12 18.5c1.4 0 2.7-.3 3.8-.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="m3.5 3.5 17 17" /></svg>;
}

export function LeafIcon(props: IconProps) {
  return <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M5 19c0-8 5-13.5 14-14 0 9-5 14-14 14Z" /><path d="M5 19 14 10" /></svg>;
}

export function SproutIcon(props: IconProps) {
  return <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 20v-7" /><path d="M12 13c0-3.2-2.3-5-5.5-5 0 3.2 2.1 5 5.5 5Z" /><path d="M12 13c0-3.2 2.3-5 5.5-5 0 3.2-2.1 5-5.5 5Z" /></svg>;
}

export function TrashIcon(props: IconProps) {
  return <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M4.5 7h15" /><path d="M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2" /><path d="M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" /><path d="M10 11v6M14 11v6" /></svg>;
}

export function BagIcon(props: IconProps) {
  return <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M5.5 8.5h13l-1 11.5h-11l-1-11.5Z" /><path d="M9 10V7a3 3 0 0 1 6 0v3" /></svg>;
}

export function CloseIcon(props: IconProps) {
  return <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}><path d="m6 6 12 12M18 6 6 18" /></svg>;
}

// Drawn inside the 24px box with a margin so the stroke is never clipped.
export function WhatsAppIcon(props: IconProps) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" {...props}>
      <path d="M12 3.25a8.75 8.75 0 0 0-7.56 13.16L3.5 20.5l4.2-.98A8.75 8.75 0 1 0 12 3.25Z" />
      <path fill="currentColor" stroke="none" d="M9.2 7.9c.2 0 .4 0 .55.36l.7 1.66c.06.15.04.33-.06.46l-.5.62c-.1.13-.12.31-.03.45.6 1.04 1.44 1.86 2.5 2.42.15.08.33.05.45-.06l.6-.55c.13-.12.32-.15.48-.08l1.64.75c.32.15.38.37.36.6-.06.82-.75 1.6-1.6 1.64-1.06.05-2.78-.43-4.42-1.98-1.66-1.57-2.4-3.37-2.4-4.4 0-.86.63-1.7 1.73-1.89Z" />
    </svg>
  );
}

export function InstagramIcon(props: IconProps) {
  return <svg {...base} fill="none" stroke="currentColor" strokeWidth="1.6" {...props}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" /></svg>;
}
