"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * Global pointer tracking for the `.specular` sheen: as the cursor moves over
 * a glass element, a soft highlight follows it (set via --mx/--my fractions).
 * One delegated listener instead of per-element handlers.
 */
export function LiquidRuntime() {
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const el = target.closest(".specular");
      if (!(el instanceof HTMLElement)) return;
      const rect = el.getBoundingClientRect();
      el.style.setProperty(
        "--mx",
        String((e.clientX - rect.left) / rect.width),
      );
      el.style.setProperty(
        "--my",
        String((e.clientY - rect.top) / rect.height),
      );
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return null;
}

/**
 * Segmented control with a floating glass thumb that springs between
 * options. Works in single-row (pill) and multi-row grid (rect) layouts:
 * the thumb is measured off the active option, so wrapping is fine.
 */
export function SegmentedControl<V extends string | number>({
  options,
  value,
  onChange,
  className = "",
  optionClassName = "",
  shape = "pill",
  label,
}: {
  options: readonly { label: string; value: V }[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
  optionClassName?: string;
  shape?: "pill" | "rect";
  label: string;
}) {
  const groupId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [thumb, setThumb] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the option set changes shape
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const active = container.querySelector<HTMLElement>(
        '[data-active="true"]',
      );
      if (!active) return;
      setThumb({
        left: active.offsetLeft,
        top: active.offsetTop,
        width: active.offsetWidth,
        height: active.offsetHeight,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [value, options.length]);

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={label}
      data-shape={shape}
      className={`seg ${className}`}
    >
      {thumb && <span aria-hidden="true" className="seg-thumb" style={thumb} />}
      {options.map((option) => (
        // biome-ignore lint/a11y/useSemanticElements: a segmented control needs buttons for the sliding-thumb layout; radiogroup/radio semantics are provided via ARIA
        <button
          key={`${groupId}-${option.value}`}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          data-active={value === option.value}
          onClick={() => onChange(option.value)}
          className={`seg-option ${optionClassName}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
