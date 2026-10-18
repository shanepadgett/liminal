/**
 * Reload offers other plugins only its name: it reads the kernel's `kernel/reload` state and sends
 * `kernel/reload-now`, both in `KernelRpcs`.
 */

/** The plugin's name, as the kernel reports its status. */
export const reloadPlugin = "reload";
