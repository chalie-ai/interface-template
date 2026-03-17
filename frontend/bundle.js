/**
 * Example Interface — Frontend Bundle
 *
 * This file is loaded by Chalie's dashboard when the user opens your interface.
 * It exports mount() and unmount() functions that the dashboard calls.
 *
 * Replace the example UI with your own interface logic.
 */

/**
 * Called when the user opens this interface from the dashboard launcher.
 *
 * @param {HTMLElement} container - The DOM element to render into (full screen).
 * @param {Object} config - Runtime configuration.
 * @param {string} config.chalie_host - Chalie backend URL.
 * @param {string} config.access_key - Authentication key for Chalie API.
 * @param {string} config.daemon_host - This interface's daemon URL.
 */
export function mount(container, config) {
  // Store config for later use
  container._interfaceConfig = config;

  // Your UI initialization here
  // For now, just update the status text
  const statusEl = container.querySelector("#statusText");
  if (statusEl) {
    statusEl.textContent = `Connected to ${config.chalie_host}`;
  }

  // Example: fetch data from your daemon
  // fetch(`${config.daemon_host}/some-endpoint`)
  //   .then(r => r.json())
  //   .then(data => renderYourUI(container, data));

  // Example: fetch user context from Chalie
  // fetch(`${config.chalie_host}/api/query/context`, {
  //   headers: { 'Authorization': `Bearer ${config.access_key}` }
  // })
  //   .then(r => r.json())
  //   .then(ctx => console.log('User location:', ctx.location));

  console.log("[ExampleInterface] Mounted");
}

/**
 * Called when the user navigates away from this interface.
 * Clean up timers, listeners, and any state.
 *
 * @param {HTMLElement} container - The same container passed to mount().
 */
export function unmount(container) {
  // Clean up: stop intervals, remove event listeners, etc.
  delete container._interfaceConfig;
  console.log("[ExampleInterface] Unmounted");
}
