/**
 * Example Interface — Frontend Bundle
 *
 * Loaded by Chalie's dashboard when the user opens your interface.
 * Exports mount() and unmount() that the dashboard calls.
 *
 * Replace the example UI with your own interface logic.
 */

/**
 * Called when the user opens this interface from the dashboard launcher.
 *
 * @param {HTMLElement} container - The DOM element to render into (full screen).
 * @param {Object} config - Runtime configuration provided by the dashboard.
 * @param {string} config.gateway - Dashboard gateway URL for Chalie API calls.
 * @param {string} config.daemon_host - This interface's daemon URL for direct data.
 */
export function mount(container, config) {
  container._config = config;

  const statusEl = container.querySelector("#statusText");
  if (statusEl) {
    statusEl.textContent = "Connected";
  }

  // Example: fetch user context via gateway (scope-filtered)
  // fetch(`${config.gateway}/context`)
  //   .then(r => r.json())
  //   .then(ctx => {
  //     // ctx.location may be missing if user denied that scope
  //     if (ctx.location) console.log('User is in', ctx.location.name);
  //   });

  // Example: fetch data from your own daemon
  // fetch(`${config.daemon_host}/my-custom-endpoint`)
  //   .then(r => r.json())
  //   .then(data => renderYourUI(container, data));

  console.log("[ExampleInterface] Mounted");
}

/**
 * Called when the user navigates away from this interface.
 * Clean up timers, listeners, and any state.
 *
 * @param {HTMLElement} container - The same container passed to mount().
 */
export function unmount(container) {
  delete container._config;
  console.log("[ExampleInterface] Unmounted");
}
