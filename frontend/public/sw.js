// Challanger service worker — offline qobiq (app shell) + Web Push.
const CACHE = "challanger-v2";

// ---- Web Push ----
// Server yuborgan push xabarini (JSON: {title, body}) bildirishnoma sifatida ko'rsatadi.
self.addEventListener("push", (e) => {
  let data = { title: "Challanger", body: "" };
  try {
    data = e.data.json();
  } catch {
    if (e.data) data.body = e.data.text();
  }
  e.waitUntil(
    self.registration.showNotification(data.title || "Challanger", {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: "challanger-reminder",
    })
  );
});

// Bildirishnoma bosilganda — ochiq oynaga o'tadi yoki yangisini ochadi.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/index.html", "/icon.svg"])));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // API so'rovlari — hech qachon keshlanmaydi (faqat tarmoq)
  if (url.pathname.startsWith("/api/")) return;
  if (url.origin !== self.location.origin) return;

  // Navigatsiya — avval tarmoq, offline bo'lsa keshdan "/"
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put("/", res.clone()));
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || caches.match("/index.html")))
    );
    return;
  }

  // Statik resurslar — stale-while-revalidate
  e.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
