import { render } from 'preact';
import { App } from './app.js';

// Captured at bundle-execution time: the script tag injected by the loader,
// whose origin is the API host. An api-url attribute overrides it.
const SCRIPT_ORIGIN = (() => {
  try {
    const src = (document.currentScript as HTMLScriptElement | null)?.src;
    return src ? new URL(src).origin : window.location.origin;
  } catch {
    return window.location.origin;
  }
})();

class BellaworksChatElement extends HTMLElement {
  connectedCallback(): void {
    if (this.shadowRoot) return;
    const clientId = this.getAttribute('client-id');
    if (!clientId) {
      console.warn('[bellaworks-chat] missing client-id attribute');
      return;
    }
    const apiBase = this.getAttribute('api-url') ?? SCRIPT_ORIGIN;
    const shadow = this.attachShadow({ mode: 'open' });
    render(<App clientId={clientId} apiBase={apiBase} />, shadow);
  }
}

if (!customElements.get('bellaworks-chat')) {
  customElements.define('bellaworks-chat', BellaworksChatElement);
}
