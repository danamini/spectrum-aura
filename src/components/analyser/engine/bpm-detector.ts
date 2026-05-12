/**
 * BPM Detection using a sliding window of bass energy analysis.
 * 
 * Algorithm:
 * 1. Maintains a history of bass energy values with timestamps
 * 2. Looks for energy peaks (local maxima) within the window
 * 3. Calculates intervals between consecutive peaks
 * 4. Estimates BPM from the median peak interval
 * 5. Applies temporal smoothing to reduce jitter
 */

export class BPMDetector {
  // History of bass values with timestamps
  private energyHistory: Array<{ energy: number; time: number }> = [];
  // Window size in milliseconds (default: 8 seconds for better analysis)
  private windowSizeMs = 8000;
  // Minimum interval between peaks in ms (helps filter noise)
  private minPeakIntervalMs = 120;
  // Threshold multiplier for peak detection (relative to average) - lowered for sensitivity
  private peakThreshold = 1.08;
  // Alternative: detect peaks via slope change (energy increasing then decreasing)
  private useSlopeDetection = true;

  private lastBPM = 0;
  private bpmSmoothingAlpha = 0.08; // Slower smoothing for more stable detection

  /**
   * Feed a new bass energy value into the detector.
   * @param energy Bass energy value (typically 0-1)
   * @param time Current time in milliseconds
   */
  feed(energy: number, time: number): void {
    this.energyHistory.push({ energy, time });

    // Remove old entries outside the window
    const cutoffTime = time - this.windowSizeMs;
    while (this.energyHistory.length > 0 && this.energyHistory[0].time < cutoffTime) {
      this.energyHistory.shift();
    }
  }

  /**
   * Get the current estimated BPM.
   * @returns BPM value (typically 60-200)
   */
  getBPM(): number {
    if (this.energyHistory.length < 5) return this.lastBPM;

    // Find peaks (local maxima) in the energy history
    const peaks = this.findPeaks();

    // Need at least 2 peaks to calculate interval
    if (peaks.length < 2) return this.lastBPM;

    // Calculate intervals between consecutive peaks
    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
      const interval = peaks[i].time - peaks[i - 1].time;
      intervals.push(interval);
    }

    if (intervals.length === 0) return this.lastBPM;

    // Get the median interval to be robust to outliers
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];

    // Convert interval (ms) to BPM (beats per minute)
    let newBPM = 60000 / medianInterval;

    // Handle octave errors (beat detected at half or double the actual tempo)
    // Check if half or double BPM makes more sense
    if (newBPM < 80) newBPM = newBPM * 2; // Likely detected every other beat
    if (newBPM > 180) newBPM = newBPM * 0.5; // Likely detected extra peaks

    // Clamp to reasonable range
    newBPM = Math.max(60, Math.min(200, newBPM));

    // Apply temporal smoothing to reduce jitter
    this.lastBPM = this.lastBPM * (1 - this.bpmSmoothingAlpha) + newBPM * this.bpmSmoothingAlpha;

    return this.lastBPM;
  }

  /**
   * Get the current beat confidence (0-1).
   * Based on how consistent and frequent the detected peaks are.
   */
  getConfidence(): number {
    if (this.energyHistory.length < 5) return 0;

    const peaks = this.findPeaks();
    
    // More peaks = more confident
    if (peaks.length < 2) return 0;
    if (peaks.length < 3) return 0.3; // At least has a beat
    
    // Calculate intervals
    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i].time - peaks[i - 1].time);
    }

    if (intervals.length < 2) return 0.4;

    // Calculate consistency of intervals
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 1;

    // More forgiving confidence scale:
    // cv < 0.08 → confidence ~1 (very consistent)
    // cv < 0.15 → confidence ~0.8 (consistent)
    // cv < 0.25 → confidence ~0.5 (somewhat consistent)
    // cv > 0.4  → confidence ~0 (inconsistent)
    let confidence = 1 - cv * 3;
    confidence = Math.max(0, Math.min(1, confidence));
    
    // Bonus: more peaks = higher confidence
    const peakBonus = Math.min(0.2, (peaks.length - 3) * 0.05);
    confidence = Math.min(1, confidence + peakBonus);

    return confidence;
  }

  /**
   * Reset the detector (useful when changing tracks).
   */
  reset(): void {
    this.energyHistory = [];
    this.lastBPM = 0;
  }

  private findPeaks(): Array<{ energy: number; time: number }> {
    if (this.energyHistory.length < 5) return [];

    const peaks: typeof this.energyHistory = [];
    const history = this.energyHistory;
    
    if (this.useSlopeDetection) {
      // Slope-based detection: find where derivative changes from positive to negative
      // This is more robust to smooth audio than threshold-based detection
      let lastPeakTime = -Infinity;
      let wasRising = false;

      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1];
        const curr = history[i];
        const isRising = curr.energy > prev.energy;

        // Peak found: was rising, now falling
        if (wasRising && !isRising) {
          // Use previous point as peak (top of the hill)
          const timeSinceLast = prev.time - lastPeakTime;
          if (timeSinceLast >= this.minPeakIntervalMs) {
            peaks.push(prev);
            lastPeakTime = prev.time;
          }
        }

        wasRising = isRising;
      }
    } else {
      // Fallback: threshold-based (original approach)
      const avg = history.reduce((sum, e) => sum + e.energy, 0) / history.length;
      const threshold = avg * this.peakThreshold;

      for (let i = 1; i < history.length - 1; i++) {
        const prev = history[i - 1];
        const curr = history[i];
        const next = history[i + 1];

        if (curr.energy > threshold && curr.energy >= prev.energy && curr.energy >= next.energy) {
          const timeSinceLast = peaks.length === 0 ? Infinity : curr.time - peaks[peaks.length - 1].time;
          if (timeSinceLast >= this.minPeakIntervalMs) {
            peaks.push(curr);
          }
        }
      }
    }

    return peaks;
  }
}
