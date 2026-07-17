import { Injectable, Logger } from '@nestjs/common';
import { AiProviderCode } from '@prisma/client';
import { ValidationError } from '../../domain/errors';
import {
  AiCompletionParams,
  AiCompletionResult,
} from '../../domain/interfaces/ai-provider.interface';
import { aiRequestTimeoutMs, MAX_OUTPUT_TOKENS } from './ai.defaults';

@Injectable()
export class LlmClient {
  private readonly logger = new Logger(LlmClient.name);

  async complete(
    provider: AiProviderCode,
    apiKey: string,
    model: string,
    params: AiCompletionParams & {
      messages?: { role: 'user' | 'assistant' | 'system'; content: string }[];
    },
  ): Promise<AiCompletionResult> {
    const timeout = aiRequestTimeoutMs();
    if (provider === AiProviderCode.ANTHROPIC) {
      return this.anthropic(apiKey, model, params, timeout);
    }
    return this.openai(apiKey, model, params, timeout);
  }

  private async openai(
    apiKey: string,
    model: string,
    params: AiCompletionParams & {
      messages?: { role: 'user' | 'assistant' | 'system'; content: string }[];
    },
    timeout: number,
  ): Promise<AiCompletionResult> {
    const messages =
      params.messages ??
      ([
        ...(params.systemPrompt
          ? [{ role: 'system' as const, content: params.systemPrompt }]
          : []),
        { role: 'user' as const, content: params.prompt },
      ] as { role: string; content: string }[]);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: params.temperature ?? 0.4,
          max_tokens: params.maxTokens ?? MAX_OUTPUT_TOKENS,
        }),
        signal: controller.signal,
      });
      const json = (await res.json()) as {
        error?: { message?: string };
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        model?: string;
      };
      if (!res.ok) {
        throw new ValidationError(
          json.error?.message || `OpenAI error ${res.status}`,
        );
      }
      const text = json.choices?.[0]?.message?.content?.trim() || '';
      if (!text) throw new ValidationError('Empty model response');
      return {
        text,
        model: json.model || model,
        usage: {
          promptTokens: json.usage?.prompt_tokens ?? 0,
          completionTokens: json.usage?.completion_tokens ?? 0,
        },
      };
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      this.logger.warn(`OpenAI request failed: ${(err as Error).message}`);
      throw new ValidationError('AI provider request failed');
    } finally {
      clearTimeout(timer);
    }
  }

  private async anthropic(
    apiKey: string,
    model: string,
    params: AiCompletionParams & {
      messages?: { role: 'user' | 'assistant' | 'system'; content: string }[];
    },
    timeout: number,
  ): Promise<AiCompletionResult> {
    const chat =
      params.messages?.filter((m) => m.role !== 'system') ??
      [{ role: 'user' as const, content: params.prompt }];
    const system =
      params.systemPrompt ||
      params.messages?.find((m) => m.role === 'system')?.content;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: params.maxTokens ?? MAX_OUTPUT_TOKENS,
          system: system || undefined,
          messages: chat.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
        }),
        signal: controller.signal,
      });
      const json = (await res.json()) as {
        error?: { message?: string };
        content?: { type?: string; text?: string }[];
        usage?: { input_tokens?: number; output_tokens?: number };
        model?: string;
      };
      if (!res.ok) {
        throw new ValidationError(
          json.error?.message || `Anthropic error ${res.status}`,
        );
      }
      const text =
        json.content
          ?.filter((c) => c.type === 'text')
          .map((c) => c.text || '')
          .join('\n')
          .trim() || '';
      if (!text) throw new ValidationError('Empty model response');
      return {
        text,
        model: json.model || model,
        usage: {
          promptTokens: json.usage?.input_tokens ?? 0,
          completionTokens: json.usage?.output_tokens ?? 0,
        },
      };
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      this.logger.warn(`Anthropic request failed: ${(err as Error).message}`);
      throw new ValidationError('AI provider request failed');
    } finally {
      clearTimeout(timer);
    }
  }
}
