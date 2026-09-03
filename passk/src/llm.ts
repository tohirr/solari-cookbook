/**
 * Provider switch. passk benches an agent, so the model behind it is a knob,
 * not a dependency: set PASSK_PROVIDER=anthropic|openai (auto-detected from
 * whichever key is present) and both the agent loop and the judge calls follow.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { config } from "./config.js";

export type Provider = "anthropic" | "openai";

let anthropicClient: Anthropic | undefined;
let openaiClient: OpenAI | undefined;
export const anthropic = () => (anthropicClient ??= new Anthropic({ apiKey: config.anthropicApiKey }));
export const openai = () => (openaiClient ??= new OpenAI({ apiKey: config.openaiApiKey }));

export interface StructuredRequest<S extends z.ZodTypeAny> {
  /** Short identifier for the schema (OpenAI requires one). */
  name: string;
  schema: S;
  prompt: string;
  /** PNG images shown before the prompt, in order. */
  images?: Uint8Array[];
  maxTokens?: number;
}

/** One vision + structured-output call, on whichever provider is configured. */
export async function structured<S extends z.ZodTypeAny>(req: StructuredRequest<S>): Promise<z.infer<S> | null> {
  const images = req.images ?? [];
  if (config.provider === "scripted") {
    // A canned answer shaped to whichever schema asked. Enough to exercise the plumbing.
    const canned: Record<string, unknown> = {
      judgement: { passed: false, reason: "scripted judge" },
      failure_analysis: { cause: "behavior_variability", confidence: "low", explanation: "scripted classifier: no model was consulted" },
      probe: { interpretation: "scripted", ambiguities: [], risk: "low" },
    };
    return (canned[req.name] as z.infer<S>) ?? null;
  }
  if (config.provider === "openai") {
    const res = await withProviderRetry(() => openai().responses.parse({
      model: config.model,
      max_output_tokens: req.maxTokens ?? 3000,
      input: [{
        role: "user",
        content: [
          ...images.map((png) => ({ type: "input_image" as const, image_url: dataUrl(png), detail: "auto" as const })),
          { type: "input_text" as const, text: req.prompt },
        ],
      }],
      text: { format: zodTextFormat(req.schema, req.name) },
    }));
    return (res.output_parsed as z.infer<S> | null) ?? null;
  }

  const res = await withProviderRetry(() => anthropic().messages.parse({
    model: config.model,
    max_tokens: req.maxTokens ?? 3000,
    messages: [{
      role: "user",
      content: [
        ...images.map((png) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/png" as const, data: b64(png) } })),
        { type: "text" as const, text: req.prompt },
      ],
    }],
    output_config: { format: zodOutputFormat(req.schema) },
  }));
  return (res.parsed_output as z.infer<S> | null) ?? null;
}

/**
 * Is this error the model provider's fault (rate limit, outage, network) rather
 * than a bad request? Both SDKs expose typed errors; a status code is the
 * fallback for anything wrapped.
 */
export function isProviderError(err: unknown): boolean {
  if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) return true;
  if (err instanceof OpenAI.RateLimitError || err instanceof OpenAI.InternalServerError || err instanceof OpenAI.APIConnectionError) return true;
  const status = (err as { status?: number })?.status;
  if (status === 429 || (status !== undefined && status >= 500)) return true;
  return /ECONNRESET|ETIMEDOUT|socket hang up|fetch failed|Connection error/i.test(String((err as Error)?.message));
}

/** Bounded retries with exponential backoff and jitter, for provider-side failures only. */
export async function withProviderRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isProviderError(err) || i >= attempts) throw err;
      const wait = Math.min(30_000, 1500 * 2 ** (i - 1)) * (0.75 + Math.random() * 0.5);
      console.warn(`provider error (${(err as Error).message.slice(0, 80)}); retry ${i}/${attempts - 1} in ${Math.round(wait / 1000)}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

export const b64 = (png: Uint8Array) => Buffer.from(png).toString("base64");
export const dataUrl = (png: Uint8Array) => `data:image/png;base64,${b64(png)}`;
