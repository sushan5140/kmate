"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const PPTX_PREVIEW_CDN = "https://cdn.jsdelivr.net/npm/pptx-preview@1.0.7/+esm";

type Previewer = {
  preview: (data: ArrayBuffer) => Promise<unknown> | unknown;
  destroy?: () => void;
};

function findRenderedSlides(host: HTMLElement): HTMLElement[] {
  const explicit = Array.from(
    host.querySelectorAll<HTMLElement>(".pptx-slide, .slide, [data-slide-index]")
  );
  if (explicit.length > 1) return explicit;

  const first = host.firstElementChild as HTMLElement | null;
  if (first && first.children.length > 1) {
    return Array.from(first.children).filter((node): node is HTMLElement => node instanceof HTMLElement);
  }

  return Array.from(host.children).filter((node): node is HTMLElement => node instanceof HTMLElement);
}

function waitForRenderedSlides(host: HTMLElement, attempts = 60): Promise<HTMLElement[]> {
  return new Promise((resolve) => {
    let count = 0;
    const inspect = () => {
      const slides = findRenderedSlides(host);
      if (slides.length > 0 || count >= attempts) {
        resolve(slides);
        return;
      }
      count += 1;
      requestAnimationFrame(inspect);
    };
    inspect();
  });
}

export interface SlideSnapshot {
  number: number;
  text: string;
}

export function PresentationViewer({
  file,
  className,
  onSlideChange,
}: {
  file: File;
  className?: string;
  onSlideChange?: (slide: SlideSnapshot) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const renderHostRef = useRef<HTMLDivElement | null>(null);
  const previewerRef = useRef<Previewer | null>(null);
  const slidesRef = useRef<HTMLElement[]>([]);
  const [currentSlide, setCurrentSlide] = useState(1);
  const [slideCount, setSlideCount] = useState(0);
  const [scale, setScale] = useState(1);
  const [status, setStatus] = useState<"rendering" | "ready" | "error">("rendering");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateScale = () => {
      const available = Math.max(0, viewport.clientWidth - 2);
      setScale(Math.min(1, available / 960));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function renderPresentation() {
      const host = renderHostRef.current;
      if (!host) return;

      setStatus("rendering");
      setError(null);
      setCurrentSlide(1);
      setSlideCount(0);
      slidesRef.current = [];
      host.innerHTML = "";

      try {
        const data = await file.arrayBuffer();
        const previewModule: { init?: (element: HTMLElement, options: { width: number; height: number }) => Previewer } =
          await import(/* webpackIgnore: true */ `${PPTX_PREVIEW_CDN}`);
        if (!previewModule.init) throw new Error("The browser PPTX renderer did not expose its init function.");
        if (cancelled || !renderHostRef.current) return;

        const previewer = previewModule.init(renderHostRef.current, { width: 960, height: 540 });
        previewerRef.current = previewer;
        await Promise.resolve(previewer.preview(data));

        if (cancelled || !renderHostRef.current) return;
        const slides = await waitForRenderedSlides(renderHostRef.current);
        if (cancelled) return;
        if (!slides.length) throw new Error("The presentation renderer returned no slides.");

        slidesRef.current = slides;
        setSlideCount(slides.length);
        setCurrentSlide(1);
        setStatus("ready");
      } catch (err) {
        console.error("PPTX render failed", err);
        setStatus("error");
        setError(
          err instanceof Error
            ? err.message
            : "This PowerPoint could not be rendered in the browser."
        );
      }
    }

    void renderPresentation();
    return () => {
      cancelled = true;
      try {
        previewerRef.current?.destroy?.();
      } catch {
        // Renderer cleanup is best-effort; the host is removed with the component anyway.
      }
      previewerRef.current = null;
      slidesRef.current = [];
    };
  }, [file]);

  useEffect(() => {
    if (!slideCount) return;
    const slides = slidesRef.current;
    slides.forEach((slide, index) => {
      slide.style.display = index === currentSlide - 1 ? "block" : "none";
      slide.setAttribute("aria-hidden", index === currentSlide - 1 ? "false" : "true");
    });

    const active = slides[currentSlide - 1];
    const text = active?.innerText?.replace(/\s+/g, " ").trim() ?? "";
    onSlideChange?.({ number: currentSlide, text });
  }, [currentSlide, slideCount, onSlideChange]);

  function goToSlide(next: number) {
    if (!slideCount) return;
    setCurrentSlide(Math.min(slideCount, Math.max(1, next)));
  }

  return (
    <section className={cn("overflow-hidden rounded-2xl border border-hairline bg-surface", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink">{file.name}</p>
          <p className="mt-0.5 text-[11px] text-muted">
            {status === "rendering"
              ? "Rendering locally in your browser…"
              : status === "ready"
                ? `Slide ${currentSlide} of ${slideCount}`
                : "Presentation unavailable"}
          </p>
        </div>
        {status === "ready" && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-label="Previous slide"
              disabled={currentSlide <= 1}
              onClick={() => goToSlide(currentSlide - 1)}
              className="h-8 w-8 px-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-label="Next slide"
              disabled={currentSlide >= slideCount}
              onClick={() => goToSlide(currentSlide + 1)}
              className="h-8 w-8 px-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div ref={viewportRef} className="relative aspect-video w-full overflow-hidden bg-[#f6f5f2]">
        {status === "rendering" && (
          <div className="absolute inset-0 z-10 grid place-items-center text-[13px] text-muted">
            Preparing slides…
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 z-10 grid place-items-center px-6 text-center">
            <div>
              <p className="text-[13px] font-semibold text-ink">Couldn&apos;t render this PPTX</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{error}</p>
            </div>
          </div>
        )}
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ width: 960, height: 540, transform: `scale(${scale})` }}
        >
          <div ref={renderHostRef} style={{ width: 960, height: 540 }} />
        </div>
      </div>

      {status === "ready" && (
        <div className="border-t border-hairline px-3 py-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {Array.from({ length: slideCount }, (_, index) => index + 1).map((number) => (
              <button
                key={number}
                type="button"
                onClick={() => goToSlide(number)}
                aria-label={`Go to slide ${number}`}
                aria-current={number === currentSlide ? "page" : undefined}
                className={cn(
                  "h-7 min-w-7 rounded-full px-2 text-[11px] font-medium transition-colors",
                  number === currentSlide
                    ? "bg-ink text-white"
                    : "bg-canvas text-muted hover:bg-primary-soft hover:text-primary"
                )}
              >
                {number}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Slides never advance automatically. Your active slide is recorded with each answer.
          </p>
        </div>
      )}
    </section>
  );
}
