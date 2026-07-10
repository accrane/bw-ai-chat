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

class BwAiChatElement extends HTMLElement {
  connectedCallback(): void {
    if (this.shadowRoot) return;
    const clientId = this.getAttribute('client-id');
    if (!clientId) {
      console.warn('[bw-ai-chat] missing client-id attribute');
      return;
    }
    const apiBase = this.getAttribute('api-url') ?? SCRIPT_ORIGIN;
    const shadow = this.attachShadow({ mode: 'open' });
    render(
      <App
        clientId={clientId}
        apiBase={apiBase}
        preview={this.hasAttribute('preview')}
        inline={this.hasAttribute('inline')}
      />,
      shadow,
    );
  }
}

if (!customElements.get('bw-ai-chat')) {
  customElements.define('bw-ai-chat', BwAiChatElement);
}
