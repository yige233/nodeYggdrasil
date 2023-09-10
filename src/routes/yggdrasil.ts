import fs from "node:fs/promises";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import mutipart, { MultipartFile } from "@fastify/multipart";
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
  RoutePackConfig,
} from "../libs/interfaces.js";
import schemas, { Packer } from "../libs/schemas.js";
import Utils, { PROFILEMAP, CONFIG, PUBLICKEY, ErrorResponse, SuccessResponse } from "../libs/utils.js";
import Session from "../libs/session.js";
import Token from "../libs/token.js";
import User from "../libs/user.js";
import Textures from "../libs/textures.js";

/** /authserver/ 开头的部分API */
export class AuthserverRoute {
  /** 用户认证 */
  static authenticate(request: FastifyRequest<{ Body: RequestAuth }>): SuccessResponse<ResponseAuth> {
    const { username = null, password = null, clientToken = undefined, requestUser = false }: RequestAuth = request.body;
    const result = User.authenticate(username, password);
    let profile: uuid = null;
    if (result.tokens.size >= 10) {
      //最多10个登录会话，若超出则删除最早的那个
      result.tokens.delete([...result.tokens][0]);
    }
    if (PROFILEMAP.has(username)) {
      //使用角色名称登录成功，令牌绑定至该角色
      profile = PROFILEMAP.get(username).id;
    }
    const token = new Token(clientToken ? clientToken : Utils.uuid(), result.id, profile);
    const responseData: ResponseAuth = {
      accessToken: token.accessToken,
      clientToken: token.clientToken,
      availableProfiles: result.yggdrasilProfiles,
      selectedProfile: token.yggdrasilProfile || undefined,
      user: requestUser ? result.yggdrasilData : undefined,
    };
    return new SuccessResponse(responseData);
  }
  /** 刷新令牌 */
  static refresh(request: FastifyRequest<{ Body: RequestRefresh }>): SuccessResponse<ResponseRefresh> {
    const { accessToken = null, clientToken = undefined, requestUser = false, selectedProfile = undefined }: RequestRefresh = request.body;
    const result = Token.refresh(accessToken, clientToken, selectedProfile?.id);
    const responseData: ResponseRefresh = {
      accessToken: result.accessToken,
      clientToken: result.clientToken,
      selectedProfile: result.yggdrasilProfile || undefined,
      user: requestUser ? result.owner.yggdrasilData : undefined,
    };
    return new SuccessResponse(responseData);
  }
  /** 验证令牌有效性 */
  static validate(request: FastifyRequest<{ Body: RequestValidate }>): SuccessResponse<undefined> {
    const { accessToken = null, clientToken = undefined }: RequestValidate = request.body;
    if (Token.validate(accessToken, clientToken) != "valid") {
      throw new ErrorResponse("ForbiddenOperation", "Invalid token.");
    }
    //令牌有效
    return new SuccessResponse(undefined, 204);
  }
  /** 注销令牌 */
  static invalidate(request: FastifyRequest<{ Body: RequestValidate }>): SuccessResponse<undefined> {
    const { accessToken = null }: RequestValidate = request.body;
    Token.invalidate(accessToken);
    return new SuccessResponse(undefined, 204);
  }
  /** 注销所有令牌 */
  static signout(request: FastifyRequest<{ Body: RequestSignout }>): SuccessResponse<undefined> {
    const { username = null, password = null }: RequestSignout = request.body;
    const result = User.authenticate(username, password);
    for (let token of result.tokens) {
      Token.invalidate(token);
    }
    return new SuccessResponse(undefined, 204);
  }
}
/** /sessionserver/ 开头的部分API */
export class SessionserverRoute {
  /** 加入服务器 */
  static join(request: FastifyRequest<{ Body: RequestJoinServer }>): SuccessResponse<undefined> {
    const { accessToken = null, selectedProfile = null, serverId = null }: RequestJoinServer = request.body;
    Session.issue(accessToken, selectedProfile, serverId, request.getIP());
    return new SuccessResponse(undefined, 204);
  }
  /** 验证会话有效性 */
  static async hasJoined(request: FastifyRequest<{ Querystring: RequestHasJoined }>): Promise<SuccessResponse<PublicProfileData | undefined>> {
    const { username = null, serverId = null, ip = null }: RequestHasJoined = request.query;
    try {
      const result = await Promise.any([Session.hasJoined(username, serverId, ip), Session.hasJoinedProxy(username, serverId, ip)]);
      return new SuccessResponse(result);
    } catch {
      return new SuccessResponse(undefined, 204);
    }
  }
  /** 获取角色信息 */
  static profile(request: FastifyRequest<{ Querystring: { unsigned: boolean }; Params: { uuid: uuid } }>): SuccessResponse<PublicProfileData | undefined> {
    const signed = request.query.unsigned == false ? true : false;
    const uuid = request.params.uuid || null;
    if (PROFILEMAP.has(uuid)) {
      return new SuccessResponse(PROFILEMAP.get(uuid).getYggdrasilData(true, signed));
    }
    return new SuccessResponse(undefined, 204);
  }
}
/** /api/ 开头的API */
export class ApiRoute {
  /** 查询多个角色信息 */
  static profiles(request: FastifyRequest<{ Body: string[] }>): SuccessResponse<PublicProfileData[]> {
    const list: PublicProfileData[] = [];
    const uniqueQuery = [...new Set(request.body instanceof Array ? request.body : [])];
    for (let i = 0; i < 5; i++) {
      //最大查询数量：5
      const name = uniqueQuery[i] || null;
      if (PROFILEMAP.has(name)) {
        const profile = PROFILEMAP.get(name).getYggdrasilData();
        if (profile.properties) {
          delete profile.properties;
        }
        list.push(profile);
      }
    }
    return new SuccessResponse(list);
  }
  /** 上传材质 */
  static async putProfile(request: FastifyRequest<{ Params: { uuid: uuid; textureType: "skin" | "cape" }; Body: { model: string; file: MultipartFile } }>): Promise<SuccessResponse<undefined>> {
    const { uuid, textureType } = request.params;
    const { file, mimetype } = request.body.file;
    const model = request.body.model == "slim" ? "slim" : "default";
    const profile = PROFILEMAP.get(uuid);
    request.rateLim(profile.owner);
    if (mimetype != "image/png") {
      throw new ErrorResponse("UnsupportedMediaType", `Incorrect mime type: ${mimetype}`);
    }
    if (file.truncated) {
      throw new ErrorResponse("UnprocessableEntity", `Image size too large.`);
    }
    const image = await Textures.check(await request.body.file.toBuffer(), textureType);
    await profile.setTexture("upload", {
      upload: {
        type: textureType == "skin" ? model : "cape",
        file: image,
      },
    });
    return new SuccessResponse(undefined, 204);
  }
  /** 删除材质 */
  static async delProfile(request: FastifyRequest<{ Params: { uuid: uuid; textureType: "skin" | "cape" } }>): Promise<SuccessResponse<undefined>> {
    const { uuid, textureType } = request.params;
    await PROFILEMAP.get(uuid).setTexture("delete", {
      type: textureType == "skin" ? "skin" : "cape",
    });
    return new SuccessResponse(undefined, 204);
  }
  static async accessibilityCheck(request: FastifyRequest<{ Params: { uuid: uuid; textureType: "skin" | "cape" } }>) {
    const { uuid, textureType } = request.params;
    try {
      request.permCheck(undefined, uuid);
      if (!["skin", "cape"].includes(textureType)) {
        //提供的材质类型无效
        throw new ErrorResponse("NotFound", "Path Not Found.");
      }
    } catch (err) {
      if (err instanceof ErrorResponse) {
        if (err.error == "ForbiddenOperation") {
          throw new ErrorResponse("Unauthorized", "Token does not exist, or is invalid.");
        }
        throw err;
      }
      throw new ErrorResponse("InternalError", "What happend?!!!");
    } finally {
      return false;
    }
  }
}
/** 其他以 / 开头的API */
export class Root {
  /** API 元数据 */
  static get meta(): SuccessResponse<ResponseMeta> {
    const responseData: ResponseMeta = {
      meta: {
        serverName: CONFIG.content.server.name,
        implementationName: "NodeYggdrasilServer",
        implementationVersion: 1,
        links: {
          homepage: CONFIG.content.server.homepage,
          register: CONFIG.content.server.register,
        },
        "feature.non_email_login": CONFIG.content.features.non_email_login,
        "feature.enable_mojang_anti_features": CONFIG.content.features.enable_mojang_anti_features,
        "feature.username_check": CONFIG.content.features.username_check,
        "feature.no_mojang_namespace": CONFIG.content.features.no_mojang_namespace,
      },
      skinDomains: CONFIG.content.skinDomains,
      signaturePublickey: PUBLICKEY.toString("utf8"),
    };
    return new SuccessResponse(responseData);
  }
  /** 存储于本机上的材质 */
  static async textures(request: FastifyRequest<{ Params: { hash: uuid } }>, reply: FastifyReply): Promise<SuccessResponse<Buffer>> {
    const hash = request.params.hash;
    try {
      const stat = await fs.stat(`./data/textures/${hash}.png`);
      if (stat.isDirectory()) {
        throw "target is directory.";
      }
      const image = await fs.readFile(`./data/textures/${hash}.png`);
      reply.header("content-type", "image/png");
      return new SuccessResponse(image);
    } catch {
      throw new ErrorResponse("NotFound", `Path not found: ${request.url}`);
    }
  }
}

