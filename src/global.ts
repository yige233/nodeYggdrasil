import crypto from "crypto";
import fs from "node:fs/promises";
import { Config, uuid, UserData, ProfileData } from "./libs/interfaces.js";
import Profile from "./libs/profile.js";
import Session from "./libs/session.js";
import Token from "./libs/token.js";
import User from "./libs/user.js";
import { JSONFile, AccessControl, ArrayMap } from "./libs/utils.js";

//全大写的常量，被程序全局依赖
/** 程序设置 */
export const CONFIG = await JSONFile.read<Config>("./data/config.json").catch((e) => {
  throw new Error("读取配置文件失败: " + e.message);
});
/** 用户数据 */
export const USERS = await JSONFile.read<{ [key: uuid]: UserData }>("./data/users.json");
/** 用户的盐值 */
export const SALTS = await JSONFile.read<{ [key: uuid]: string }>("./data/salts.json");
/** 角色数据 */
export const PROFILES = await JSONFile.read<{ [key: uuid]: ProfileData }>("./data/profiles.json");
/** 材质目录 */
export const TEXTURES = await JSONFile.read<{ [key: uuid]: uuid[] }>("./data/textures.json");
/** 私钥数据 */
export const PRIVATEKEY = await fs
  .readFile(CONFIG.privateKeyPath)
  .then((buf) => crypto.createPrivateKey(buf))
  .catch((e) => {
    throw new Error("读取私钥失败: " + e.message);
  });
/** 公钥数据 */
export const PUBLICKEY = crypto.createPublicKey(PRIVATEKEY);
/** Mojang的公钥数据 */
export const MOJANGPUBKEY = await fetch("https://api.minecraftservices.com/publickeys")
  .then((res) => res.json())
  .catch((e) => {
    throw new Error("读取Mojang公钥失败: " + e.message);
  });
/** 用户数据Map */
export const USERSMAP: ArrayMap<string[], User> = new ArrayMap();
for (const uuid in USERS) {
  const user = USERS[uuid];
  USERSMAP.set([user.username, user.id, ...user.profiles], new User(user));
}
/** 角色数据Map */
export const PROFILEMAP: ArrayMap<[string, string], Profile> = new ArrayMap();
for (const profileId in PROFILES) {
  const profile = PROFILES[profileId];
  PROFILEMAP.set([profile.name, profile.id], new Profile(profile));
}
/** 令牌数据Map，仅存在于内存 */
export const TOKENSMAP: Map<uuid, Token> = new Map();
/** 会话数据Map，仅存在于内存 */
export const SESSIONMAP: Map<string, Session> = new Map();
/** 访问控制器使用的Map */
export const ACCESSCONTROLLER = new AccessControl();
