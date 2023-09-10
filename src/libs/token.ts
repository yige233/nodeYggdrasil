import { uuid, TokenStatus, PublicProfileData } from "./interfaces.js";
import User from "./user.js";
import Utils, { USERSMAP, TOKENSMAP, PROFILEMAP, CONFIG, ErrorResponse } from "./utils.js";

/** 令牌 */
export default class Token {
  /** 令牌的 accessToken */
  readonly accessToken: string;
  /** 令牌的 clientToken */
  readonly clientToken: string;
  /** 该令牌使用的角色uuid */
  readonly profile?: uuid;
  /** 该令牌申请的时间 */
  readonly issuedTime: number;
  /** 使用该令牌的用户 */
  readonly owner: User;
  /**
   * 实例化一个令牌
   * @param accessToken
   * @param clientToken
   * @param profile 该令牌要绑定到的角色uuid
   */
  constructor(clientToken: string, owner: uuid, profile?: uuid) {
    const accessToken = Utils.uuid();
    const user = USERSMAP.get(owner);
    this.accessToken = accessToken;
    this.clientToken = clientToken;
    this.owner = user;
    this.issuedTime = new Date().getTime();
    if (user.profiles.length == 1) this.profile = user.profiles[0];
    if (profile) this.profile = profile;
    TOKENSMAP.set(accessToken, this);
    user.tokens.add(accessToken);
  }
  /**
   * 刷新一个令牌
   * @param accessToken 令牌
   * @param clientToken (可选) 客户端token
   * @param profileId (可选) 绑定到新令牌的角色id
   * @returns {Token}
   */
  static refresh(accessToken: uuid, clientToken?: string, profileId?: uuid): Token {
    if (!TOKENSMAP.has(accessToken)) {
      //令牌不存在
      throw new ErrorResponse("ForbiddenOperation", "Invalid token.");
    }
    const token: Token = TOKENSMAP.get(accessToken);
    return token.refresh(clientToken, profileId);
  }
  /**
   * 刷新自身
   * @param clientToken 客户端token
   * @param profileId (可选) 绑定到新令牌的角色id
   * @returns {Token}
   */
  refresh(clientToken?: string, profileId?: uuid): Token {
    if (this.validate(clientToken) == "invalid") {
      //令牌验证失效
      throw new ErrorResponse("ForbiddenOperation", "Invalid token.");
    }
    if (profileId) {
      //存在 profileId, 是选择角色的操作
      if (this.profile) {
        //该令牌已经绑定了角色
        throw new ErrorResponse("IllegalArgument", "Access token already has a profile assigned.");
      }
      if (!PROFILEMAP.has(profileId)) {
        //不存在要选择的角色
        throw new ErrorResponse("IllegalArgument", "Invalid Profile.");
      }
      const profile = PROFILEMAP.get(profileId);
      if (profile.owner != this.owner.id) {
        //该角色不属于该用户
        throw new ErrorResponse("ForbiddenOperation", "No ownership of this profile.");
      }
    }
    this.invalidate();
    return new Token(this.clientToken, this.owner.id, this.profile || profileId || undefined);
  }
  /**
   * 验证一个令牌。
   * @param accessToken 令牌
   * @param clientToken (可选) 客户端token
   * @param owner (可选) 令牌所有者
   * @returns {TokenStatus}
   */
  static validate(accessToken: uuid, clientToken?: string, owner?: uuid): TokenStatus {
    if (!TOKENSMAP.has(accessToken)) {
      //令牌不存在
      return "invalid";
    }
    const token: Token = TOKENSMAP.get(accessToken);
    return token.validate(clientToken, owner);
  }
  /**
   * 验证令牌自身
   * @param clientToken (可选) 客户端token
   * @param owner (可选) 令牌所有者
   * @returns {TokenStatus}
   */
  validate(clientToken?: string, owner?: uuid): TokenStatus {
    if (clientToken && this.clientToken != clientToken) {
      //指定了客户端token但该token无效
      return "invalid";
    }
    if (owner && owner != this.owner.id) {
      //指定了令牌所有者，但所有者不符
      return "invalid";
    }
    const validityPeriod = CONFIG.content.user.tokenValidityPeriod;
    const now = new Date().getTime();
    if (now < this.issuedTime + validityPeriod * 36e5) {
      //当现在时间小于令牌颁发时间+过期时间，说明令牌有效或暂时失效
      if (now < this.issuedTime + validityPeriod * 18e5) {
        //当现在时间小于令牌颁发时间+过期时间的一半，说明令牌有效
        return "valid";
      }
      return "Tvalid";
    }
    this.invalidate();
    return "invalid";
  }
  /**
   * 吊销一个令牌
   * @param accessToken 令牌
   * @returns {boolean}
   */
  static invalidate(accessToken: uuid): boolean {
    if (!TOKENSMAP.has(accessToken)) {
      //令牌不存在
      return false;
    }
    const token: Token = TOKENSMAP.get(accessToken);
    return token.invalidate();
  }
  /**
   * 吊销令牌自身
   * @returns {true}
   */
  invalidate(): true {
    this.owner.tokens.delete(this.accessToken);
    TOKENSMAP.delete(this.accessToken);
    return true;
  }
  /**导出符合 yggdrasil API 格式的单个角色信息 */
  get yggdrasilProfile(): PublicProfileData {
    if (!this.profile) return null;
    return PROFILEMAP.get(this.profile).getYggdrasilData();
  }
}
