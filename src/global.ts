import crypto from "crypto";
import path from "node:path";
import fs from "node:fs/promises";
import pino from "pino";
import { Config, uuid, UserData, ProfileData, OfficialPlayerList } from "./libs/interfaces.js";
import Profile from "./libs/profile.js";
import Session from "./libs/session.js";
import Token from "./libs/token.js";
import User, { InviteCode } from "./libs/user.js";
import Utils, { buildDataDir, ThrottleController } from "./libs/utils.js";
import WebHook from "./libs/webhook.js";

const [argDataDir = "./data"] = process.argv.slice(2);

const DATADIR = path.resolve(argDataDir);

export const pathOf = Utils.dataDir(DATADIR);

const configDataRaw = await Utils.readJSON<Config>(pathOf("config.json"), () => buildDataDir(argDataDir));
const saltDataRaw = await Utils.readJSON<{ [key: uuid]: string }>(pathOf("salts.json"));
const textureDataRaw = await Utils.readJSON<{ [key: uuid]: uuid[] }>(pathOf("textures.json"));
const officialPlayersRaw = await Utils.readJSON<OfficialPlayerList>(pathOf("official-players.json"));
const userDataRaw = await Utils.readJSON<UserData>(pathOf("users.json"));
const profileDataRaw = await Utils.readJSON<ProfileData>(pathOf("profiles.json"));
function compareWith<T>(produceArrFunc: (data: T) => string[]) {
  return (input: string) => (data: T) => {
    const searchArray = produceArrFunc(data).filter((i) => i);
    return searchArray.some((i: string) => i.toLowerCase() === input?.toLowerCase());
  };
}

/** 程序设置 */
export const CONFIG = configDataRaw.asObject().data;
/** 用户盐值 */
export const SALTS = saltDataRaw.asObject().data;
/** 材质使用数据 */
export const TEXTURES = textureDataRaw.asObject().data;
/** 正版玩家数据 */
export const OFFICIALPLAYERLIST = officialPlayersRaw.asObject({ blacklist: [], whitelist: [], logged: [] }).data;
/** 用户数据 */
export const USERS = userDataRaw.asArray("id")<User>(
  (user) => new User(user),
  compareWith((user) => [user.id, user.username, ...user.profiles]),
  (user) => user.export
);
/** 角色数据 */
export const PROFILES = profileDataRaw.asArray("id")<Profile>(
  (profile) => new Profile(profile),
  compareWith((profile) => [profile.name, profile.id, profile.linkedMSUserId]),
  (profile) => profile.export
);

/** 私钥数据 */
export const PRIVATEKEY = await fs
  .readFile(CONFIG.privateKeyPath)
  .then((buf) => crypto.createPrivateKey(buf))
  .catch((e) => {
    throw new Error("读取私钥失败: " + e.message);
  });
/** 公钥数据 */
export const PUBLICKEY = crypto.createPublicKey(PRIVATEKEY);
/** 官方的公钥数据 */
export const OFFICIALPUBKEY = await Utils.fetch("https://api.minecraftservices.com/publickeys").catch((e) => {
  throw new Error("读取官方公钥失败: " + e.message);
});

/** 令牌数据Map，仅存在于内存 */
export const TOKENSMAP: Map<uuid, Token> = new Map();
/** 加入服务器会话数据Map，仅存在于内存 */
export const SESSIONMAP: Map<string, Session> = new Map();
/** 访问控制器使用的Map */
export const ACCESSCONTROLLER = new ThrottleController();
/** WebHook实例 */
export const WEBHOOK = new WebHook(CONFIG.webhooks);
/** 邀请码 */
export const InviteCodes = new InviteCode();
/** 日志记录 */
export const pinoLogger = pino(
  {
    formatters: {
      level(label) {
        return { level: label.toUpperCase() };
      },
    },
    customLevels: {
      /** 登录事件日志 */
      login: 35,
      /** webhook事件日志 */
      webhook: 36,
    },
  },
  pino.multistream([
    {
      stream: {
        write(msg: string) {
          const { level, time, msg: message, err = null } = JSON.parse(msg);
          const date = new Date(time).toLocaleString();
          if (level == "LOGIN") {
            fs.appendFile(pathOf("logs/logins.log"), `[${date}] [${level}] ${message}\r\n`);
          }
          if (level == "WEBHOOK") {
            fs.appendFile(pathOf("logs/webhooks.log"), `[${date}] [${level}] ${message}\r\n`);
          }
          if (level == "ERROR") {
            const prettyMsg = [`[${date}] [${level}] ${err?.type}: ${message?.split("\n")[0]}`, `  stack:${err?.stack}`, `  traceId:${err?.trace}`];
            fs.appendFile(pathOf("logs/errors.log"), `${prettyMsg.join("\r\n")}\r\n`);
          }
          process.stdout.write(`[${date}] [${level}] ${message} ${level == "ERROR" ? err?.trace ?? "" : ""}\r\n`);
        },
      },
    },
  ])
);
