import { Configuration, OpenAIApi } from "openai";
import { countTokens } from "./countTokens";
const chalk = require('chalk');;

export type GptChat = {
  role: "system" | "user" | "assistant",
  content: string,
}

export async function chatComplete(convo: GptChat[], opts?: {
  temperature?: number;
  gpt4?: boolean;
}) {
  const rawText = convo.map((x) => x.content).join("\n");
  const tokenCount = countTokens(rawText);
  const tokensLeft = 3950 - tokenCount;
  if (tokensLeft < 0) {
    throw new Error("Prompt is too long");
  }

  console.log(chalk.cyan("<CONVO>"))
  convo.forEach((chat, i) => {
    console.log(chalk[chat.role === "user" ? "green" : "yellow"](`${i + 1}. ${chat.role}: ${chat.content}\n\n`))
  })
  console.log(chalk.cyan("</CONVO>"))

  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);
  const response = await openai.createChatCompletion({
    model: opts?.gpt4 ? "gpt-4" : "gpt-3.5-turbo",
    messages: convo,
    temperature: opts?.temperature,
    max_tokens: tokensLeft
  });

  if (!response.data.choices[0]?.message?.content) {
    throw new Error("OpenAI did not respond");
  }

  const answer = response.data.choices[0].message.content

  console.log(chalk.cyan("<GPT ANSWER>"))
  console.log(answer)
  console.log(chalk.cyan("</GPT ANSWER>"))

  return answer;
}
