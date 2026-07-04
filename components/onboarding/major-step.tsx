"use client";

import { SearchableSelect } from "@/components/ui/searchable-select";
import { MAJORS } from "@/data/majors";

interface MajorStepProps {
  value: string;
  onChange: (value: string) => void;
}

export function MajorStep({ value, onChange }: MajorStepProps) {
  const isOther = value !== "" && !MAJORS.includes(value as (typeof MAJORS)[number]);
  const isOtherSelected = value === "Other" || isOther;

  return (
    <div>
      <SearchableSelect
        options={MAJORS}
        value={MAJORS.includes(value as (typeof MAJORS)[number]) ? value : value ? "Other" : ""}
        onChange={onChange}
        placeholder="Search your major…"
      />
      {isOtherSelected && (
        <input
          type="text"
          value={isOther ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Tell us your major"
          maxLength={100}
          className="mt-2 h-10 w-full rounded-lg border border-border bg-white px-3 text-[14px] text-ink outline-none focus:border-primary"
        />
      )}
    </div>
  );
}
