"""
Promotional / recruitment detection for community answers.

The community corpus comes from open WhatsApp groups, so alongside genuine
applicant experience it carries the usual group spam: people recruiting for
paid TOPIK batches, advertising consultancies and SOP-writing services,
promoting their own groups and channels, and soliciting DMs.

None of that answers an applicant's question, and it scores *well* on the
usefulness heuristics -- recruitment posts are full of concrete-action verbs
("contact", "register", "send") and specific numbers ("3 slots", "2000 per
month"). So it needs its own detector, and answers it flags are excluded
outright rather than ranked lower.

Design: no phrase blacklist. Six independent signal *families* are matched,
and the decision is made on how many fire together (see usefulness.py). That
way "join our group", "DM me for the price" and "limited seats in my batch"
are all caught by the same rules, while an applicant who merely mentions
WhatsApp, a fee they paid, or a tool they recommend trips at most one family
and is left alone.
"""

import re

# 1. Solicitation aimed at the reader: "contact me", "DM us", "whatsapp me".
#    Deliberately requires the me/us object -- "contact the embassy" and "you
#    should email your university" are advice, not solicitation.
SOLICITATION = re.compile(
    r"\b(?:dm|pm|inbox|whatsapp|telegram|text|message|msg|ping|contact|call)\s+(?:me|us)\b"
    # Requires the contact verb: "message me on Instagram" is solicitation,
    # but "the people told me on Instagram" is someone reporting what they heard.
    r"|\b(?:dm|pm|inbox|whatsapp|telegram|text|message|msg|ping|contact|call|reach)\s+(?:me|us)\s+(?:on|at)\b"
    r"|\breach\s+out\s+to\s+(?:me|us)\b"
    r"|\bhmu\b"
    r"|\bdm\s+(?:for|if\s+interested)\b"
    r"|\bsend\s+me\s+a\s+(?:dm|message|text)\b",
    re.I,
)

# 2. An explicit invite URL. On its own this is conclusive -- no applicant
#    reporting their own experience pastes a group invite link.
INVITE_LINK = re.compile(
    r"chat\.whatsapp\.com|wa\.me/|t\.me/|telegram\.me/|discord\.gg/|bit\.ly/|linktr\.ee"
    r"|\b(?:invite|joining|group)\s+link\b",
    re.I,
)

# 3. Being recruited into a group/batch. "join our group" is promotion;
#    "I joined a group and they said..." is experience, so only the
#    imperative/possessive form matches (\bjoin\b won't match "joined").
GROUP_INVITE = re.compile(
    r"\bjoin\s+(?:my|our|the|this|these|his|her)\b[^.!?]{0,40}"
    r"\b(?:group|channel|class(?:es)?|batch|community|server|chat)\b"
    r"|\badd\s+me\s+(?:to|in)\b"
    r"|\b(?:i|we)(?:'ll| will)?\s+add\s+you\b"
    r"|\bwho(?:'s| is)?\s+interested\s+(?:can|may|should)\b"
    r"|\binterested\s+(?:one|ones|people|students|candidates)\b",
    re.I,
)

# 4. Money changing hands.
COMMERCE = re.compile(
    r"\b(?:fees?|charges?|pricing|price|payment|paid\s+(?:class|course|group|service)"
    r"|per\s+month|per\s+session|monthly\s+fee|discount|affordable|cheap(?:est)?\s+rate"
    r"|free\s+(?:trial|demo)|demo\s+class|enroll?ment|enroll|registration\s+(?:open|fee)"
    r"|book\s+(?:your|a)\s+(?:seat|slot|spot))\b"
    r"|\b(?:rs\.?|inr|usd|pkr|₹|\$)\s*\d{2,}",
    re.I,
)

# 5. The thing being sold. Never decisive alone -- "I took a Korean course"
#    must stay visible -- but strong in combination.
OFFERING = re.compile(
    r"\b(?:coaching|tuitions?|tutor(?:ing)?|consultanc(?:y|ies)|agency|agencies"
    r"|coaching\s+cent(?:er|re)|institute|academy|mentorship\s+program"
    r"|(?:sop|essay|cv|resume)\s+(?:writing|editing|review)\s+(?:service|help)"
    r"|our\s+services?|my\s+services?)\b"
    r"|\b(?:batch(?:es)?|classes|course|sessions?)\b(?=[^.!?]{0,60}"
    r"\b(?:start|starting|begin|available|open|join|enroll|fee|slot|seat)\w*\b)",
    re.I,
)

