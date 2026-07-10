/**
 * BW AI Chat loader. This file's URL is what client sites embed and it
 * must stay stable forever — it only injects the current versioned bundle,
 * so widget updates and rollbacks never require embed-code changes.
 */
(function () {
  if (window.__bwChatLoaded) return;
  window.__bwChatLoaded = true;
  var current = document.currentScript;
  var base = current && current.src ? new URL(current.src).origin : '';
  var script = document.createElement('script');
  script.src = base + '/widget/v1.js';
  script.async = true;
  document.head.appendChild(script);
})();
