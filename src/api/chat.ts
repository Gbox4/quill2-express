const chalk = require('chalk');;
import express from 'express';
import { rm } from 'fs/promises';
import { z } from 'zod';
import { asyncHandler } from '~/lib/asyncHandler';
import { GptChat, chatComplete } from '~/lib/chatComplete';
import { countTokens } from '~/lib/countTokens';
import { prisma } from '~/lib/db';
import getCsvInfo from '~/lib/getCsvInfo';
import runPyScript from '~/lib/runPyScript';
import { runPython } from '~/lib/runPython';

const router = express.Router();


// Create route
router.post('/create', asyncHandler(async (req, res) => {
  // Handle input
  const schema = z.object({
    sessionToken: z.string(),
    filenames: z.string().array().min(1),
    gpt4: z.boolean().optional()
  });
  const body = schema.parse(req.body);
  const session = await prisma.session.findFirstOrThrow({
    where: { token: body.sessionToken },
    select: { user: { select: { teamId: true, id: true } } }
  })

  // Create questionChain
  const csvInfo = await getCsvInfo(body.filenames, session.user.teamId)
  const questionChain = await prisma.questionChain.create({
    data: {
      name: new Date().toLocaleString(),
      userId: session.user.id,
    }
  })

  // Send off response
  res.json({ id: questionChain.id })

  // Generate starting text
  const convo = [{ role: "system", content: "You are a helpful assistant." },
  {
    role: "user", content: `MESSAGE FROM SYSTEM:

The user has uploaded the following files:
${csvInfo.descStr}

You are an assistant who can help analyze the data.

Start the conversation by doing a few things:
- Acknowledge the files uploaded
- Suggest some questions they might ask about the data

Your conversation with the user begins now.`}
  ] as GptChat[]

  // Update questionChain
  const startingText = await chatComplete(convo, { temperature: 0, gpt4: body.gpt4 })
  await prisma.questionChain.update({
    where: { id: questionChain.id },
    data: { startingText }
  })
  return
}));

// Continue route
router.post('/continue', asyncHandler(async (req, res) => {

  // Handle input
  const schema = z.object({
    question: z.string().max(6000),
    sessionToken: z.string(),
    filenames: z.string().array(),
    questionChainId: z.number(),
    replyQuestionId: z.number().optional(),
    gpt4: z.boolean().optional()
  });
  const body = schema.parse(req.body);
  const session = await prisma.session.findFirstOrThrow({
    where: { token: body.sessionToken },
    select: { user: { select: { teamId: true, id: true } } }
  })

  // Make sure questionChain exists
  const questionChain = (await prisma.questionChain.findFirstOrThrow({
    where: { id: body.questionChainId, userId: session.user.id }, include: {
      questions: {
        where: {
          loading: false,
          archived: false,
          id: body.replyQuestionId ? { lte: body.replyQuestionId } : undefined
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          rawAnswer: true,
          text: true,
          createdAt: true,
          id: true
        }
      },
    }
  }))

  // Create new question
  const question = await prisma.question.create({
    data: {
      text: body.question,
      loading: true,
      questionChainId: questionChain.id,
      filenames: body.filenames.join("\n=====\n")
    }
  })

  // Send response
  res.json({ id: questionChain.id });

  try {
    console.log("generating answer...")
    // Get CSV data
    const csvInfo = await getCsvInfo(body.filenames, session.user.teamId)

    // Build conversation
    const convoStart: GptChat[] = [{ role: "system", content: "You are a helpful assistant." },
    {
      role: "user", content: `MESSAGE FROM SYSTEM:

The user has uploaded the following files:
${csvInfo.descStr}

You have access to the following functions if needed:
\`\`\`
print_table(df, columns)
print_bar(df, xcol, ycol)
print_line(df, xcol, ycol)
print_pie(df, xcol, ycol)
\`\`\`

DO NOT USE MATPLOTLIB OR ANY OTHER LIBRARY. ONLY USE THE FUNCTIONS PROVIDED ABOVE.

IMPORT PANDAS EVERY TIME. WRITE THE COMPLETE SCRIPT EVERY TIME.

Today is ${new Date().toISOString().split('T')[0]}.

Your job is to write python scripts to answer the user's requests. Write code by using the code block token: \`\`\``}
    ]

    const convoMid: GptChat[] = []

    const convoEnd: GptChat[] = [
      {
        role: "user",
        content: body.question
      }]

    let currentTokens = countTokensConvo(convoStart) + countTokensConvo(convoEnd)
    let tokensBuffer = 500 // 500 tokens for the answer
    let tokensTotal = 4000

    for (let i = 0; i < questionChain.questions.length; i++) {
      const question = questionChain.questions[i]!;
      let newTokens = countTokens(question.rawAnswer) + countTokens(question.text)
      if (currentTokens + newTokens + tokensBuffer > tokensTotal) {
        break;
      }
      currentTokens += newTokens
      convoMid.push({ role: "assistant", content: question.rawAnswer })
      convoMid.push({ role: "user", content: question.text })
    }

    const convoExamples: GptChat[] = []

    // TODO: setup examples
    const examples = [] as string[]
    for (let i = 0; i < examples.length; i += 2) {
      const question = examples[i]
      const answer = examples[i + 1]

      if (!answer || !question) {
        console.log(chalk.red("Invalid example."))
        break
      }

      let newTokens = countTokens(question) + countTokens(answer)
      if (currentTokens + newTokens + tokensBuffer > tokensTotal) {
        break;
      }
      currentTokens += newTokens
      convoExamples.push({ role: "assistant", content: answer })
      convoExamples.push({ role: "user", content: question })
    }

    convoMid.reverse()
    convoExamples.reverse()

    let convo = [...convoExamples, ...convoStart, ...convoMid, ...convoEnd]

    const answer = await chatComplete(convo, { temperature: 0 })

    // Parse gpt response
    console.log("parsing answer...")
    const chunks = parseAnswer(answer)

    // Run python code and format for frontend
    let formattedAnswer = ""
    for (const chunk of chunks) {
      if (chunk.type === 'text') {
        formattedAnswer += chunk.value
      } else {
        const rawCode = chunk.value
        const { output, error } = await runPython(chunk.value, csvInfo)

        if (output) {
          formattedAnswer += "\n=====QUILL_CHUNK=====\n"
            + "\n<CODE>\n" + rawCode + "\n</CODE>\n"
            + "\n<OUTPUT>\n" + output + "\n</OUTPUT>\n"
            + "\n=====QUILL_CHUNK=====\n"
        } else if (error) {
          formattedAnswer += "\n=====QUILL_CHUNK=====\n"
            + "\n<CODE>\n" + rawCode + "\n</CODE>\n"
            + "\n<ERROR>\n" + error + "\n</ERROR>\n"
            + "\n=====QUILL_CHUNK=====\n"
        }
      }
    }

    console.log("updating question...")
    await prisma.question.update({
      where: {
        id: question.id
      },
      data: {
        rawAnswer: answer,
        loading: false,
        answer: formattedAnswer,
      }
    })
    console.log("Done!")
    return
  } catch (e) {
    console.log(e)
    await prisma.question.update({
      where: {
        id: question.id
      },
      data: {
        loading: false,
        error: String(e),
      }
    })
  }
}));

