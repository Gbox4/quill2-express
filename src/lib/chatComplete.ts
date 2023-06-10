import { Configuration, OpenAIApi } from "openai";
import { countTokens } from "./countTokens";
import { Response } from "express";
const chalk = require('chalk');;
import https from 'https';

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


export async function chatCompleteStream(convo: GptChat[], res: Response, opts?: {
  gpt4?: boolean,
  temperature?: number,
  onFinish?: (final: string) => void
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

  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Content-Type', 'text/event-stream');
  // res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders(); // flush the headers to establish SSE with client

  const openaiReq = https.request({
    hostname: "api.openai.com",
    port: 443,
    path: "/v1/chat/completions",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + process.env.OPENAI_API_KEY
    }
  }, function (openaiRes) {
    let final = ""

    openaiRes.on('data', (chunk) => {
      res.write(chunk)

      const lines = (chunk.toString() as string).split('\n').filter(line => line.trim() !== '');
      for (const line of lines) {
        // res.write(line)
        const message = line.replace(/^data: /, '');
        if (message === '[DONE]') {
          console.log("done")
          res.end(); // terminates SSE session
          return;
        } else {
          try {
            const parsed = JSON.parse(message);
            // console.log(parsed.choices[0].delta);
            if (parsed.choices[0].delta.content) {
              final += parsed.choices[0].delta.content
            }
          } catch (error) {
            console.error('Could not JSON parse stream message', message, error);
          }
        }
      }

    });
    openaiRes.on('end', () => {
      console.log('No more data in response.');
    });

    res.on('close', () => {
      console.log('client dropped me');
      res.end();
      openaiReq.destroy()
      console.log(chalk.cyan("<GPT ANSWER>"))
      console.log(final)
      console.log(chalk.cyan("</GPT ANSWER>"))
      if (opts?.onFinish) { opts.onFinish(final) }
    });
  })

  const body = JSON.stringify({
    model: opts?.gpt4 ? "gpt-4" : "gpt-3.5-turbo",
    messages: convo,
    temperature: opts?.temperature,
    max_tokens: tokensLeft,
    stream: true
  })

  openaiReq.on('error', (e) => {
    console.error("problem with request:" + e.message);
    openaiReq.destroy()
  });

  openaiReq.write(body)

  openaiReq.end()
}