import net from "node:net";
import { PublicProfileData, uuid } from "./interfaces.js";
import Token from "./token.js";
import Utils, { ErrorResponse, Time } from "./utils.js";
import { CONFIG, OFFICIALPLAYERLIST, PROFILES, SESSIONMAP, TOKENSMAP } from "../global.js";
import User from "./user.js";

/** 会话 */
export default class Session {
  /** mc服务器获取到的mc客户端的ip */
  ip: string;
  /** mc服务器id */
  serverId: string;
  /** 使用的令牌 */
  accessToken: uuid;
  /** 选择的角色uuid */
  selectedProfile: uuid;
  /** 会话请求创建的时间 */
  readonly issuedTime: number = Date.now();
  constructor(accessToken: uuid, selectedProfile: uuid, serverId: string, ip: string) {
    this.ip = ip;
    this.serverId = serverId;
    this.accessToken = accessToken;
    this.selectedProfile = selectedProfile;
    SESSIONMAP.set(serverId, this);
  }
  /**
   * 检查客户端会话的有效性
   * @param serverId 要检查的serverId
   * @param username 用户名称
   * @param ip (可选) mc客户端ip地址
   * @returns {boolean}
   */
  static async hasJoined(username: string, serverId: string, ip?: string): Promise<[PublicProfileData, "yggdrasil"]> {
    function findRecordedIP(session: Session) {
      /**
       * 如果两边 ip 版本不同，那么试图从服务器记录的 ip 中提取 ipv4
       * 如果服务端记录的是映射到v6的v4地址，那么服务端的ip测试结果是6，提供的ip就是v4，提取后如果二者相同就通过
       * 如果服务端记录的是常规ipv6，那么提取结果是null，与提供的ipv4肯定不符，拒绝
       * 如果服务端记录的是ipv4，那么提供的ip就是v6，提取结果与提供的ip肯定不符，拒绝
       */
      if (net.isIP(ip) != 0 && net.isIP(ip) != net.isIP(session.ip)) {
        return session.ip.match(/(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/g)?.[0] ?? null;
      }
      return session.ip;
    }
    // 不存在该serverid
    if (!SESSIONMAP.has(serverId)) {
      throw false;
    }
    // 不存在的用户名称
    if (!PROFILES.has(username)) {
      throw false;
    }
    const session = SESSIONMAP.get(serverId);
    // 该id对应的会话已过期（超过30秒）
    if (Date.now() > Time.parse(session.issuedTime, "30s")) {
      SESSIONMAP.delete(serverId);
      throw false;
    }
    const profile = PROFILES.get(session.selectedProfile);
    // 提供的用户名称与记录的用户名称不符;
    if (username != profile.name) {
      throw false;
    }
    // 提供了客户端 ip
    if (ip) {
      const sessionRecorded = findRecordedIP(session);
      if (ip != sessionRecorded) {
        throw false;
      }
    }
    return [PROFILES.get(username).getYggdrasilData(true, true), "yggdrasil"];
  }
  /**
   * 对于正版登录，验证端起一个代理作用，向官方验证端验证会话有效性，实现兼容正版登录
   * @param serverId 要检查的serverId
   * @param username 用户名称
   * @param ip (可选) mc客户端ip地址
   * @returns {Promise<PublicProfileData>}
   */
  static async hasJoinedProxy(username: string, serverId: string, ip?: string): Promise<[PublicProfileData, "official"]> {
    const url = new URL(`https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${username}&serverId=${serverId}`);
    // 没有启用兼容正版验证，或者提供的用户名不符合官方的限制 (肯定过不了官方验证)
    if (!CONFIG.user.officialProxy || !/^[0-9a-z_]{1,16}$/i.test(username)) {
      throw false;
    }
    // 如果有需要验证ip
    if (ip) {
      url.searchParams.append("ip", ip);
    }
    const profile: PublicProfileData = await Utils.fetch(url.href, { fallback: {} });
    // 如果返回的json中没有角色属性，也视为失败
    if (!profile.properties) {
      throw false;
    }
    // 记录尝试通过本验证服务器加入游戏的正版玩家
    if (!OFFICIALPLAYERLIST.logged.includes(profile.id)) OFFICIALPLAYERLIST.logged.push(profile.id);
    // 偏好黑名单时，玩家在黑名单内
    if (CONFIG.user.officialPlayerWhitelist === false && OFFICIALPLAYERLIST.blacklist.includes(profile.id)) throw false;
    // 偏好白名单时，玩家不在白名单内
    if (CONFIG.user.officialPlayerWhitelist && !OFFICIALPLAYERLIST.whitelist.includes(profile.id)) throw false;
    return [profile, "official"];
  }
  /**
   * 申请创建会话
   * @param accessToken 令牌
   * @param selectedProfile 选择的角色uuid
   * @param serverId mc服务器id
   * @param ip mc服务器获取到的mc客户端的ip
   * @returns {Session}
   */
  static issue(accessToken: uuid, selectedProfile: uuid, serverId: string, ip: string): void {
    // 令牌无效或暂时失效
    if (Token.validate(accessToken) != "valid") {
      throw new ErrorResponse("ForbiddenOperation", "无效的令牌。");
    }
    // 选择的角色id无效
    if (!PROFILES.has(selectedProfile)) {
      throw new ErrorResponse("ForbiddenOperation", "无效的角色。");
    }
    const token = TOKENSMAP.get(accessToken);
    // 令牌没有绑定的角色
    if (!token.profile) {
      throw new ErrorResponse("ForbiddenOperation", "令牌尚未绑定任何角色。");
    }
    // 角色id不匹配
    if (PROFILES.get(token.profile).id != selectedProfile) {
      throw new ErrorResponse("ForbiddenOperation", "无效的角色。");
    }
    new Session(accessToken, selectedProfile, serverId, ip);
  }
  /**
   * 对于正版登录，验证端起一个代理作用，向官方验证端报告登录事件。这里由于是代替客户端向官方报告登录，可能会出现两边ip不一致，导致hasJoined验证失败
   * @param accessToken 用户accessToken，在此处是正版用户的登录token，不能对其进行任何形式的保存
   * @param selectedProfile 选择的角色uuid
   * @param serverId mc服务器id
   * @returns {true}
   */
  static async issue2Official(accessToken: string, selectedProfile: uuid, serverId: string): Promise<void> {
    // 没有启用兼容正版验证
    if (!CONFIG.user.officialProxy) throw false;
    await Utils.fetch("https://sessionserver.mojang.com/session/minecraft/join", {
      method: "POST",
      json: { accessToken, selectedProfile, serverId },
    });
  }
  /**
   * 通过Xbox登录。起一个代理作用，向官方API验证该令牌是否有效。如果有效，且能够找到绑定了该响应中的username的角色，则颁发一个绑定至该角色的令牌
   * 这一步只依赖于username，即微软账户是否有效，不需要该账户拥有正版MC
   * 如果找不到username对应的角色，但是从accessToken中找到了该令牌绑定的正版角色，那么该令牌是事实上可以用于加入正版服务器的，
   * 直接原封不动返回该令牌，后续客户端可以继续使用该令牌执行进服步骤，和java版正版进服步骤相同
   * @param identityToken 客户端从微软处申请到的XSTS令牌
   * @returns
   */
  static async joinWithXbox(identityToken: string): Promise<{ access_token: string; username: string; user?: User }> {
    const { username, error, errorMessage, access_token } = await Utils.fetch("https://api.minecraftservices.com/authentication/login_with_xbox", {
      method: "POST",
      fallback: { errorMessage: "未知错误" },
      json: { identityToken },
    });
    if (error || errorMessage) {
      throw new ErrorResponse("Unauthorized", "登录Xbox失败: " + error || errorMessage);
    }
    if (PROFILES.has(username)) {
      const profile = PROFILES.get(username);
      const accessToken = new Token(undefined, profile.owner, profile.id);
      return { username, access_token: accessToken.accessToken, user: accessToken.owner };
    }
    try {
      const { profiles } = JSON.parse(Utils.decodeb64(access_token.split(".")[1]));
      if (profiles.mc) {
        return { username, access_token };
      }
      throw false;
    } catch {
      throw new ErrorResponse("Unauthorized", "该微软账号未绑定任何角色。");
    }
  }
}
