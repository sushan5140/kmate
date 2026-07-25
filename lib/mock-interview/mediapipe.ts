// Loads MediaPipe Tasks Vision (Face Landmarker + Pose Landmarker) straight
// from jsDelivr at runtime -- deliberately NOT an npm dependency bundled by
// webpack. The prototype achieved this with an HTML <script type="importmap">
// aliasing the bare specifier to the CDN URL, which only works for a plain
// browser <script type="module">; webpack has no concept of import maps for
// code it bundles. `webpackIgnore` tells webpack to leave this import alone
// entirely so it hits the CDN at runtime exactly like the prototype did,
// instead of failing to resolve "@mediapipe/tasks-vision" at build time.
const VISION_CDN_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VisionModule = any;

let modelsLoadingPromise: Promise<{ faceLandmarker: VisionModule; poseLandmarker: VisionModule }> | null = null;
let lastLandmarkerTs = 0;

/**
 * MediaPipe's VIDEO running mode requires every detectForVideo() call
 * (across both landmarkers combined) to use a strictly increasing
 * timestamp. Rapid back-to-back calls (e.g. a quick pause retry) can
 * otherwise land on the same millisecond and throw. This guarantees forward
 * progress. One shared counter for both landmarkers, matching the prototype.
 */
export function nextLandmarkerTs(): number {
  const ts = Math.max(performance.now(), lastLandmarkerTs + 1);
  lastLandmarkerTs = ts;
  return ts;
}

/**
 * Memoizes the in-flight promise itself, not just the finished result. Two
 * near-simultaneous callers (e.g. starting the interview while a pause
 * overlay is also kicking off a load) could otherwise both pass a
 * synchronous "already loaded?" check before either had actually set the
 * result, causing two full landmarker graphs (and their WASM/model
 * downloads) to build concurrently. Every caller awaits the same promise.
 */
export function loadMediaPipeModels() {
  if (modelsLoadingPromise) return modelsLoadingPromise;

  modelsLoadingPromise = (async () => {
    const visionModule: VisionModule = await import(
      /* webpackIgnore: true */ `${VISION_CDN_BASE}/vision_bundle.mjs`
    );
    const { FaceLandmarker, PoseLandmarker, FilesetResolver } = visionModule;

    const filesetResolver = await FilesetResolver.forVisionTasks(`${VISION_CDN_BASE}/wasm`);

    const faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      outputFaceBlendshapes: true,
      runningMode: "VIDEO",
      numFaces: 1,
    });

    const poseLandmarker: VisionModule = await PoseLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });

    return { faceLandmarker, poseLandmarker };
  })();

  return modelsLoadingPromise;
}

export function computePostureStability(positions: { x: number; y: number }[]): number | null {
  if (positions.length < 5) return null;
  const xs = positions.map((p) => p.x);
  const ys = positions.map((p) => p.y);
  const variance = (arr: number[]) => {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  };
  const totalVar = variance(xs) + variance(ys);
  // lower variance = more stable; convert to a 0-100 "stability" score, clamped
  const stability = Math.max(0, Math.min(100, 100 - totalVar * 4000));
  return Math.round(stability);
}
