import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export default async function runPyScript(scriptpath: string, args: string[]) {
    const res = await execAsync('env/bin/python ' + scriptpath + " " + args.join(" "));
    if (res.stderr?.trim().startsWith("Error:")) {
        console.log("py script error")
        throw res.stderr;
    }
    else {
        return res.stdout.split("=====PYSCRIPT_OUTPUT=====")[1]?.split("=====PYSCRIPT_OUTPUT=====")[0]?.trim() ?? "";
    }
}