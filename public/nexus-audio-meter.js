// Runs on the audio-rendering thread; silence detection does not depend on
// background-tab timers. Never sends audio samples, only energy and elapsed time.
class NexusAudioMeter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frames = 0;
    this.windowFrames = 0;
    this.energy = 0;
  }
  process(inputs) {
    const samples = inputs[0]?.[0];
    if (samples) {
      for (const sample of samples) this.energy += sample * sample;
      this.frames += samples.length;
      this.windowFrames += samples.length;
      if (this.windowFrames >= sampleRate * 0.08) {
        this.port.postMessage({
          rms: Math.sqrt(this.energy / this.windowFrames),
          elapsed: (this.frames / sampleRate) * 1000,
        });
        this.windowFrames = 0;
        this.energy = 0;
      }
    }
    // The output stays silent. A zero-gain connection keeps processing active.
    return true;
  }
}
registerProcessor("nexus-audio-meter", NexusAudioMeter);
