// Step text ported verbatim from the prototype's API-key guide. Screenshots
// extracted from the prototype's embedded base64 <img> tags into real files
// under public/mock-interview/ -- inlining ~470KB of base64 across 6 images
// directly in a component isn't how Next.js apps hold static assets, so
// these moved to /public rather than being carried over byte-for-byte in code.
export interface ApiKeyGuideStep {
  num: number;
  title: string;
  caption: string;
  screenshotSrc: string;
}

export const API_KEY_GUIDE_STEPS: ApiKeyGuideStep[] = [
  {
    num: 1,
    title: "Go to Google AI Studio and click the key icon",
    caption: "Open aistudio.google.com and sign in with any Google account. In the bottom-left toolbar, click the key-shaped icon.",
    screenshotSrc: "/mock-interview/api-key-guide-step-1.jpg",
  },
  {
    num: 2,
    title: 'Click "Create API key"',
    caption: 'You\'ll land on the API Keys page. Click the "Create API key" button in the top-right.',
    screenshotSrc: "/mock-interview/api-key-guide-step-2.jpg",
  },
  {
    num: 3,
    title: 'Name your key and click "Create key"',
    caption: 'Give it any name you like, pick any project from the dropdown (or the default one), then click "Create key".',
    screenshotSrc: "/mock-interview/api-key-guide-step-3.jpg",
  },
  {
    num: 4,
    title: 'Click "Copy key"',
    caption: 'Your key is generated. Click "Copy key" — this is the value you\'ll paste into the field below.',
    screenshotSrc: "/mock-interview/api-key-guide-step-4.jpg",
  },
  {
    num: 5,
    title: "Done — your key is ready to use",
    caption: "Your new key now appears in the list. Paste it into the field below and continue.",
    screenshotSrc: "/mock-interview/api-key-guide-step-5.jpg",
  },
  {
    num: 6,
    title: "Copy the key and paste it below",
    caption: 'Back on this page, paste the copied key into the field further down, then click "Validate & continue".',
    screenshotSrc: "/mock-interview/api-key-guide-step-6.jpg",
  },
];
