"use client";

import posthog from "posthog-js";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SegmentedControl } from "@/components/liquid";
import {
  DEFAULT_EXPIRY_MS,
  DEFAULT_VIEW_SECONDS,
  EXPIRY_OPTIONS,
  MAX_INPUT_BYTES,
  VIEW_SECONDS_OPTIONS,
} from "@/lib/config";
import { encryptImage } from "@/lib/crypto";
import { processImage } from "@/lib/image";

type Phase = "encrypting" | "uploading";
type State =
  | { step: "idle" }
  | { step: "ready"; file: File; previewUrl: string }
  | { step: "working"; phase: Phase; previewUrl: string }
  | { step: "done"; link: string; seconds: number; expiryLabel: string }
  | { step: "error"; message: string };

const SECONDS_OPTIONS = VIEW_SECONDS_OPTIONS.map((s) => ({
  label: `${s}s`,
  value: s,
}));

export function Uploader() {
  const [state, setState] = useState<State>({ step: "idle" });
  const [seconds, setSeconds] = useState<number>(DEFAULT_VIEW_SECONDS);
  const [expiry, setExpiry] = useState<number>(DEFAULT_EXPIRY_MS);
  const [watermark, setWatermark] = useState(true);
  const [windowDrag, setWindowDrag] = useState(false);
  const previewRef = useRef<string | null>(null);

  // Revoke any object URL we created when it changes / on unmount.
  const setPreview = useCallback((url: string | null) => {
    if (previewRef.current && previewRef.current !== url) {
      URL.revokeObjectURL(previewRef.current);
    }
    previewRef.current = url;
  }, []);
  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const pick = useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setState({ step: "error", message: "That file isn't an image." });
        return;
      }
      if (file.size > MAX_INPUT_BYTES) {
        setState({
          step: "error",
          message: "That image is too large (max 5 MB).",
        });
        return;
      }
      const url = URL.createObjectURL(file);
      setPreview(url);
      setState({ step: "ready", file, previewUrl: url });
    },
    [setPreview],
  );

  const reset = useCallback(() => {
    setPreview(null);
    setState({ step: "idle" });
  }, [setPreview]);

  const acceptsInput = state.step === "idle" || state.step === "ready";

  // Drop a photo anywhere on the window: a frosted overlay confirms the
  // gesture, and the drop replaces whatever is selected.
  useEffect(() => {
    if (!acceptsInput) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setWindowDrag(true);
    };
    const onLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setWindowDrag(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      depth = 0;
      setWindowDrag(false);
      if (!hasFiles(e)) return;
      e.preventDefault();
      pick(e.dataTransfer?.files?.[0]);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
      setWindowDrag(false);
    };
  }, [acceptsInput, pick]);

  // Paste an image from the clipboard.
  useEffect(() => {
    if (!acceptsInput) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (file) {
        e.preventDefault();
        pick(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptsInput, pick]);

  // Escape discards the selected photo.
  useEffect(() => {
    if (state.step !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.step, reset]);

  async function createLink(file: File, previewUrl: string) {
    try {
      setState({ step: "working", phase: "encrypting", previewUrl });
      const { data, format } = await processImage(file);
      const { payload, keyB64 } = await encryptImage(data, format, watermark);

      setState({ step: "working", phase: "uploading", previewUrl });
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-otp-expiry": String(expiry),
        },
        body: payload,
      });
      if (!res.ok) {
        setState({ step: "error", message: await readError(res) });
        return;
      }
      const { id } = (await res.json()) as { id: string };
      setPreview(null);
      const link = `${window.location.origin}/v/${id}#${keyB64}.${seconds}`;
      const expiryLabel =
        EXPIRY_OPTIONS.find((option) => option.ms === expiry)?.label ??
        "24 hours";
      posthog.capture("photo_uploaded", { seconds, watermark, expiry });
      setState({ step: "done", link, seconds, expiryLabel });
    } catch (err) {
      setState({
        step: "error",
        message:
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
      });
    }
  }

  return (
    <>
      {state.step === "idle" && <DropPanel onFile={pick} />}

      {(state.step === "ready" || state.step === "working") && (
        <div className="flex flex-col gap-5">
          <Preview
            url={state.previewUrl}
            busy={state.step === "working"}
            phase={state.step === "working" ? state.phase : undefined}
            onRemove={state.step === "ready" ? reset : undefined}
          />

          <fieldset
            disabled={state.step === "working"}
            className="flex flex-col transition-opacity duration-300 disabled:pointer-events-none disabled:opacity-50"
          >
            <div className="glass glass-group">
              <div className="relative z-[2]">
                <div className="group-row">
                  <span className="group-label">Shows for</span>
                  <SegmentedControl
                    label="How long the photo shows"
                    options={SECONDS_OPTIONS}
                    value={seconds}
                    onChange={setSeconds}
                    optionClassName="px-3.5 py-1.5 text-[13px] font-medium"
                  />
                </div>
                <div className="group-sep" />
                <div className="group-row">
                  <label className="group-label" htmlFor="otp-expiry">
                    Link expires in
                  </label>
                  <select
                    id="otp-expiry"
                    className="glass-select"
                    value={expiry}
                    onChange={(e) => setExpiry(Number(e.target.value))}
                  >
                    {EXPIRY_OPTIONS.map((option) => (
                      <option key={option.ms} value={option.ms}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="group-sep" />
                <label className="group-row cursor-pointer">
                  <span className="group-label">Watermark</span>
                  <span className="switch" data-on={watermark}>
                    <input
                      type="checkbox"
                      checked={watermark}
                      onChange={() => setWatermark((v) => !v)}
                      aria-label="Watermark"
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className="switch-knob peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-glacier peer-focus-visible:outline-offset-2"
                    />
                  </span>
                </label>
              </div>
            </div>
            <p className="group-foot">
              The watermark adds a faint label across the photo to discourage
              sharing.
            </p>
          </fieldset>

          <button
            type="button"
            disabled={state.step === "working"}
            onClick={() => {
              if (state.step === "ready") {
                createLink(state.file, state.previewUrl);
              }
            }}
            className="btn btn-primary specular w-full px-6 py-4 text-[17px]"
          >
            {state.step === "working" ? (
              <>
                <Spinner />
                {state.phase === "encrypting" ? "Encrypting…" : "Uploading…"}
              </>
            ) : (
              "Create one-time link"
            )}
          </button>

          <p className="text-center text-[13px] text-faint">
            Encrypted on your device before upload. We never see it.
          </p>
        </div>
      )}

      {state.step === "done" && (
        <DoneCard
          link={state.link}
          seconds={state.seconds}
          expiryLabel={state.expiryLabel}
          onReset={reset}
        />
      )}

      {state.step === "error" && (
        <div className="materialize flex flex-col items-center gap-5 py-8 text-center">
          <AlertIcon />
          <p className="max-w-sm text-[15px] text-frost">{state.message}</p>
          <button
            type="button"
            onClick={reset}
            className="btn btn-ghost specular px-5 py-3 text-[15px]"
          >
            Try again
          </button>
        </div>
      )}

      {/* Portaled to <body>: ancestors keep residual filter/transform values
          from their entrance animations, which would break position:fixed
          and the backdrop blur. */}
      {windowDrag &&
        acceptsInput &&
        createPortal(
          <div className="drop-overlay">
            <div className="glass flex flex-col items-center gap-3 rounded-[28px] px-12 py-10">
              <span className="relative z-[2] text-glacier">
                <PhotoGlyph size={34} />
              </span>
              <span className="relative z-[2] text-[17px] font-medium text-frost">
                Drop to add photo
              </span>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/* ── Subcomponents ───────────────────────────────────────────────────────── */

function DropPanel({ onFile }: { onFile: (file: File | null) => void }) {
  return (
    <label className="drop-panel glass flex-col items-center gap-5 px-8 py-16 text-center">
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <span className="drop-glyph relative z-[2] text-mist">
        <PhotoGlyph size={40} />
      </span>
      <span className="relative z-[2] flex flex-col gap-1.5">
        <span className="text-[17px] font-medium text-frost">
          Drag a photo here
        </span>
        <span className="text-sm leading-relaxed text-faint">
          Or click to browse, or paste one.
          <br />
          Up to 5 MB, encrypted before it leaves your device.
        </span>
      </span>
    </label>
  );
}

function Preview({
  url,
  busy,
  phase,
  onRemove,
}: {
  url: string;
  busy: boolean;
  phase?: Phase;
  onRemove?: () => void;
}) {
  return (
    <div className="photo-frame materialize">
      {/* biome-ignore lint/performance/noImgElement: transient local object-URL preview; next/image adds no value and would route a private image through the optimizer */}
      <img
        src={url}
        alt="Selected"
        className={`mx-auto max-h-[380px] w-auto object-contain transition-all duration-500 ${
          busy ? "scale-105 blur-lg brightness-[0.35]" : ""
        }`}
      />
      {onRemove && (
        <div className="absolute left-3 top-3">
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove photo"
            title="Remove photo (Esc)"
            className="chip-btn"
          >
            <CloseIcon />
          </button>
        </div>
      )}
      {busy && (
        <div className="materialize absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Spinner large />
          <span className="text-sm text-frost">
            {phase === "encrypting"
              ? "Encrypting in your browser…"
              : "Uploading encrypted photo…"}
          </span>
        </div>
      )}
    </div>
  );
}

function DoneCard({
  link,
  seconds,
  expiryLabel,
  onReset,
}: {
  link: string;
  seconds: number;
  expiryLabel: string;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(link, {
      margin: 1,
      width: 256,
      color: { dark: "#0a0a16", light: "#f4f4fa" },
    })
      .then((url) => {
        if (active) setQr(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [link]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; user can select manually */
    }
  }

  return (
    <div className="materialize flex flex-col items-center gap-7">
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-[24px] font-semibold tracking-tight text-frost">
          Your link is ready
        </h2>
        <p className="max-w-xs text-[15px] leading-relaxed text-mist">
          It opens once, shows for {seconds} seconds, then deletes itself.
        </p>
      </div>

      <div className="flex w-full flex-col gap-2.5 sm:flex-row">
        <div className="field ph-no-capture min-w-0 flex-1 truncate px-5 py-3.5 text-[13px] leading-[1.5] text-mist">
          {link}
        </div>
        <button
          type="button"
          onClick={copy}
          className="btn btn-primary specular min-w-[132px] px-5 py-3.5 text-[15px]"
        >
          {copied ? (
            <>
              <CheckIcon /> Copied
            </>
          ) : (
            "Copy link"
          )}
        </button>
      </div>

      {qr && (
        <div className="flex flex-col items-center gap-2.5">
          <span className="glass rounded-2xl p-2">
            {/* biome-ignore lint/performance/noImgElement: client-generated data-URL QR code, nothing for next/image to optimize */}
            <img
              src={qr}
              alt="QR code for the one-time link"
              className="relative z-[2] size-32 rounded-xl"
            />
          </span>
          <span className="text-[13px] text-faint">
            Or scan it on another phone
          </span>
        </div>
      )}

      <p className="max-w-xs text-center text-[13px] leading-relaxed text-faint">
        This is the only copy. If no one opens it, it deletes after{" "}
        {expiryLabel}.
      </p>

      <button
        type="button"
        onClick={onReset}
        className="btn btn-quiet px-4 py-2 text-[15px]"
      >
        Send another photo
      </button>
    </div>
  );
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error) return data.error;
  } catch {
    /* not json */
  }
  if (res.status === 413) return "That image is too large.";
  if (res.status === 429) return "Daily limit reached. Please try again later.";
  return "Upload failed. Please try again.";
}

/* ── Icons ───────────────────────────────────────────────────────────────── */

function Spinner({ large = false }: { large?: boolean }) {
  return (
    <span
      className={`spin inline-block rounded-full border-2 border-current border-t-transparent ${
        large ? "size-7 text-glacier" : "size-4"
      }`}
      aria-hidden="true"
    />
  );
}

function PhotoGlyph({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="4.75"
        y="7.75"
        width="30.5"
        height="24.5"
        rx="5.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="14.5" cy="16.5" r="2.75" fill="currentColor" />
      <path
        d="M9 29.5 17.2 21a2.4 2.4 0 0 1 3.5 0l3 3.2 2.5-2.6a2.4 2.4 0 0 1 3.5 0L34 26"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 2l10 10M12 2 2 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="text-rose"
    >
      <path
        d="M12 8v5m0 3.5h.01M10.3 3.9 2.4 18a1.9 1.9 0 0 0 1.7 2.9h15.8a1.9 1.9 0 0 0 1.7-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
