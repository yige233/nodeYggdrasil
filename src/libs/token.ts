import { CONFIG, PROFILES, TOKENSMAP, USERS } from "../global.js";
import { uuid, TokenStatus, PublicProfileData } from "./interfaces.js";
import User from "./user.js";
import Utils, { ErrorResponse, Time } from "./utils.js";

/** 令牌 */
export default class Token {
  /** 使用该令牌的用户 */
  readonly owner: User;
  /** 该令牌使用的角色uuid */
  readonly profile?: uuid;
  /** 该令牌申请的时间 */
  readonly issuedTime: number;
  /** 令牌的 accessToken */
  readonly accessToken: string;
  /** 令牌的 clientToken */
  readonly clientToken: string;
  /** 该令牌是否强制暂时失效 */
  forcedTvalid: boolean;
  /**
   * 实例化一个令牌
   * @param accessToken
   * @param clientToken
   * @param profile 该令牌要绑定到的角色uuid
   */
  constructor(clientToken: string, owner: uuid, profile?: uuid) {
    const accessToken = Utils.uuid();
    const user = USERS.get(owner);
    this.owner = user;
    this.issuedTime = Date.now();
    this.accessToken = accessToken;
    this.clientToken = clientToken;
    this.forcedTvalid = false;
    if (user.profiles.length == 1) this.profile = user.profiles[0];
    if (profile) this.profile = profile;
    // 最多10个登录会话，若超出则删除最早的那个
    if (user.tokens.size >= 10) {
      user.tokens.delete([...user.tokens][0]);
    }
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
      throw new ErrorResponse("ForbiddenOperation", "无效的令牌。");
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
    // 令牌验证失效
    if (this.validate(clientToken) == "invalid") {
      throw new ErrorResponse("ForbiddenOperation", "无效的令牌。");
    }
    // 存在 profileId, 是选择角色的操作
    if (profileId) {
      if (this.profile) {
        throw new ErrorResponse("IllegalArgument", "该令牌已经绑定了角色。");
      }
      if (!PROFILES.has(profileId)) {
        throw new ErrorResponse("IllegalArgument", "无效的角色。");
      }
      const profile = PROFILES.get(profileId);
      if (profile.owner != this.owner.id) {
        throw new ErrorResponse("ForbiddenOperation", "没有对该角色的所有权。");
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
    // 令牌不存在
    if (!TOKENSMAP.has(accessToken)) {
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
    // 指定了客户端token但该token无效
    if (clientToken && this.clientToken != clientToken) {
      return "invalid";
    }
    // 指定了令牌所有者，但所有者不符
    if (owner && owner != this.owner.id) {
      return "invalid";
    }
    // 令牌被设置为强制暂时失效状态
    if (this.forcedTvalid) {
      return "Tvalid";
    }
    const validityPeriod = Time.parse(CONFIG.user.tokenTTL);
    /** 保证令牌有效期至少为30秒，避免出现意外修改成很小的数字，导致令牌瞬间失效 */
    const appliedPeriod = validityPeriod > 3e4 ? validityPeriod : 3e4;
    const now = Date.now();
    // 当现在时间小于令牌颁发时间+过期时间，说明令牌有效或暂时失效
    if (now < this.issuedTime + appliedPeriod) {
      // 当现在时间小于令牌颁发时间+过期时间的一半，说明令牌有效
      if (now < this.issuedTime + appliedPeriod) {
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
    // 令牌不存在
    if (!TOKENSMAP.has(accessToken)) {
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
    if (!this.profile || !PROFILES.has(this.profile)) return null;
    return PROFILES.get(this.profile).getYggdrasilData();
  }
}
