import { UserData, uuid, MinimumUserData, PublicProfileData, PublicUserData, PrivateUserData } from "./interfaces.js";
import Token from "./token.js";
import Utils, { USERSMAP, CONFIG, USERS, PROFILEMAP, ErrorResponse, SuccessResponse, ACCESSCONTROLLER } from "./utils.js";
import crypto from "crypto";

/** 用户 */
export default class User implements UserData {
  username: string;
  password: string;
  rescueCode: string;
  nickName: string;
  profiles: string[];
  readonly id: uuid;
  readonly regTime: number;
  readonly regIP: string;
  role: "admin" | "user" = "user";
  banned: number = 0;
  extend: { [key: string]: any; inviteCode: string; source: string };
  pubExtends: {};
  properties: { name: "preferredLanguage" | string; value: string }[];
  /** 用户拥有的令牌 */
  tokens: Set<uuid> = new Set();
  constructor(data: Partial<UserData>) {
    this.username = data.username;
    this.password = data.password;
    this.id = data.id;
    this.regTime = data.regTime || new Date().getTime();
    this.regIP = data.regIP;
    this.role = "admin" == data.role ? "admin" : "user";
    this.extend = data.extend;
    this.nickName = data.nickName;
    this.properties = data.properties || [
      {
        name: "preferredLanguage",
        value: "zh_CN",
      },
    ];
    this.profiles = data.profiles || [];
  }
  /**
   * 用户认证
   * @param username 用户名
   * @param password 密码
   * @returns {User}
   */
  static authenticate(username: string, password: string): User {
    let user: User;
    username = username.toLowerCase();
    if (USERSMAP.has(username)) {
      //用户存在，使用用户名登录
      user = USERSMAP.get(username);
    } else if (CONFIG.content.features.non_email_login && PROFILEMAP.has(username)) {
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
    if (user.password != Utils.sha256(password)) {
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
   * @param compareTo (可选) 提供的对比对象（在修改用户名/密码时，与原来的进行对比）
   * @returns {true}
   */
  static userInfoCheck(username?: string, password?: string, nickName?: string, compareTo?: User): true {
    if (username) {
      username = username.toLowerCase();
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

      if (compareTo && username == compareTo.username) {
        //提供了待对比的用户（通常是自己）; 新用户名和旧用户名相同
        throw new ErrorResponse("BadOperation", "New username is same to the old.");
      }
    }
    if (password) {
      //提供了待检查的密码
      if (password.length < CONFIG.content.user.passLenLimit) {
        //密码太短
        throw new ErrorResponse("BadOperation", "The password provided is too short.");
      }
      if (compareTo && Utils.sha256(password) == compareTo.password) {
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
    const lowerUsername = username.toLowerCase(); //将用户名改为全小写，忽略大小写
    User.userInfoCheck(lowerUsername, password, nickName);
    const rawUsr: Partial<UserData> = {
      username: lowerUsername,
      nickName: nickName ? nickName : lowerUsername,
      profiles: [],
      regIP: ip,
      extend: { source: null, inviteCode: null },
    };
    if (USERSMAP.size == 0) {
      //第一个用户默认成为admin，跳过邀请码检查
      rawUsr.role = "admin";
      rawUsr.extend.source = "system";
    } else {
      const officialInviteCodes = CONFIG.content.user.inviteCodes || [], //公共邀请码列表
        userInviteCodes = new Map(); //用户邀请码列表
      for (const user of USERSMAP.values()) {
        if (CONFIG.content.user.disableUserInviteCode == false) {
          //没有禁止使用用户邀请码注册
          userInviteCodes.set(user.extend.inviteCode, user.id);
        }
      }
      if (!officialInviteCodes.includes(inviteCode) && !userInviteCodes.has(inviteCode)) {
        //进行邀请码检查。公共邀请码和用户邀请码中都没有包含提供的邀请码
        throw new ErrorResponse("ForbiddenOperation", `Invalid inviteCode: ${inviteCode ? inviteCode : "No inviteCode provided."}`);
      }
      if (officialInviteCodes.includes(inviteCode)) {
        //来自于公共邀请码
        rawUsr.extend.source = "system";
      } else {
        const inviter = userInviteCodes.get(inviteCode);
        if (USERSMAP.get(inviter).banned > new Date().getTime()) {
          //该邀请码的所有者被封禁
          throw new ErrorResponse("ForbiddenOperation", "The user that owned this inviteCode is under ban.");
        }
        //来自于用户邀请码
        if (!ACCESSCONTROLLER.test(inviteCode, CONFIG.content.user.inviteCodeUseRateLimit * 1e3)) {
          //邀请码尚处于使用冷却时间内
          throw new ErrorResponse("ForbiddenOperation", "This inviteCode is temporarily unavailable.");
        }
        rawUsr.extend.source = inviter;
      }
    }
    rawUsr.id = Utils.uuid();
    rawUsr.password = Utils.sha256(password);
    const user = new User(rawUsr);
    user.extend.inviteCode = parseInt(
      crypto
        .createHash("shake256", { outputLength: 4 })
        .update(user.id + user.regIP + user.password)
        .digest("hex"),
      16
    ).toString(36);
    ACCESSCONTROLLER.test(user.extend.inviteCode, CONFIG.content.user.inviteCodeUseRateLimit * 1e3); //新用户的邀请码默认处于冷却状态
    USERSMAP.set([user.username, user.id], user);
    await user.save();
    return user;
  }
  /** 将json形式的用户数据转换为Map */
  static buildMap(): Map<any, User> {
    const map: Map<any, User> = Utils.arrMap();
    for (const uuid in USERS.content) {
      const user = USERS.content[uuid];
      map.set([user.username.toLowerCase(), user.id, ...user.profiles], new User(user));
    }
    return map;
  }
  /**
   * 封禁一位用户
   * @param userId 用户id
   * @param duration (分钟。默认:60min) 封禁时长。多次封禁时长不累加。将此参数设为 0 可以视为执行了解除封禁
   * @returns {boolean}
   */
  static async ban(target: string, duration: number = 60): Promise<SuccessResponse<PublicUserData>> {
    target = target.toLowerCase();
    if (!USERSMAP.has(target) || !PROFILEMAP.has(target)) {
      //该用户不存在
      throw new ErrorResponse("BadOperation", `Invalid user or profile.`);
    }
    let user: User;
    if (USERSMAP.has(target)) {
      user = USERSMAP.get(target);
    }
    if (PROFILEMAP.has(target)) {
      user = USERSMAP.get(PROFILEMAP.get(target).owner);
    }
    user.banned = new Date().getTime() + duration * 6e4;
    for (let token of user.tokens) {
      Token.invalidate(token);
    }
    await user.save();
    return new SuccessResponse(user.publicUserData);
  }

  static async resetPass(userId: string, rescueCode: string, newPass: string) {
    userId = userId.toLowerCase();
    if (!USERSMAP.has(userId)) {
      //该用户不存在
      throw new ErrorResponse("BadOperation", `Invalid user.`);
    }
    const user = USERSMAP.get(userId);
    if (!user.rescueCode) {
      throw new ErrorResponse("ForbiddenOperation", "The user hasn't generated any rescueCode, so you can't reset the password.");
    }
    if (Utils.sha256(rescueCode) != user.rescueCode) {
      throw new ErrorResponse("ForbiddenOperation", "Wrong rescueCode.");
    }
    User.userInfoCheck(undefined, newPass, undefined, user);
    user.password = Utils.sha256(newPass);
    user.rescueCode = null;
    await user.save();
    return new SuccessResponse(undefined, 204);
  }
  /**
   * 保存用户信息
   * @param deleteFlag (默认: false) 该操作是否为删除该用户
   */
  async save(deleteFlag: boolean = false) {
    USERSMAP.delete(this.id);
    if (deleteFlag) {
      delete USERS.content[this.id];
    } else {
      USERSMAP.set([this.username, this.id, ...this.profiles], this);
      USERS.content[this.id] = this.export;
    }
    await USERS.save();
  }

  /**
   * 修改用户信息
   * @param data
   * @returns
   */
  async setUserInfo(username?: string, password?: string, nickName?: string): Promise<User> {
    User.userInfoCheck(username, password, nickName, this);
    if (username) this.username = username;
    if (password) {
      this.password = Utils.sha256(password);
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
      extend: this.extend,
      pubExtends: this.pubExtends,
      properties: this.properties,
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
      extend: this.extend,
    });
  }
}
