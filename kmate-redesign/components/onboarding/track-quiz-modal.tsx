"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Track } from "@/lib/constants";

interface TrackQuizModalProps {
  onClose: () => void;
  onRecommend: (track: Track) => void;
}

type Answer = "gks_u" | "gks_g";

const QUESTIONS: { prompt: string; options: { label: string; answer: Answer }[] }[] = [
  {
    prompt: "What's your current education level?",
    options: [
      { label: "Currently in, or finished, high school", answer: "gks_u" },
      { label: "Currently in, or finished, a Bachelor's degree", answer: "gks_g" },
    ],
  },
  {
    prompt: "Are you looking to earn a Bachelor's degree, or a Master's/PhD, in Korea?",
    options: [
      { label: "Bachelor's degree", answer: "gks_u" },
      { label: "Master's or PhD", answer: "gks_g" },
    ],
  },
  {
    prompt: "Do you already have a Bachelor's degree?",
    options: [
      { label: "Yes", answer: "gks_g" },
      { label: "No", answer: "gks_u" },
    ],
  },
];

export function TrackQuizModal({ onClose, onRecommend }: TrackQuizModalProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);

  function choose(answer: Answer) {
    const next = [...answers, answer];
    setAnswers(next);

    if (step === QUESTIONS.length - 1) {
      // Q3 "Yes" (already has a Bachelor's) hard-implies GKS-G, since GKS-U
      // is closed to existing degree holders -- otherwise go by majority.
      const hasBachelors = next[2] === "gks_g";
      const recommendation: Track = hasBachelors
        ? "gks_g"
        : next.filter((a) => a === "gks_u").length >= next.filter((a) => a === "gks_g").length
        ? "gks_u"
        : "gks_g";
      onRecommend(recommendation);
      return;
    }
    setStep(step + 1);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-card">
        <p className="text-[12px] font-medium uppercase tracking-wide text-muted">
          Question {step + 1} of {QUESTIONS.length}
        </p>
        <h3 className="mt-2 text-[16px] font-semibold text-ink">{QUESTIONS[step].prompt}</h3>

        <div className="mt-4 flex flex-col gap-2">
          {QUESTIONS[step].options.map((option) => (
            <Button
              key={option.label}
              variant="secondary"
              className="justify-start"
              onClick={() => choose(option.answer)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 text-[13px] text-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
