const chalk = require('chalk');;
import { exec } from "child_process";
import { randomUUID } from "crypto";
import { mkdir, rm, writeFile } from "fs/promises";
import { promisify } from "util";
import getCsvInfo, { CsvInfo } from "./getCsvInfo";

const execAsync = promisify(exec);

export async function runPython(code: string, csvInfo: CsvInfo) {

  const foldername = randomUUID().replace("-", '').slice(0, 8)
  const imagename = randomUUID().replace("-", '').slice(0, 8)
  const containername = randomUUID().replace("-", '').slice(0, 8)
  await mkdir(`tmp/${foldername}`)

  await writeFile(`tmp/${foldername}/script.py`, generateScript(code), { flag: "w" });
  await writeFile(`tmp/${foldername}/Dockerfile`, generateDockerfile(foldername, csvInfo), { flag: "w" });

  const scriptOutput = await execAsync(
    `./runInDocker.sh tmp/${foldername}/Dockerfile ${imagename} ${containername}`,
    {
      maxBuffer: 1024 * 40000,
    }
  );
  await rm(`tmp/${foldername}`, { recursive: true, force: true })

  console.log(chalk.cyan("<DOCKER RAW>"))
  console.log(scriptOutput.stdout + "\n" + scriptOutput.stderr)
  console.log(chalk.cyan("</DOCKER RAW>"))

  if (scriptOutput.stdout.includes("===== SCRIPT ERROR =====")) {
    return { error: (scriptOutput.stdout.split("===== SCRIPT ERROR =====")[1]?.split("===== SCRIPT OUTPUT =====")[0]?.trim() ?? "") }
  }

  const pythonOutput = scriptOutput.stdout.split("===== SCRIPT OUTPUT =====")[1]?.trim() ?? ""

  return { output: pythonOutput };
}

function generateScript(script: string) {
  return `def print_table(df, columns):
  print("=====")
  print("TABLE")
  print(df[columns].to_csv(index=False))
  print("=====")


def print_bar(df, xcol, ycol, *args):
  print("=====")
  print(f"BAR-----{xcol}-----{ycol}")
  print(df[[xcol, ycol]].to_csv(index=False))
  print("=====")


def print_line(df, xcol, ycol, *args):
  print("=====")
  print(f"LINE-----{xcol}-----{ycol}")
  print(df[[xcol, ycol]].to_csv(index=False))
  print("=====")


def print_pie(df, xcol, ycol, *args):
  print("=====")
  print(f"PIE-----{xcol}-----{ycol}")
  print(df[[xcol, ycol]].to_csv(index=False))
  print("=====")

print("===== SCRIPT OUTPUT =====")
try:
${script.split("\n").reduce((acc, line) => acc + "  " + line + "\n", "")}
except Exception as e:
  print("===== SCRIPT ERROR =====")
  print(e)
print("===== SCRIPT OUTPUT =====")
`
}

function generateDockerfile(folder: string, csvInfo: CsvInfo) {
  return `FROM amancevice/pandas

COPY tmp/${folder}/script.py /app/

${csvInfo.csvs.reduce((acc, cur, i) => {
    acc += `
ARG src${i}="${cur.filepath.replace("\"", "\\\"")}"
ARG target${i}="/app/${cur.filename.replace("\"", "\\\"")}"
COPY \${src${i}} \${target${i}}
`
    return acc
  }, "")}

WORKDIR /app

CMD ["python", "script.py"]
`
}