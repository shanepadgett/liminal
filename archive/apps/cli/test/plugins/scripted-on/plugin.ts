/** The scripted provider, enabled, so a kernel booted for a test can run turns without a network. */

import modelScripted from "@liminal/model-scripted";

export default { ...modelScripted, name: "scripted-on", enabledByDefault: true };
