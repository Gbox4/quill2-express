const chalk = require('chalk');;
import express from 'express';
import { z } from 'zod';
import { asyncHandler } from '~/lib/asyncHandler';
import { GptChat, chatCompleteStream } from '~/lib/chatComplete';
import { countTokens } from '~/lib/countTokens';
import { prisma } from '~/lib/db';
import getCsvInfo from '~/lib/getCsvInfo';
import { runPython } from '~/lib/runPython';

const router = express.Router();

router.get('/create', asyncHandler(async (req, res) => {
  const schema = z.object({
    sessionToken: z.string(),
    filenames: z.string(),
    gpt4: z.enum(["true", "false"]).transform((value) => value === "true")
  });
  const body = schema.parse(req.query);
  const session = await prisma.session.findFirstOrThrow({
    where: { token: body.sessionToken },
    select: { user: { select: { teamId: true, id: true } } }
  })
  const csvInfo = await getCsvInfo(body.filenames.split("=====QUILL_CHUNK====="), session.user.teamId)

  const questionChain = await prisma.questionChain.create({
    data: {
      filenames: body.filenames,
      userId: session.user.id,
      name: new Date().toLocaleString(),
      filesDesc: csvInfo.descStr,
      gpt4: body.gpt4
    }
  })

  res.json({ id: questionChain.id })
}))

router.get('/settings', asyncHandler(async (req, res) => {
  const schema = z.object({
    sessionToken: z.string(),
    filenames: z.string(),
    gpt4: z.enum(["true", "false"]).transform((value) => value === "true"),
    id: z.coerce.number()
  });

  const body = schema.parse(req.query);
  console.log(body)
  const session = await prisma.session.findFirstOrThrow({
    where: { token: body.sessionToken },
    select: { user: { select: { teamId: true, id: true } } }
  })
  const csvInfo = await getCsvInfo(body.filenames.split("=====QUILL_CHUNK====="), session.user.teamId)

  await prisma.questionChain.updateMany({
    where: {
      id: body.id,
      userId: session.user.id
    },
    data: {
      filenames: body.filenames,
      userId: session.user.id,
      name: new Date().toLocaleString(),
      filesDesc: csvInfo.descStr,
      gpt4: body.gpt4
    }
  })

  res.json({ descStr: csvInfo.descStr })
}))

router.get('/start', asyncHandler(async (req, res) => {
  const schema = z.object({
    sessionToken: z.string(),
    id: z.coerce.number()
  });
  const body = schema.parse(req.query);
  const session = await prisma.session.findFirstOrThrow({
    where: { token: body.sessionToken },
    select: { user: { select: { teamId: true, id: true } } }
  })

  const questionChain = await prisma.questionChain.findFirstOrThrow({
    where: {
      id: body.id,
      userId: session.user.id
    }
  })

  // Create questionChain
  const csvInfo = await getCsvInfo(questionChain.filenames.split("=====QUILL_CHUNK====="), session.user.teamId)

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
  await chatCompleteStream(convo, res, {
    temperature: 0,
    gpt4: questionChain.gpt4,
    onFinish: async (final) => {
      await prisma.questionChain.update({
        where: { id: questionChain.id },
        data: { startingText: final }
      })
    }
  })

  return
}))

