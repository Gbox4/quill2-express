import { get_encoding } from "@dqbd/tiktoken";
import { GptChat } from "./chatComplete";

const enc = get_encoding("gpt2");

export function countTokens(s: string) {
  return enc.encode(s).length;
}

export function countTokensConvo(convo: GptChat[]) {
  const raw = convo.map((x) => x.content).join("\n");

  return countTokens(raw)
}