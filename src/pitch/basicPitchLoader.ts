import type { BasicPitch } from "@spotify/basic-pitch";
let cached: Promise<{
  model: BasicPitch;
  library: typeof import("@spotify/basic-pitch");
  tf: typeof import("@tensorflow/tfjs");
}> | null = null;
export function loadBasicPitch(modelUrl: string) {
  const reused = cached !== null;
  if (!cached)
    cached = (async () => {
      const url = new URL(modelUrl, self.location.href);
      if (url.origin !== self.location.origin)
        throw new Error("모델은 현재 사이트에서만 불러올 수 있습니다.");
      // Both AI dependencies are imported only upon entering the Pitch stage.
      const [library, tf] = await Promise.all([
        import("@spotify/basic-pitch"),
        import("@tensorflow/tfjs"),
      ]);
      // TF.js 3.21's browser timer references window even in a Worker during
      // asynchronous WebGL reads. Use the public Platform API with Worker-native timers.
      tf.env().setPlatform("acascore-worker", {
        fetch: (path, init) => {
          const asset = new URL(path, self.location.href);
          if (
            asset.origin !== self.location.origin ||
            (init?.method ?? "GET").toUpperCase() !== "GET"
          )
            throw new Error("모델은 같은 사이트의 정적 파일 GET만 허용합니다.");
          return fetch(asset.href, { ...init, redirect: "error" });
        },
        now: () => performance.now(),
        encode: (text) => new TextEncoder().encode(text),
        decode: (bytes) => new TextDecoder().decode(bytes),
        setTimeoutCustom: (callback, delay) => {
          setTimeout(callback, delay);
        },
      });
      let accelerated = false;
      if (typeof OffscreenCanvas !== "undefined") {
        try {
          accelerated = await tf.setBackend("webgl");
        } catch {
          /* CPU fallback */
        }
      }
      if (!accelerated && !(await tf.setBackend("cpu")))
        throw new Error("CPU 분석 엔진을 준비하지 못했습니다.");
      await tf.ready();
      const model = new library.BasicPitch(url.href);
      await model.model;
      return { model, library, tf };
    })().catch((reason) => {
      cached = null;
      throw reason;
    });
  return { promise: cached, reused };
}
