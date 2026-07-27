import "server-only";

export type OpenAIConfiguration = {
  apiKey: string;
  model: string;
};

export type ExaConfiguration = {
  apiKey: string;
};

export function getOpenAIModel(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  return environment.OPENAI_MODEL?.trim() || "gpt-5.6";
}
