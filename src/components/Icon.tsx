type IconName =
  | "music"
  | "plus"
  | "upload"
  | "shield"
  | "file"
  | "headphones"
  | "arrow"
  | "check"
  | "wave";
const paths: Record<IconName, string> = {
  music:
    "M9 18V5l12-2v13M9 8l12-2M9 18a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Zm12-2a3 3 0 1 1-3-3c1.7 0 3 1.3 3 3Z",
  plus: "M12 5v14M5 12h14",
  upload: "M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4",
  shield: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6",
  file: "M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 13h8M8 17h5",
  headphones: "M3 14v-2a9 9 0 0 1 18 0v2M3 12h3v9H3v-9Zm15 0h3v9h-3v-9Z",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  check: "m5 12 4 4L19 6",
  wave: "M2 12h2m2-4v8m4-12v16m4-14v12m4-9v6m4-3h-2",
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
