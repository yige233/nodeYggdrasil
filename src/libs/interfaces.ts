import { FastifyInstance, FastifyReply, FastifyRequest, FastifySchema } from "fastify";

import { LogFn } from "pino";
import Profile from "./profile.js";
import User from "./user.js";

/** uuid类型 */
export type uuid = string;
/** 可上传的材质 */
export type uploadableTextures = "skin" | "skin,cape";
/** 皮肤可使用的模型 */
export type model = "default" | "slim";
/** 令牌状态 */
export type TokenStatus = "invalid" | "Tvalid" | "valid";
/** http状态 */
export type Status =
  | "Unauthorized"
  | "ForbiddenOperation"
  | "IllegalArgument"
  | "BadOperation"
  | "NotFound"
  | "ContentTooLarge"
  | "TooManyRequests"
  | "UnsupportedMediaType"
  | "UnprocessableEntity"
  | "MethodNotAllowed"
  | "ServiceUnavailable"
  | "InternalError";

/** webhook事件类型 */
export type WebhookTypes =
  | "test"
  | "server.start"
  | "server.killed"
  | "server.error"
  | "user.login"
  | "user.loginWithXbox"
  | "user.logout"
  | "user.register"
  | "user.lock"
  | "user.delete"
  | "user.password.reset"
  | "user.banned"
  | "user.unbanned"
  | "profile.create"
  | "profile.delete"
  | "join.yggdrasil"
  | "join.official";

