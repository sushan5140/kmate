"use client";

import { useEffect, useState } from "react";
import { useDebouncedCallback } from "@/lib/hooks/use-debounced-callback";
import { isValidUsernameFormat } from "@/lib/validation/username";

interface UsernameFieldProps {
  value: string;
  onChange: (value: string) => void;
  onAvailabilityChange: (available: boolean) => void;
}

type Status = "idle" | "checking" | "available" | "taken" | "invalid";

export function UsernameField({ value, onChange, onAvailabilityChange }: UsernameFieldProps) {
  const [checkResult, setCheckResult] = useState<Status>("idle");
  const status: Status = value ? checkResult : "idle";

  const { debounced: checkAvailability } = useDebouncedCallback(async (username: string) => {
    if (!isValidUsernameFormat(username)) {
      setCheckResult("invalid");
      onAvailabilityChange(false);
      return;
    }
    setCheckResult("checking");
    try {
      const res = await fetch(`/api/onboarding/username-check?u=${encodeURIComponent(username)}`);
      const data = await res.json();
      setCheckResult(data.available ? "available" : "taken");
      onAvailabilityChange(Boolean(data.available));
    } catch {
      setCheckResult("idle");
      onAvailabilityChange(false);
    }
  }, 300);

  useEffect(() => {
    if (!value) {
      onAvailabilityChange(false);
      return;
    }
    checkAvailability(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div>
      <div className="flex items-center rounded-lg border border-border bg-white px-3 focus-within:border-primary">
        <span className="text-[14px] text-muted">@</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\s/g, ""))}
          maxLength={20}
          placeholder="username"
          className="h-10 w-full bg-transparent px-1 text-[14px] text-ink outline-none"
        />
      </div>
      <p className="mt-1.5 text-[12.5px]">
        {status === "checking" && <span className="text-muted">Checking…</span>}
        {status === "available" && <span className="text-success">Available</span>}
        {status === "taken" && <span className="text-red-600">That username is taken.</span>}
        {status === "invalid" && (
          <span className="text-muted">3-20 characters, letters/numbers/underscore only.</span>
        )}
        {status === "idle" && (
          <span className="text-muted">3-20 characters, letters/numbers/underscore only.</span>
        )}
      </p>
    </div>
  );
}
