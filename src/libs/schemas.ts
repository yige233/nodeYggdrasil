function anyOf(...schemas: any[]) {
  return { anyOf: [...schemas] };
}

function object(description?: string, additionalProperties?: boolean) {
  return function <T>(properties: T, ...required: string[]): { type: string; description: string; properties: T; additionalProperties: {}; required: string[] } {
    return {
      type: "object",
      description,
      properties,
      additionalProperties: additionalProperties ? {} : undefined,
      required,
    };
  };
}

function array(description?: string) {
  return function <T>(schema: T) {
    return { type: "array", description, items: schema };
  };
}
function string(description?: string, ...enums: string[]) {
  return { type: "string", description, enum: enums && enums.length > 0 ? enums : undefined };
}
function boolean(description?: string): { type: "boolean"; description: string } {
  return { type: "boolean", description };
}
function number(type: "integer" | "number") {
  return function (description?: string, minimum?: number, maximum?: number): { type: "integer" | "number"; description: string; minimum: number; maximum: number } {
    return { type, description, minimum, maximum };
  };
}
function typeNull(description?: string): { type: "null"; description: string } {
  return { type: "null", description };
}
export const Packer = { object, string, array, typeNull, boolean, number: number("number"), integer: number("integer"), anyOf };

const WebhookConfig = object("webhook配置")({
    active: boolean("是否启用该webhook"),
    url: string("webhook url"),
    subTypes: array("订阅类型列表")(string("要订阅的事件类型", "user.login", "test")),
    secrets: array("签名密钥列表")(
      object("签名密钥")({
        key: string("密钥内容"),
        type: string("密钥类型", "v1", "v1a"),
      })
    ),
  }),
  model = string("皮肤可使用的模型", "default", "slim"),
  shared = {
    unsigned: boolean("响应中不包含数字签名，默认为 true"),
    userUuid: string("用户的无符号 uuid "),
    serverId: string("mc服务器发送给认证服务器的随机id"),
    password: string("用户密码"),
    username: string("用户账号(邮箱)"),
    usernameInput: string("用户账号，可接受邮箱、用户uuid、拥有的角色uuid，若用于登录且服务器允许，还可用角色名称"),
    profileUuid: string("角色的无符号 uuid "),
    textureType: string("要操作的材质类型", "skin", "cape"),
    accessToken: string("令牌的 accessToken"),
    clientToken: string("令牌的 clientToken"),
    requestUser: boolean("是否在响应中包含用户信息"),
    authorization: string("携带了认证令牌的认证请求头"),
  },
  Config = object("验证服务器配置")({
    privExtend: object("私有扩展属性", true)(undefined),
    pubExtend: object("公开可见的扩展属性", true)(undefined),
    skinDomains: array("材质域名白名单")(string("域名、IP地址")),
    privateKeyPath: string("用于计算数字签名的公钥路径(不能在线修改)"),
    features: object("验证服务器的特性")({
      username_check: boolean("指示 authlib-injector 是否启用用户名验证功能(开启后，启动器将会直接拒绝启动)"),
      legacy_skin_api: boolean("是否支持旧版皮肤api, 需要验证服务器支持(暂不支持)"),
      non_email_login: boolean("是否支持使用邮箱之外的凭证登录, 如角色名登录"),
      enable_profile_key: boolean("服务器是否支持 Minecraft 的消息签名密钥对功能, 即多人游戏中聊天消息的数字签名"),
      no_mojang_namespace: boolean("是否禁用 authlib-injector 的 Mojang 命名空间"),
      enable_mojang_anti_features: boolean("是否开启 Minecraft 的 anti-features"),
    }),
    server: object("服务器相关")({
      host: string("服务器监听的地址(空字符串被视为监听所有地址)(不能在线修改)"),
      name: string("验证服务器名称"),
      port: number("integer")("验证服务器使用的端口(不能在线修改)"),
      root: string("验证服务器的根url，用于拼接材质url。 以斜杠(/)结尾。示例：https://auth.example.com/"),
      cors: string("Access-Control-Allow-Origin 请求头的值"),
      homepage: string("验证服务器主页"),
      register: string("验证服务器注册页"),
      proxyCount: number("integer")("服务端前面代理服务器的数量。如果存在 x-forwarded-for ，这个值决定了程序信任该头中的哪个ip"),
      trustXRealIP: boolean("是否信任 x-real-ip 头的值"),
      keyReqRL: string("关键请求速率限制(毫秒)。作用于影响账户安全的API和对服务器性能开销明显的API"),
    }),
    user: object("用户相关")({
      inviteCodes: array("验证服务器公共注册邀请码。留空则视为不启用")(string("邀请码字符串")),
      defaultSkin: boolean("是否启用默认皮肤(若禁用，无皮肤角色的profile里将不会包含默认皮肤的url)"),
      passLenLimit: number("integer")("用户密码长度限制"),
      uploadTexture: boolean("是否允许上传材质到服务器"),
      officialProxy: boolean("是否允许正版登录玩家进入游戏(将会带来一些兼容性问题) 建议同时安装插件：https://modrinth.com/plugin/freedomchat"),
      userInviteCode: boolean("是否允许使用用户邀请码注册账号"),
      defaultSkinURL: string("角色的默认皮肤url，使用steve模型"),
      offlineProfile: boolean("是否允许创建兼容离线模式的角色(使用和离线模式相同的方式计算角色的uuid)"),
      passwdHashType: string("用户密码hash方式", "HMACsha256", "sha256"),
      keyOpRL: string("用户重要操作频率限制(秒)"),
      maxProfileCount: number("integer")("用户最大角色数量限制"),
      tokenTTL: string("令牌过期时间(小时)"),
      defaultInviteCodeCount: number("integer")("新用户默认拥有的可生成邀请码次数"),
      officialPlayerWhitelist: boolean("是否开启正版玩家白名单功能"),
      changeOfflineProfileName: boolean("是否允许修改兼容离线模式的角色名称。该项禁用时修改了名称的角色仍然可以继续使用修改后的名称。"),
      changeUserName: boolean("是否允许修改用户名"),
    }),
    webhooks: array("webhook配置列表")(WebhookConfig),
  }),
  PublicConfig = object("公开可见的服务器配置")({
    features: Config.properties.features,
    pubExtend: Config.properties.pubExtend,
    server: object("服务器相关")({
      name: Config.properties.server.properties.name,
      root: Config.properties.server.properties.root,
      register: Config.properties.server.properties.register,
      homepage: Config.properties.server.properties.homepage,
    }),
    user: object("用户相关")({
      passLenLimit: Config.properties.user.properties.passLenLimit,
      uploadTexture: Config.properties.user.properties.uploadTexture,
      officialProxy: Config.properties.user.properties.officialProxy,
      userInviteCode: Config.properties.user.properties.userInviteCode,
      offlineProfile: Config.properties.user.properties.offlineProfile,
      maxProfileCount: Config.properties.user.properties.maxProfileCount,
      changeOfflineProfileName: Config.properties.user.properties.changeOfflineProfileName,
    }),
  }),
  TextureData = object("单个皮肤")({
    url: string("材质的 URL"),
    metadata: object("材质的元数据(可能不存在)")({
      model: string("材质使用的模型", "default", "slim"),
    }),
  }),
  TexturesData = object("角色使用的皮肤")({
    profileId: string("该皮肤绑定到的角色 uuid"),
    timestamp: number("integer")("该属性值被生成时的时间戳"),
    profileName: string("该皮肤绑定到的角色名称"),
    signatureRequired: boolean("提示是否需要签名。仅当请求url中查询参数“unsigned”为false时才存在，存在时其值始终为true"),
    textures: object("材质")({
      CAPE: object("皮肤")(TextureData.properties),
      SKIN: object("皮肤")(TextureData.properties),
    }),
  }),
  PrivateUserData = object("私人可见的用户数据")({
    id: string("用户uuid"),
    role: string("用户身份", "user", "admin"),
    regIP: string("注册ip"),
    banned: number("integer")("是否被封禁，以及到期时间。如果大于当前时间就是被封禁"),
    regTime: number("integer")("注册的时间"),
    username: shared.username,
    nickName: string("用户昵称"),
    profiles: array("用户拥有的角色列表")(string("角色uuid")),
    pubExtends: object("公开可见的扩展属性", true)(undefined),
    extend: object("扩展属性", true)({ source: string("用户来源") }),
    maxProfileCount: number("integer")("用户最大角色数量限制"),
    remainingInviteCodeCount: number("integer")("用户剩余可生成的邀请码数量"),
    properties: array()(
      object("用户属性")({
        name: string("属性名称"),
        value: string("属性的值"),
      })
    ),
  }),
  PublicUserData = object("公开可见的用户数据")({
    id: PrivateUserData.properties.id,
    role: PrivateUserData.properties.role,
    banned: PrivateUserData.properties.banned,
    regTime: PrivateUserData.properties.regTime,
    nickName: PrivateUserData.properties.nickName,
    properties: PrivateUserData.properties.properties,
    pubExtends: PrivateUserData.properties.pubExtends,
  }),
  MinimumUserData = object("最小化用户数据")({
    id: PrivateUserData.properties.id,
    properties: PrivateUserData.properties.properties,
  }),
  ProfileData = object("角色数据")({
    id: string("角色uuid"),
    name: string("角色名称"),
    owner: string("角色所有者"),
    localRes: object("本地资源列表")({ cape: string("披风的uuid"), skin: string("皮肤的uuid") }),
    textures: object("材质列表")({ CAPE: object("披风")(TextureData.properties), SKIN: object("皮肤")(TextureData.properties) }),
    uploadableTextures: string("可上传的材质", "skin", "skin,cape"),
  }),
  PublicProfileData = object("对外暴露的角色信息")({
    id: string("角色uuid"),
    name: string("角色名称"),
    properties: array("角色属性")(
      object("单项角色属性")({
        name: string("角色属性的名称"),
        value: string("角色属性的值"),
        signature: string("上述值的签名(可能不存在)"),
      })
    ),
    profileActions: array("游戏需要针对该账户采取的操作的列表")(string("操作代号。实际上是个空数组", "FORCED_NAME_CHANGE", "USING_BANNED_SKIN")),
  }),
  RequestAuth = object("认证请求")(
    {
      username: string("用户账号(在允许的情况下，也可以是角色名称)"),
      password: shared.password,
      clientToken: string("(可选) 由客户端指定的令牌的 clientToken"),
      requestUser: shared.requestUser,
      agent: object("agent")({
        name: {
          type: "string",
          const: "Minecraft",
        },
        version: {
          type: "number",
          const: 1,
        },
      }),
    },
    "username",
    "password"
  ),
  RequestHasJoined = object("是否加入了服务器请求")(
    {
      ip: string("玩家客户端的ip地址(可能不存在)"),
      serverId: shared.serverId,
      username: string("玩家角色名称"),
    },
    "serverId",
    "username"
  ),
  RequestJoinServer = object("加入服务器请求")(
    {
      serverId: shared.serverId,
      accessToken: shared.accessToken,
      selectedProfile: string("该令牌绑定的角色的 UUID"),
    },
    "accessToken",
    "selectedProfile",
    "serverId"
  ),
  RequestRefresh = object("刷新令牌请求")(
    {
      accessToken: shared.accessToken,
      clientToken: shared.clientToken,
      requestUser: shared.requestUser,
      selectedProfile: object("要选择的角色")({
        id: ProfileData.properties.id,
      }),
    },
    "accessToken"
  ),
  RequestSignout = object("吊销所有令牌请求")(
    {
      username: shared.username,
      password: shared.password,
    },
    "username",
    "password"
  ),
  RequestValidate = object("验证或者吊销令牌请求")(
    {
      accessToken: shared.accessToken,
      clientToken: shared.clientToken,
    },
    "accessToken"
  ),
  RequestProfilesQuery = array("角色名称列表")(string("角色名称")),
  ResponseAuth = object("认证响应")({
    user: object("用户信息 (可能不存在)")(MinimumUserData.properties),
    accessToken: shared.accessToken,
    clientToken: shared.clientToken,
    selectedProfile: object("绑定的角色 (可能不存在)")(PublicProfileData.properties),
    availableProfiles: array("用户可用角色列表 (可能为空)")(PublicProfileData),
  }),
  ResponseMeta = object("元数据响应")({
    meta: object("元数据")({
      serverName: string("验证服务器名称"),
      "feature.legacy_skin_api": Config.properties.features.properties.legacy_skin_api,
      "feature.username_check": Config.properties.features.properties.username_check,
      "feature.non_email_login": Config.properties.features.properties.non_email_login,
      "feature.enable_profile_key": Config.properties.features.properties.enable_profile_key,
      "feature.no_mojang_namespace": Config.properties.features.properties.no_mojang_namespace,
      "feature.enable_mojang_anti_features": Config.properties.features.properties.enable_mojang_anti_features,
      implementationName: string("服务端实现的名称"),
      implementationVersion: number("number")("服务端实现的版本"),
      links: object("相关链接")({
        homepage: string("验证服务器首页地址"),
        register: string("注册页面地址"),
      }),
    }),
    signaturePublickey: string("服务器公钥"),
    skinDomains: array("材质域名白名单")(string("域名、IP地址")),
  }),
  ResponseRefresh = object("刷新令牌响应")({
    user: object("用户信息")(MinimumUserData.properties),
    accessToken: shared.accessToken,
    clientToken: shared.clientToken,
    selectedProfile: object("选择的角色")(PublicProfileData.properties),
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
  shared,
  WebhookConfig,
};
