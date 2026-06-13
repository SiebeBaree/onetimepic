"use client";

import Link from "next/link";
import posthog from "posthog-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlameMark } from "@/components/logo";
import {
  DEFAULT_VIEW_SECONDS,
  MAX_VIEW_SECONDS,
  MIN_VIEW_SECONDS,
} from "@/lib/config";
import { decryptImage } from "@/lib/crypto";

type Loaded = {
  src: CanvasImageSource;
  w: number;
  h: number;
  cleanup: () => void;
};

type View =
  | { step: "init" }
  | { step: "intro"; seconds: number }
  | { step: "loading" }
  | { step: "viewing"; seconds: number }
  | { step: "destroyed" }
  | { step: "gone" }
  | { step: "error"; message: string };

export function Viewer({ id }: { id: string }) {
  const [view, setView] = useState<View>({ step: "init" });
  const [blackout, setBlackout] = useState(false);
  const [burning, setBurning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const keyRef = useRef<string | null>(null);
  const loadedRef = useRef<Loaded | null>(null);
  const watermarkRef = useRef(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const endedRef = useRef(false);

  // Parse the URL fragment (#key.seconds); never sent to the server.
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const [key, secsRaw] = hash.split(".");
    if (!key) {
      setView({
        step: "error",
        message: "This link is incomplete. Ask the sender to share it again.",
      });
      return;
    }
    keyRef.current = key;
    const parsed = Number(secsRaw);
    const seconds = Number.isFinite(parsed)
      ? Math.min(
          MAX_VIEW_SECONDS,
          Math.max(MIN_VIEW_SECONDS, Math.round(parsed)),
        )
      : DEFAULT_VIEW_SECONDS;
    setView({ step: "intro", seconds });
  }, []);

  const destroy = useCallback(() => {
    if (endedRef.current) return;
    endedRef.current = true;
    setBurning(true);
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      loadedRef.current?.cleanup();
      loadedRef.current = null;
      setView({ step: "destroyed" });
    }, 900);
  }, []);

  const reveal = useCallback(
    async (seconds: number) => {
      const key = keyRef.current;
      if (!key) return;
      setView({ step: "loading" });

      let payload: ArrayBuffer;
      try {
        const res = await fetch(`/api/i/${id}`, {
          method: "POST",
          cache: "no-store",
        });
        if (res.status === 410) {
          setView({ step: "gone" });
          return;
        }
        if (!res.ok) {
          setView({ step: "error", message: "We couldn't open this photo." });
          return;
        }
        payload = await res.arrayBuffer();
      } catch {
        setView({
          step: "error",
          message: "Something went wrong. The link may already have been used.",
        });
        return;
      }

      try {
        const { blob, watermark } = await decryptImage(payload, key);
        watermarkRef.current = watermark;
        loadedRef.current = await loadImage(blob);
      } catch {
        setView({
          step: "error",
          message: "This link doesn't work. The photo couldn't be opened.",
        });
        return;
      }

      posthog.capture("photo_viewed");
      setRemaining(seconds);
      setView({ step: "viewing", seconds });
    },
    [id],
  );

  // Draw to canvas once the viewing UI (and its canvas) is mounted.
  useEffect(() => {
    if (view.step !== "viewing") return;
    const canvas = canvasRef.current;
    const loaded = loadedRef.current;
    if (!canvas || !loaded) return;
    try {
      paint(canvas, loaded, id, watermarkRef.current);
    } catch {
      setView({ step: "error", message: "Couldn't render the photo." });
    }
  }, [view.step, id]);

  // Countdown (keeps running even when blacked out, so hiding can't pause it).
  useEffect(() => {
    if (view.step !== "viewing") return;
    const total = view.seconds;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const rem = Math.max(0, total - (now - start) / 1000);
      setRemaining(rem);
      if (rem <= 0) {
        destroy();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [view, destroy]);

  // Screenshot / capture deterrents.
  useEffect(() => {
    if (view.step !== "viewing") return;

    const onVisibility = () => setBlackout(document.hidden);
    const onBlur = () => setBlackout(true);
    const onFocus = () => setBlackout(false);
    const onKey = (e: KeyboardEvent) => {
      const isPrintScreen = e.key === "PrintScreen";
      const isMacGrab =
        e.metaKey && e.shiftKey && ["3", "4", "5", "6"].includes(e.key);
      if (isPrintScreen || isMacGrab) {
        setBlackout(true);
        flashNotice("Screenshots are discouraged. This photo is one-time.");
        setTimeout(() => setBlackout(document.hidden), 1200);
      }
    };
    const flashNotice = (msg: string) => {
      setNotice(msg);
      setTimeout(() => setNotice(null), 2200);
    };
    const block = (e: Event) => e.preventDefault();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("keyup", onKey);
    window.addEventListener("keydown", onKey);
    window.addEventListener("contextmenu", block);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("contextmenu", block);
    };
  }, [view.step]);

  // Cleanup any decoded image on unmount.
  useEffect(() => () => loadedRef.current?.cleanup(), []);

  /* ── Render ────────────────────────────────────────────────────────────── */

  if (view.step === "viewing") {
    const progress = view.seconds > 0 ? remaining / view.seconds : 0;
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        {/* context-menu / drag are blocked by the window-level listeners in the deterrent effect */}
        <div
          className={`relative select-none overflow-hidden rounded-2xl border border-white/10 bg-ink-950 shadow-2xl ${
            burning ? "burn-away" : ""
          }`}
        >
          <canvas
            ref={canvasRef}
            className="block max-w-full touch-none"
            style={{ WebkitTouchCallout: "none", userSelect: "none" }}
          />
          <CountdownRing seconds={Math.ceil(remaining)} progress={progress} />

          {blackout && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black text-center">
              <FlameMark size={26} />
              <p className="text-sm text-ash">Hidden while you're away</p>
              <p className="max-w-[240px] text-xs text-faint">
                Come back to this tab to keep viewing. The timer is still
                running.
              </p>
            </div>
          )}
        </div>

        <p className="mt-5 text-sm text-ash">
          This photo disappears when the timer ends.
        </p>
        {notice && <p className="mt-2 text-xs text-ember">{notice}</p>}
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="card w-full max-w-md p-8 text-center">
        {view.step === "init" && <Centered>Preparing…</Centered>}

        {view.step === "loading" && (
          <Centered>
            <span className="spin mb-4 inline-block size-7 rounded-full border-2 border-ember border-t-transparent" />
            Unlocking the photo…
          </Centered>
        )}

        {view.step === "intro" && (
          <div className="flex flex-col items-center gap-5">
            <span className="flex size-16 items-center justify-center rounded-full border border-white/10 bg-ink-800">
              <FlameMark size={28} />
            </span>
            <div className="flex flex-col gap-2">
              <h1 className="font-display text-2xl text-ivory">
                Someone sent you a one-time photo
              </h1>
              <p className="text-sm leading-relaxed text-ash">
                It can be opened <span className="text-ivory">once</span>.
                You'll have{" "}
                <span className="text-ivory">{view.seconds} seconds</span>, then
                it's gone. Open it when you're ready.
              </p>
            </div>
            <button
              type="button"
              onClick={() => reveal(view.seconds)}
              className="btn btn-primary w-full px-5 py-3.5 text-[15px]"
            >
              Reveal photo
            </button>
            <p className="text-xs text-faint">
              Encrypted, and opens only once.
            </p>
          </div>
        )}

        {view.step === "destroyed" && (
          <Outcome
            title="Poof, it's gone"
            body="The photo was shown once and has been permanently deleted. There's no way to see it again."
          />
        )}

        {view.step === "gone" && (
          <Outcome
            title="This photo is no longer here"
            body="It's already been viewed, or it expired before anyone opened it. One-time means one time."
          />
        )}

        {view.step === "error" && (
          <Outcome title="This link won't open" body={view.message} />
        )}
      </div>
    </main>
  );
}

