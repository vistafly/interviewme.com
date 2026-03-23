/**
 * Singleton mic stream manager.
 * Requests getUserMedia once, caches the stream, and reuses it
 * for both the audio analyser and to pre-grant permission so
 * SpeechRecognition doesn't re-prompt the user.
 *
 * Supports device selection — call switchDevice(deviceId) to change
 * the active microphone. The next requestMicStream() will use it.
 */

let cachedStream = null;
let pendingRequest = null;
let preferredDeviceId = null;
let currentDeviceId = null;

/**
 * Build the getUserMedia constraints for the target device.
 */
function buildConstraints(deviceId) {
  return deviceId
    ? { audio: { deviceId: { exact: deviceId } } }
    : { audio: true };
}

/**
 * Request mic access and cache the stream.
 * If already granted (same device), returns the cached stream instantly.
 * If a request is in flight, deduplicates by returning the same promise.
 */
export async function requestMicStream() {
  const targetDevice = preferredDeviceId || null;

  // Reuse if the stream is still alive AND matches the preferred device
  if (cachedStream && cachedStream.active && currentDeviceId === targetDevice) {
    return cachedStream;
  }

  // Stream died or device changed — drop the old one
  if (cachedStream) {
    cachedStream.getTracks().forEach((t) => t.stop());
    cachedStream = null;
    currentDeviceId = null;
  }

  // Deduplicate concurrent calls
  if (pendingRequest) {
    return pendingRequest;
  }

  pendingRequest = navigator.mediaDevices
    .getUserMedia(buildConstraints(targetDevice))
    .then((stream) => {
      cachedStream = stream;
      currentDeviceId = targetDevice;
      pendingRequest = null;
      return stream;
    })
    .catch((err) => {
      pendingRequest = null;
      throw err;
    });

  return pendingRequest;
}

/**
 * Get the cached stream without triggering a new request.
 * Returns null if no stream has been acquired yet.
 */
export function getCachedMicStream() {
  if (cachedStream && cachedStream.active) {
    return cachedStream;
  }
  return null;
}

/**
 * Release the cached stream (stops all tracks).
 * Call this on unmount / session end.
 */
export function releaseMicStream() {
  if (cachedStream) {
    cachedStream.getTracks().forEach((t) => t.stop());
    cachedStream = null;
  }
  currentDeviceId = null;
  pendingRequest = null;
}

/**
 * Check mic permission state without triggering a prompt.
 * Falls back to 'unknown' if the Permissions API is not available.
 */
export async function getMicPermissionState() {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' });
    return result.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Device management
// ---------------------------------------------------------------------------

/**
 * Enumerate available audio input devices.
 * Note: labels are only populated after the user has granted mic permission.
 */
export async function getAudioInputDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === 'audioinput');
  } catch {
    return [];
  }
}

/**
 * Get the currently preferred device ID (null = system default).
 */
export function getPreferredDeviceId() {
  return preferredDeviceId;
}

/**
 * Switch to a different microphone device.
 * Releases the current stream and pre-acquires a new one.
 * Returns the new MediaStream.
 */
export async function switchDevice(deviceId) {
  preferredDeviceId = deviceId || null;

  // Drop the old stream so requestMicStream picks up the new device
  if (cachedStream) {
    cachedStream.getTracks().forEach((t) => t.stop());
    cachedStream = null;
  }
  currentDeviceId = null;
  pendingRequest = null;

  return requestMicStream();
}
