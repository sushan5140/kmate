"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MATCH_STAGES, type MatchChoice, type MatchPreference } from "@/lib/connections/stage-matching";

export function StageMatchingConsent({ choices, preference, enabled }: {
  choices: MatchChoice[]; preference: MatchPreference | null; enabled: boolean;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState(preference?.choice_id ?? "");
  const [stage, setStage] = useState(preference?.stage ?? "");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(action: "enable" | "disable") {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/stage-matching", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "enable" ? { action, choiceId: choice, stage, consent } : { action }),
      });
      if (!response.ok) { setError("The preference could not be updated. No change was confirmed."); return; }
      setConsent(false); setMessage(action === "enable" ? "Preference saved." : "Sharing preference revoked.");
      router.refresh();
    } catch { setError("Connection failed. No change was confirmed."); }
    finally { setBusy(false); }
  }
  function onSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (consent) void submit("enable"); }
  return <div className="rounded-2xl border border-hairline bg-white p-4 sm:p-5">
    <h2 className="text-[17px] font-semibold text-ink">Share a stage voluntarily</h2>
    <p className="mt-2 text-[13px] leading-relaxed text-muted">Opting in makes your existing public username and selected university discoverable to other opted-in applicants in the same GKS program, cycle, university and broad stage. They may infer the stage you chose. No private tracker data, decisions, documents, dates or contact details are shared. Consent expires after 30 days; revoke it at any time. Saving again renews the expiry.</p>
    {preference && <p className="mt-3 text-[12px] text-muted">Preference recorded · expires {preference.expires_at.slice(0,10)} UTC, or earlier if your profile or university choice changes.</p>}
    {enabled && choices.length > 0 && <form className="mt-4 space-y-3" onSubmit={onSubmit}>
      <label className="block text-[13px] font-medium text-ink">University from your profile<select className="mt-1 w-full rounded-lg border border-hairline p-2" value={choice} onChange={e => setChoice(e.target.value)} required><option value="">Choose university</option>{choices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="block text-[13px] font-medium text-ink">Broad, self-reported stage<select className="mt-1 w-full rounded-lg border border-hairline p-2" value={stage} onChange={e => setStage(e.target.value as typeof stage)} required><option value="">Choose stage</option>{MATCH_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
      <label className="flex items-start gap-2 text-[13px] text-ink"><input className="mt-1" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required /> I agree to this limited sharing for up to 30 days.</label>
      <button type="submit" disabled={busy || !consent || !choice || !stage} className="rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">Enable or renew matching</button>
    </form>}
    {enabled && !choices.length && <p className="mt-3 text-[13px] text-muted">Add a university in your profile before opting in.</p>}
    {preference && <button type="button" disabled={busy} onClick={() => void submit("disable")} className="mt-4 rounded-full px-4 py-2 text-[13px] font-medium text-ink ring-1 ring-hairline">Revoke sharing</button>}
    {error && <p role="alert" className="mt-3 text-[13px] text-red-700">{error}</p>}
    {message && <p role="status" className="mt-3 text-[13px] text-muted">{message}</p>}
  </div>;
}
