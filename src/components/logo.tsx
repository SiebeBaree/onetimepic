// Wordmark + ember flame mark. The flame ties to the "burns once" concept and
// the accent color; the gradient + soft glow give it a premium feel.
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <FlameMark />
      <span className="text-[15px] font-medium tracking-tight text-ivory">
        OneTime<span className="text-ember">Pic</span>
      </span>
    </span>
  );
}

export function FlameMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      role="img"
      aria-label="OneTimePic"
      style={{ filter: "drop-shadow(0 0 6px var(--ember-glow))" }}
    >
      <title>OneTimePic</title>
      <defs>
        <linearGradient id="otp-flame" x1="12" y1="2" x2="12" y2="22">
          <stop offset="0" stopColor="var(--color-ember-bright)" />
          <stop offset="1" stopColor="var(--color-ember-deep)" />
        </linearGradient>
      </defs>
      <path
        d="M13.4 2.1c.3 2.6-.9 4-2.2 5.4C9.7 9 8.2 10.6 8.2 13a3.8 3.8 0 0 0 7.6.3c0-1.2-.4-2-.9-2.8.1.9-.5 1.8-1.4 1.9-.8.1-1.5-.5-1.5-1.5 0-1.6 1.6-2.6 1.9-4.6.2-1.6-.3-3-.5-4.2Z"
        fill="url(#otp-flame)"
      />
      <path
        d="M11.2 13.6c0-1 .5-1.8 1.1-2.5-.1 1 .6 1.7 1.4 1.6"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="0.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
