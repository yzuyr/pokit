if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/pokit/dev-sw.js?dev-sw", {
    scope: "/pokit/",
    type: "classic",
  });