/* ── Subcomponents ───────────────────────────────────────────────────────── */

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-sm text-ash">
      {children}
    </div>
  );
}

function Outcome({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-5">
      <span className="flex size-16 items-center justify-center rounded-full border border-white/10 bg-ink-800 opacity-70">
        <FlameMark size={26} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl text-ivory">{title}</h1>
        <p className="text-sm leading-relaxed text-ash">{body}</p>
      </div>
      <Link href="/" className="btn btn-primary px-5 py-3 text-sm">
        Send your own one-time photo
      </Link>
    </div>
  );
}

function CountdownRing({
  seconds,
  progress,
}: {
  seconds: number;
  progress: number;
}) {
  const r = 18;
  const circ = 2 * Math.PI * r;
  return (
    <div className="absolute right-3 top-3 flex size-12 items-center justify-center rounded-full bg-ink-950/70 backdrop-blur">
      <svg
        width="44"
        height="44"
        viewBox="0 0 44 44"
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="3"
        />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          stroke="var(--color-ember)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - progress)}
        />
      </svg>
      <span className="absolute font-mono text-xs font-medium text-ivory">
        {seconds}
      </span>
    </div>
  );
}

/* ── Canvas helpers ──────────────────────────────────────────────────────── */

async function loadImage(blob: Blob): Promise<Loaded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(blob);
      return {
        src: bmp,
        w: bmp.width,
        h: bmp.height,
        cleanup: () => bmp.close(),
      };
    } catch {
      // fall through
    }
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("decode failed"));
    img.src = url;
  });
  return {
    src: img,
    w: img.naturalWidth,
    h: img.naturalHeight,
    cleanup: () => URL.revokeObjectURL(url),
  };
}

function paint(
  canvas: HTMLCanvasElement,
  loaded: Loaded,
  id: string,
  watermark: boolean,
): void {
  const maxW = Math.min(window.innerWidth - 40, 900);
  const maxH = Math.min(window.innerHeight - 220, 760);
  const scale = Math.min(maxW / loaded.w, maxH / loaded.h, 1);
  const w = Math.max(1, Math.round(loaded.w * scale));
  const h = Math.max(1, Math.round(loaded.h * scale));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.scale(dpr, dpr);
  ctx.drawImage(loaded.src, 0, 0, w, h);
  if (watermark) drawWatermark(ctx, w, h, id);
}

function drawWatermark(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  id: string,
): void {
  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const label = `ONETIMEPIC · ${id.slice(0, 6).toUpperCase()} · ${time}`;

  ctx.save();
  ctx.font = "600 13px ui-monospace, SFMono-Regular, monospace";
  ctx.fillStyle = "rgba(236,231,223,0.15)";
  ctx.shadowColor = "rgba(0,0,0,0.28)";
  ctx.shadowBlur = 2;
  ctx.textBaseline = "middle";
  ctx.rotate(-Math.PI / 9);

  const stepX = 250;
  const stepY = 116;
  for (let y = -h; y < h * 2; y += stepY) {
    for (let x = -w; x < w * 2; x += stepX) {
      ctx.fillText(label, x, y);
    }
  }
  ctx.restore();
}
