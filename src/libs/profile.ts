import { AuthorizatedProfileData, ProfileData, PublicProfileData, TextureData, TexturesData, uploadableTextures, uuid } from "./interfaces.js";
import Utils, { ErrorResponse } from "./utils.js";
import textureManager from "./textures.js";
import { cacheMgr, CONFIG, PRIVATEKEY, PROFILES, USERS } from "../global.js";

/** 角色 */
export default class Profile implements ProfileData {
  readonly id: uuid;
  readonly originalName: string;
  name: string;
  owner: uuid;
  capeVisible: boolean;
  linkedMSUserId?: string;
  uploadableTextures: uploadableTextures;
  textures: {
    SKIN?: TextureData;
    CAPE?: TextureData;
  };
  localRes: {
    skin?: string;
    cape?: string;
  };
  constructor(data: ProfileData) {
    this.id = data.id;
    this.name = data.name;
    this.localRes = data.localRes;
    this.textures = data.textures;
    this.owner = data.owner || null;
    this.capeVisible = data.capeVisible;
    this.originalName = data.originalName || null;
    this.linkedMSUserId = data.linkedMSUserId || null;
    this.uploadableTextures = data.uploadableTextures;
  }
  /**
   * 新创建一个角色
   * @param name 角色名称
   * @param userId 要绑定的用户id
   * @param offlineCompatible (默认:false) 是否兼容离线模式（使用与离线模式相同的uuid生成模式）
   * @returns {Profile}
   */
  static new(name: string, userId: uuid, offlineCompatible: boolean = false): Profile {
    if (!USERS.has(userId)) {
      throw new ErrorResponse("BadOperation", `指定的用户不存在: ${userId} 。`);
    }
    if (offlineCompatible && !CONFIG.user.offlineProfile) {
      throw new ErrorResponse("ForbiddenOperation", "不允许创建兼容离线模式的角色。");
    }
    const user = USERS.get(userId);
    user.checkReadonly();
    if (user.profiles.length >= user.maxProfileCount) {
      throw new ErrorResponse("ForbiddenOperation", "用户所拥有的角色太多。");
    }
    Profile.checkName(name);
    const id: uuid = offlineCompatible ? Utils.uuid(name) : Utils.uuid();
    if (PROFILES.has(id)) {
      throw new ErrorResponse("ForbiddenOperation", "该角色名称对应的离线uuid已经被他人占用。请尝试换一个名称，或取消勾选兼容离线模式。");
    }
    PROFILES.add({
      id,
      name,
      localRes: {},
      textures: {},
      owner: user.id,
      capeVisible: true,
      originalName: name,
      uploadableTextures: "skin,cape",
    });
    const profile = PROFILES.get(id);
    user.profiles.push(id);
    return profile;
  }
  /**
   * 检查角色名称是否合法
   * @param name 待检查的角色名称
   * @returns {true}
   */
  static checkName(name: string): true {
    if (!name) {
      throw new ErrorResponse("BadOperation", "请提供一个角色名。");
    }
    if (name.length > 30) {
      throw new ErrorResponse("BadOperation", `提供的角色名称太长。`);
    }
    if (!/^[_A-Za-z0-9\u4e00-\u9fa5]+$/.test(name)) {
      throw new ErrorResponse("BadOperation", "角色名称非法：包含有非数字、字母、汉字的字符。");
    }
    if (PROFILES.has(name)) {
      throw new ErrorResponse("ForbiddenOperation", `该角色名称已被使用: ${name} 。`);
    }
    return true;
  }
  /**
   * 获取微软账户登录后提供给的用户id。该流程实际上相当于登录一遍Minecraft，不过在这里登录token反而成为了副产品。
   * @param authCode 从 https://login.live.com/oauth20_authorize.srf?client_id=00000000402b5328&response_type=code&scope=service%3A%3Auser.auth.xboxlive.com%3A%3AMBI_SSL&redirect_uri=https%3A%2F%2Flogin.live.com%2Foauth20_desktop.srf 处登录微软账号后，获得的授权码。实际上是一个回调url，该url中包含了我们需要的授权码。
   * @returns
   */
  static async getMSAccountId(authCode: string) {
    if (!authCode) {
      return undefined;
    }
    const { access_token: authToken } = await Utils.fetch("https://login.live.com/oauth20_token.srf", {
      method: "POST",
      fallback: {},
      formdata: {
        code: authCode,
        client_id: "00000000402b5328",
        grant_type: "authorization_code",
        redirect_uri: "https://login.live.com/oauth20_desktop.srf",
        scope: "service::user.auth.xboxlive.com::MBI_SSL",
      },
    });
    if (!authToken) {
      throw new ErrorResponse("BadOperation", "提供的 authCode 无效。(1/4)");
    }
    const {
      Token: xboxToken,
      DisplayClaims: {
        xui: [{ uhs }],
      },
    } = await Utils.fetch("https://user.auth.xboxlive.com/user/authenticate", {
      method: "POST",
      fallback: {},
      json: {
        Properties: { AuthMethod: "RPS", SiteName: "user.auth.xboxlive.com", RpsTicket: authToken },
        RelyingParty: "http://auth.xboxlive.com",
        TokenType: "JWT",
      },
    });
    if (!xboxToken || !uhs) {
      throw new ErrorResponse("BadOperation", "请求 xbox token 失败。(2/4)");
    }
    const { Token: xstsToken } = await Utils.fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
      method: "POST",
      fallback: {},
      json: {
        Properties: { SandboxId: "RETAIL", UserTokens: [xboxToken] },
        RelyingParty: "rp://api.minecraftservices.com/",
        TokenType: "JWT",
      },
    });
    if (!xstsToken) {
      throw new ErrorResponse("BadOperation", "请求 xbox XSTS token 失败。(3/4)");
    }
    const { username } = await Utils.fetch("https://api.minecraftservices.com/authentication/login_with_xbox", {
      method: "POST",
      fallback: {},
      json: { identityToken: `XBL3.0 x=${uhs};${xstsToken}` },
    });
    if (!username) {
      throw new ErrorResponse("BadOperation", "请求 MS Account ID 失败。(4/4)");
    }
    return username;
  }
  /**
   * 设置新的角色信息，同时检查该角色绑定的用户是否是只读用户；如果是修改name，则额外检查用户名称的合法性
   * @param {string} propertyName 要更新的属性名称
   * @param {T} newValue - 要设置的新属性值
   * @returns {Promise<Profile>} - 更新后的用户配置文件对象
   */
  setValue<T>(propertyName: string, newValue: T): void {
    if (!(propertyName in this) || typeof this[propertyName] === "function") {
      throw new ErrorResponse("InternalError", `试图访问无效的属性: ${propertyName} 。`);
    }
    USERS.get(this.owner).checkReadonly();
    if (propertyName === "name") {
      if (!CONFIG.user.changeOfflineProfileName && Utils.uuid(this.originalName) === this.id) {
        throw new ErrorResponse("ForbiddenOperation", "不允许修改“兼容离线模式的角色”的名称。");
      }
      Profile.checkName(newValue as string);
    }
    if (propertyName === "linkedMSUserId") {
      if (newValue) {
        if (PROFILES.has(newValue as string)) {
          throw new ErrorResponse("ForbiddenOperation", "该微软账号已经绑定了一个角色。请选择另一个账微软号，或先取消该账号的绑定。");
        }
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(newValue as string)) {
          throw new ErrorResponse("BadOperation", "提供的微软账号ID无效。");
        }
      }
    }
    this[propertyName] = newValue;
  }
  textureManager() {
    USERS.get(this.owner).checkReadonly();
    return textureManager(this);
  }
  /**
   * 导出符合 yggdrasil API 格式的角色信息
   * @param includeProperty (默认: false) 是否包括属性
   * @param signed (默认: false) 是否对属性进行数字签名
   * @returns {PublicProfileData}
   */
  getYggdrasilData(includeProperty: boolean = false, signed: boolean = false): PublicProfileData {
    const textures: TexturesData = {
      profileId: this.id,
      profileName: this.name,
      timestamp: Date.now(),
      textures: Object.assign({}, this.textures),
    };
    if (signed) {
      textures.signatureRequired = true;
    }
    if (this.capeVisible === false && textures.textures.CAPE) {
      delete textures.textures.CAPE;
    }
    if (!textures.textures.SKIN && CONFIG.user.defaultSkin) {
      textures.textures.SKIN = {
        url: CONFIG.user.defaultSkinURL,
      };
    }
    const textureStr = Utils.encodeb64(JSON.stringify(textures));
    return {
      id: this.id,
      name: this.name,
      ...(includeProperty && {
        profileActions: [],
        properties: [
          {
            name: "textures",
            value: textureStr,
            ...(signed && { signature: Utils.makeSignature(textureStr, PRIVATEKEY) }),
          },
          {
            name: "uploadableTextures",
            value: this.uploadableTextures,
            ...(signed && { signature: Utils.makeSignature(this.uploadableTextures, PRIVATEKEY) }),
          },
        ],
      }),
    };
  }
  /** 导出符合 api.minecraftservices.com/minecraft/profile 格式的数据 */
  getProfileData(): AuthorizatedProfileData {
    return {
      id: this.id,
      name: this.name,
      profileActions: {},
      skins: this.textures.SKIN
        ? [
            {
              id: Utils.uuid(),
              state: "ACTIVE",
              url: this.textures.SKIN.url,
              textureKey: this.textures.SKIN.url.match(/[0-9a-f]{64}/i)?.[0] ?? undefined,
              variant: this.textures.SKIN.metadata?.model === "slim" ? "SLIM" : "CLASSIC",
            },
          ]
        : [],
      capes: this.textures.CAPE
        ? [
            {
              id: Utils.uuid(),
              state: "ACTIVE",
              url: this.textures.CAPE.url,
              alias: "Vanilla",
            },
          ]
        : [],
    };
  }
  /**
   * 从官方服务器，通过登录token获取角色数据
   * @param authorization
   * @returns
   */
  static getOfficialProfileData(authorization: string): Promise<AuthorizatedProfileData> {
    if (!authorization || !CONFIG.user.officialProxy) {
      throw false;
    }
    return Utils.fetch("https://api.minecraftservices.com/minecraft/profile", {
      headers: { authorization },
      cacheMgr,
    });
  }
  /** 导出角色信息 */
  get export(): ProfileData {
    return {
      id: this.id,
      name: this.name,
      owner: this.owner,
      textures: this.textures,
      localRes: this.localRes,
      capeVisible: this.capeVisible,
      originalName: this.originalName,
      linkedMSUserId: this.linkedMSUserId,
      uploadableTextures: this.uploadableTextures,
    };
  }
}
