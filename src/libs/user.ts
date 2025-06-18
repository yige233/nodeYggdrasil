import crypto, { KeyObject } from "crypto";
import fs from "fs/promises";
import { USERS, CONFIG, ACCESSCONTROLLER, PROFILES, SALTS, pathOf, pinoLogger, InviteCodes } from "../global.js";
import { UserData, uuid, MinimumUserData, PublicProfileData, PublicUserData, PrivateUserData } from "./interfaces.js";
import Token from "./token.js";
import Utils, { ErrorResponse, Time } from "./utils.js";

export class InviteCode {
  codes: Map<string, { expiresAt: number; issuer: string }> = new Map();
  issue(issuer: string = "system"): string {
    /** 邀请码过期时间：半小时 */
    const expireIn = Time.parse("30m");
    if (issuer != "system" && this.countOf(issuer) >= USERS.get(issuer).remainingInviteCodeCount) {
      throw new ErrorResponse("ForbiddenOperation", "无法生成更多的邀请码。");
    }
    const code = parseInt(crypto.createHash("shake256", { outputLength: 4 }).update(Utils.uuid()).digest("hex"), 16).toString(36);
    this.codes.set(code, { expiresAt: Date.now() + expireIn, issuer });
    return code;
  }
  countOf(issuer: string = "system") {
    return [...this.codes.values()].filter((val) => val.issuer === issuer).length;
  }
  clear() {
    this.codes.forEach((_v, k) => {
      if (!InviteCodes.test(k).available) this.invalidate(k);
    });
    return this.codes.size;
  }
  /**
   * 测试一个邀请码是否有效。
   * @param code 邀请码
   * @returns
   */
  test(code: string): { available: boolean; issuer: string } {
    const { expiresAt = 0, issuer } = this.codes.get(code) || {};
    return { issuer, available: expiresAt > Date.now() };
  }
  /**
   * 吊销一个邀请码
   * @param code 邀请码
   * @returns {boolean}
   */
  invalidate(code: string): boolean {
    return this.codes.delete(code);
  }
}

