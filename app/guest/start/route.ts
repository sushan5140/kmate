import { NextRequest, NextResponse } from "next/server";
import { sanitizeNext } from "@/lib/auth/safe-next";

const COOKIE = "kmate_reviewer_guest";

function guestName() {
  const first = ["Nuri","Haneul","Bomi","Haru","Miso","Duri","Jadu","Sori","Minji","Ara"];
  const second = ["Scholar","Explorer","Applicant","Buddy","Learner","Traveler","Reviewer","Guest"];
  const pick = (items: string[]) => items[Math.floor(Math.random() * items.length)];
  return `${pick(first)}${pick(second)}${Math.floor(100 + Math.random() * 900)}`;
}

export async function GET(request: NextRequest) {
  const next = sanitizeNext(request.nextUrl.searchParams.get("next") || "/home");
  const payload = {
    id: crypto.randomUUID(),
    name: guestName(),
    createdAt: new Date().toISOString(),
  };

  const response = NextResponse.redirect(new URL(next, request.nextUrl.origin));
  response.cookies.set(COOKIE, encodeURIComponent(JSON.stringify(payload)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 4,
  });
  return response;
}