/** 验证服务器配置文件 */
export interface Config extends PublicConfig {
  /** 服务器相关 */
  server: {
    /** 服务器监听的地址(空字符串被视为监听所有地址) */
    host: string;
    /** 验证服务器使用的端口 */
    port: number;
    /** 验证服务器的根url，用于拼接材质url。 以斜杠(/)结尾。示例：https://auth.example.com/ */
    root: string;
    /** 验证服务器名称 */
    name: string;
    /** 验证服务器主页 */
    homepage: string;
    /** 验证服务器注册页 */
    register: string;
    /** 关键请求速率限制。作用于影响账户安全的API和对服务器性能开销明显的API。 */
    keyReqRL: string;
    /** 服务端前面代理服务器的数量。如果存在 x-forwarded-for ，这个值决定了程序信任该头中的哪个ip */
    proxyCount: number;
    /** 是否信任 x-real-ip 头的值 */
    trustXRealIP: boolean;
  };
  /** 用户相关 */
  user: {
    /** 密码hash方式 */
    passwdHashType: "HMACsha256" | "sha256";
    /** 默认皮肤 */
    defaultSkinURL: string;
    /** 身份验证令牌过期时间 */
    tokenTTL: string;
    /** 用户密码长度限制 */
    passLenLimit: number;
    /** 验证服务器公共注册邀请码。留空则视为不启用。 */
    inviteCodes: string[];
    /** 用户关键行为速率限制，包括使用邀请码、修改用户信息、为角色绑定微软账户 */
    keyOpRL: string;
    /** 是否启用默认皮肤(若禁用，无皮肤角色的profile里将不会包含默认皮肤的url) */
    defaultSkin: boolean;
    /** 是否启用用户邀请码 */
    userInviteCode: boolean;
    /** 是否允许正版玩家进入游戏(将会带来一些问题) 建议同时安装插件：https://modrinth.com/plugin/freedomchat */
    officialProxy: boolean;
    /** 新用户可拥有的最大角色数量 */
    maxProfileCount: number;
    /** 在保持 officialProxy 开启的情况下，使用白名单控制可加入服务器的正版玩家。若为false，则是使用黑名单控制不可加入服务器的正版玩家。*/
    officialPlayerWhitelist: false;
    /** 是否允许上传材质到服务器。 */
    uploadTexture: boolean;
    /** 是否允许创建兼容离线模式的角色(使用和离线模式相同的方式计算角色的uuid) */
    offlineProfile: boolean;
    /** 是否允许修改兼容离线模式的角色名称。该项禁用后，已经修改了名称的角色仍然可以继续使用修改后的名称。 */
    changeOfflineProfileName: boolean;
    /** 新用户默认拥有的可生成邀请码次数 */
    defaultInviteCodeCount: number;
  };
  /** 皮肤服务器白名单 */
  skinDomains: string[];
  /** 用于计算数字签名的私钥 */
  privateKeyPath: string;
  /** 扩展属性 */
  privExtend: {
    /** 其他扩展属性 */
    [key: string]: any;
  };
  /** webhook配置列表 */
  webhooks: WebHookConfig[];
}
/** 公开可见的服务器配置 */
export interface PublicConfig {
  server: {
    /** 验证服务器的根url，用于拼接材质url。 以斜杠(/)结尾。示例：https://auth.example.com/ */
    root: string;
    /** 验证服务器名称 */
    name: string;
    /** 验证服务器主页 */
    homepage: string;
    /** 验证服务器注册页 */
    register: string;
  };
  user: {
    /** 用户密码长度限制 */
    passLenLimit: number;
    /** 是否启用用户邀请码 */
    userInviteCode: boolean;
    /** 是否允许正版登录玩家进入游戏(将会带来一些问题) 建议同时安装插件：https://modrinth.com/plugin/freedomchat */
    officialProxy: boolean;
    /** 是否允许上传材质到服务器。 */
    uploadTexture: boolean;
    /** 是否允许创建兼容离线模式的角色(使用和离线模式相同的方式计算角色的uuid) */
    offlineProfile: boolean;
    /** 单个用户的最大角色数量 */
    maxProfileCount: number;
    /** 是否允许修改兼容离线模式的角色名称。该项禁用时修改了名称的角色仍然可以继续使用修改后的名称。 */
    changeOfflineProfileName: boolean;
  };
  /** 验证服务器的特性 */
  features?: {
    /** 是否支持使用邮箱之外的凭证登录, 如角色名登录（需要验证服务器支持） */
    non_email_login?: boolean;
    /** 是否支持旧版皮肤api, 需要验证服务器支持（暂不支持） */
    legacy_skin_api?: boolean;
    /** 是否禁用 authlib-injector 的 Mojang 命名空间 */
    no_mojang_namespace?: boolean;
    /** 是否开启 Minecraft 的 anti-features */
    enable_mojang_anti_features?: boolean;
    /** 服务器是否支持 Minecraft 的消息签名密钥对功能, 即多人游戏中聊天消息的数字签名 */
    enable_profile_key?: boolean;
    /** 指示 authlib-injector 是否启用用户名验证功能（开启后，启动器将会直接拒绝启动） */
    username_check?: boolean;
  };
  /** 公共扩展属性 */
  pubExtend: {
    /** 其他扩展属性 */
    [key: string]: any;
  };
}
/** 完整的用户数据 */
export interface UserData extends Required<PrivateUserData> {
  /** 用户密码 */
  password: string;
  /** 用户的救援码 */
  rescueCode: string;
  /** 用户的盐值。不记录在users.json中，而是单独记录在salts.json中 */
  salt: string;
}
/** 私人可见的用户数据 */
export interface PrivateUserData extends PublicUserData {
  /** 用户账号 (邮箱) */
  username: string;
  /** 注册ip */
  regIP: string;
  /** 用户拥有的角色列表 */
  profiles: string[];
  /** 该用户可创建的最大的角色数量 */
  maxProfileCount: number;
  /** 用户剩余可生成的邀请码数量 */
  remainingInviteCodeCount: number;
  /** 用于加密用户聊天的证书 */
  cert: {
    /** 私钥 */
    privkey: string;
    /** 过期时间 */
    expiresAt: number;
  };
  /** 扩展属性 */
  extend?: {
    /** 用户来源 */
    source: uuid | "system";
    /** 其他扩展属性 */
    [key: string]: any;
  };
}
/** 公共可见的用户数据 */
export interface PublicUserData extends MinimumUserData {
  /**用户昵称 */
  nickName: string;
  /** 注册的时间 */
  regTime: number;
  /** 用户身份 */
  role: "admin" | "user";
  /** 是否被封禁，以及到期时间。如果大于当前时间就是被封禁。 */
  banned: number;
  /** 是否是只读账户 */
  readonly: boolean;
  /** 公共可见的扩展属性 */
  pubExtends: {
    /** 其他扩展属性 */
    [key: string]: any;
  };
}
/** 最小化用户数据 */
export interface MinimumUserData {
  /** 用户uuid */
  id: uuid;
  /** 用户属性 */
  properties?: { name: "preferredLanguage" | string; value: string }[];
}
/** 单个皮肤文件 */
export interface TextureData {
  /** 材质的 URL, */
  url: string;
  /** 材质的元数据(可能不存在) */
  metadata?: {
    /** 材质使用的模型 */
    model?: "default" | "slim";
  };
}
/** 角色使用的皮肤 */
export interface TexturesData {
  /** 该属性值被生成时的时间戳 */
  timestamp: number;
  /** 该皮肤绑定到的角色 UUID*/
  profileId: uuid;
  /** 该皮肤绑定到的角色名称*/
  profileName: string;
  /** 提示是否需要签名。仅当请求url中查询参数“unsigned”为false时才存在 */
  signatureRequired?: true;
  /** 材质 */
  textures: {
    /** 皮肤 */
    SKIN?: TextureData;
    /** 披风 */
    CAPE?: TextureData;
  };
}
/** 角色 */
export interface ProfileData {
  /** 角色uuid */
  id: uuid;
  /** 角色名称 */
  name: string;
  /** 角色所有者 */
  owner?: uuid;
  /** 是否显示披风 */
  capeVisible: boolean;
  /** 角色创建时的原始名称 */
  originalName: string;
  /** 关联的微软账号id */
  linkedMSUserId?: string;
  /** 可上传的材质 */
  uploadableTextures: uploadableTextures;
  /** 材质列表 */
  textures: {
    /** 皮肤 */
    SKIN?: TextureData;
    /** 披风 */
    CAPE?: TextureData;
  };
  /** 本地资源列表 */
  localRes: {
    /** 皮肤 */
    skin?: string;
    /** 披风 */
    cape?: string;
  };
}
/** 对外暴露的角色信息 */
export interface PublicProfileData {
  /** 角色uuid */
  id: uuid;
  /** 角色名称 */
  name: string;
  /** 角色属性 */
  properties?: { name: string; value: string; signature?: string }[];
  /** 游戏需要针对该账户采取的操作的列表 */
  profileActions: ("FORCED_NAME_CHANGE" | "USING_BANNED_SKIN")[];
}
/** 认证请求 */
export interface RequestAuth {
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
  /** (可选) 由客户端指定的令牌的 clientToken */
  clientToken?: string;
  /** 是否在响应中包含用户信息 */
  requestUser?: boolean;
  agent: {
    name: "Minecraft";
    version: 1;
  };
}
/** 认证响应 */
export interface ResponseAuth {
  /** 令牌的 accessToken */
  accessToken: string;
  /** 令牌的 clientToken */
  clientToken: string;
  /** 用户可用角色列表 */
  availableProfiles: PublicProfileData[];
  /** 绑定的角色 */
  selectedProfile?: {};
  /** 对外暴露的用户信息 */
  user?: MinimumUserData;
}
/** 刷新令牌请求 */
export interface RequestRefresh {
  /** 令牌的 accessToken */
  accessToken: string;
  /** 令牌的 clientToken */
  clientToken: string;
  /** 是否在响应中包含用户信息 */
  requestUser: boolean;
  /** 要选择的角色 */
  selectedProfile: PublicProfileData;
}
/** 刷新令牌响应 */
export interface ResponseRefresh {
  /** 令牌的 accessToken */
  accessToken: string;
  /** 令牌的 clientToken */
  clientToken: string;
  /** 要选择的角色 */
  selectedProfile: PublicProfileData;
  /** 对外暴露的用户信息 */
  user?: MinimumUserData;
}
/** 验证、吊销令牌请求 */
export interface RequestValidate {
  /** 令牌的 accessToken */
  accessToken: string;
  /** 令牌的 clientToken */
  clientToken?: string;
}
/** 吊销所有令牌请求 */
export interface RequestSignout {
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
}
/** 是否加入了服务器请求 */
export interface RequestHasJoined {
  /** 玩家角色名称 */
  username: string;
  /** mc服务器发送给认证服务器的随机id */
  serverId: string;
  /** 玩家客户端的ip地址(可能不存在) */
  ip?: string;
}
/** 加入服务器请求 */
export interface RequestJoinServer {
  /** 令牌的 accessToken */
  accessToken: string;
  /** 该令牌绑定的角色的 UUID */
  selectedProfile: string;
  /** mc服务器发送给认证服务器的随机id */
  serverId: string;
}
/** 元数据响应 */
export interface ResponseMeta {
  /** 元数据 */
  meta: {
    /** 验证服务器名称 */
    serverName?: string;
    /** 服务端实现的名称 */
    implementationName?: string;
    /** 服务端实现的版本 */
    implementationVersion?: number;
    /** 链接 */
    links?: {
      /** 验证服务器首页地址 */
      homepage: string;
      /** 注册页面地址 */
      register: string;
    };
    "feature.non_email_login"?: boolean;
    "feature.legacy_skin_api"?: boolean;
    "feature.no_mojang_namespace"?: boolean;
    "feature.enable_mojang_anti_features"?: boolean;
    "feature.enable_profile_key"?: boolean;
    "feature.username_check"?: boolean;
  };
  /** 材质域名白名单 */
  skinDomains: string[];
  signaturePublickey: string;
}
/** 玩家聊天证书响应 */
export interface ResponseCertificates {
  keyPair: {
    privateKey: string;
    publicKey: string;
  };
  expiresAt: string;
  refreshedAfter: string;
  publicKeySignature: string;
  publicKeySignatureV2: string;
}
/** 服务器公钥响应 */
export interface ResponsePublicKeys {
  profilePropertyKeys: { publicKey: string }[];
  playerCertificateKeys: { publicKey: string }[];
}