// Continue route
router.get('/continue', asyncHandler(async (req, res) => {

  // Handle input
  const schema = z.object({
    question: z.string().max(6000),
    sessionToken: z.string(),
    questionChainId: z.coerce.number(),
    replyQuestionIds: z.string().optional(), // delimmed by ,
  });
  const body = schema.parse(req.query);
  const session = await prisma.session.findFirstOrThrow({
    where: { token: body.sessionToken },
    select: { user: { select: { teamId: true, id: true } } }
  })
  const replyQuestionIds = body.replyQuestionIds?.split(",").map(x => parseInt(x))

  // Make sure questionChain exists
  const questionChain = (await prisma.questionChain.findFirstOrThrow({
    where: { id: body.questionChainId, userId: session.user.id }, include: {
      questions: {
        where: {
          loading: false,
          archived: false,
          id: replyQuestionIds ? { in: replyQuestionIds } : undefined
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

  // Validate all replyQuestionIds
  if (replyQuestionIds && questionChain.questions.length !== replyQuestionIds.length) {
    throw 'Bad replyQuestionIds'
  }

  // Create new question
  const question = await prisma.question.create({
    data: {
      text: body.question,
      loading: true,
      questionChainId: questionChain.id,
    }
  })

  try {
    console.log("generating answer...")
    // Get CSV data
    const csvInfo = await getCsvInfo(questionChain.filenames.split("=====QUILL_CHUNK====="), session.user.teamId)

    // Build conversation
    const convoStart: GptChat[] = [{ role: "system", content: "You write code and you never, ever apologize." },
    {
      role: "user", content: `MESSAGE FROM SYSTEM:

The user has uploaded the following files:
${csvInfo.descStr}

Current date: ${new Date().toISOString().split('T')[0]}. I want you to act as a Python script generator. Every time I ask a question, write a complete python script that will print the answer to my question. Print in csv format, with any relevant columns. Comment your logic. Describe what you are going to do, then write the script enclosed a code block \`\`\`.

Remember:
- Write a complete python script in each code block.
- Only output in CSV format. Do not use matplotlib or any such library. The only way you are allowed to output data is by printing a CSV string.`}
    ]

    const convoMid: GptChat[] = []

    const convoEnd: GptChat[] = [
      {
        role: "user",
        content: body.question
      }]

    let currentTokens = countTokensConvo(convoStart) + countTokensConvo(convoEnd)

    let tokensTotal = questionChain.gpt4 ? 7000 : 15000

    for (let i = 0; i < questionChain.questions.length; i++) {
      const question = questionChain.questions[i]!;
      let newTokens = countTokens(question.rawAnswer) + countTokens(question.text)
      if (currentTokens + newTokens > tokensTotal) {
        break;
      }
      currentTokens += newTokens
      convoMid.push({ role: "assistant", content: question.rawAnswer })
      convoMid.push({ role: "user", content: question.text })
    }

    // const convoExamples: GptChat[] = []

    // // TODO: setup examples
    // const examples = [] as string[]
    // for (let i = 0; i < examples.length; i += 2) {
    //   const question = examples[i]
    //   const answer = examples[i + 1]

    //   if (!answer || !question) {
    //     console.log(chalk.red("Invalid example."))
    //     break
    //   }

    //   let newTokens = countTokens(question) + countTokens(answer)
    //   if (currentTokens + newTokens > tokensTotal) {
    //     break;
    //   }
    //   currentTokens += newTokens
    //   convoExamples.push({ role: "assistant", content: answer })
    //   convoExamples.push({ role: "user", content: question })
    // }

    const convoExamples: GptChat[] = [{
      role: "user",
      content: "Show all data."
    }, {
      role: "assistant",
      content: `Sure! I'll show you the entire dataset:

\`\`\`
import pandas as pd

# Load the csv
data = pd.read_csv('data.csv')
# Display to user
print(data.to_csv(index=False))
\`\`\``
    }, {
      role: "user", content: "Are there any trends or patterns in the data that can be identified?"
    }, {
      role: "assistant",
      content: `import pandas as pd

# Load the csv
data = pd.read_csv('finviz-2023-06-10.csv')

# Select only the numerical columns
numerical_cols = data.select_dtypes(include=['float64', 'int64'])

# Calculate the correlation matrix
corr_matrix = numerical_cols.corr()

# Print the correlation matrix in CSV format
print(corr_matrix.to_csv())
`}, 
// {
//   role: "user", content: "Are there any trends or patterns in the data that can be identified?"
// }, {
//   role: "assistant",
//   content: `import pandas as pd

// # Load the csv
// data = pd.read_csv('finviz-2023-06-10.csv')

// # Select only the numerical columns
// numerical_cols = data.select_dtypes(include=['float64', 'int64'])

// # Calculate the correlation matrix
// corr_matrix = numerical_cols.corr()

// # Print the correlation matrix in CSV format
// print(corr_matrix.to_csv())
// `}
    ]

    convoMid.reverse()
    // convoExamples.reverse()

    let convo = [...convoExamples, ...convoStart, ...convoMid, ...convoEnd]
    // const tokenCount = countTokensConvo(convo)

    await chatCompleteStream(convo, res, {
      temperature: 0,
      gpt4: questionChain.gpt4,
      onError: async (msg) => {
        console.log(msg)
        await prisma.question.update({
          where: {
            id: question.id
          },
          data: {
            loading: false,
            error: msg,
          }
        })
      },
      onFinish: async (answer) => {
        try {
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
      }

    })
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

// // Get full answer for a question
// router.post('/full', asyncHandler(async (req, res) => {
//   // Handle input
//   const schema = z.object({
//     sessionToken: z.string(),
//     questionId: z.number(),
//     codeIndex: z.number()
//   });
//   const body = schema.parse(req.body);
//   const session = await prisma.session.findFirstOrThrow({
//     where: { token: body.sessionToken },
//     select: { user: { select: { teamId: true, id: true } } }
//   })
//   const question = await prisma.question.findFirstOrThrow({
//     where: {
//       id: body.questionId, questionChain: {
//         userId: session.user.id
//       }
//     }
//   })
//   const csvInfo = await getCsvInfo(question.filenames.split("\n=====\n"), session.user.teamId)

//   const parsed = parseAnswer(question.rawAnswer).filter(x => x.type === "code")

//   const selectedCode = parsed[body.codeIndex]
//   if (!selectedCode) throw 'Bad code index'

//   const rawCode = selectedCode.value
//   const { output, error } = await runPython(selectedCode.value, csvInfo)

//   let answer = ""
//   if (output) {
//     answer = "\n=====QUILL_CHUNK=====\n"
//       + "\n<CODE>\n" + rawCode + "\n</CODE>\n"
//       + "\n<OUTPUT>\n" + output + "\n</OUTPUT>\n"
//       + "\n=====QUILL_CHUNK=====\n"
//   } else if (error) {
//     answer = "\n=====QUILL_CHUNK=====\n"
//       + "\n<CODE>\n" + rawCode + "\n</CODE>\n"
//       + "\n<ERROR>\n" + error + "\n</ERROR>\n"
//       + "\n=====QUILL_CHUNK=====\n"
//   }

//   res.json({ answer })

//   return
// }));

export default router