function parseAnswer(raw: string) {
  raw = "\n" + raw + "\n"
  const chunks = raw.split(/\n```.*\n/g).map((x, i) => ({
    type: i % 2 === 0 ? "text" as const : "code" as const,
    value: x.trim(),
  })).filter(x => x.value.length > 0)
  return chunks
}

function countTokensConvo(convo: GptChat[]) {
  return convo.reduce((acc, cur) => {
    return acc + countTokens(cur.content)
  }, 0)
}

// Get full answer for a question
router.post('/full', asyncHandler(async (req, res) => {
  // Handle input
  const schema = z.object({
    sessionToken: z.string(),
    questionId: z.number(),
    codeIndex: z.number()
  });
  const body = schema.parse(req.body);
  const session = await prisma.session.findFirstOrThrow({
    where: { token: body.sessionToken },
    select: { user: { select: { teamId: true, id: true } } }
  })
  const question = await prisma.question.findFirstOrThrow({
    where: {
      id: body.questionId, questionChain: {
        userId: session.user.id
      }
    }
  })
  const csvInfo = await getCsvInfo(question.filenames.split("\n=====\n"), session.user.teamId)

  const parsed = parseAnswer(question.rawAnswer).filter(x => x.type === "code")

  const selectedCode = parsed[body.codeIndex]
  if (!selectedCode) throw 'Bad code index'

  const rawCode = selectedCode.value
  const { output, error } = await runPython(selectedCode.value, csvInfo)

  let answer = ""
  if (output) {
    answer = "\n=====QUILL_CHUNK=====\n"
      + "\n<CODE>\n" + rawCode + "\n</CODE>\n"
      + "\n<OUTPUT>\n" + output + "\n</OUTPUT>\n"
      + "\n=====QUILL_CHUNK=====\n"
  } else if (error) {
    answer = "\n=====QUILL_CHUNK=====\n"
      + "\n<CODE>\n" + rawCode + "\n</CODE>\n"
      + "\n<ERROR>\n" + error + "\n</ERROR>\n"
      + "\n=====QUILL_CHUNK=====\n"
  }

  res.json({ answer })

  return
}));

export default router
