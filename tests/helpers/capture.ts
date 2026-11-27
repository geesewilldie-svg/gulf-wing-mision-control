import type { Page } from "@playwright/test";
export async function mediaFixture(page: Page, mode = "normal") {
  await page.addInitScript(
    ({ mode }) => {
      const fixture: any = { calls: [], tracks: [], mode, release: null };
      (window as any).__capture = fixture;
      function create() {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext("2d")!;
        const draw = () => {
          ctx.fillStyle = "#14354a";
          ctx.fillRect(0, 0, 640, 360);
          ctx.fillStyle = "#90e8ff";
          ctx.font = "24px sans-serif";
          ctx.fillText("Owned local preview fixture", 100, 180);
        };
        draw();
        const stream = canvas.captureStream(5);
        const timer = setInterval(draw, 200);
        for (const track of stream.getTracks()) {
          fixture.tracks.push(track);
          const stop = track.stop.bind(track);
          track.stop = () => {
            clearInterval(timer);
            stop();
          };
        }
        if (mode === "audio") {
          // A video track presented as an unexpected audio collection is rejected.
          Object.defineProperty(stream, "getAudioTracks", {
            value: () => stream.getTracks(),
          });
        }
        return stream;
      }
      const get = (kind: string, options: any) => {
        fixture.calls.push({ kind, options });
        if (mode === "deny")
          return Promise.reject(
            new DOMException("PRIVATE BROWSER ERROR", "NotAllowedError"),
          );
        if (mode === "pending")
          return new Promise<MediaStream>((resolve) => {
            fixture.release = () => resolve(create());
          });
        return Promise.resolve(create());
      };
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia:
            mode === "unsupported"
              ? undefined
              : (options: any) => get("camera", options),
          getDisplayMedia:
            mode === "unsupported"
              ? undefined
              : (options: any) => get("screen", options),
        },
      });
    },
    { mode },
  );
}
