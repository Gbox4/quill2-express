import { get_encoding } from "@dqbd/tiktoken";

const enc = get_encoding("gpt2");

export function countTokens(s: string) {
  return enc.encode(s).length;
}
