import "server-only";

export type OpenAIConfiguration = {
  apiKey: string;
  model: string;
};

export type ExaConfiguration = {
  apiKey: string;
};

export function getOpenAIConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): OpenAIConfiguration | undefined {
  const apiKey = environment.OPENAI_API_KEY?.trim();
  if (!apiKey) return undefined;

  return {
    apiKey,
    model: environment.OPENAI_MODEL?.trim() || "gpt-5.6",
  };
}

export function getExaConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): ExaConfiguration | undefined {
  const apiKey = environment.EXA_API_KEY?.trim();
  return apiKey ? { apiKey } : undefined;
}
