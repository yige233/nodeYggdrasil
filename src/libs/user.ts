import { USERSMAP, CONFIG, ACCESSCONTROLLER, PROFILEMAP, USERS, SALTS } from "../global.js";
import { UserData, uuid, MinimumUserData, PublicProfileData, PublicUserData, PrivateUserData } from "./interfaces.js";
import Profile from "./profile.js";
import Token from "./token.js";
import Utils, { ErrorResponse, JSONFile, SuccessResponse } from "./utils.js";
import crypto, { KeyObject } from "crypto";

/** 临时邀请码 */
export const TempInviteCodes = new (class {
  /** 存储临时邀请码 */
  codes = new Map();
  /**
   * 申请一个临时邀请码
   * @returns {string}
   */
  new(): string {
    const code = parseInt(crypto.createHash("shake256", { outputLength: 4 }).update(Utils.uuid()).digest("hex"), 16).toString(36);
    this.codes.set(code, { expiresAt: new Date().getTime() + 18e5 });
    return code;
  }
  /**
   * 测试一个临时邀请码。如果测试通过，该邀请码会被删除，同时返回true；测试未通过则返回false。
   * @param code
   * @returns {boolean}
   */
  test(code: string): boolean {
    const data = this.codes.get(code) || { expiresAt: 0 };
    if (!data || data.expiresAt < new Date().getTime()) {
      return false;
    }
    return true;
  }
  /**
   * 吊销一个邀请码
   * @param code 邀请码
   * @returns {boolean}
   */
  invalidate(code: string): boolean {
    return this.codes.delete(code);
  }
})();

