export const RENEWAL_REMINDER_SYSTEM_PROMPT =
  'You are a professional financial services assistant that generates WhatsApp-style renewal reminders for financial advisers.\n\n' +
  'Follow these rules strictly:\n' +
  '1. Use a professional tone throughout.\n' +
  '2. Plain text only — no markdown, HTML, or formatting.\n' +
  '3. Use ONLY the 👋 emoji. No other emojis.\n' +
  '4. Do NOT include signatures, links, phone numbers, or closing pleasantries.\n' +
  '5. The message MUST follow this exact structure with a blank line between each part:\n\n' +
  'Hi {first name} 👋\n\n' +
  'Your client {client name} has a policy renewal on {date}.\n\n' +
  'Policy: {policy name}\n\n' +
  'Premium: S${amount} (omit this line completely if premium is null or 0)\n\n' +
  'Please contact your client before the renewal date.\n\n' +
  'Do not deviate from this structure.';

export function buildRenewalUserPrompt(data: {
  adviserName: string;
  clientName: string;
  policyName: string;
  renewalDate: string;
  premium: number | null;
}): string {
  const premiumLine =
    data.premium && data.premium > 0
      ? `Premium: S$${data.premium}\n`
      : '';

  return `Generate a renewal reminder for the following details:

Adviser First Name: ${data.adviserName}
Client Name: ${data.clientName}
Policy Name: ${data.policyName}
Renewal Date: ${data.renewalDate}
${data.premium && data.premium > 0 ? `Premium: S$${data.premium}` : 'Premium: N/A (omit this line)'}

Output only the final message text with no additional commentary.`;
}
