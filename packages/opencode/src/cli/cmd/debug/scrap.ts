import { EOL } from "os"
import { Product } from "../../../product"
import { Log } from "../../../util/log"
import { cmd } from "../cmd"

export const ScrapCommand = cmd({
  command: "scrap",
  describe: "list all known projects",
  builder: (yargs) => yargs,
  async handler() {
    const timer = Log.Default.time("scrap")
    const list = await Product.list()
    process.stdout.write(JSON.stringify(list, null, 2) + EOL)
    timer.stop()
  },
})
