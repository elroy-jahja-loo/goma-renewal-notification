import { Injectable, InternalServerErrorException } from '@nestjs/common';
import OpenAI from 'openai';
import {
  RENEWAL_REMINDER_SYSTEM_PROMPT,
  buildRenewalUserPrompt,
} from './prompts/renewal-reminder.prompt';

@Injectable()
export class AiService {
  private readonly openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateMessage(data: {
    adviserName: string;
    clientName: string;
    policyName: string;
    renewalDate: string;
    premium: number | null;
  }): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 300,
        messages: [
          { role: 'system', content: RENEWAL_REMINDER_SYSTEM_PROMPT },
          { role: 'user', content: buildRenewalUserPrompt(data) },
        ],
      });

      return response.choices[0].message.content!.trim();
    } catch (error) {
      throw new InternalServerErrorException(
        `AI message generation failed: ${(error as Error).message}`,
      );
    }
  }
}