# 6. Manufactured scarcity -- the tell of a recruitment post.
SCARCITY = re.compile(
    r"\b\d+\s*(?:slots?|seats?|spots?|places?)\b"
    r"|\b(?:slots?|seats?|spots?|places?)\s+(?:are\s+)?(?:available|left|open|remaining)\b"
    r"|\blimited\s+(?:slots?|seats?|spots?|places?|time)\b"
    r"|\bfirst\s+come\s+first\s+serve\b|\bhurry\b|\blast\s+chance\b|\bfew\s+seats\b",
    re.I,
)

# 7. Advertising voice.
PROMO_FRAME = re.compile(
    r"\bwe\s+(?:offer|provide|are\s+offering|are\s+providing|specialise|specialize)\b"
    # "I'm starting a batch" is recruitment; "I'm taking classes at the King
    # Sejong Institute" is an applicant describing their own study, so the verb
    # list is restricted to ones that mean the writer is running the thing.
    r"|\bi(?:'m| am)?\s+(?:offering|providing|starting|conducting|running|teaching)\s+"
    r"(?:a\s+|an\s+|new\s+|only\s+|my\s+)*(?:class|classes|batch|course|session)"
    r"|\b100%\s*(?:guarantee|guaranteed|success|result)"
    r"|\bguaranteed\s+(?:admission|scholarship|visa|success)\b"
    r"|\bbest\s+(?:price|rates?|coaching|consultancy)\b"
    r"|\bspecial\s+offer\b|\bbook\s+now\b|\bapply\s+now\s+with\b"
    r"|\bfor\s+(?:more\s+)?(?:details|info|information|price)\s+(?:dm|pm|contact|message|whatsapp)\b",
    re.I,
)

FAMILIES = (
    ("solicitation", SOLICITATION),
    ("invite_link", INVITE_LINK),
    ("group_invite", GROUP_INVITE),
    ("commerce", COMMERCE),
    ("offering", OFFERING),
    ("scarcity", SCARCITY),
    ("promo_frame", PROMO_FRAME),
)

# Families that, on their own, already read as someone selling or recruiting
# rather than answering. Still require the answer to carry no first-hand
# experience or cited source before excluding it -- see is_promotional().
STRONG = frozenset({"solicitation", "invite_link", "group_invite", "promo_frame"})


def promotional_families(text: str) -> frozenset[str]:
    """Which promotional signal families the text trips."""
    t = text or ""
    return frozenset(name for name, pattern in FAMILIES if pattern.search(t))


def is_promotional(text: str, *, has_experience: bool = False, has_source: bool = False) -> tuple[bool, list[str]]:
    """
    True when this answer is promotion/recruitment rather than an answer.

    `has_experience` / `has_source` come from the usefulness signals and act as
    the brake: a post that genuinely reports what happened to the writer, or
    points at an official source, is left visible even if it also mentions a
    fee or a group -- the goal is to remove adverts, not to silence anyone who
    says the word "WhatsApp".

    An invite URL overrides that brake: pasting a group link is promotion
    regardless of what else the message says.
    """
    families = promotional_families(text)
    if not families:
        return False, []

    reasons = sorted(families)

    if "invite_link" in families:
        return True, reasons

    # Manufactured scarcity next to something being sold or a DM request is an
    # advert whatever else the message says. Checked before the brake because
    # adverts freely borrow authority words -- "Study in Korea with our agency!
    # Limited seats" trips the source-reference signal without being informative.
    # Scarcity ALONE stays innocent: GKS quotas are a real topic, and
    # "the embassy said only 3 slots are available for my country" must survive.
    if "scarcity" in families and families & {"offering", "promo_frame", "solicitation", "invite_link"}:
        return True, reasons

    informative = has_experience or has_source

    # Two independent families is the general rule: "batch starting" + "per
    # month", or "contact me" + "enrollment". One family alone is routinely
    # innocent ("the embassy charged a fee").
    if len(families) >= 2 and not informative:
        return True, reasons
    if len(families) >= 3:
        # Three at once outweighs an incidental "I did..." elsewhere in the post.
        return True, reasons

    # A single strong family with nothing informative in the message: "DM me
    # for details", "Join our WhatsApp group".
    if families & STRONG and not informative:
        return True, reasons

    return False, reasons
