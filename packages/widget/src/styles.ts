import type { Branding } from '@bellaworks/shared';

/**
 * Theming contract: branding from the API becomes --bw-* defaults on :host.
 * Rules the host page writes against the element (bellaworks-chat { --bw-*: … })
 * outrank :host styles, so site owners can override any variable in plain CSS.
 */
export function hostVars(branding: Branding): string {
  return `:host {
  --bw-primary: ${branding.primaryColor};
  --bw-secondary: ${branding.secondaryColor};
  --bw-text: ${branding.textColor};
  --bw-background: ${branding.backgroundColor};
  --bw-radius: ${branding.borderRadius}px;
  --bw-font: ${branding.fontFamily};
}`;
}

export const baseStyles = `
* { box-sizing: border-box; }

.root {
  font-family: var(--bw-font, system-ui, sans-serif);
  --surface: var(--bw-background, #ffffff);
  --text: var(--bw-text, #111827);
  --bubble-bg: #f3f4f6;
  --border: #e5e7eb;
  --header-text: #ffffff;
}
.root[data-theme='dark'] {
  --surface: #111827;
  --text: #f9fafb;
  --bubble-bg: #1f2937;
  --border: #374151;
}

.launcher {
  position: fixed;
  bottom: 20px;
  width: 56px;
  height: 56px;
  border: none;
  border-radius: 50%;
  background: var(--bw-primary, #2563eb);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  transition: transform 0.15s ease;
  z-index: 2147483000;
}
.launcher:hover { transform: scale(1.06); }
.launcher:focus-visible { outline: 3px solid var(--bw-secondary, #1e40af); outline-offset: 2px; }
.root[data-position='bottom-right'] .launcher { right: 20px; }
.root[data-position='bottom-left'] .launcher { left: 20px; }

.panel {
  position: fixed;
  bottom: 88px;
  width: 380px;
  max-width: calc(100vw - 32px);
  height: 560px;
  max-height: calc(100vh - 120px);
  background: var(--surface);
  color: var(--text);
  border-radius: var(--bw-radius, 12px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 2147483001;
}
.root[data-position='bottom-right'] .panel { right: 20px; }
.root[data-position='bottom-left'] .panel { left: 20px; }

@media (max-width: 480px) {
  .panel {
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    border-radius: 0;
  }
}

.header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--bw-primary, #2563eb);
  color: var(--header-text);
  flex-shrink: 0;
}
.header img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
.header .name { font-weight: 600; font-size: 15px; }
.header .close {
  margin-left: auto;
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
}
.header .close:hover { background: rgba(255, 255, 255, 0.15); }

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.msg {
  max-width: 85%;
  padding: 9px 13px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.5;
  overflow-wrap: break-word;
}
.msg.user {
  align-self: flex-end;
  background: var(--bw-primary, #2563eb);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.msg.bot {
  align-self: flex-start;
  background: var(--bubble-bg);
  color: var(--text);
  border-bottom-left-radius: 4px;
}
.msg p { margin: 0; }
.msg p + p, .msg ul, .msg pre { margin-top: 8px; }
.msg ul { margin-bottom: 0; padding-left: 18px; }
.msg a { color: var(--bw-primary, #2563eb); }
.msg.user a { color: #fff; }
.msg pre {
  background: rgba(0, 0, 0, 0.08);
  padding: 8px 10px;
  border-radius: 6px;
  overflow-x: auto;
  font-size: 12px;
  margin-bottom: 0;
}
.msg code { font-family: ui-monospace, monospace; font-size: 0.9em; }
.msg.failed { opacity: 0.85; font-style: italic; }

.sources {
  align-self: flex-start;
  font-size: 11px;
  opacity: 0.65;
  margin: -4px 0 0 4px;
}
.sources a { color: inherit; }

.typing { display: inline-flex; gap: 4px; padding: 4px 0; }
.typing span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.4;
  animation: bw-pulse 1s infinite;
}
.typing span:nth-child(2) { animation-delay: 0.2s; }
.typing span:nth-child(3) { animation-delay: 0.4s; }
@keyframes bw-pulse {
  50% { opacity: 1; }
}

.inputbar {
  display: flex;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.inputbar input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 14px;
}
.inputbar input:focus-visible { outline: 2px solid var(--bw-primary, #2563eb); }
.inputbar .send {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: var(--bw-primary, #2563eb);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.inputbar .send:disabled { opacity: 0.5; cursor: default; }

.credit {
  text-align: center;
  font-size: 10px;
  opacity: 0.45;
  padding: 4px 0 6px;
}
.credit a { color: inherit; }
`;