/** 符合 api.minecraftservices.com/minecraft/profile 格式的数据 */
export interface AuthorizatedProfileData {
  /** 角色id */
  id: uuid;
  /** 角色名称 */
  name: string;
  /** 固定的空对象 */
  profileActions: {};
  /** 拥有的皮肤数组 */
  skins: {
    /** 皮肤id */
    id: uuid;
    /** 皮肤状态，一般都是 "ACTIVE" */
    state: "ACTIVE" | "INACTIVE";
    /** 皮肤url */
    url: string;
    /** 材质的key id，对于官方皮肤，就是该皮肤的sha256 hash值 */
    textureKey: string;
    /** 皮肤变种，分别对应细手臂模型和经典（粗手臂）模型 */
    variant: "SLIM" | "CLASSIC";
  }[];
  /** 拥有的披风数组。对于官方角色，可以拥有好几个披风 */
  capes: {
    /** 披风id */
    id: uuid;
    /** 披风状态。拥有复数披风的情况下，启用的那个披风的state为 "ACTIVE"，其他的为 "INACTIVE" */
    state: "ACTIVE" | "INACTIVE";
    /** 披风url */
    url: string;
    /** 披风别名 */
    alias?: string;
  }[];
}

/** webhook使用的密钥 */
export interface WebhookSecrets {
  /** 密钥类型.v1: hmacSHA256对称加密密钥; v2: ed25519 非对称加密公钥 */
  type: "v1" | "v1a";
  /** 密钥内容 */
  key: string;
}

