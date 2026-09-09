// Web Push — brauzer obunasini boshqarish (obuna bo'lish / bekor qilish).
import { api } from "./api";

/// Brauzer Web Push'ni qo'llab-quvvatlaydimi?
export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/// VAPID base64url kalitini push API kutadigan Uint8Array ga o'tkazadi.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/// Joriy holat: 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed' | 'disabled'
/// ('disabled' — server tomonda VAPID sozlanmagan).
export async function pushState(): Promise<
  "unsupported" | "denied" | "subscribed" | "unsubscribed" | "disabled"
> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  // Server push'ni yoqganmi?
  try {
    await api.pushVapidKey();
  } catch {
    return "disabled";
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? "subscribed" : "unsubscribed";
}

/// Push'ni yoqadi: ruxsat so'raydi, obuna bo'ladi va serverga saqlaydi.
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error("push qo'llab-quvvatlanmaydi");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("bildirishnomaga ruxsat berilmadi");

  const { key } = await api.pushVapidKey();
  const reg = await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("obuna ma'lumotlari olinmadi");
  }
  await api.pushSubscribe({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
}

/// Push'ni o'chiradi: obunani bekor qiladi va serverdan ham o'chiradi.
export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    try {
      await api.pushUnsubscribe(endpoint);
    } catch {
      /* server tomonda bo'lmasa ham muhim emas */
    }
  }
}
