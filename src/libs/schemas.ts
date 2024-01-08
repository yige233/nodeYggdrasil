function object(
  description?: string,
  additionalProperties?: boolean
): (properties: any, ...required: string[]) => { type: string; description: string; properties: any; additionalProperties: {}; required: string[] } {
  return function (properties: any, ...required: string[]): { type: string; description: string; properties: any; additionalProperties: {}; required: string[] } {
    return {
      type: "object",
      description,
      properties,
      additionalProperties: additionalProperties ? {} : undefined,
      required: required && required.length > 0 ? required : undefined,
    };
  };
}
function array(description?: string): (schema: any) => { type: "array"; description: string; items: any } {
  return function (schema: any) {
    return {
      type: "array",
      description,
      items: schema,
    };
  };
}
function string(description?: string, ...enums: string[]): { type: "string"; description: string; enum: string[] } {
  return {
    type: "string",
    description,
    enum: enums && enums.length > 0 ? enums : undefined,
  };
}
function boolean(description?: string): { type: "boolean"; description: string } {
  return {
    type: "boolean",
    description,
  };
}
function number(description?: string): { type: "number"; description: string } {
  return {
    type: "number",
    description,
  };
}
function typeNull(description?: string): { type: "null"; description: string } {
  return {
    type: "null",
    description,
  };
}
export const Packer = {
  object,
  string,
  array,
  typeNull,
  boolean,
  number,
};

