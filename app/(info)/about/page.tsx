import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — KMate",
};

export default function AboutPage() {
  return (
    <article className="flex flex-col gap-4 text-[14.5px] leading-relaxed text-ink">
      <h1 className="text-[22px] font-semibold">About KMate</h1>

      <p>
        KMate is an independent, applicant-run community for people applying to the
        Global Korea Scholarship (GKS-U and GKS-G). It exists to help applicants find
        others targeting the same major and universities, trade notes on the interview
        stage, and exchange contact info without spamming public groups or handing out
        numbers to strangers.
      </p>

      <p className="font-medium">
        KMate is not affiliated with, endorsed by, or operated by NIIED (National
        Institute for International Education) or the Korean government. It is built and
        run independently by applicants, for applicants.
      </p>

      <p>
        Nothing about your profile is public by default: contact info stays private in
        your own account until you send or accept a connection request. See our{" "}
        <a href="/guidelines" className="text-primary hover:underline">
          community guidelines
        </a>{" "}
        for how we expect people to treat each other here.
      </p>
    </article>
  );
}