/** 用户 */
export default class User implements UserData {
  readonly id: uuid;
  readonly regTime: number;
  readonly regIP: string;
  role: "admin" | "user" = "user";
  salt: string;
  banned: number = 0;
  readonly: boolean = false;
  username: string;
  password: string;
  nickName: string;
  profiles: uuid[];
  rescueCode: string;
  maxProfileCount: number;
  remainingInviteCodeCount: number;
  cert: {
    privkey: string;
    expiresAt: number;
  };
  extend: { [key: string]: any; source: string };
  pubExtends: {};
  properties: { name: "preferredLanguage" | string; value: string }[];
  /** 用户拥有的令牌 */
  tokens: Set<uuid> = new Set();
  constructor(data: UserData) {
    this.id = data.id;
    this.role = "admin" === data.role ? "admin" : "user";
    this.salt = SALTS[data.id];
    this.cert = data.cert;
    this.regIP = data.regIP;
    this.banned = data.banned;
    this.extend = data.extend;
    this.regTime = data.regTime;
    this.username = data.username;
    this.password = data.password;
    this.readonly = data.readonly;
    this.nickName = data.nickName;
    this.profiles = data.profiles ?? [];
    this.rescueCode = data.rescueCode;
    this.properties = data.properties ?? [{ name: "preferredLanguage", value: "zh_CN" }];
    this.maxProfileCount = data.maxProfileCount ?? CONFIG.user.maxProfileCount;
    this.remainingInviteCodeCount = data.remainingInviteCodeCount ?? CONFIG.user.defaultInviteCodeCount;
  }
  /**
   * 用户注册
   * @param username 用户名
   * @param password 密码
   * @param inviteCode 邀请码
   * @param ip 用户注册ip
   * @param nickName 用户昵称
   * @returns {User}
   */
  static register({ username, password, inviteCode, ip, nickName }: { username: string; password: string; inviteCode: string; ip: string; nickName?: string }): User {
    function checkInviteCode(skip = false) {
      // 跳过邀请码检查
      if (skip) {
        return () => undefined;
      }
      // 来自于公共邀请码
      if (CONFIG.user.inviteCodes.includes(inviteCode)) {
        return (data: UserData) => (data.extend.source = "system");
      }
      const { available, issuer } = InviteCodes.test(inviteCode);
      if (available) {
        InviteCodes.invalidate(inviteCode);
        if (issuer === "system") {
          // 来自于系统临时邀请码
          return (data: UserData) => (data.extend.source = "system");
        }
        const inviter = USERS.get(issuer);
        if (CONFIG.user.userInviteCode && !inviter.readonly && inviter.banned < Date.now()) {
          // 允许用户邀请码；邀请用户未被锁定；邀请用户未被封禁
          return (data: UserData) => (data.extend.source = issuer);
        }
      }
      throw new ErrorResponse("ForbiddenOperation", "无效的邀请码。");
    }
    if (!username || !password) {
      throw new ErrorResponse("BadOperation", "请提供用户名和密码。");
    }
    User.userInfoCheck(username, password, nickName);
    const id = Utils.uuid();
    const data: UserData = {
      id,
      role: undefined,
      salt: undefined,
      cert: { privkey: "", expiresAt: 0 },
      regIP: ip,
      extend: { source: null },
      banned: 0,
      regTime: Date.now(),
      profiles: [],
      username,
      nickName: nickName ? nickName : username,
      password: undefined,
      rescueCode: undefined,
      readonly: false,
      pubExtends: {},
      properties: [{ name: "preferredLanguage", value: "zh_CN" }],
      maxProfileCount: CONFIG.user.maxProfileCount,
      remainingInviteCodeCount: CONFIG.user.defaultInviteCodeCount,
    };
    // 第一个用户默认成为admin
    if (USERS.size === 0) {
      data.role = "admin";
      data.extend.source = "system";
    }
    // 检查邀请码
    checkInviteCode(USERS.size === 0)(data);
    // 添加数据
    USERS.add(data);
    // 获得用户对象实例
    const user = USERS.get(id);
    // 添加密码
    user.passwdHash(password).apply();
    // 新用户的邀请码默认处于冷却状态
    ACCESSCONTROLLER.test(`${id}.inviteCode`, Time.parse(CONFIG.user.keyOpRL));
    return user;
  }
  /**
   * 重置密码
   * @param userId 用户账户
   * @param rescueCode 用户的救援码
   * @param newPass 新的密码
   * @returns Response
   */
  static resetPass(userId: string, rescueCode: string, newPass: string): User {
    if (!USERS.has(userId)) {
      // 该用户不存在
      throw new ErrorResponse("NotFound", `无效的用户ID。`);
    }
    const user = USERS.get(userId);
    user.checkReadonly();
    if (!user.rescueCode) {
      throw new ErrorResponse("ForbiddenOperation", "用户未生成任何救援码，因此无法重置密码。");
    }
    if (Utils.sha256(rescueCode) != user.rescueCode) {
      throw new ErrorResponse("ForbiddenOperation", "无效的救援码。");
    }
    User.userInfoCheck(undefined, newPass, undefined, user);
    user.logout();
    user.rescueCode = null;
    user.passwdHash(newPass).apply();
    return user;
  }
  /**
   * 用户认证
   * @param username 用户名
   * @param password 密码
   * @returns {User}
   */
  static authenticate(username: string, password: string): User {
    function findUser() {
      // 用户存在，使用用户名登录
      if (USERS.has(username)) {
        return USERS.get(username);
      }
      // 用户使用了角色名登录
      if (CONFIG.features.non_email_login && PROFILES.has(username)) {
        const matchedProfile = PROFILES.get(username);
        return USERS.get(matchedProfile.owner);
      }
      // 不存在的用户名
      throw new ErrorResponse("ForbiddenOperation", "无效的用户名或密码。");
    }
    const user = findUser();
    if (user.banned > Date.now()) {
      // 用户已被封禁
      throw new ErrorResponse("ForbiddenOperation", `用户已被封禁: ${username} 。 预计于 ${new Date(user.banned).toLocaleString()} 解封。`);
    }
    if (!user.checkPasswd(password)) {
      // 用户提供的密码错误
      throw new ErrorResponse("ForbiddenOperation", "无效的用户名或密码。");
    }
    return user;
  }
  /**
   * 检查用户提供的信息
   * @param username 提供的用户名
   * @param password (可选) 提供的密码
   * @param nickName (可选) 提供的用户昵称
   * @param origin (可选) 提供的源对象（在修改用户名/密码时，与原来的进行对比）
   * @returns {true}
   */
  static userInfoCheck(username?: string, password?: string, nickName?: string, origin?: User): true {
    if (origin) {
      // 不能对只读账户进行更改
      origin.checkReadonly();
    }
    if (username) {
      if (USERS.has(username)) {
        // 用户名已被占用
        throw new ErrorResponse("BadOperation", `提供的用户名无效: ${username}`);
      }
      if (!/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/.test(username)) {
        // 用户名不符合邮箱格式要求
        throw new ErrorResponse("IllegalArgument", "用户名必须符合邮箱格式。");
      }
      if (username.length >= 50) {
        throw new ErrorResponse("BadOperation", "提供的用户名过长。");
      }
    }
    if (password) {
      // 提供了待检查的密码
      if (password.length < CONFIG.user.passLenLimit) {
        // 密码太短
        throw new ErrorResponse("BadOperation", "提供的密码太短。");
      }
      if (origin && origin.checkPasswd(password)) {
        // 新密码和旧密码相同
        throw new ErrorResponse("BadOperation", "新密码和旧密码相同。");
      }
    }
    if (nickName) {
      if (nickName.length >= 50) {
        throw new ErrorResponse("BadOperation", "提供的昵称过长。");
      }
    }
    return true;
  }
  /**
   * 计算密码hash值。
   * @param input 输入
   * @param salt 盐值。不提供则为随机生成。
   */
  passwdHash(input: string, salt = Utils.sha256(Utils.uuid())): { salt: string; hash: string; apply: () => void } {
    const hash = crypto.createHmac("sha256", salt).update(input).digest("hex");
    const apply = () => {
      this.password = hash;
      this.salt = salt;
      SALTS[this.id] = this.salt;
    };
    return { hash, salt, apply };
  }
  /**
   * 检查密码是否有效。
   * @param input 输入
   * @returns {boolean}
   */
  checkPasswd(input: string): boolean {
    const { hash: resultHash } = this.passwdHash(input, this.salt);
    return resultHash === this.password;
  }
  /**
   * 修改用户信息
   * @param username 新的用户名
   * @param password 新的密码
   * @param nickName 新的昵称
   * @returns
   */
  setUserInfo(username?: string, password?: string, nickName?: string): User {
    this.checkReadonly();
    User.userInfoCheck(username, password, nickName, this);
    if (username && CONFIG.user.changeUserName) this.username = username;
    if (nickName) this.nickName = nickName;
    if (password) {
      this.passwdHash(password).apply();
      this.logout();
    }
    return this;
  }
  /** 生成救援代码 */
  generateRescueCode() {
    this.checkReadonly();
    if (this.rescueCode) {
      throw new ErrorResponse("ForbiddenOperation", "你的救援代码已经生成。除非重置密码，否则无法再次提供。");
    }
    const rescueCodeHex = crypto
      .createHash("shake256", { outputLength: 4 })
      .update(this.id + this.password + Date.now())
      .digest("hex");
    const rescueCode = parseInt(rescueCodeHex, 16).toString(36);
    this.rescueCode = Utils.sha256(rescueCode);
    return rescueCode;
  }
  generateInviteCode() {
    this.checkReadonly();
    InviteCodes.clear();
    if (!ACCESSCONTROLLER.test(`${this.id}.inviteCode`, Time.parse(CONFIG.user.keyOpRL))) {
      // 邀请码尚处于使用冷却时间内
      throw new ErrorResponse("ForbiddenOperation", "无法生成邀请码。");
    }
    // 申请邀请码时，立即减少剩余邀请码数量
    this.remainingInviteCodeCount--;
    return InviteCodes.issue(this.id);
  }
  /** 使账户成为只读状态 */
  makeReadonly() {
    if (this.role === "admin") {
      throw new ErrorResponse("ForbiddenOperation", "无法将管理员账户锁定。");
    }
    this.checkReadonly();
    this.readonly = true;
  }
  /** 删除账户 */
  async deleteAccount() {
    if (this.role === "admin") {
      throw new ErrorResponse("ForbiddenOperation", "无法删除管理员用户。");
    }
    this.checkReadonly();
    this.logout();
    await this.deleteProfile();
    USERS.delete(this.id);
  }
  /**
   * 删除角色
   * @param profileIds 要删除的角色的id。若不提供则为删除所有角色
   */
  async deleteProfile(...profileIds: uuid[]) {
    const targets = [...this.profiles].filter((i) => profileIds.includes(i)) || this.profiles;
    const tasks = targets.map((profileId) =>
      (async () => {
        const profile = PROFILES.get(profileId);
        await profile.textureManager().deleteTexture("all");
        PROFILES.delete(profileId);
        this.profiles.splice(this.profiles.indexOf(profileId), 1);
      })()
    );
    await Promise.allSettled(tasks);
  }
  /**
   * 封禁用户
   * @param duration 封禁时长。多次封禁时长不累加。将此参数设为 0 可以视为执行了解除封禁
   */
  ban(duration: number) {
    const now = Date.now();
    if (this.role === "admin") {
      throw new ErrorResponse("ForbiddenOperation", "无法封禁管理员用户。");
    }
    this.banned = now + duration;
    this.logout();
  }
  /** 为用户创建和更新加密证书对 */
  async getUserPrivKey(): Promise<{ privkey: KeyObject; expiresAt: number }> {
    /** 在24小时内有效 */
    const avaliableIn = Time.parse("24h");
    const { expiresAt = 0 } = this.cert || {};
    const now = Date.now();
    if (now > expiresAt) {
      const { privateKey } = await Utils.getRSAKeyPair();
      this.cert = { privkey: Utils.keyRepack(privateKey), expiresAt: now + avaliableIn };
      return {
        privkey: privateKey,
        expiresAt: now + avaliableIn,
      };
    }
    return {
      privkey: crypto.createPrivateKey(this.cert.privkey),
      expiresAt: this.cert.expiresAt,
    };
  }
  /** 重置管理员密码 */
  async adminResetPasswd() {
    if (this.role != "admin") return;
    const passwordFilePath = pathOf("admin-password.json");
    const passwordFileContent = await Utils.readJSON<{ password: string }>(passwordFilePath);
    const { password } = passwordFileContent.asObject().data;
    if (password) {
      this.setUserInfo(undefined, password);
      await fs.unlink(passwordFilePath);
      pinoLogger.info(`从 ${passwordFilePath} 重置了管理员密码。请注意该文件是否已被删除。`);
    }
  }
  /** 检测账户是否为只读状态 */
  checkReadonly(): true {
    if (this.readonly) {
      throw new ErrorResponse("ForbiddenOperation", "该账户为只读状态，无法修改或删除。");
    }
    return true;
  }
  /**
   * 注销登录
   * @param tokens 要注销的token。若不提供则为注销所有登录
   */
  logout(...tokens: uuid[]) {
    const invalidateList = tokens.length > 0 ? [...this.tokens].filter((i) => tokens.includes(i)) : this.tokens;
    invalidateList.forEach((token: string) => Token.invalidate(token));
  }
  /** 导出用户信息 */
  get export(): UserData {
    return {
      id: this.id,
      salt: undefined,
      role: this.role,
      cert: this.cert,
      regIP: this.regIP,
      banned: this.banned,
      extend: this.extend,
      regTime: this.regTime,
      nickName: this.nickName,
      profiles: this.profiles,
      readonly: this.readonly,
      username: this.username,
      password: this.password,
      rescueCode: this.rescueCode,
      pubExtends: this.pubExtends,
      properties: this.properties,
      maxProfileCount: this.maxProfileCount,
      remainingInviteCodeCount: this.remainingInviteCodeCount,
    };
  }
  /** 导出对外暴露的用户信息 */
  get yggdrasilData(): MinimumUserData {
    return {
      id: this.id,
      properties: this.properties || [],
    };
  }
  /**导出符合 yggdrasil API 格式的角色信息列表 */
  get yggdrasilProfiles(): PublicProfileData[] {
    return this.profiles
      .map((profileId) => {
        const profile = PROFILES.data.find(PROFILES.compareFunc(profileId));
        return profile?.getYggdrasilData();
      })
      .filter((i) => i);
  }
  /** 导出公共可见的用户数据 */
  get publicUserData(): PublicUserData {
    return {
      id: this.id,
      role: this.role,
      banned: this.banned,
      regTime: this.regTime,
      nickName: this.nickName,
      readonly: this.readonly,
      pubExtends: this.pubExtends,
      properties: this.properties || [],
    };
  }
  /** 导出私人可见的用户数据 */
  get privateUserData(): PrivateUserData {
    return Object.assign({}, this.publicUserData, {
      cert: this.cert,
      regIP: this.regIP,
      extend: this.extend,
      username: this.username,
      profiles: this.profiles,
      maxProfileCount: this.maxProfileCount,
      remainingInviteCodeCount: this.remainingInviteCodeCount,
    });
  }
}
