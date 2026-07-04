"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { QUESTION_CATEGORIES, QUESTION_CATEGORY_LABELS } from "@/lib/constants";

export function QuestionFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeCategory = searchParams.get("category");

  function pushParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    router.push(`/interview-db?${params.toString()}`);
  }

  function toggleCategory(category: string) {
    pushParams((params) => {
      if (params.get("category") === category) params.delete("category");
      else params.set("category", category);
    });
  }

  function toggleMine() {
    pushParams((params) => {
      if (params.get("relevant") === "1") params.delete("relevant");
      else params.set("relevant", "1");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {QUESTION_CATEGORIES.map((category) => (
        <button
          key={category}
          type="button"
          onClick={() => toggleCategory(category)}
          className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium ${
            activeCategory === category
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-white text-muted"
          }`}
        >
          {QUESTION_CATEGORY_LABELS[category]}
        </button>
      ))}
      <button
        type="button"
        onClick={toggleMine}
        className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium ${
          searchParams.get("relevant") === "1"
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-white text-muted"
        }`}
      >
        Relevant to me
      </button>
    </div>
  );
}
