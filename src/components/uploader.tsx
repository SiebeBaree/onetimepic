"use client";

import posthog from "posthog-js";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
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

export function Uploader() {
  const [state, setState] = useState<State>({ step: "idle" });
  const [seconds, setSeconds] = useState<number>(DEFAULT_VIEW_SECONDS);
  const [expiry, setExpiry] = useState<number>(DEFAULT_EXPIRY_MS);
  const [watermark, setWatermark] = useState(true);
  const [dragging, setDragging] = useState(false);
  const previewRef = useRef<string | null>(null);

  // Revoke any object URL we created when it changes / on unmount.
  function setPreview(url: string | null) {
    if (previewRef.current && previewRef.current !== url) {
      URL.revokeObjectURL(previewRef.current);
    }
    previewRef.current = url;
  }
  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  function pick(file: File | null | undefined) {
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
  }

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

  function reset() {
    setPreview(null);
    setState({ step: "idle" });
  }

  return (
    <div className="card p-6 sm:p-8">
      {state.step === "idle" && (
        <Dropzone
          dragging={dragging}
          onDragChange={setDragging}
          onFile={pick}
        />
      )}

      {(state.step === "ready" || state.step === "working") && (
        <div className="flex flex-col gap-6">
          <Preview
            url={state.previewUrl}
            busy={state.step === "working"}
            phase={state.step === "working" ? state.phase : undefined}
          />

          <fieldset
            disabled={state.step === "working"}
            className="flex flex-col gap-5 disabled:opacity-60"
          >
            <div className="flex flex-col gap-2.5">
              <span className="text-sm text-ash">How long it shows</span>
              <div className="flex gap-2">
                {VIEW_SECONDS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={seconds === s}
                    data-active={seconds === s}
                    onClick={() => setSeconds(s)}
                    className="pill flex-1 px-4 py-2.5 text-sm font-medium"
                  >
                    {s} seconds
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <span className="text-sm text-ash">
                How long the link stays available
              </span>
              <div className="grid grid-cols-2 gap-2">
                {EXPIRY_OPTIONS.map((option) => (
                  <button
                    key={option.ms}
                    type="button"
                    aria-pressed={expiry === option.ms}
                    data-active={expiry === option.ms}
                    onClick={() => setExpiry(option.ms)}
                    className="pill px-4 py-2.5 text-sm font-medium"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-4">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm text-ivory">Watermark</span>
                <span className="text-xs text-faint">
                  Adds a faint label across the photo to discourage sharing.
                </span>
              </span>
              <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
                <input
                  type="checkbox"
                  checked={watermark}
                  onChange={() => setWatermark((v) => !v)}
                  aria-label="Watermark"
                  className="peer sr-only"
                />
                <span className="absolute inset-0 rounded-full bg-white/10 transition-colors peer-checked:bg-ember peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ember peer-focus-visible:outline-offset-2" />
                <span className="absolute left-[3px] size-[18px] rounded-full bg-white shadow transition-transform peer-checked:translate-x-[20px]" />
              </span>
            </label>
          </fieldset>

          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <button
              type="button"
              disabled={state.step === "working"}
              onClick={() => {
                if (state.step === "ready") {
                  createLink(state.file, state.previewUrl);
                }
              }}
              className="btn btn-primary flex-1 px-5 py-3.5 text-[15px]"
            >
              {state.step === "working" ? (
                <>
                  <Spinner />
                  {state.phase === "encrypting" ? "Encrypting…" : "Uploading…"}
                </>
              ) : (
                <>
                  <LockIcon />
                  Create one-time link
                </>
              )}
            </button>
            <button
              type="button"
              disabled={state.step === "working"}
              onClick={reset}
              className="btn btn-ghost px-5 py-3.5 text-[15px]"
            >
              Choose another
            </button>
          </div>

          <p className="text-center text-xs text-faint">
            Your photo is encrypted on your device. We never see it.
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
        <div className="flex flex-col items-center gap-5 py-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-full border border-white/10 bg-ink-800">
            <AlertIcon />
          </div>
          <p className="max-w-sm text-ivory">{state.message}</p>
          <button
            type="button"
            onClick={reset}
            className="btn btn-ghost px-5 py-3"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Subcomponents ───────────────────────────────────────────────────────── */

function Dropzone({
  dragging,
  onDragChange,
  onFile,
}: {
  dragging: boolean;
  onDragChange: (v: boolean) => void;
  onFile: (file: File | null) => void;
}) {
  return (
    <label
      data-drag={dragging}
      onDragOver={(e) => {
        e.preventDefault();
        onDragChange(true);
      }}
      onDragLeave={() => onDragChange(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDragChange(false);
        onFile(e.dataTransfer.files?.[0] ?? null);
      }}
      className="dropzone flex cursor-pointer flex-col items-center gap-4 px-6 py-14 text-center"
    >
      <input
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      <span className="flex size-16 items-center justify-center rounded-full border border-white/10 bg-ink-800 text-ember">
        <UploadIcon />
      </span>
      <span className="flex flex-col gap-1.5">
        <span className="text-[17px] font-medium text-ivory">
          Drop a photo, or click to choose
        </span>
        <span className="text-sm text-faint">
          Up to 5 MB. Encrypted on your device before upload.
        </span>
      </span>
    </label>
  );
}

function Preview({
  url,
  busy,
  phase,
}: {
  url: string;
  busy: boolean;
  phase?: Phase;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-ink-950">
      {/* biome-ignore lint/performance/noImgElement: transient local object-URL preview; next/image adds no value and would route a private image through the optimizer */}
      <img
        src={url}
        alt="Selected"
        className={`mx-auto max-h-72 w-auto object-contain transition-all duration-300 ${
          busy ? "scale-105 blur-md brightness-50" : ""
        }`}
      />
      {busy && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          <Spinner large />
          <span className="text-sm text-ivory">
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
      width: 320,
      color: { dark: "#0b0d10", light: "#ece7df" },
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
    <div className="ignite flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-ember/15 text-ember">
          <CheckIcon />
        </span>
        <h2 className="font-display text-2xl text-ivory">
          Your one-time link is ready
        </h2>
        <p className="text-sm text-ash">
          Share it however you like. It opens once, shows for {seconds} seconds,
          then it's gone.
        </p>
      </div>

      {qr && (
        <div className="flex justify-center">
          {/* biome-ignore lint/performance/noImgElement: client-generated data-URL QR code, nothing for next/image to optimize */}
          <img
            src={qr}
            alt="QR code for the one-time link"
            className="size-40 rounded-xl border border-white/8"
          />
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="field ph-no-capture flex-1 truncate px-4 py-3 text-sm text-ash">
          {link}
        </div>
        <button
          type="button"
          onClick={copy}
          className="btn btn-primary px-5 py-3 text-sm"
        >
          {copied ? (
            <>
              <CheckIcon /> Copied
            </>
          ) : (
            <>
              <CopyIcon /> Copy link
            </>
          )}
        </button>
      </div>

      <div className="rounded-2xl border border-ember/20 bg-ember/5 p-4 text-sm leading-relaxed text-ash">
        <span className="font-medium text-ember">This is the only copy.</span>{" "}
        Once it's opened, it's gone for everyone. If no one opens it, it's
        deleted after {expiryLabel}.
      </div>

      <button
        type="button"
        onClick={onReset}
        className="btn btn-ghost mx-auto px-5 py-3 text-sm"
      >
        Send another
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
        large ? "size-7 text-ember" : "size-4"
      }`}
      aria-hidden="true"
    />
  );
}

function UploadIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="11" rx="2.5" fill="currentColor" />
      <path
        d="M8 10V7a4 4 0 0 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
function CopyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="9"
        y="9"
        width="11"
        height="11"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5 15V5a2 2 0 0 1 2-2h8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg
      width="17"
      height="17"
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
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="text-ember"
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
