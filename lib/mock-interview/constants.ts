// Ported verbatim from mock-interview-prototype.html -- question wording,
// categories, model choice, and the pause-scaling rule are all deliberate
// decisions carried over unchanged, not re-derived.

export const MOCK_INTERVIEW_CATEGORIES = ["all", "motivation", "academic", "korea", "behavioral", "curveball"] as const;
export type MockInterviewCategory = (typeof MOCK_INTERVIEW_CATEGORIES)[number];

export const MOCK_INTERVIEW_CATEGORY_LABELS: Record<MockInterviewCategory, string> = {
  all: "All categories (mixed)",
  motivation: "Motivation",
  academic: "Academic Background",
  korea: "Korea-specific",
  behavioral: "Behavioral",
  curveball: "Curveball",
};

// Single source of truth for the model name -- see the port plan for why
// this is gemini-2.5-flash specifically and not 2.0-flash/flash-lite/pro/3.x.
export const GEMINI_MODEL = "gemini-2.5-flash";

// Grab a candidate frame every ~4s during the tracking loop.
export const FRAME_SAMPLE_INTERVAL_MS = 4000;

export const QUESTION_BANK: Record<Exclude<MockInterviewCategory, "all">, string[]> = {
  motivation: [
    "Why did you choose to apply for the Global Korea Scholarship specifically?",
    "What draws you to studying in Korea rather than another country?",
    "How does this scholarship fit into your long-term career plans?",
    "What would you contribute to your host university's community?",
    "Why this major, and why now?",
    "What's one thing about Korean culture that excites you about relocating?",
    "How did you first become interested in Korea?",
  ],
  academic: [
    "Walk me through your academic background so far.",
    "What has been your most challenging course, and how did you handle it?",
    "How do you plan to bridge any gaps between your background and your intended major?",
    "Describe a research project or assignment you're proud of.",
    "How do you plan to keep up academically while adjusting to a new country?",
    "What academic habits do you think will serve you well in Korea?",
    "Tell me about a time you struggled academically and what you learned.",
  ],
  korea: [
    "What do you know about the Korean education system?",
    "How will you handle the language barrier during your studies?",
    "What's your plan for the mandatory Korean language requirement?",
    "How familiar are you with life in your target city in Korea?",
    "What Korean cultural norms do you think will be an adjustment for you?",
    "Have you had any exposure to Korean language or culture before this?",
    "How do you plan to build a support network in Korea?",
  ],
  behavioral: [
    "Tell me about a time you had to adapt quickly to a new environment.",
    "Describe a conflict you had with a teammate and how you resolved it.",
    "Tell me about a failure and what you learned from it.",
    "How do you handle stress or pressure?",
    "Describe a time you had to learn something completely on your own.",
    "Tell me about a leadership experience, even an informal one.",
    "How do you typically make a difficult decision?",
  ],
  curveball: [
    "If you don't get this scholarship, what will you do instead?",
    "What would you do if your assigned university wasn't your first choice?",
    "How would you handle failing a class in Korea?",
    "What's a criticism of the GKS program you've heard, and how would you respond to it?",
    "If your Korean language skills plateau, what would you do?",
    "What's something about your application you're least confident about?",
    "If you had to leave Korea and return home mid-program, how would that affect you?",
  ],
};

// Real interviews don't pause -- the cap scales with session length so it
// stays "enough for a genuine interruption" without becoming a stalling
// tactic on shorter sessions. Roughly 1 pause per ~3 questions.
export function getMaxMidInterviewPauses(questionCount: number): number {
  if (questionCount <= 3) return 1;
  if (questionCount <= 5) return 2;
  return 3; // 6+ questions
}

export const PAUSE_DURATION_OPTIONS = [15, 30, 45, 60] as const;
