import { FastifyInstance, FastifyReply, FastifyRequest, FastifySchema, HTTPMethods } from "fastify";

import { LogFn } from "pino";

export type uuid = string;
export type uploadableTextures = "skin" | "skin,cape";
export type model = "default" | "slim";
export type TokenStatus = "invalid" | "Tvalid" | "valid";
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
  | "InternalError";

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
    /** 关键请求速率限制(毫秒)。作用于影响账户安全的API和对服务器性能开销明显的API。 */
    keyReqRateLimit: number;
    /** 服务端前面代理服务器的数量。如果存在 x-forwarded-for ，这个值决定了程序信任该头中的哪个ip */
    proxyCount: number;
    /** 是否信任 x-real-ip 头的值 */
    trustXRealIP: boolean;
  };
  /** 用户相关 */
  user: {
    /** 默认皮肤 */
    defaultSkin: string;
    /** 是否启用默认皮肤(若禁用，无皮肤角色的profile里将不会包含默认皮肤的url) */
    enableDefaultSkin: boolean;
    /** 令牌过期时间(小时) */
    tokenValidityPeriod: number;
    /** 用户密码长度限制 */
    passLenLimit: number;
    /** 验证服务器公共注册邀请码。留空则视为不启用。 */
    inviteCodes: string[];
    /** 用户验证码使用频率限制(秒) */
    inviteCodeUseRateLimit: number;
    /** 单个用户的最大角色数量 */
    maxProfileCount: number;
    /** 禁用用户邀请码 */
    disableUserInviteCode: boolean;
    /** 允许正版登录玩家进入游戏(将会带来一些问题) 建议同时安装插件：https://modrinth.com/plugin/freedomchat */
    enableOfficialProxy: boolean;
    /** 禁止上传材质到服务器 */
    disableUploadTexture: boolean;
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
    /** 禁用用户邀请码 */
    disableUserInviteCode: boolean;
    /** 允许正版登录玩家进入游戏(将会带来一些问题) 建议同时安装插件：https://modrinth.com/plugin/freedomchat */
    enableOfficialProxy: boolean;
    /** 禁止上传材质到服务器。如果程序没有检测到 sharp 图片处理库，该项会被自动启用 */
    disableUploadTexture: boolean;
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
}
/** 私人可见的用户数据 */
export interface PrivateUserData extends PublicUserData {
  /** 用户账号 (邮箱) */
  username: string;
  /** 注册ip */
  regIP: string;
  /** 用户拥有的角色列表 */
  profiles: string[];
  /** 用于加密用户聊天的证书 */
  cert: {
    /** 私钥 */
    privkey: string;
    /** 过期时间 */
    expiresAt: number;
  };
  /** 扩展属性 */
  extend?: {
    /** 验证服务器个人注册邀请码。 */
    inviteCode: string;
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
  /** 是否隐藏披风 */
  capeVisible: boolean;
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
}
/** 材质目录 */
export interface TextureIndex {
  /** 材质的hash，对应使用该材质的profile的id */
  [key: uuid]: uuid[];
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

/** 自定义route包装器的配置 */
export type RoutePackConfig = {
  /** http 方法，及对应的配置 (简化版 RouteOptions ) */
  [key in HTTPMethods]?: {
    /** 具体的处理函数。传入request, reply。要用该 reply 发送响应，或是用它包装钩子，应返回false */
    handler: (request: FastifyRequest, reply: FastifyReply) => any | Promise<any>;
    /** 验证和序列化 schema。 */
    schema?: FastifySchema;
    /** 是否使用自定义的响应 schema */
    customResponse?: boolean;
    /** 在注册路由前执行的函数 */
    before?: (instance: FastifyInstance) => any;
  };
} & {
  /** 子路由列表 */
  routes?: {
    /** 路由url */
    url: string;
    /** 子路由配置 */
    config: RoutePackConfig;
  }[];
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
     * @param uuid 额外检查提供的 token 是否属于给定的用户
     * @param profileId 额外检查提供的 token 是否拥有给定的角色，以及是否是该角色的所有者
     * @param checkAdmin 额外检查该token所属的用户是否是管理员
     */
    permCheck: (uuid?: uuid, profileId?: uuid, checkAdmin?: boolean) => true;
    /** 获取 Authorization 头中包含的 token */
    getToken: () => string;
    /**
     * 限制请求速率
     * @param key 确定该请求的目标的key
     * @param ms (默认:100) 限制的速率，毫秒
     * @returns {true}
     */
    rateLim: (key: string, ms?: number) => true;
  }
  interface FastifyInstance {
    /**
     * 按照 config 提供的配置，为对应url下的每个 http 方法都配置路由。如果是未在配置中的 http 方法，返回 405 Method Not Allwed。
     * @param url 匹配的url路径
     * @param config 配置对象
     */
    pack: (url: string, config: RoutePackConfig) => void;
    /**
     * 包装一个处理方法
     * @param handler 具体的处理函数。传入request, reply。要用该 reply 发送响应，或是用它包装钩子，应返回false
     * @returns {packedHandler}
     */
    packHandle: (handler: (request: FastifyRequest, reply: FastifyReply) => any | Promise<any>) => (request: FastifyRequest, reply: FastifyReply) => any | Promise<any>;
    allowedContentType: (...allowedContentTypes: string[]) => (request: FastifyRequest, reply: FastifyReply) => any | Promise<any>;
  }
  interface FastifyBaseLogger {
    /** 登录事件日志级别 */
    login: LogFn;
  }
}
