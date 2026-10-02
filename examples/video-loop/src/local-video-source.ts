/** Owns the file URL and rejects stale playback completions after replacement. */
export class LocalVideoSource {
  private url: string | null = null;

  constructor(private readonly video: HTMLVideoElement) {}

  async load(file: Blob): Promise<boolean> {
    const previous = this.url;
    const current = URL.createObjectURL(file);
    this.url = current;
    this.video.src = current;
    if (previous) URL.revokeObjectURL(previous);
    try {
      await this.video.play();
      return this.url === current;
    } catch (error) {
      if (this.url !== current) return false;
      throw error;
    }
  }

  clear() {
    const previous = this.url;
    this.url = null;
    this.video.pause();
    this.video.removeAttribute("src");
    this.video.load();
    if (previous) URL.revokeObjectURL(previous);
  }
}
