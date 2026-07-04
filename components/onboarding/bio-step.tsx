"use client";

interface BioStepProps {
  value: string;
  onChange: (value: string) => void;
}

export function BioStep({ value, onChange }: BioStepProps) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 150))}
        placeholder="A short line about you and what you're preparing for (optional)"
        rows={3}
        className="w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-primary"
      />
      <p className="mt-1 text-right text-[12px] text-muted">{value.length}/150</p>
    </div>
  );
}