/** 单一webhook配置 */
export interface WebHookConfig {
  /** webhook id */
  id: string;
  /** 是否启用该webhook */
  active: boolean;
  /** webhook地址 */
  url: string;
  /** 订阅的事件列表 */
  subTypes: WebhookTypes[];
  /** 生成签名的密钥 */
  secrets: WebhookSecrets[];
}

/** 尚未实例化的webhook请求对象 */
export interface WebHookReqInit extends RequestInit {
  /** 该请求的消息id */
  messageId: string;
  /** 该请求的消息内容 */
  data: string;
  /** 该请求要送达的webhook地址 */
  url: string;
  /** 该请求发送失败的次数 */
  errorCount: number;
}
/** 记录的官方玩家名单 */
export interface OfficialPlayerList {
  /** 黑名单列表。偏好黑名单时，该名单中的正版玩家无法加入服务器。 */
  blacklist: uuid[];
  /** 白名单列表。偏好白名单时，仅该名单中的正版玩家才能加入服务器。 */
  whitelist: uuid[];
  /** 已记录的正版玩家列表。 */
  logged: uuid[];
}

export type HTTPMethods = "delete" | "get" | "head" | "patch" | "post" | "put" | "options";

/** 自定义route包装器的配置 */
export type RoutePackConfig = {
  /** 路由url。若需要由父路由指定，则设为undefined，然后在父路由通过 { ...routePackConfig, url: "/url-path" } 方式合并。也可以自行指定，作为默认值 */
  url?: string;
  /** 在注册路由前执行的函数 */
  before?: (instance: FastifyInstance) => void;
  /** 子路由列表 */
  routes?: RoutePackConfig[];
} & {
  /** http 方法，及对应的配置 (简化版 RouteOptions ) */
  [key in HTTPMethods]?: {
    /** 具体的处理函数。传入request, reply。要用该 reply 发送响应，或是用它包装钩子，应返回false */
    handler: (request: FastifyRequest, reply: FastifyReply) => any | Promise<any>;
    /** 验证和序列化 schema。 */
    schema?: FastifySchema;
    /** 是否使用自定义的响应 schema */
    customResponse?: boolean;
  };
};