/** 用户 */
export default class User implements UserData {
  username: string;
  password: string;
  rescueCode: string;
  nickName: string;
  profiles: uuid[];
  readonly id: uuid;
  readonly regTime: number;
  readonly regIP: string;
  role: "admin" | "user" = "user";
  banned: number = 0;
  readonly: boolean = false;
  salt: string;
  cert: {
    privkey: string;
    expiresAt: number;
  };
  extend: { [key: string]: any; inviteCode: string; source: string };
  pubExtends: {};
  properties: { name: "preferredLanguage" | string; value: string }[];
  /** 用户拥有的令牌 */
  tokens: Set<uuid> = new Set();
  constructor(data: Partial<UserData>) {
    this.username = data.username;
    this.password = data.password;
    this.banned = data.banned;
    this.id = data.id;
    this.regTime = data.regTime || new Date().getTime();
    this.regIP = data.regIP;
    this.role = "admin" == data.role ? "admin" : "user";
    this.extend = data.extend;
    this.readonly = data.readonly;
    this.nickName = data.nickName;
    this.salt = SALTS[data.id] || undefined;
    this.cert = data.cert || undefined;
    this.profiles = data.profiles || [];
    this.properties = data.properties || [
      {
        name: "preferredLanguage",
        value: "zh_CN",
      },
    ];
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
  static async register({ username, password, inviteCode, ip, nickName }: { username: string; password: string; inviteCode: string; ip: string; nickName?: string }): Promise<User> {
    if (!username || !password) {
      throw new ErrorResponse("BadOperation", "Username and pasowrd is both required.");
    }
    User.userInfoCheck(username, password, nickName);
    const rawUsr: Partial<UserData> = {
      username: username,
      nickName: nickName ? nickName : username,
      profiles: [],
      regIP: ip,
      extend: { source: null, inviteCode: null },
    };
    if (USERSMAP.size == 0) {
      //第一个用户默认成为admin，跳过邀请码检查
      rawUsr.role = "admin";
      rawUsr.extend.source = "system";
    } else {
      const officialInviteCodes = CONFIG.user.inviteCodes || [], //公共邀请码列表
        userInviteCodes = new Map(); //用户邀请码列表
      for (const user of USERSMAP.values()) {
        if (CONFIG.user.disableUserInviteCode == false) {
          //没有禁止使用用户邀请码注册
          userInviteCodes.set(user.extend.inviteCode, user.id);
        }
      }
      //进行邀请码检查。
      if (officialInviteCodes.includes(inviteCode)) {
        //来自于公共邀请码
        rawUsr.extend.source = "system";
      } else if (TempInviteCodes.test(inviteCode)) {
        //来自于系统临时邀请码
        rawUsr.extend.source = "system";
        TempInviteCodes.invalidate(inviteCode);
      } else if (userInviteCodes.has(inviteCode)) {
        //来自于用户邀请码
        const inviter = userInviteCodes.get(inviteCode);
        if (USERSMAP.get(inviter).banned > new Date().getTime()) {
          //该邀请码的所有者被封禁
          throw new ErrorResponse("ForbiddenOperation", "The user that owned this inviteCode is under ban.");
        }
        if (USERSMAP.get(inviter).readonly) {
          //该邀请码的所有者是只读账户
          throw new ErrorResponse("ForbiddenOperation", `Invalid inviteCode: ${inviteCode}`);
        }
        if (!ACCESSCONTROLLER.test(inviteCode, CONFIG.user.inviteCodeUseRateLimit * 1e3)) {
          //邀请码尚处于使用冷却时间内
          throw new ErrorResponse("ForbiddenOperation", "This inviteCode is temporarily unavailable.");
        }
        rawUsr.extend.source = inviter;
      } else {
        //邀请码检查全部失败
        throw new ErrorResponse("ForbiddenOperation", `Invalid inviteCode: ${inviteCode ? inviteCode : "No inviteCode provided."}`);
      }
    }
    rawUsr.id = Utils.uuid();
    const user = new User(rawUsr);
    user.passwdHash(password).apply();
    user.extend.inviteCode = parseInt(
      crypto
        .createHash("shake256", { outputLength: 4 })
        .update(user.id + user.regIP + user.password)
        .digest("hex"),
      16
    ).toString(36);
    ACCESSCONTROLLER.test(user.extend.inviteCode, CONFIG.user.inviteCodeUseRateLimit * 1e3); //新用户的邀请码默认处于冷却状态
    USERSMAP.set([user.username, user.id], user);
    await user.save();
    return user;
  }
  /**
   * 重置密码
   * @param userId 用户账户
   * @param rescueCode 用户的救援码
   * @param newPass 新的密码
   * @returns Response
   */
  static async resetPass(userId: string, rescueCode: string, newPass: string): Promise<SuccessResponse<undefined> | ErrorResponse> {
    if (!USERSMAP.has(userId)) {
      //该用户不存在
      throw new ErrorResponse("BadOperation", `Invalid user.`);
    }
    const user = USERSMAP.get(userId);
    user.checkReadonly();
    if (!user.rescueCode) {
      throw new ErrorResponse("ForbiddenOperation", "The user hasn't generated any rescueCode, so you can't reset the password.");
    }
    if (Utils.sha256(rescueCode) != user.rescueCode) {
      throw new ErrorResponse("ForbiddenOperation", "Wrong rescueCode.");
    }
    User.userInfoCheck(undefined, newPass, undefined, user);
    user.passwdHash(newPass).apply();
    user.rescueCode = null;
    await user.save();
    return new SuccessResponse(undefined, 204);
  }
  /**
   * 用户认证
   * @param username 用户名
   * @param password 密码
   * @returns {User}
   */
  static authenticate(username: string, password: string): User {
    let user: User;
    if (USERSMAP.has(username)) {
      //用户存在，使用用户名登录
      user = USERSMAP.get(username);
    } else if (CONFIG.features.non_email_login && PROFILEMAP.has(username)) {
      //用户使用了角色名登录
      user = USERSMAP.get(PROFILEMAP.get(username).owner);
    } else {
      //不存在的用户名
      throw new ErrorResponse("ForbiddenOperation", "Invalid credentials. Invalid username or password.");
    }
    if (user.banned > new Date().getTime()) {
      //用户已被封禁
      throw new ErrorResponse("ForbiddenOperation", `User is banned: ${username} . Expected to unban at ${new Date(user.banned).toLocaleString()}`);
    }
    if (!user.checkPasswd(password)) {
      //用户提供的密码错误
      throw new ErrorResponse("ForbiddenOperation", "Invalid credentials. Invalid username or password.");
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
      //不能对只读账户进行更改
      origin.checkReadonly();
    }
    if (username) {
      if (USERSMAP.has(username)) {
        //用户名已被占用
        throw new ErrorResponse("ForbiddenOperation", `Username is not avaliable: ${username}`);
      }
      if (!/^[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)+$/.test(username)) {
        //用户名不符合邮箱格式要求
        throw new ErrorResponse("IllegalArgument", "The username must fit to email address format.");
      }
      if (username.length >= 60) {
        throw new ErrorResponse("BadOperation", "Provided username is too loooooog.");
      }
      if (origin && username == origin.username) {
        //新用户名和旧用户名相同
        throw new ErrorResponse("BadOperation", "New username is same to the old.");
      }
    }
    if (password) {
      //提供了待检查的密码
      if (password.length < CONFIG.user.passLenLimit) {
        //密码太短
        throw new ErrorResponse("BadOperation", "The password provided is too short.");
      }
      if (origin && origin.checkPasswd(password)) {
        //新密码和旧密码相同
        throw new ErrorResponse("BadOperation", "The new password is the same as the old password.");
      }
    }
    if (nickName) {
      if (nickName.length >= 30) {
        throw new ErrorResponse("BadOperation", "Provided nickName is too loooooog.");
      }
    }
    return true;
  }
  /** * 保存用户信息 */
  async save() {
    USERSMAP.delete(this.id);
    USERSMAP.set([this.username, this.id, ...this.profiles], this);
    USERS[this.id] = this.export;
    SALTS[this.id] = this.salt;
    await JSONFile.save(USERS);
    await JSONFile.save(SALTS);
  }
  /**
   * 计算密码hash值。
   * @param input 输入
   * @param salt 盐值。不提供则为随机生成。
   */
  passwdHash(input: string, salt = Utils.sha256(Utils.uuid())): { salt: string; hash: string; apply: () => void } {
    if (!["sha256", "HMACsha256"].includes(CONFIG.user.passwdHashType)) {
      throw new Error(`未知的 passwdHashType: ${CONFIG.user.passwdHashType}`);
    }
    let hash = Utils.sha256(input);
    if (CONFIG.user.passwdHashType == "HMACsha256") {
      hash = crypto.createHmac("sha256", salt).update(input).digest("hex");
    }
    return {
      hash,
      salt,
      apply: () => {
        this.password = hash;
        this.salt = salt;
      },
    };
  }
  /**
   * 检查密码是否有效。
   * @param input 输入
   * @returns {boolean}
   */
  checkPasswd(input: string): boolean {
    const { hash: resultHash } = this.passwdHash(input, this.salt);
    return resultHash == this.password;
  }
  /**
   * 修改用户信息
   * @param username 新的用户名
   * @param password 新的密码
   * @param nickName 新的昵称
   * @returns
   */
  async setUserInfo(username?: string, password?: string, nickName?: string): Promise<User> {
    this.checkReadonly();
    User.userInfoCheck(username, password, nickName, this);
    if (username) this.username = username;
    if (password) {
      this.passwdHash(password).apply();
      for (let token of this.tokens) {
        Token.invalidate(token);
      }
    }
    if (nickName) {
      this.nickName = nickName;
    }
    if (username || password || nickName) {
      await this.save();
    }
    return this;
  }
  /** 生成救援代码 */
  async getRescueCode() {
    this.checkReadonly();
    if (this.rescueCode) {
      throw new ErrorResponse("ForbiddenOperation", "Your rescueCode was generated and can't be provided again unless you reset your password.");
    }
    const rescueCode = parseInt(
      crypto
        .createHash("shake256", { outputLength: 4 })
        .update(this.id + this.password + new Date().getTime())
        .digest("hex"),
      16
    ).toString(36);
    this.rescueCode = Utils.sha256(rescueCode);
    await this.save();
    return rescueCode;
  }
  /** 使账户成为只读状态 */
  async makeReadonly() {
    if (this.role == "admin") {
      throw new ErrorResponse("ForbiddenOperation", "Unable to lock admin user account.");
    }
    this.checkReadonly();
    this.readonly = true;
    await this.save();
  }
  /** 删除账户 */
  async remove() {
    if (this.role == "admin") {
      throw new ErrorResponse("ForbiddenOperation", "Unable to delete admin user account.");
    }
    this.checkReadonly();
    this.signout();
    await this.removeProfile();
    USERSMAP.delete(this.id);
    delete USERS[this.id];
    await JSONFile.save(USERS);
  }
  /**
   * 删除角色
   * @param profileIds 要删除的角色的id。若不提供则为删除所有角色
   */
  async removeProfile(...profileIds: uuid[]) {
    this.checkReadonly();
    let targets = [...this.profiles].filter((i) => profileIds.includes(i)) || this.profiles;
    await Profile.deleteProfile(...targets);
  }
  /**
   * 封禁用户
   * @param duration (分钟。默认:60min) 封禁时长。多次封禁时长不累加。将此参数设为 0 可以视为执行了解除封禁
   */
  async ban(duration: number = 60) {
    const now = new Date().getTime();
    this.banned = now + (duration > 0 ? duration : 0) * 6e4;
    this.signout();
    await this.save();
  }
  /** 为用户创建和更新加密证书对 */
  async getUserPrivKey(): Promise<{ privkey: KeyObject; expiresAt: number }> {
    const { expiresAt = 0 } = this.cert || {};
    const now = new Date().getTime();
    if (now > expiresAt) {
      const { privateKey } = await Utils.getRSAKeyPair();
      this.cert = {
        privkey: Utils.keyRepack(privateKey),
        expiresAt: now + 8.64e7,
      };
      await this.save();
      return {
        privkey: privateKey,
        expiresAt: now,
      };
    }
    return {
      privkey: crypto.createPrivateKey(this.cert.privkey),
      expiresAt: this.cert.expiresAt,
    };
  }
  /** 检测账户是否为只读状态 */
  checkReadonly(): boolean {
    if (this.readonly) {
      throw new ErrorResponse("ForbiddenOperation", "This user is now readonly, can't modify or delete.");
    }
    return true;
  }
  /**
   * 注销登录
   * @param tokens 要注销的token。若不提供则为注销所有登录
   */
  signout(...tokens: uuid[]) {
    for (let token of tokens.length > 0 ? [...this.tokens].filter((i) => tokens.includes(i)) : this.tokens) {
      Token.invalidate(token);
    }
  }
  /** 导出用户信息 */
  get export(): UserData {
    return {
      id: this.id,
      username: this.username,
      password: this.password,
      rescueCode: this.rescueCode,
      nickName: this.nickName,
      profiles: this.profiles,
      regTime: this.regTime,
      regIP: this.regIP,
      role: this.role,
      banned: this.banned,
      readonly: this.readonly,
      cert: this.cert,
      extend: this.extend,
      pubExtends: this.pubExtends,
      properties: this.properties,
      salt: undefined,
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
    const list = [];
    for (const profile of this.profiles) {
      list.push(PROFILEMAP.get(profile).getYggdrasilData());
    }
    return list;
  }
  /** 导出公共可见的用户数据 */
  get publicUserData(): PublicUserData {
    return {
      id: this.id,
      nickName: this.nickName,
      regTime: this.regTime,
      role: this.role,
      banned: this.banned,
      readonly: this.readonly,
      pubExtends: this.pubExtends,
      properties: this.properties || [],
    };
  }
  /** 导出私人可见的用户数据 */
  get privateUserData(): PrivateUserData {
    const publicData = this.publicUserData;
    return Object.assign(publicData, {
      username: this.username,
      regIP: this.regIP,
      profiles: this.profiles,
      cert: this.cert,
      extend: this.extend,
    });
  }
}
