import runPyScript from "./runPyScript";

export async function getCsvInfo(filenames: string[], teamId: number) {
    const csvs = [] as { filepath: string, filename: string, colDesc: string }[]

    filenames = filenames.filter(x => x.length > 0)
    console.log(filenames)

    for (let i = 0; i < filenames.length; i++) {
        const filename = filenames[i];
        const filepath = getCsvPath(filename, teamId)
        const colDesc = await runPyScript("pyscripts/csvCols.py", [filepath], true)

        console.log(colDesc)

        csvs.push({ colDesc, filename, filepath })
    }

    const descStr = csvs.reduce((acc, cur, i) => {
        acc += `\n\n[${i + 1}]: \`${cur.filename}\`\nDescription of columns with name, type, and example:\n${cur.colDesc}`
        return acc
    }, "")

    return { csvs, descStr }
}

export type CsvInfo = Awaited<ReturnType<typeof getCsvInfo>>

export function getCsvPath(filename: string, teamId: number) {
    return (
        (filename.startsWith("common-")) ?
            `data/common/${filename}`
            :
            `data/${teamId}/${filename}`
    )
}