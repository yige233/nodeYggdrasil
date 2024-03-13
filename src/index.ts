import { fork } from "child_process";

(function main() {
  const forked = fork("./build/app.js");
  forked.on("message", (msg) => {
    const { operation } = JSON.parse(JSON.stringify(msg));
    if (operation == "restart") {
      setTimeout(() => forked.kill(), 3000);
    }
  });
  forked.on("exit", main);
})();
