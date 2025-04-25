import fs from "node:fs/promises";
import crypto, { KeyObject } from "crypto";
import { FastifyReply, FastifyRequest } from "fastify";
import { MultipartFile } from "@fastify/multipart";
import {
  uuid,
  RequestAuth,
  ResponseAuth,
  RequestRefresh,
  ResponseRefresh,
  RequestValidate,
  RequestSignout,
  RequestJoinServer,
  RequestHasJoined,
  ResponseMeta,
  PublicProfileData,
  ResponseCertificates,
  ResponsePublicKeys,
} from "../libs/interfaces.js";
import Utils, { ErrorResponse, SuccessResponse, Time } from "../libs/utils.js";
import Session from "../libs/session.js";
import Token from "../libs/token.js";
import User from "../libs/user.js";
import { checkTexture } from "../libs/textures.js";
import { PROFILES, CONFIG, PUBLICKEY, TOKENSMAP, PRIVATEKEY, OFFICIALPUBKEY, USERS, WEBHOOK, pathOf } from "../global.js";
import Profile from "../libs/profile.js";

/** /authserver/ 开头的部分API */
export const AuthserverService = {
  /** 用户认证 */
  login(request: FastifyRequest<{ Body: RequestAuth }>): SuccessResponse<ResponseAuth> {
    const { username = null, password = null, clientToken = undefined, requestUser = false }: RequestAuth = request.body;
    const loginIP = request.getIP();
    request.rateLim(username || "", "authenticate");
    request.log.login(`新的登录请求：尝试以 ${username} 为用户名进行登录。登录IP地址: ${loginIP}`);
    const user = User.authenticate(username, password);
    // 使用角色名称登录成功，获取该角色的id
    const profileId = PROFILES.has(username) ? PROFILES.get(username)?.id : undefined;
    /** 申请新令牌 */
    const token = new Token(clientToken ? clientToken : Utils.uuid(), user.id, profileId);
    // 从令牌中获取该令牌绑定的角色名称
    const profileName = token.profile ? PROFILES.get(token.profile).name : undefined;
    request.log.login(`用户 ${user.username} (内部ID: ${user.id}) 登录成功${profileName ? `，登录令牌绑定至 ${profileName}` : ""}。登录IP地址: ${loginIP}`);
    /** 构造响应数据 */
    const responseData: ResponseAuth = {
      accessToken: token.accessToken,
      clientToken: token.clientToken,
      availableProfiles: user.yggdrasilProfiles,
      selectedProfile: token.yggdrasilProfile || undefined,
      user: requestUser ? user.yggdrasilData : undefined,
    };
    WEBHOOK.emit("user.login", {
      nickName: token.owner.nickName,
      id: token.owner.id,
      ip: request.getIP(),
    });
    return new SuccessResponse(responseData);
  },
  /** 刷新令牌 */
  refresh(request: FastifyRequest<{ Body: RequestRefresh }>): SuccessResponse<ResponseRefresh> {
    const { accessToken = null, clientToken = undefined, requestUser = false, selectedProfile = undefined }: RequestRefresh = request.body;
    /** 刷新令牌 */
    const result = Token.refresh(accessToken, clientToken, selectedProfile?.id);
    /** 构造响应数据 */
    const responseData: ResponseRefresh = {
      accessToken: result.accessToken,
      clientToken: result.clientToken,
      selectedProfile: result.yggdrasilProfile || undefined,
      user: requestUser ? result.owner.yggdrasilData : undefined,
    };
    return new SuccessResponse(responseData);
  },
  /** 验证令牌有效性 */
  validate(request: FastifyRequest<{ Body: RequestValidate }>): SuccessResponse<undefined> {
    const { accessToken = null, clientToken = undefined }: RequestValidate = request.body;
    if (Token.validate(accessToken, clientToken) != "valid") {
      throw new ErrorResponse("ForbiddenOperation", "Invalid token.");
    }
    // 令牌有效
    return new SuccessResponse(undefined, 204);
  },
  /** 注销令牌 */
  invalidate(request: FastifyRequest<{ Body: RequestValidate }>): SuccessResponse<undefined> {
    const { accessToken = null }: RequestValidate = request.body;
    Token.invalidate(accessToken);
    return new SuccessResponse(undefined, 204);
  },
  /** 注销所有令牌 */
  logout(request: FastifyRequest<{ Body: RequestSignout }>): SuccessResponse<undefined> {
    const { username = null, password = null }: RequestSignout = request.body;
    request.rateLim(username || "", "authenticate");
    const user = User.authenticate(username, password);
    user.logout();
    WEBHOOK.emit("user.logout", {
      nickName: user.nickName,
      id: user.id,
      ip: request.getIP(),
    });
    return new SuccessResponse(undefined, 204);
  },
};
/** /sessionserver/ 开头的部分API */
export const SessionserverService = {
  /** 加入服务器 */
  async join(request: FastifyRequest<{ Body: RequestJoinServer }>): Promise<SuccessResponse<undefined>> {
    const { accessToken = null, selectedProfile = null, serverId = null }: RequestJoinServer = request.body;
    try {
      Session.issue(accessToken, selectedProfile, serverId, request.getIP());
    } catch {
      await Session.issue2Official(accessToken, selectedProfile, serverId);
    } finally {
      return new SuccessResponse(undefined, 204);
    }
  },
  /** 验证会话有效性 */
  async testHasJoined(request: FastifyRequest<{ Querystring: RequestHasJoined }>): Promise<SuccessResponse<PublicProfileData | undefined>> {
    const { username = null, serverId = null, ip = null }: RequestHasJoined = request.query;
    try {
      const [result, type] = await Promise.any([
        Session.hasJoined(username, serverId, ip),
        (async () => {
          request.rateLim(request.getIP(), "hasJoinedProxy");
          return Session.hasJoinedProxy(username, serverId, ip);
        })(),
      ]);
      const profile = PROFILES.get(result.id);
      if (type == "official") {
        WEBHOOK.emit("join.official", { name: result.name, id: result.id, ip });
      }
      if (type == "yggdrasil") {
        WEBHOOK.emit("join.yggdrasil", {
          name: result.name,
          id: profile.id,
          ip,
          owner: {
            id: profile.owner,
            nickName: USERS.get(profile.owner)?.nickName ?? undefined,
          },
        });
      }
      return new SuccessResponse(result);
    } catch (e) {
      return new SuccessResponse(undefined, 204);
    }
  },
  /** 获取角色信息 */
  getProfile(request: FastifyRequest<{ Querystring: { unsigned: boolean }; Params: { uuid: uuid } }>): SuccessResponse<PublicProfileData | undefined> {
    const signed = request.query.unsigned == false ? true : false;
    const uuid = request.params.uuid || null;
    if (PROFILES.has(uuid)) {
      return new SuccessResponse(PROFILES.get(uuid).getYggdrasilData(true, signed));
    }
    return new SuccessResponse(undefined, 204);
  },
};
/** /api/ 开头的API */
export const ApiService = {
  /** 查询多个角色信息 */
  getProfiles(request: FastifyRequest<{ Body: string[] }>): SuccessResponse<PublicProfileData[]> {
    function getQuery(index: number) {
      const rawQuery = uniqueQuery[index]?.replace("-", "");
      return rawQuery.match(/^[0-9a-f]{32}$/i)?.[0].toLowerCase() ?? undefined;
    }
    // 最大查询数量：5
    const maxQuery = 5;
    const list: PublicProfileData[] = [];
    const uniqueQuery = [...new Set(request.body instanceof Array ? request.body : [])];
    for (let i = 0; i < maxQuery; i++) {
      const query = getQuery(i);
      if (PROFILES.has(query)) {
        const profile = PROFILES.get(query).getYggdrasilData();
        if (profile.properties) {
          delete profile.properties;
        }
        list.push(profile);
      }
    }
    return new SuccessResponse(list);
  },
  /** 上传材质 */
  async uploadTexture(request: FastifyRequest<{ Params: { uuid: uuid; textureType: "skin" | "cape" }; Body: { model: string; file: MultipartFile } }>): Promise<SuccessResponse<undefined>> {
    const { uuid, textureType } = request.params;
    const { file, mimetype } = request.body.file;
    const model = request.body.model == "slim" ? "slim" : "default";
    const profile = PROFILES.get(uuid);
    request.rateLim(profile.owner, "uploadTexture");
    if (mimetype != "image/png") {
      throw new ErrorResponse("UnsupportedMediaType", `Unsupported content-type: ${mimetype}`);
    }
    if (file.truncated) {
      throw new ErrorResponse("ContentTooLarge", `Provided image exceeds the maximum allowed size(5KB).`);
    }
    const image = await checkTexture(await request.body.file.toBuffer(), textureType);
    profile.textureManager().uploadTexture(image, textureType == "skin" ? model : "cape");
    return new SuccessResponse(undefined, 204);
  },
  /** 删除材质 */
  async deleteTexture(request: FastifyRequest<{ Params: { uuid: uuid; textureType: "skin" | "cape" | "all" } }>): Promise<SuccessResponse<undefined>> {
    const { uuid, textureType } = request.params;
    const profile = PROFILES.get(uuid);
    await profile.textureManager().deleteTexture(textureType);
    return new SuccessResponse(undefined, 204);
  },
  async textureAaccessCheck(request: FastifyRequest<{ Params: { uuid: uuid; textureType: "skin" | "cape" | "all" } }>) {
    const { uuid, textureType } = request.params;
    if (!["skin", "cape", "all"].includes(textureType)) {
      // 提供的材质类型无效
      throw new ErrorResponse("NotFound", "Path Not Found.");
    }
    if (request.method.toLocaleLowerCase() == "get") {
      return false;
    }
    const { user } = request.permCheck(undefined, uuid);
    user.checkReadonly();
    return false;
  },
};
/** minecraftservives开头的API */
export const mcService = {
  /** 玩家聊天证书 */
  async getCertificates(request: FastifyRequest): Promise<SuccessResponse<ResponseCertificates>> {
    /** 证书过期时间为1天 */
    const expireIn = Time.parse("1d");
    function publicKeySignatureV2(pubKey: KeyObject, uuid: uuid, expiresAt: number): Buffer {
      const timeBf = Buffer.alloc(8);
      timeBf.writeBigUInt64BE(BigInt(new Date(expiresAt).getTime()), 0);
      return Buffer.concat([Buffer.from(uuid, "hex"), timeBf, Buffer.from(pubKey.export({ type: "spki", format: "der" }))]);
    }
    function buildResponse(pubkey: KeyObject, privkey: KeyObject, uuid: string, expiresAt: number): SuccessResponse<ResponseCertificates> {
      return new SuccessResponse({
        keyPair: {
          privateKey: Utils.keyRepack(privkey, true),
          publicKey: Utils.keyRepack(pubkey, true),
        },
        expiresAt: new Date(expiresAt).toISOString(),
        refreshedAfter: new Date(expiresAt - expireIn).toISOString(),
        publicKeySignature: Utils.makeSignature(expiresAt + Utils.keyRepack(pubkey, true), PRIVATEKEY),
        publicKeySignatureV2: Utils.makeSignature(publicKeySignatureV2(pubkey, uuid, expiresAt), PRIVATEKEY),
      });
    }
    if (!CONFIG.features.enable_profile_key) {
      throw new ErrorResponse("ForbiddenOperation", "The option 'features.enable_profile_key' is set to false.");
    }
    // 检查携带的Authorization头是否是合法的令牌
    try {
      // 是合法令牌，因此使用我们自己创建的公钥和私钥。
      const { user, token: accessToken } = request.permCheck();
      const token = TOKENSMAP.get(accessToken);
      const { privkey, expiresAt } = await user.getUserPrivKey();
      const pubKey = crypto.createPublicKey(privkey);
      return buildResponse(pubKey, privkey, token.profile, expiresAt);
    } catch {
      // 不是合法令牌，试图将其解析为官方令牌，并从中提取玩家uuid，结合该uuid，生成私钥和公钥。
      request.rateLim(request.url, "updateCert", "1s");
      try {
        const { profiles } = JSON.parse(Utils.decodeb64(request.headers.authorization.split(".")[1]));
        const uuid = profiles.mc.replace(/-/g, "");
        const { privateKey, publicKey } = await Utils.getRSAKeyPair();
        return buildResponse(publicKey, privateKey, uuid, Date.now() + expireIn);
      } catch {
        // 令牌解析失败，视为无效令牌。
        throw new ErrorResponse("ForbiddenOperation", "Invalid token.");
      }
    }
  },
  /** 服务器公钥 */
  async getPublickeys(): Promise<SuccessResponse<ResponsePublicKeys>> {
    const publicKeyArr = PUBLICKEY.export({ type: "spki", format: "pem" })
      .toString()
      .split("\n")
      .filter((i) => i);
    publicKeyArr.shift();
    publicKeyArr.pop();
    const selfPublickey = publicKeyArr.join("");
    const {
      profilePropertyKeys: [{ publicKey: officialPublickey }],
      playerCertificateKeys: [{ publicKey: officialPlayerCertificateKey }],
    } = OFFICIALPUBKEY;
    return new SuccessResponse({
      profilePropertyKeys: [{ publicKey: selfPublickey }, { publicKey: officialPublickey }],
      playerCertificateKeys: [{ publicKey: selfPublickey }, { publicKey: officialPlayerCertificateKey }],
    });
  },
  /** 玩家属性 */
  getPlayerAttributes() {
    return new SuccessResponse({
      privileges: {
        onlineChat: { enabled: true },
        multiplayerServer: { enabled: true },
        multiplayerRealms: { enabled: true },
        telemetry: { enabled: true },
        optionalTelemetry: { enabled: true },
      },
      profanityFilterPreferences: { profanityFilterOn: true },
      banStatus: { bannedScopes: {} },
    });
  },
  /** 通过Xbox登录 */
  async loginWithXbox(request: FastifyRequest<{ Body: { identityToken: string } }>) {
    const { identityToken } = request.body;
    request.rateLim(request.getIP(), "loginWithXbox");
    const { username, access_token, user } = await Session.joinWithXbox(identityToken);
    if (user) {
      WEBHOOK.emit("user.loginWithXbox", {
        id: user.id,
        nickName: user.nickName,
        ip: request.getIP(),
      });
    }
    return new SuccessResponse({ roles: [], expires_in: 86400, token_type: "Bearer", username, access_token });
  },
  /** 通过accessToken获取角色信息 */
  async getProfile(request: FastifyRequest) {
    request.rateLim(request.getIP(), "getProfileProxy");
    try {
      const result = await Promise.any([
        (async () => {
          const { token } = request.permCheck();
          const profileId = TOKENSMAP.get(token).profile;
          if (!profileId) {
            throw false;
          }
          return PROFILES.get(profileId).getProfileData();
        })(),
        Profile.getOfficialProfileData(request.headers.authorization),
      ]);
      return new SuccessResponse(result);
    } catch {
      throw new ErrorResponse("BadOperation", "Provided token is not bound to any profile.");
    }
  },
};

