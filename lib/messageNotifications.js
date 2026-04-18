/**
 * Desktop notifications for new ForgeFit messages (Browser Notification API).
 */

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission() {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

/** @returns {'granted'|'denied'|'default'|'unsupported'} */
export async function requestNotificationPermission() {
  if (!notificationsSupported()) return "unsupported";
  try {
    const p = await Notification.requestPermission();
    return p === "granted" ? "granted" : p === "denied" ? "denied" : "default";
  } catch {
    return "denied";
  }
}

/**
 * Show a desktop notification (no-op if not granted or unsupported).
 * @param {{ title: string, body: string, tag?: string }} opts
 */
export function showMessageNotification({ title, body, tag }) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  const snippet = String(body ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  try {
    new Notification(title, {
      body: snippet || "New message",
      tag: tag || "forgefit-message",
    });
  } catch {
    // ignore
  }
}
