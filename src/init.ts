import fs from "node:fs/promises";
import crypto, { KeyObject } from "crypto";
import { Config } from "./libs/interfaces.js";

async function mkDir(dir: string) {
  try {
    const res = await fs.stat(dir);
    if (!res.isDirectory()) {
      throw undefined;
    }
  } catch (err) {
    fs.mkdir(dir);
  }
}

const config: Config = {
  server: {
    host: "",
    port: 5400,
    name: "NodeYggdrasilServer",
    root: "http://localhost:5400/",
    homepage: "http://localhost:5400/",
    register: "http://localhost:5400/",
    keyReqRateLimit: 300,
    proxyCount: 0,
    trustXRealIP: false,
  },
  user: {
    passwdHashType:"HMACsha256",
    defaultSkin: "http://textures.minecraft.net/texture/31f477eb1a7beee631c2ca64d06f8f68fa93a3386d04452ab27f43acdf1b60cb",
    enableDefaultSkin: false,
    tokenValidityPeriod: 336,
    passLenLimit: 8,
    maxProfileCount: 5,
    inviteCodes: [],
    inviteCodeUseRateLimit: 3600,
    disableUserInviteCode: false,
    enableOfficialProxy: false,
    disableUploadTexture: false,
  },
  privateKeyPath: "./data/privkey.pem",
  skinDomains: ["littleskin.cn", ".littleskin.cn", "localhost", ".minecraft.net"],
  features: {
    non_email_login: true,
    username_check: false,
    enable_profile_key: true,
    no_mojang_namespace: false,
    enable_mojang_anti_features: false,
  },
  pubExtend: {
    headerInfo: "node-yggdrasil-server",
  },
  privExtend: {
    enableSwaggerUI: false,
  },
};

const options = {
  modulusLength: 4096,
  publicExponent: 0x10001,
};
const privateKey: KeyObject = await new Promise((resolve, reject) => {
  crypto.generateKeyPair("rsa", options, (err, _publicKey, privateKey) => {
    if (err) return reject(err);
    resolve(privateKey);
  });
});

await mkDir("./data");
await mkDir("./data/textures");
await fs.writeFile("./data/config.json", JSON.stringify(config, null, 2));
await fs.writeFile("./data/privkey.pem", privateKey.export({ type: "pkcs8", format: "pem" }));

console.log(`
程序所需的配置文件已经创建完成。下面是一些说明：

ℹ️ 首次创建用户时不需要邀请码，且会默认该账户为管理员账户。

ℹ️ 请特别注意，应当提前修改 server.root 项，该项用于向用户提示 Yggdrasil API 的地址(以斜杠'/'结尾)，并在用户上传材质时构建正确的材质url。

ℹ️ 请特别注意，应当向 skinDomains 中添加本服务器的域名，否则 Minecraft 会拒绝从本服务器加载材质。
`);