/** 对象的黑名单参数类型 */
export type ObjBlackList =
  | string
  | {
      /** 父节点 */
      p: string;
      /** 父节点上的黑名单属性 */
      c: ObjBlackList[];
    };

/* 利用声明合并将自定义属性加入 Fastify 的类型系统 */
declare module "fastify" {
  interface FastifyReply {
    /**
     * 响应非2xx结果
     * @param error 错误代码
     * @param errorMessage 详细错误说明
     * @param cause 导致错误的原因
     * @returns {void}
     */
    replyError: (error: Status, errorMessage: string, cause?: string) => void;
    /**
     * 响应2xx结果
     * @param data 响应数据
     * @param code 响应代码
     * @returns {void}
     */
    replySuccess: (data: any, code?: number) => void;
  }
  interface FastifyRequest {
    getIP: () => string;
    /**
     * 进行权限检查。默认只检查 Authorization 头是否有效
     * @param userId 额外检查提供的 token 是否属于给定的用户
     * @param profileId 额外检查提供的 token 是否绑定至给定的角色，以及该 token 的所有者是否也是该角色的所有者。提供了该项，返回内容中会包含 profile 字段
     * @param checkAdmin 额外检查该 token 所属的用户是否是管理员
     */
    permCheck: (userId?: uuid, profileId?: uuid, checkAdmin?: boolean) => { token: uuid; user: User; profile?: Profile };
    /** 获取 Authorization 头中包含的 token */
    getToken: () => string;
    /**
     * 限制请求速率
     * @param key 确定该请求的目标的key
     * @param 操作名称，同一个key使用不同的操作名称可以避免意外触发速率限制
     * @param ms (默认时长受config.json限制) 限制的速率，毫秒，或是时间字符串(例如：30s)
     * @returns {true}
     */
    rateLim: (key: string, operation: string, ms?: number | string) => true;
  }
  interface FastifyInstance {
    /**
     * 按照 config 提供的配置，为对应url下的每个 http 方法都配置路由。如果是未在配置中的 http 方法，返回 405 Method Not Allwed。
     * @param url 匹配的url路径
     * @param config 配置对象
     */
    pack: (config: RoutePackConfig) => void;
    /**
     * 包装一个处理方法
     * @param handler 具体的处理函数。传入request, reply。要用该 reply 发送响应，或是用它包装钩子，可以返回false
     * @returns {packedHandler}
     */
    packHandle: (handler: (request: FastifyRequest, reply: FastifyReply) => any | Promise<any>) => (request: FastifyRequest, reply: FastifyReply) => any | Promise<any>;
    allowedContentType: (...allowedContentTypes: string[]) => (request: FastifyRequest, reply: FastifyReply) => any | Promise<any>;
  }
  interface FastifyBaseLogger {
    /** 登录事件日志级别 */
    login: LogFn;
    /** webhook事件日志级别 */
    webhook: LogFn;
  }
}