/** 其他以 / 开头的API */
export const RootService = {
  /** API 元数据 */
  get metaResponse(): SuccessResponse<ResponseMeta> {
    const responseData: ResponseMeta = {
      meta: {
        serverName: CONFIG.server.name,
        implementationName: "NodeYggdrasilServer",
        implementationVersion: 1,
        links: {
          homepage: CONFIG.server.homepage,
          register: CONFIG.server.register,
        },
        "feature.non_email_login": CONFIG.features.non_email_login,
        "feature.enable_mojang_anti_features": CONFIG.features.enable_mojang_anti_features,
        "feature.username_check": CONFIG.features.username_check,
        "feature.enable_profile_key": CONFIG.features.enable_profile_key,
        "feature.no_mojang_namespace": CONFIG.features.no_mojang_namespace,
      },
      skinDomains: CONFIG.skinDomains,
      signaturePublickey: Utils.keyRepack(PUBLICKEY),
    };
    return new SuccessResponse(responseData);
  },
  /** 存储于本机上的材质 */
  async getTextures(request: FastifyRequest<{ Params: { hash: uuid } }>, reply: FastifyReply): Promise<SuccessResponse<Buffer>> {
    const hash = request.params.hash;
    try {
      const stat = await fs.stat(pathOf(`textures/${hash}.png`));
      if (stat.isDirectory()) {
        throw "target is directory.";
      }
      const image = await fs.readFile(pathOf(`textures/${hash}.png`));
      reply.header("content-type", "image/png");
      return new SuccessResponse(image);
    } catch {
      throw new ErrorResponse("NotFound", `Path not found: ${request.url}`);
    }
  },
};
