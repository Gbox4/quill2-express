import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export default async function runPyScript(scriptpath: string, args: string[], verbose = false) {
    const res = await execAsync('env/bin/python ' + scriptpath + " " + args.map(x => `'${x.replaceAll("'", "\\'")}'`).join(" "));

    if (verbose) {
        console.log(res)
    }

    if (res.stderr?.trim().startsWith("Error:")) {
        console.log("py script error")
        throw res.stderr;
    }
    else {
        return res.stdout.split("=====PYSCRIPT_OUTPUT=====")[1]?.split("=====PYSCRIPT_OUTPUT=====")[0]?.trim() ?? "";
    }
}