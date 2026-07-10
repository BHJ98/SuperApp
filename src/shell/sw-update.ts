// Bridge between the vite-plugin-pwa service-worker registration (done once in
// main.tsx, outside React) and the <UpdatePrompt /> component inside the tree.
// registerSW's update function is kept in a module singleton; when a new
// service worker is waiting we dispatch a window CustomEvent that the
// component listens for. A flag covers the race where the event fires before
// the component has mounted.
import { registerSW } from "virtual:pwa-register";

export const SW_NEED_REFRESH_EVENT = "sw-need-refresh";

let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;
let refreshPending = false;

export function registerServiceWorker() {
  updateSW = registerSW({
    onNeedRefresh() {
      refreshPending = true;
      window.dispatchEvent(new CustomEvent(SW_NEED_REFRESH_EVENT));
    },
  });
}

/** True when a new version is waiting (in case the event already fired). */
export function isRefreshPending() {
  return refreshPending;
}

/** Activate the waiting service worker and reload the page. */
export function applyUpdate() {
  void updateSW?.(true);
}
