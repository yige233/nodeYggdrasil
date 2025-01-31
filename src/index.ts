import { fork } from "child_process";

(function main() {
  const forked = fork("./build/app.js", process.argv.slice(2));
  forked.on("message", (msg) => {
    const { operation } = JSON.parse(JSON.stringify(msg));
    if (operation == "restart") {
      setTimeout(() => forked.kill(), 3000);
    }
  });
  forked.on("exit", main);
})();