const authserver: RoutePackConfig = {
  routes: [
    {
      url: "/authenticate",
      config: {
        post: {
          handler: AuthserverRoute.authenticate,
          rateLim: (request: FastifyRequest<{ Body: RequestAuth }>) => request.body.username || "",
          schema: {
            summary: "使用密码进行身份验证，并分配一个新的令牌",
            description: "如果验证服务端允许，也可以使用角色名登录，获得的令牌自动绑定至登录使用的角色。\n以提供的用户名为key进行速率限制。",
            tags: ["ydddrasil"],
            body: schemas.RequestAuth,
            response: { 200: schemas.ResponseAuth },
          },
        },
      },
    },
    {
      url: "/refresh",
      config: {
        post: {
          handler: AuthserverRoute.refresh,
          schema: { summary: "吊销原令牌，并颁发一个新的令牌", tags: ["ydddrasil"], body: schemas.RequestRefresh, response: { 200: schemas.ResponseRefresh } },
        },
      },
    },
    {
      url: "/validate",
      config: {
        post: {
          handler: AuthserverRoute.validate,
          schema: { summary: "检验令牌是否有效", tags: ["ydddrasil"], body: schemas.RequestValidate, response: { 204: schemas.Response204.ok } },
        },
      },
    },
    {
      url: "/invalidate",
      config: {
        post: {
          handler: AuthserverRoute.invalidate,
          schema: { summary: "吊销给定的令牌", tags: ["ydddrasil"], body: schemas.RequestValidate, response: { 204: schemas.Response204.ok } },
        },
      },
    },
    {
      url: "/signout",
      config: {
        post: {
          handler: AuthserverRoute.signout,
          rateLim: (request: FastifyRequest<{ Body: RequestSignout }>) => request.body.username || "",
          schema: {
            summary: "吊销用户的所有令牌",
            description: "可以使用角色名作为用户名(需要服务器允许)\n以提供的用户名为key进行速率限制。",
            tags: ["ydddrasil"],
            body: schemas.RequestSignout,
            response: { 204: schemas.Response204.ok },
          },
        },
      },
    },
  ],
};
const sessionserver: RoutePackConfig = {
  routes: [
    {
      url: "/join",
      config: {
        post: {
          handler: SessionserverRoute.join,
          schema: { summary: "客户端进入服务器，记录服务端发送给客户端的 serverId，以备服务端检查", tags: ["ydddrasil"], body: schemas.RequestJoinServer, response: { 204: schemas.Response204.ok } },
        },
      },
    },
    {
      url: "/hasJoined",
      config: {
        get: {
          handler: SessionserverRoute.hasJoined,
          defaultResponse: false,
          schema: {
            summary: "服务端验证客户端：检查客户端会话的有效性",
            tags: ["ydddrasil"],
            querystring: schemas.RequestHasJoined,
            response: { 200: schemas.PublicProfileData, 204: schemas.Response204.bad },
          },
        },
      },
    },
    {
      url: "/profile/:uuid",
      config: {
        get: {
          handler: SessionserverRoute.profile,
          schema: {
            summary: "查询指定角色的完整信息（包含角色属性）",
            tags: ["ydddrasil"],
            params: Packer.object()({ uuid: Packer.string("角色的uuid") }, "uuid"),
            querystring: Packer.object()({ unsigned: schemas.sharedVars.unsigned }),
            response: { 200: schemas.PublicProfileData },
          },
        },
      },
    },
  ],
};
const api: RoutePackConfig = {
  routes: [
    {
      url: "/user/profile/:uuid/:textureType",
      config: {
        put: {
          handler: ApiRoute.putProfile,
          schema: {
            summary: "设置指定角色的材质",
            description: "使用formdata上传文件，提供两个字段：'model'：只能是'slim'或'default'，指示材质应用的模型；\n'file'：材质文件二进制数据。\n文件大小上限是5KB。",
            tags: ["ydddrasil"],
            headers: Packer.object()({ authorization: schemas.sharedVars.authorization, "content-type": schemas.sharedVars.contentTypeFd }, "authorization", "content-type"),
            params: Packer.object()({ uuid: schemas.sharedVars.profileUuid, textureType: schemas.sharedVars.textureType }, "uuid", "textureType"),
            body: Packer.object()({ model: { multipart: true }, file: { multipart: true } }),
            consumes: ["multipart/form-data"],
            response: { 204: schemas.Response204.ok },
          },
        },
        delete: {
          handler: ApiRoute.delProfile,
          schema: {
            summary: "清除指定角色的材质",
            tags: ["ydddrasil"],
            headers: Packer.object()({ authorization: schemas.sharedVars.authorization }, "authorization"),
            params: Packer.object()({ uuid: schemas.sharedVars.profileUuid, textureType: schemas.sharedVars.textureType }, "uuid", "textureType"),
            response: { 204: schemas.Response204.ok },
          },
        },
      },
      before: async function (instance: FastifyInstance) {
        instance.addHook("onRequest", instance.packHandle(ApiRoute.accessibilityCheck));
        instance.register(mutipart, {
          attachFieldsToBody: true,
          limits: {
            fileSize: 5120,
            files: 1,
            fields: 1,
          },
        });
      },
    },
    {
      url: "/profiles/minecraft",
      config: {
        post: {
          handler: ApiRoute.profiles,
          schema: {
            summary: "批量查询角色名称所对应的角色。可以使用角色uuid和角色名称。",
            tags: ["ydddrasil"],
            body: schemas.RequestProfilesQuery,
            response: { 204: schemas.Response204.bad, 200: Packer.array("不包含角色属性")(schemas.PublicProfileData) },
          },
        },
      },
    },
  ],
};

const yggdrasil: RoutePackConfig = {
  get: {
    handler: () => Root.meta,
    schema: { summary: "获取本 API 的元数据", tags: ["ydddrasil"], response: { 200: schemas.ResponseMeta } },
  },
  routes: [
    { url: "/authserver", config: authserver },
    { url: "/sessionserver/session/minecraft", config: sessionserver },
    { url: "/api", config: api },
    {
      url: "/textures/:hash",
      config: {
        get: {
          handler: Root.textures,
          schema: {
            summary: "获取hash对应的材质文件",
            tags: ["ydddrasil"],
            params: Packer.object("材质hash")({ hash: schemas.sharedVars.hashUUid }, "hash"),
            response: { 200: Packer.typeNull("材质图片(.png)") },
            produces: ["image/png"],
          },
        },
      },
    },
  ],
};
export default yggdrasil;
