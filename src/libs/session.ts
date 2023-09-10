import net from "node:net";
import { PublicProfileData, uuid } from "./interfaces.js";
import Token from "./token.js";
import Utils, { SESSIONMAP, TOKENSMAP, PROFILEMAP, ErrorResponse, CONFIG } from "./utils.js";

/** 会话 */
export default class Session {
  /** mc服务器id */
  serverId: string;
  /** 选择的角色uuid */
  selectedProfile: uuid;
  /** 使用的令牌 */
  accessToken: uuid;
  /** mc服务器获取到的mc客户端的ip */
  ip: string;
  /** 会话请求创建的时间 */
  readonly issuedTime: number = new Date().getTime();
  constructor(accessToken: uuid, selectedProfile: uuid, serverId: string, ip: string) {
    this.accessToken = accessToken;
    this.selectedProfile = selectedProfile;
    this.serverId = serverId;
    this.ip = ip;
    SESSIONMAP.set(serverId, this);
  }
  /**
   * 检查客户端会话的有效性
   * @param serverId 要检查的serverId
   * @param username 用户名称
   * @param ip (可选) mc客户端ip地址
   * @returns {boolean}
   */
  static async hasJoined(username: string, serverId: string, ip?: string): Promise<PublicProfileData> {
    return new Promise((resolve, reject) => {
      if (!SESSIONMAP.has(serverId)) {
        //不存在该serverid
        return reject(false);
      }
      const session = SESSIONMAP.get(serverId);
      if (new Date().getTime() > session.issuedTime + 3e4) {
        //该id对应的会话已过期（超过30秒）
        SESSIONMAP.delete(serverId);
        return reject(false);
      }
      if (!PROFILEMAP.has(username)) {
        //不存在的用户名称
        return reject(false);
      }
      const profile = PROFILEMAP.get(session.selectedProfile);
      if (username != profile.name) {
        //提供的用户名称与记录的用户名称不符;
        return reject(false);
      }
      if (ip) {
        //提供了客户端 ip
        let sessionRecorded = session.ip;
        if (net.isIP(ip) != 0 && net.isIP(ip) != net.isIP(session.ip)) {
          /**
           * 如果两边 ip 版本不同，那么试图从服务器记录的 ip 中提取 ipv4
           * 如果服务端记录的是映射到v6的v4地址，那么服务端的ip测试结果是6，提供的ip就是v4，提取后如果二者相同就通过
           * 如果服务端记录的是常规ipv6，那么提取结果是null，与提供的ipv4肯定不符，拒绝
           * 如果服务端记录的是ipv4，那么提供的ip就是v6，提取结果与提供的ip肯定不符，拒绝
           */
          sessionRecorded = session.ip.match(/(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/g)[0];
        }
        if (ip != sessionRecorded) {
          return reject(false);
        }
      }
      return resolve(PROFILEMAP.get(username).getYggdrasilData(true, true));
    });
  }
  /**
   * 对于正版登录，验证端起一个代理作用，向官方验证端验证会话有效性，实现兼容正版登录
   * @param serverId 要检查的serverId
   * @param username 用户名称
   * @param ip (可选) mc客户端ip地址
   * @returns {Promise<PublicProfileData>}
   */
  static async hasJoinedProxy(username: string, serverId: string, ip?: string): Promise<PublicProfileData> {
    const url = new URL(`https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${username}&serverId=${serverId}`);
    if (!CONFIG.content.user.enableOfficialProxy || /[\u4e00-\u9fa5]/.test(username)) {
      //没有启用兼容正版验证，或者提供的用户名含有中文字符 (肯定过不了官方验证)
      throw false;
    }
    if (ip) {
      //如果有需要验证ip
      url.searchParams.append("ip", ip);
    }
    const result = await fetch(url.href, {
      headers: Utils.requestHeaders,
    });
    if (result.status != 200) {
      //状态码不为200，说明验证失败
      throw false;
    }
    const profile: PublicProfileData = await result.json().catch(() => {});
    if (!profile.properties) {
      //如果返回的json中没有角色属性，也视为失败
      throw false;
    }
    return profile;
  }
  /**
   * 申请创建会话
   * @param accessToken 令牌
   * @param selectedProfile 选择的角色uuid
   * @param serverId mc服务器id
   * @param ip mc服务器获取到的mc客户端的ip
   * @returns {Session}
   */
  static issue(accessToken: uuid, selectedProfile: uuid, serverId: string, ip: string): Session {
    if (Token.validate(accessToken) != "valid") {
      //令牌无效或暂时失效
      throw new ErrorResponse("ForbiddenOperation", "Invalid token.");
    }
    if (!PROFILEMAP.has(selectedProfile)) {
      //选择的角色id无效
      throw new ErrorResponse("ForbiddenOperation", "Invalid Profile.");
    }
    const token = TOKENSMAP.get(accessToken);
    if (!token.profile) {
      //令牌没有绑定的角色
      throw new ErrorResponse("ForbiddenOperation", "Access token has no profile assigned.");
    }
    if (PROFILEMAP.get(token.profile).id != selectedProfile) {
      //角色id不匹配
      throw new ErrorResponse("ForbiddenOperation", "Invalid Profile.");
    }
    return new Session(accessToken, selectedProfile, serverId, ip);
  }
}
