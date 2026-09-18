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
  // Real pixel dimensions of the screenshot -- passed straight to next/image
  // so its aspect-ratio CSS matches the actual file instead of assuming a
  // uniform 1200x750 (step 6, and now steps 3/3a/3b, aren't that ratio; a
  // hardcoded width/height here would stretch or squish them).
  width: number;
  height: number;
}

export const API_KEY_GUIDE_STEPS: ApiKeyGuideStep[] = [
  {
    num: 1,
    title: "Go to Google AI Studio and click the key icon",
    caption: "Open aistudio.google.com and sign in with any Google account. In the bottom-left toolbar, click the key-shaped icon.",
    screenshotSrc: "/mock-interview/api-key-guide-step-1.jpg",
    width: 1200,
    height: 750,
  },
  {
    num: 2,
    title: 'Click "Create API key"',
    caption: 'You\'ll land on the API Keys page. Click the "Create API key" button in the top-right.',
    screenshotSrc: "/mock-interview/api-key-guide-step-2.jpg",
    width: 1200,
    height: 750,
  },
  {
    num: 3,
    title: "Name your key and choose a project",
    caption: 'Give it any name you like, then pick a project from the dropdown. Don\'t have a project yet? See the next step.',
    screenshotSrc: "/mock-interview/api-key-guide-step-3.jpg",
    width: 1356,
    height: 642,
  },
  {
    num: 4,
    title: 'No projects yet? Click "Create project"',
    caption: 'Open the project dropdown and click "Create project" at the top of the list. Already have a project? Skip to the next step.',
    screenshotSrc: "/mock-interview/api-key-guide-step-3a.jpg",
    width: 485,
    height: 620,
  },
  {
    num: 5,
    title: "Name your project and create it",
    caption: 'Give it any name, click "Create project", then go back and pick it from the dropdown in step 3.',
    screenshotSrc: "/mock-interview/api-key-guide-step-3b.jpg",
    width: 554,
    height: 425,
  },
  {
    num: 6,
    title: 'Click "Copy key"',
    caption: 'Your key is generated. Click "Copy key" — this is the value you\'ll paste into the field below.',
    screenshotSrc: "/mock-interview/api-key-guide-step-4.jpg",
    width: 1200,
    height: 750,
  },
  {
    num: 7,
    title: "Done — your key is ready to use",
    caption: "Your new key now appears in the list. Paste it into the field below and continue.",
    screenshotSrc: "/mock-interview/api-key-guide-step-5.jpg",
    width: 1200,
    height: 750,
  },
  {
    num: 8,
    title: "Copy the key and paste it below",
    caption: 'Back on this page, paste the copied key into the field further down, then click "Validate & continue".',
    screenshotSrc: "/mock-interview/api-key-guide-step-6.jpg",
    width: 1200,
    height: 420,
  },
];
