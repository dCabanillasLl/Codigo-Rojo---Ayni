export type IconName =
  | "home"
  | "hands"
  | "megaphone"
  | "user"
  | "bell"
  | "pin"
  | "chevron"
  | "shield"
  | "star"
  | "clock"
  | "mic"
  | "search"
  | "sliders"
  | "store"
  | "heart"
  | "arrow"
  | "close"
  | "check"
  | "wifiOff"
  | "headphones"
  | "whatsapp"
  | "share"
  | "calendar"
  | "package"
  | "alert"
  | "plus"
  | "eye"
  | "eyeOff";

const paths: Record<IconName, React.ReactNode> = {
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  eyeOff: <><path d="m3 3 18 18M10.6 5.1A12 12 0 0 1 12 5c6.5 0 10 7 10 7a19 19 0 0 1-3 4M6.2 6.2A20 20 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.8-1.6M10 10a3 3 0 0 0 4 4"/></>,
  home: (
    <>
      <path d="m3 11 9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  hands: (
    <>
      <path d="M8.5 12.5 5 9a2.1 2.1 0 0 0-3 3l5.4 5.4A5.5 5.5 0 0 0 11.3 19H14" />
      <path d="m15.5 12.5 3.5-3.5a2.1 2.1 0 0 1 3 3l-5.4 5.4A5.5 5.5 0 0 1 12.7 19H10" />
      <path d="m8 8 2.3-2.3a2.4 2.4 0 0 1 3.4 0L16 8" />
      <path d="m9 13 3-3 3 3" />
    </>
  ),
  megaphone: (
    <>
      <path d="m3 11 14-6v14L3 13Z" />
      <path d="M11.6 16.7 13 21H7l-1.5-6" />
      <path d="M21 9v6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  star: <path d="m12 2 3 6 6.5 1-4.7 4.6 1.1 6.4-5.9-3.1L6.1 20l1.1-6.4L2.5 9 9 8Z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h16M4 18h16M7 6v4M17 14v4" />
      <circle cx="7" cy="12" r="2" />
      <circle cx="17" cy="12" r="2" />
    </>
  ),
  store: (
    <>
      <path d="M4 10v11h16V10M3 4h18l-1 6a3 3 0 0 1-5 1 3 3 0 0 1-6 0 3 3 0 0 1-5-1Z" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  heart: (
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
  ),
  arrow: (
    <>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12M18 6 6 18" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  wifiOff: (
    <>
      <path d="M2 8.8A15 15 0 0 1 8.5 6M22 8.8A15 15 0 0 0 15 6M5 12.8a10 10 0 0 1 7-2.8c1.2 0 2.3.2 3.3.6M8.5 16.5a5 5 0 0 1 7 0M12 21h.01M3 3l18 18" />
    </>
  ),
  headphones: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M4 14h3v6H5a1 1 0 0 1-1-1ZM20 14h-3v6h2a1 1 0 0 0 1-1Z" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3 20.5l1.3-4.7A8.5 8.5 0 1 1 20.5 11.6Z" />
      <path d="M8.2 7.7c.3-.5.6-.5.9-.5h.4l.8 2c.1.3 0 .5-.2.7l-.6.7c.9 1.8 2.2 3 4 3.8l.6-.8c.2-.2.5-.3.7-.2l2 .9c.3.1.3.4.3.6-.1.8-.6 1.5-1.3 1.8-1 .4-2.4.2-4.5-.8-2.8-1.3-4.5-4.5-4.6-4.7-.4-1-.4-2.4.1-3.1Z" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="2" />
      <circle cx="6" cy="12" r="2" />
      <circle cx="18" cy="19" r="2" />
      <path d="m8 11 8-5M8 13l8 5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  package: (
    <>
      <path d="m12 3 9 4.5v9L12 21l-9-4.5v-9Z" />
      <path d="m3 7.5 9 4.5 9-4.5M12 12v9" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.7 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
};

export default function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}


