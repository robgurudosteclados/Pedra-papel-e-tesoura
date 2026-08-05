/* Service Worker — deixa o jogo instalado e jogável sem internet.
   Estratégia: "cache primeiro, com atualização em segundo plano".
   Sempre que um arquivo do jogo mudar, troque o CACHE_VERSION abaixo
   pra forçar todo mundo a baixar a versão nova. */
const CACHE_VERSION = 'ppt-torneio-v5';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // offline: usa o que já está em cache

      // Responde rápido com o cache (se existir) e atualiza em segundo plano;
      // se não houver cache ainda, espera a rede.
      return cached || network;
    })
  );
});
