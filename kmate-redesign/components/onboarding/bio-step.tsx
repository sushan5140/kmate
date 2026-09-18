"use client";

interface BioStepProps {
  value: string;
  onChange: (value: string) => void;
  onSkip?: () => void;
}

export function BioStep({ value, onChange, onSkip }: BioStepProps) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 150))}
        placeholder="A short line about you and what you're preparing for (optional)"
        rows={3}
        className="w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-[14px] text-ink outline-none focus:border-primary"
      />
      <div className="mt-1 flex items-center justify-between">
        {onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            className="text-[12.5px] font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
          >
            Skip for now
          </button>
        ) : (
          <span />
        )}
        <p className="text-[12px] text-muted">{value.length}/150</p>
      </div>
    </div>
  );
}
