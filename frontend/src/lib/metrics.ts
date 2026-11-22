export type MetricReport = {
  name: "LCP" | "FID" | "INP" | "CLS" | "FCP" | "TTFB";
  value: number;
  rating: "good" | "needs-improvement" | "poor";
};

export function reportWebVitals(onReport?: (metric: MetricReport) => void) {
  if (typeof window === "undefined" || !("PerformanceObserver" in window)) {
    return;
  }

  const logMetric = (metric: MetricReport) => {
    if (onReport) {
      onReport(metric);
    } else if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info(`[Web Vitals] ${metric.name}: ${metric.value.toFixed(2)}ms (${metric.rating})`);
    }
  };

  try {
    // 1. Largest Contentful Paint (LCP)
    const lcpObserver = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        const value = lastEntry.startTime;
        logMetric({
          name: "LCP",
          value,
          rating: value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor",
        });
      }
    });
    lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });

    // 2. Cumulative Layout Shift (CLS)
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        const layoutShift = entry as PerformanceEntry & {
          hadRecentInput?: boolean;
          value?: number;
        };
        if (!layoutShift.hadRecentInput && layoutShift.value) {
          clsValue += layoutShift.value;
        }
      }
      logMetric({
        name: "CLS",
        value: clsValue,
        rating: clsValue <= 0.1 ? "good" : clsValue <= 0.25 ? "needs-improvement" : "poor",
      });
    });
    clsObserver.observe({ type: "layout-shift", buffered: true });

    // 3. First Input Delay (FID) / Interaction to Next Paint (INP)
    const eventObserver = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        const eventEntry = entry as PerformanceEntry & {
          duration?: number;
          processingStart?: number;
        };
        const duration =
          eventEntry.duration ||
          (eventEntry.processingStart ? eventEntry.processingStart - entry.startTime : 0);
        logMetric({
          name: "INP",
          value: duration,
          rating: duration <= 200 ? "good" : duration <= 500 ? "needs-improvement" : "poor",
        });
      }
    });
    eventObserver.observe({ type: "first-input", buffered: true });
  } catch {
    // PerformanceObserver feature unsupported in environment
  }
}
