/**
 * Proof that `passk/agent-types` still describes this repo's agent loop.
 *
 * The published contract is a hand-written .d.ts with no runtime, so nothing
 * would otherwise notice if the interface here grew a field or the SDK changed
 * a signature. These two assertions fail `npm run typecheck` the moment the
 * two drift in a way that matters:
 *
 *   · what passk passes an agent must satisfy the published options;
 *   · what a published agent returns must satisfy what passk consumes.
 *
 * Types only: this module emits nothing and is imported by nothing.
 */
import type { AgentRunOptions as PublishedOptions, AgentRunOutput as PublishedOutput } from "../../agent-types/index.js";
import type { AgentRunOptions, AgentRunOutput } from "./index.js";

type Assert<T extends true> = T;

/** The checks are stripped before a custom agent is called (see custom.ts), which is why they are absent from the published options. */
type _optionsAreHonest = Assert<Omit<AgentRunOptions, "checks"> extends PublishedOptions ? true : false>;
type _outputIsEnough = Assert<PublishedOutput extends AgentRunOutput ? true : false>;
