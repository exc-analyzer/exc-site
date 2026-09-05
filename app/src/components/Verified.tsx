export default function Verified({
  size = 15,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      role="img"
      aria-label="Verified account"
    >
      <title>Verified account</title>
      <path
        d="M12.00 2.70A4.2 4.2 0 0 1 16.65 3.95A4.2 4.2 0 0 1 20.05 7.35A4.2 4.2 0 0 1 21.30 12.00A4.2 4.2 0 0 1 20.05 16.65A4.2 4.2 0 0 1 16.65 20.05A4.2 4.2 0 0 1 12.00 21.30A4.2 4.2 0 0 1 7.35 20.05A4.2 4.2 0 0 1 3.95 16.65A4.2 4.2 0 0 1 2.70 12.00A4.2 4.2 0 0 1 3.95 7.35A4.2 4.2 0 0 1 7.35 3.95A4.2 4.2 0 0 1 12.00 2.70Z"
        fill="var(--color-verified)"
      />
      <path
        d="m8.1 12.3 2.7 2.7 5.1-5.6"
        fill="none"
        stroke="#ffffff"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
