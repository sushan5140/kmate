"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";

const items = [
  { id: 1, text: "Graduation Certificate (or Expected Graduation Certificate)", category: "Education", tip: "Must be apostilled. NIIED keeps originals — consider using a certified true copy." },
  { id: 2, text: "Academic Transcript (all semesters with CGPA)", category: "Education", tip: "If no CGPA shown, attach a GPA conversion certificate." },
  { id: 3, text: "Master's Degree & Transcript (PhD applicants only)", category: "Education", tip: "Only needed if you're applying for a PhD program." },
  { id: 4, text: "Applicant's Birth Certificate", category: "Citizenship", tip: "Or passport can be used as citizenship proof in some countries." },
  { id: 5, text: "Parent 1 Citizenship Proof (Passport / Voter ID / Family Register)", category: "Citizenship", tip: "Must match the parent name on your birth certificate." },
  { id: 6, text: "Parent 2 Citizenship Proof", category: "Citizenship", tip: "Same as Parent 1. If deceased/divorced, attach supporting docs." },
  { id: 7, text: "Official Translation (if docs not in English/Korean)", category: "Translation", tip: "Either the original or the translation must be apostilled." },
  { id: 8, text: "Apostille / Consular Confirmation obtained", category: "Authentication", tip: "Hague countries = Apostille. Non-Hague = Consular confirmation from Korean Embassy." },
  { id: 9, text: "Photocopies made (Embassy track: 3 copies)", category: "Copies", tip: "University track: no extra copies needed for NIIED." },
  { id: 10, text: "All forms signed with original handwritten signature", category: "Final Check", tip: "Digital or typed signatures = disqualification." }
];

const categoryColors: Record<string, string> = {
  "Education": "bg-blue-50 text-blue-700",
  "Citizenship": "bg-emerald-50 text-emerald-700",
  "Translation": "bg-violet-50 text-violet-700",
  "Authentication": "bg-amber-50 text-amber-700",
  "Copies": "bg-gray-100 text-gray-600",
  "Final Check": "bg-rose-50 text-rose-700"
};

export default function ApostilleChecklist() {
  const [checkedState, setCheckedState] = useState<Record<number, boolean>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("gks_apostille_checklist_v2");
      if (saved) setCheckedState(JSON.parse(saved));
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem("gks_apostille_checklist_v2", JSON.stringify(checkedState));
    }
  }, [checkedState, mounted]);

  const toggleItem = (id: number) => {
    setCheckedState(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const resetChecklist = () => {
    if (typeof window !== "undefined" && window.confirm("Reset all checklist items?")) {
      setCheckedState({});
    }
  };

  const completed = items.filter(item => checkedState[item.id]).length;
  const pct = Math.round((completed / items.length) * 100);
  const allDone = completed === items.length;

  if (!mounted) {
    return (
      <div className="animate-pulse space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-2xl"></div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Progress */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[13.5px] font-semibold text-ink">{completed} of {items.length} done</span>
          <span className="text-[13.5px] font-bold text-ink">{pct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div className="bg-blue-600 h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
        </div>
      </div>

      {/* Checklist Items */}
      <div className="space-y-3">
        {items.map(item => {
          const isChecked = checkedState[item.id];
          return (
            <Card
              key={item.id}
              onClick={() => toggleItem(item.id)}
              className={`p-5 cursor-pointer transition-all ${
                isChecked 
                  ? 'bg-gray-50/50 ring-gray-200' 
                  : 'hover:ring-blue-300 hover:shadow-md'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Checkbox */}
                <div className="mt-0.5 flex-shrink-0">
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                    isChecked 
                      ? 'bg-blue-600 border-blue-600' 
                      : 'border-gray-300'
                  }`}>
                    {isChecked && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/>
                      </svg>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${categoryColors[item.category] || 'bg-gray-100 text-gray-600'}`}>
                      {item.category}
                    </span>
                  </div>
                  <p className={`text-[14px] font-semibold leading-snug ${isChecked ? 'line-through text-muted' : 'text-ink'}`}>
                    {item.text}
                  </p>
                  <p className={`text-[12.5px] text-muted mt-1.5 leading-relaxed ${isChecked ? 'opacity-50' : ''}`}>
                    {item.tip}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Completion Message */}
      {allDone && (
        <Card className="mt-6 bg-emerald-50/50 ring-emerald-200 text-center p-5">
          <div className="text-3xl mb-2">🎉</div>
          <h3 className="font-bold text-emerald-800 text-[16px]">All documents ready!</h3>
          <p className="text-emerald-700 text-[13.5px] mt-1">You&apos;re fully prepared for the NIIED second round submission.</p>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="mt-6 flex gap-3">
        <button 
          onClick={resetChecklist} 
          className="flex-1 py-3 px-4 border border-gray-200 text-muted font-medium rounded-xl hover:bg-gray-50 transition text-[13.5px]"
        >
          Reset All
        </button>
        <button 
          onClick={() => window.print()} 
          className="flex-1 py-3 px-4 bg-ink text-white font-medium rounded-xl hover:bg-ink/90 transition text-[13.5px]"
        >
          Print / Save PDF
        </button>
      </div>
    </div>
  );
}