"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { Card } from "@/components/ui/card";

type DemoConversation = {
  id: string;
  username: string;
  major: string;
  last: string;
  messages: { from: "me" | "them"; body: string; time: string }[];
};

const DEMO_CONVERSATIONS: DemoConversation[] = [
  {
    id: "demo-1",
    username: "applicant-01",
    major: "Computer Science",
    last: "I’m checking the university-specific documents too.",
    messages: [
      { from: "them", body: "Hey! Are you also preparing for the 2027 GKS-U cycle?", time: "6:42 PM" },
      { from: "me", body: "Yep — I’m organizing the route and documents first.", time: "6:44 PM" },
      { from: "them", body: "I’m checking the university-specific documents too.", time: "6:46 PM" },
    ],
  },
  {
    id: "demo-2",
    username: "applicant-04",
    major: "Software Engineering",
    last: "The interview database is useful for grouping themes.",
    messages: [
      { from: "me", body: "How are you structuring interview prep?", time: "Yesterday" },
      { from: "them", body: "The interview database is useful for grouping themes.", time: "Yesterday" },
    ],
  },
  {
    id: "demo-3",
    username: "applicant-03",
    major: "Data Science",
    last: "I’m comparing the official notice dates now.",
    messages: [
      { from: "them", body: "I’m comparing the official notice dates now.", time: "Mon" },
    ],
  },
];

export function DemoChatWorkspace() {
  const [activeId, setActiveId] = useState(DEMO_CONVERSATIONS[0].id);
  const [draft, setDraft] = useState("");
  const [extra, setExtra] = useState<Record<string, { from: "me"; body: string; time: string }[]>>({});
  const active = useMemo(
    () => DEMO_CONVERSATIONS.find((item) => item.id === activeId) ?? DEMO_CONVERSATIONS[0],
    [activeId]
  );

  function send() {
    const body = draft.trim();
    if (!body) return;
    setExtra((prev) => ({
      ...prev,
      [active.id]: [...(prev[active.id] ?? []), { from: "me", body, time: "Now" }],
    }));
    setDraft("");
  }

  const messages = [...active.messages, ...(extra[active.id] ?? [])];

  return (
    <div className="overflow-hidden border-y border-hairline bg-surface shadow-card sm:rounded-[24px] sm:border md:grid md:h-[72vh] md:min-h-[560px] md:grid-cols-[310px_1fr]">
      <aside className="hidden border-r border-hairline md:block">
        <div className="flex h-14 items-center border-b border-hairline px-4">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-muted/70">Demo conversations</p>
            <p className="mt-0.5 text-[9.5px] font-medium text-muted">Fictional preview data</p>
          </div>
        </div>
        <ul>
          {DEMO_CONVERSATIONS.map((conversation) => (
            <li key={conversation.id} className="border-b border-hairline">
              <button
                type="button"
                onClick={() => setActiveId(conversation.id)}
                className={`pressable w-full px-4 py-4 text-left transition-colors hover:bg-canvas/70 ${active.id === conversation.id ? "bg-primary-soft" : ""}`}
              >
                <p className="text-[12.5px] font-extrabold text-ink">@{conversation.username}</p>
                <p className="mt-0.5 text-[10px] font-semibold text-muted">{conversation.major}</p>
                <p className="mt-2 truncate text-[10.5px] font-medium text-muted">{conversation.last}</p>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex min-h-[560px] min-w-0 flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-hairline px-4">
          <button type="button" className="md:hidden" aria-label="Back to conversations">
            <ArrowLeft className="h-4 w-4 text-muted" />
          </button>
          <div>
            <p className="text-[12.5px] font-extrabold text-ink">@{active.username}</p>
            <p className="text-[9.5px] font-semibold text-muted">{active.major} · demo</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-2xl space-y-3">
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.from === "me" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[82%]">
                  <div
                    className={`rounded-[16px] px-3.5 py-2.5 text-[12px] font-medium leading-5 ${
                      message.from === "me" ? "bg-ink text-white" : "bg-canvas text-ink"
                    }`}
                  >
                    {message.body}
                  </div>
                  <p className={`mt-1 text-[9px] font-medium text-muted ${message.from === "me" ? "text-right" : ""}`}>
                    {message.time}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-hairline p-3 sm:p-4">
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, 500))}
              rows={1}
              placeholder="Try the message composer…"
              className="max-h-28 flex-1 resize-y rounded-[13px] border border-hairline-strong bg-canvas/55 px-3 py-2.5 text-[12px] font-medium text-ink outline-none focus:border-primary focus:bg-white"
            />
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim()}
              className="pressable flex h-10 w-10 items-center justify-center rounded-[12px] bg-ink text-white disabled:opacity-35"
              aria-label="Add demo message"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mx-auto mt-2 max-w-2xl text-[9.5px] font-medium text-muted">
            Preview only — messages stay in this browser session and are never sent.
          </p>
        </div>
      </section>
    </div>
  );
}
