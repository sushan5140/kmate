"use client";

import { useState } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { GEMINI_MODEL } from "@/lib/mock-interview/constants";
import { API_KEY_GUIDE_STEPS } from "@/lib/mock-interview/api-key-guide";

type ValidationState =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "error"; message: string }
  | { kind: "success" };

export function ApiKeyStage({ onValidated }: { onValidated: (key: string) => void }) {
  const [key, setKey] = useState("");
  const [showGuide, setShowGuide] = useState(true); // guide starts expanded, matching the prototype
  const [validation, setValidation] = useState<ValidationState>({ kind: "idle" });

  async function handleValidate() {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      setValidation({ kind: "error", message: "Please paste a key first." });
      return;
    }

    setValidation({ kind: "validating" });
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${trimmedKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with just: OK" }] }] }),
        }
      );

      if (resp.status === 429) {
        setValidation({
          kind: "error",
          message: "This key has hit its free-tier limit already. Try a different key, or wait for the daily reset (midnight Pacific Time).",
        });
        return;
      }
      if (!resp.ok) {
        const errBody = await resp.text();
        setValidation({
          kind: "error",
          message: `Key validation failed (${resp.status}). Double check you copied it correctly.\n${errBody.slice(0, 300)}`,
        });
        return;
      }

      setValidation({ kind: "success" });
      onValidated(trimmedKey);
    } catch (err) {
      setValidation({
        kind: "error",
        message: `Network error validating key: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return (
    <Card className="mt-4">
      <span className="inline-flex items-center rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-gold">
        API key needed
      </span>
      <h3 className="mt-2.5 text-[15px] font-semibold text-ink">Paste your free Gemini API key</h3>
      <p className="mt-1 text-[13.5px] text-muted">
        Used only at the end of your interview, for delivery feedback and a rewritten version of your answers. Free,
        no billing required. Not sure how to get one? Follow the steps below.
      </p>

      <button
        type="button"
        onClick={() => setShowGuide((v) => !v)}
        className="mt-4 rounded-lg bg-primary-soft px-4 py-2 text-[13.5px] font-semibold text-primary"
      >
        {showGuide ? "Hide guide ↑" : "Show me how to get a key ↓"}
      </button>

      {showGuide && (
        <div className="mt-4 flex max-h-[480px] flex-col gap-5 overflow-y-auto rounded-xl border border-hairline bg-canvas p-4">
          {API_KEY_GUIDE_STEPS.map((step) => (
            <div key={step.num} className="flex gap-3.5">
              <div className="mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-white">
                {step.num}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-ink">{step.title}</p>
                <p className="mt-1 text-[13px] text-muted">{step.caption}</p>
                <Image
                  src={step.screenshotSrc}
                  alt={step.title}
                  width={step.width}
                  height={step.height}
                  className="mt-2.5 w-full rounded-lg border border-hairline"
                  unoptimized
                  loading="eager"
                />
              </div>
            </div>
          ))}
          <p className="text-[13px] text-muted">
            Or go straight to{" "}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              aistudio.google.com/apikey
            </a>{" "}
            if you already know the flow.
          </p>
        </div>
      )}

      <div className="mt-5">
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="AIza..."
          className="w-full rounded-lg border border-hairline-strong bg-surface px-3 py-2 font-mono text-[14px] text-ink"
        />
      </div>
      <div className="mt-3">
        <button
          type="button"
          disabled={validation.kind === "validating"}
          onClick={handleValidate}
          className="rounded-lg bg-primary px-5 py-2.5 text-[14px] font-semibold text-white transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {validation.kind === "validating" ? "Validating…" : "Validate & continue"}
        </button>
      </div>

      {validation.kind !== "idle" && (
        <div
          className={cn(
            "mt-3 whitespace-pre-wrap rounded-lg px-3.5 py-3 text-[13px]",
            validation.kind === "error" && "bg-danger-soft text-danger",
            (validation.kind === "validating" || validation.kind === "success") && "bg-canvas text-muted"
          )}
        >
          {validation.kind === "validating" && "Validating key with a minimal test call…"}
          {validation.kind === "error" && validation.message}
          {validation.kind === "success" && "Key looks valid — let's set up your interview…"}
        </div>
      )}
    </Card>
  );
}