const model = string("皮肤可使用的模型", "default", "slim"),
  sharedVars = {
    unsigned: boolean("响应中不包含数字签名，默认为 true"),
    profileUuid: string("角色的无符号 uuid "),
    userUuid: string("用户的无符号 uuid "),
    hashUUid: string("材质的无符号 uuid "),
    textureType: string("要操作的材质类型 ", "skin", "cape"),
    authorization: string("携带了认证令牌的认证请求头"),
    contentTypeFd: string("必须是 multipart/form-data"),
    contentTypePng: string("必须是 image/png", "image/png"),
    accessToken: string("令牌的 accessToken"),
    clientToken: string("令牌的 clientToken"),
    serverId: string("mc服务器发送给认证服务器的随机id"),
    requestUser: boolean("是否在响应中包含用户信息"),
    password: string("用户密码"),
    username: string("用户账号(邮箱)"),
  },
  Config = object("验证服务器配置")({
    features: object("验证服务器的特性")({
      enable_mojang_anti_features: boolean("是否开启 Minecraft 的 anti-features"),
      enable_profile_key: boolean("服务器是否支持 Minecraft 的消息签名密钥对功能, 即多人游戏中聊天消息的数字签名(需要验证服务器支持)(目前不支持)"),
      legacy_skin_api: boolean("是否支持旧版皮肤api, 需要验证服务器支持(暂不支持)"),
      no_mojang_namespace: boolean("是否禁用 authlib-injector 的 Mojang 命名空间"),
      non_email_login: boolean("是否支持使用邮箱之外的凭证登录, 如角色名登录"),
      username_check: boolean("指示 authlib-injector 是否启用用户名验证功能(开启后，启动器将会直接拒绝启动)"),
    }),
    privExtend: object("私有扩展属性", true)(undefined),
    pubExtend: object("公开可见的扩展属性", true)(undefined),
    privateKeyPath: string("用于计算数字签名的公钥路径(不能在线修改)"),
    server: object("服务器相关")({
      homepage: string("验证服务器主页"),
      host: string("服务器监听的地址(空字符串被视为监听所有地址)(不能在线修改)"),
      keyReqRateLimit: number("关键请求速率限制(毫秒)。作用于影响账户安全的API和对服务器性能开销明显的API"),
      name: string("验证服务器名称"),
      port: number("验证服务器使用的端口(不能在线修改)"),
      proxyCount: number("服务端前面代理服务器的数量。如果存在 x-forwarded-for ，这个值决定了程序信任该头中的哪个ip"),
      register: string("验证服务器注册页"),
      root: string("验证服务器的根url，用于拼接材质url。 以斜杠(/)结尾。示例：https://auth.example.com/"),
      trustXRealIP: string("是否信任 x-real-ip 头的值"),
    }),
    skinDomains: array("材质域名白名单")(string("域名、IP地址")),
    user: object("用户相关")({
      defaultSkin: string("角色的默认皮肤url，使用steve模型"),
      enableDefaultSkin: boolean("是否启用默认皮肤(若禁用，无皮肤角色的profile里将不会包含默认皮肤的url)"),
      disableUploadTexture: boolean("禁止上传材质到服务器"),
      disableUserInviteCode: boolean("禁止使用用户邀请码注册账号"),
      enableOfficialProxy: boolean("允许正版登录玩家进入游戏(将会带来一些兼容性问题) 建议同时安装插件：https://modrinth.com/plugin/freedomchat"),
      inviteCodeUseRateLimit: number("用户验证码使用频率限制(秒)"),
      inviteCodes: array("验证服务器公共注册邀请码。留空则视为不启用")(string("邀请码字符串")),
      passLenLimit: number("用户密码长度限制"),
      tokenValidityPeriod: number("令牌过期时间(小时)"),
    }),
  }),
  PublicConfig = object("公开可见的服务器配置")({
    features: Config.properties.features,
    pubExtend: Config.properties.pubExtend,
    server: object("服务器相关")({
      homepage: Config.properties.server.properties.homepage,
      name: Config.properties.server.properties.name,
      register: Config.properties.server.properties.register,
      root: Config.properties.server.properties.root,
    }),
    user: object("用户相关")({
      disableUploadTexture: Config.properties.user.properties.disableUploadTexture,
      disableUserInviteCode: Config.properties.user.properties.disableUserInviteCode,
      enableOfficialProxy: Config.properties.user.properties.enableOfficialProxy,
      passLenLimit: Config.properties.user.properties.passLenLimit,
    }),
  }),
  TextureData = object("单个皮肤")({
    metadata: object("材质的元数据(可能不存在)")({
      model: string("材质使用的模型", "default", "slim"),
    }),
    url: string("材质的 URL"),
  }),
  TexturesData = object("角色使用的皮肤")({
    profileId: string("该皮肤绑定到的角色 uuid"),
    profileName: string("该皮肤绑定到的角色名称"),
    textures: object("材质")({
      CAPE: object("皮肤")(TextureData.properties),
      SKIN: object("皮肤")(TextureData.properties),
    }),
    timestamp: number("该属性值被生成时的时间戳"),
  }),
  PrivateUserData = object("私人可见的用户数据")({
    banned: number("是否被封禁，以及到期时间。如果大于当前时间就是被封禁"),
    extend: object(
      "扩展属性",
      true
    )({
      inviteCode: string("验证服务器个人注册邀请码"),
      source: string("用户来源"),
    }),
    id: string("用户uuid"),
    nickName: string("用户昵称"),
    profiles: array("用户拥有的角色列表")(string("角色uuid")),
    properties: array()(
      object("用户属性")({
        name: string("属性名称"),
        value: string("属性的值"),
      })
    ),
    pubExtends: object("公开可见的扩展属性", true)(undefined),
    regIP: string("注册ip"),
    regTime: number("注册的时间"),
    role: string("用户身份", "user", "admin"),
    username: sharedVars.username,
  }),
  PublicUserData = object("公开可见的用户数据")({
    banned: PrivateUserData.properties.banned,
    id: PrivateUserData.properties.id,
    nickName: PrivateUserData.properties.nickName,
    properties: PrivateUserData.properties.properties,
    pubExtends: PrivateUserData.properties.pubExtends,
    regTime: PrivateUserData.properties.regTime,
    role: PrivateUserData.properties.role,
  }),
  MinimumUserData = object("最小化用户数据")({
    id: PrivateUserData.properties.id,
    properties: PrivateUserData.properties.properties,
  }),
  ProfileData = object("角色数据")({
    id: string("角色uuid"),
    localRes: object("本地资源列表")({ cape: string("披风的uuid"), skin: string("皮肤的uuid") }),
    name: string("角色名称"),
    owner: string("角色所有者"),
    textures: object("材质列表")({ CAPE: object("披风")(TextureData.properties), SKIN: object("皮肤")(TextureData.properties) }),
    uploadableTextures: string("可上传的材质", "skin", "skin,cape"),
  }),
  PublicProfileData = {
    description: "对外暴露的角色信息",
    properties: {
      name: string("角色名称"),
      id: string("角色uuid"),
      properties: array("角色属性")(
        object("单项角色属性")({
          name: string("角色属性的名称"),
          value: string("角色属性的值"),
          signature: string("上述值的签名(可能不存在)"),
        })
      ),
    },
  },
  RequestAuth = object("认证请求")(
    {
      username: string("用户账号(在允许的情况下，也可以是角色名称)"),
      password: sharedVars.password,
      clientToken: string("(可选) 由客户端指定的令牌的 clientToken"),
      requestUser: sharedVars.requestUser,
      agent: object("agent")({
        name: {
          const: "Minecraft",
          type: "string",
        },
        version: {
          const: 1,
          type: "number",
        },
      }),
    },
    "username",
    "password"
  ),
  RequestHasJoined = object("是否加入了服务器请求")(
    {
      ip: string("玩家客户端的ip地址(可能不存在)"),
      serverId: sharedVars.serverId,
      username: string("玩家角色名称"),
    },
    "serverId",
    "username"
  ),
  RequestJoinServer = object("加入服务器请求")(
    {
      accessToken: sharedVars.accessToken,
      selectedProfile: string("该令牌绑定的角色的 UUID"),
      serverId: sharedVars.serverId,
    },
    "accessToken",
    "selectedProfile",
    "serverId"
  ),
  RequestRefresh = object("刷新令牌请求")(
    {
      accessToken: sharedVars.accessToken,
      clientToken: sharedVars.clientToken,
      requestUser: sharedVars.requestUser,
      selectedProfile: object("要选择的角色")({
        id: ProfileData.properties.id,
      }),
    },
    "accessToken"
  ),
  RequestSignout = object("吊销所有令牌请求")(
    {
      username: sharedVars.username,
      password: sharedVars.password,
    },
    "username",
    "password"
  ),
  RequestValidate = object("验证或者吊销令牌请求")(
    {
      accessToken: sharedVars.accessToken,
      clientToken: sharedVars.clientToken,
    },
    "accessToken"
  ),
  RequestProfilesQuery = array("角色名称列表")(string("角色名称")),
  ResponseAuth = object("认证响应")({
    accessToken: sharedVars.accessToken,
    clientToken: sharedVars.clientToken,
    availableProfiles: array("用户可用角色列表 (可能为空)")(PublicProfileData),
    selectedProfile: object("绑定的角色 (可能不存在)")(PublicProfileData.properties),
    user: object("用户信息 (可能不存在)")(MinimumUserData.properties),
  }),
  ResponseMeta = object("元数据响应")({
    meta: object("元数据")({
      "feature.enable_mojang_anti_features": Config.properties.features.properties.enable_mojang_anti_features,
      "feature.enable_profile_key": Config.properties.features.properties.enable_profile_key,
      "feature.legacy_skin_api": Config.properties.features.properties.legacy_skin_api,
      "feature.no_mojang_namespace": Config.properties.features.properties.no_mojang_namespace,
      "feature.non_email_login": Config.properties.features.properties.non_email_login,
      "feature.username_check": Config.properties.features.properties.username_check,
      implementationName: string("服务端实现的名称"),
      implementationVersion: number("服务端实现的版本"),
      links: object("相关链接")({
        homepage: string("验证服务器首页地址"),
        register: string("注册页面地址"),
      }),
      serverName: string("验证服务器名称"),
    }),
    signaturePublickey: string("服务器公钥"),
    skinDomains: array("材质域名白名单")(string("域名、IP地址")),
  }),
  ResponseRefresh = object("刷新令牌响应")({
    accessToken: sharedVars.accessToken,
    clientToken: sharedVars.clientToken,
    selectedProfile: object("选择的角色")(PublicProfileData.properties),
    user: object("用户信息")(MinimumUserData.properties),
  }),
  Response204 = {
    ok: typeNull("204 No Content\n这就是正常情况下的响应"),
    bad: typeNull("操作失败(但确实要返回204)"),
  },
  ResponseError = object("通用错误响应")({ error: string("错误代码"), errorMessage: string("错误说明"), cause: string("(可能存在) 导致错误的原因") }, "error", "errorMessage");
export default {
  Config,
  TextureData,
  MinimumUserData,
  PrivateUserData,
  ProfileData,
  PublicProfileData,
  PublicConfig,
  PublicUserData,
  RequestAuth,
  RequestHasJoined,
  RequestJoinServer,
  RequestRefresh,
  RequestSignout,
  RequestValidate,
  ResponseAuth,
  RequestProfilesQuery,
  ResponseMeta,
  ResponseRefresh,
  TexturesData,
  model,
  ResponseError,
  Response204,
  sharedVars,
};
