/** Real skills plugin dependencies over isolated test directories. */

import { Layer, type PlatformError } from "effect";

import agentLoop from "@liminal/agent-loop";
import context from "@liminal/context";
import inbox from "@liminal/inbox";
import modelCatalog from "@liminal/model-catalog";
import modelScripted from "@liminal/model-scripted";
import models from "@liminal/models";
import notices from "@liminal/notices";
import type { BaseServices } from "@liminal/sdk";
import { serverOf, testBaseServices } from "@liminal/sdk/testing";
import sessionLog from "@liminal/session-log";
import sessionStore from "@liminal/session-store";
import settingsPlugin from "@liminal/settings";
import tools from "@liminal/tools";

import skills from "../plugin.ts";

export const managementStack = (base: Layer.Layer<BaseServices, PlatformError.PlatformError>) =>
  serverOf(skills).pipe(
    Layer.provideMerge(serverOf(notices)),
    Layer.provideMerge(serverOf(inbox)),
    Layer.provideMerge(serverOf(agentLoop)),
    Layer.provideMerge(serverOf(tools)),
    Layer.provideMerge(serverOf(context)),
    Layer.provideMerge(serverOf(modelScripted)),
    Layer.provideMerge(serverOf(models)),
    Layer.provideMerge(serverOf(modelCatalog)),
    Layer.provideMerge(serverOf(sessionLog)),
    Layer.provideMerge(serverOf(sessionStore)),
    Layer.provideMerge(serverOf(settingsPlugin)),
    Layer.provideMerge(base),
  );

export const stack = managementStack(testBaseServices);
