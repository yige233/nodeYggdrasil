import { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { RoutePackConfig } from "../libs/interfaces.js";
import { ApiService, AuthserverService, RootService, mcService, SessionserverService } from "../services/yggdrasil.js";
import schemas, { Packer } from "../libs/schemas.js";

const authserver: RoutePackConfig = {
  url: "/authserver",
  routes: [
    {
      url: "/authenticate",
      post: {
        handler: AuthserverService.login,
        schema: {
          summary: "使用密码进行身份验证，并分配一个新的令牌",
          description: "如果验证服务端允许，也可以使用角色名登录，获得的令牌自动绑定至登录使用的角色。\n以提供的用户名为key进行速率限制。",
          tags: ["yggdrasil"],
          body: schemas.RequestAuth,
          response: { 200: schemas.ResponseAuth },
        },
      },
    },
    {
      url: "/refresh",
      post: {
        handler: AuthserverService.refresh,
        schema: { summary: "吊销原令牌，并颁发一个新的令牌", tags: ["yggdrasil"], body: schemas.RequestRefresh, response: { 200: schemas.ResponseRefresh } },
      },
    },
    {
      url: "/validate",
      post: {
        handler: AuthserverService.validate,
        schema: { summary: "检验令牌是否有效", tags: ["yggdrasil"], body: schemas.RequestValidate, response: { 204: schemas.Response204.ok } },
      },
    },
    {
      url: "/invalidate",
      post: {
        handler: AuthserverService.invalidate,
        schema: { summary: "吊销给定的令牌", tags: ["yggdrasil"], body: schemas.RequestValidate, response: { 204: schemas.Response204.ok } },
      },
    },
    {
      url: "/signout",
      post: {
        handler: AuthserverService.logout,
        schema: {
          summary: "吊销用户的所有令牌",
          description: "可以使用角色名作为用户名(需要服务器允许)\n以提供的用户名为key进行速率限制。",
          tags: ["yggdrasil"],
          body: schemas.RequestSignout,
          response: { 204: schemas.Response204.ok },
        },
      },
    },
  ],
};
const sessionserver: RoutePackConfig = {
  url: "/sessionserver/session/minecraft",
  routes: [
    {
      url: "/join",
      post: {
        handler: SessionserverService.join,
        schema: { summary: "客户端进入服务器，记录服务端发送给客户端的 serverId，以备服务端检查", tags: ["yggdrasil"], body: schemas.RequestJoinServer, response: { 204: schemas.Response204.ok } },
      },
    },
    {
      url: "/hasJoined",
      get: {
        handler: SessionserverService.testHasJoined,
        customResponse: true,
        schema: {
          summary: "服务端验证客户端：检查客户端会话的有效性",
          tags: ["yggdrasil"],
          querystring: schemas.RequestHasJoined,
          response: { 200: schemas.PublicProfileData, 204: schemas.Response204.bad },
        },
      },
    },
    {
      url: "/profile/:uuid",
      get: {
        handler: SessionserverService.getProfile,
        schema: {
          summary: "查询指定角色的完整信息（包含角色属性）",
          tags: ["yggdrasil"],
          params: Packer.object()({ uuid: Packer.string("角色的uuid") }, "uuid"),
          querystring: Packer.object()({ unsigned: schemas.shared.unsigned }),
          response: { 200: schemas.PublicProfileData },
        },
      },
    },
  ],
};
const api: RoutePackConfig = {
  url: "/api",
  routes: [
    {
      url: "/user/profile/:uuid/:textureType",
      put: {
        handler: ApiService.uploadTexture,
        schema: {
          summary: "设置指定角色的材质",
          description: "使用formdata上传文件，提供两个字段：'model'：只能是'slim'或'default'，指示材质应用的模型；\n'file'：材质文件二进制数据。\n文件大小上限是5KB。",
          tags: ["yggdrasil"],
          headers: Packer.object()({ authorization: schemas.shared.authorization, "content-type": Packer.string("必须是 multipart/form-data") }, "authorization", "content-type"),
          params: Packer.object()({ uuid: schemas.shared.profileUuid, textureType: schemas.shared.textureType }, "uuid", "textureType"),
          body: Packer.object()({ model: { multipart: true }, file: { multipart: true } }),
          consumes: ["multipart/form-data"],
          response: { 204: schemas.Response204.ok },
        },
      },
      delete: {
        handler: ApiService.deleteTexture,
        schema: {
          summary: "清除指定角色的材质",
          tags: ["yggdrasil"],
          headers: Packer.object()({ authorization: schemas.shared.authorization }, "authorization"),
          params: Packer.object()({ uuid: schemas.shared.profileUuid, textureType: schemas.shared.textureType }, "uuid", "textureType"),
          response: { 204: schemas.Response204.ok },
        },
      },
      before: function (instance: FastifyInstance) {
        instance.addHook("onRequest", instance.allowedContentType("multipart/form-data"));
        instance.addHook("onRequest", instance.packHandle(ApiService.textureAccessCheck));
        instance.register(multipart, { attachFieldsToBody: true, limits: { fileSize: 5120, files: 1, fields: 1 } });
      },
    },
    {
      url: "/profiles/minecraft",
      post: {
        handler: ApiService.getProfiles,
        schema: {
          summary: "批量查询角色名称所对应的角色。可以使用角色uuid和角色名称。",
          tags: ["yggdrasil"],
          body: schemas.RequestProfilesQuery,
          response: { 204: schemas.Response204.bad, 200: Packer.array("不包含角色属性")(schemas.PublicProfileData) },
        },
      },
    },
  ],
};
const minecraftservices: RoutePackConfig = {
  url: "/minecraftservices",
  routes: [
    {
      url: "/player/certificates",
      post: {
        handler: mcService.getCertificates,
        schema: {
          summary: "获取用户密钥对，用于加密聊天消息",
          tags: ["yggdrasil"],
          headers: Packer.object()({ authorization: schemas.shared.authorization }, "authorization"),
          response: {
            200: Packer.object()({
              keyPair: Packer.object("密钥对")({
                privateKey: Packer.string("私钥"),
                publicKey: Packer.string("公钥"),
              }),
              expiresAt: Packer.string("密钥过期时间"),
              refreshedAfter: Packer.string("密钥刷新时间"),
              publicKeySignature: Packer.string("对公钥的签名，1.19早期版本使用"),
              publicKeySignatureV2: Packer.string("对公钥的签名，1.19后期版本及更新版本使用"),
            }),
          },
        },
      },
      before: function (instance) {
        instance.addHook("onRequest", async function (request) {
          if (request.headers["content-type"]) {
            delete request.headers["content-type"];
          }
        });
      },
    },
    {
      url: "/publickeys",
      get: {
        handler: mcService.getPublickeys,
        schema: {
          summary: "获取服务器公钥",
          description: "包含服务器自己的公钥和Mojang的公钥，这样可以兼容正版玩家进服",
          tags: ["yggdrasil"],
          response: {
            200: Packer.object()({
              profilePropertyKeys: Packer.array("公钥组")(Packer.object("公钥")({ publicKey: Packer.string("公钥") })),
              playerCertificateKeys: Packer.array("公钥组")(Packer.object("公钥")({ publicKey: Packer.string("公钥") })),
            }),
          },
        },
      },
    },
    {
      url: "/minecraft/profile/lookup/bulk/byname",
      post: {
        handler: ApiService.getProfiles,
        schema: {
          summary: "批量查询角色名称所对应的角色。可以使用角色uuid和角色名称。",
          tags: ["yggdrasil"],
          body: schemas.RequestProfilesQuery,
          response: { 204: schemas.Response204.bad, 200: Packer.array("不包含角色属性")(schemas.PublicProfileData) },
        },
      },
    },
    {
      url: "/player/attributes",
      get: {
        handler: mcService.getPlayerAttributes,
        schema: {
          summary: "如果mc客户端采取添加jvm参数的方式实现完美兼容正版，则此api会被mc调用，因此需要返回有意义的信息",
          tags: ["yggdrasil"],
          response: {
            200: Packer.object("玩家属性")(mcService.getPlayerAttributes().data),
          },
        },
      },
    },
    {
      url: "/minecraft/profile",
      get: {
        handler: mcService.getProfile,
        schema: {
          summary: "获取玩家信息（该API会被Geyser调用）",
          tags: ["yggdrasil"],
          headers: Packer.object()({ authorization: schemas.shared.authorization }, "authorization"),
          response: {
            200: Packer.object()({
              id: Packer.string("角色id"),
              name: Packer.string("角色名称"),
              profileActions: Packer.object()({}),
              skins: Packer.array("皮肤列表")(
                Packer.object()({
                  id: Packer.string("皮肤id"),
                  state: Packer.string("皮肤状态", "ACTIVE"),
                  url: Packer.string("皮肤url"),
                  textureKey: Packer.string("皮肤材质id"),
                  variant: Packer.string("皮肤类型", "CLASSIC", "SLIM"),
                  alias: Packer.string("皮肤别名，可能不存在"),
                })
              ),
              capes: Packer.array("披风列表")(
                Packer.object()({
                  id: Packer.string("披风id"),
                  state: Packer.string("披风状态", "ACTIVE", "INACTIVE"),
                  url: Packer.string("披风url"),
                  alias: Packer.string("披风别名，可能不存在"),
                })
              ),
            }),
          },
        },
      },
    },
    {
      url: "/authentication/login_with_xbox",
      post: {
        handler: mcService.loginWithXbox,
        schema: {
          summary: "通过Xbox登录（该API会被Geyser调用）",
          tags: ["yggdrasil"],
          body: Packer.object()({ identityToken: Packer.string("OAuth流程中从微软拿到的XSTS Token") }, "identityToken"),
          response: {
            200: Packer.object()({
              roles: {
                type: "array",
                maxItems: 0,
              },
              expires_in: Packer.integer("登录Token过期时间"),
              token_type: Packer.string("登录Token类型，固定为 Bearer", "Bearer"),
              access_token: Packer.string("登录Token"),
              username: Packer.string("用户id（不是MC角色id）"),
            }),
          },
        },
      },
    },
  ],
};
const textures: RoutePackConfig = {
  url: "/textures/:hash",
  get: {
    handler: RootService.getTextures,
    schema: {
      summary: "获取hash对应的材质文件",
      tags: ["yggdrasil"],
      params: Packer.object("材质hash")({ hash: Packer.string("材质的sha256值") }, "hash"),
      response: { 200: Packer.typeNull("材质图片(.png)") },
      produces: ["image/png"],
    },
  },
  before: function (instance) {
    instance.addHook("onRequest", async (_request, reply) => {
      reply.headers({
        "Access-Control-Allow-Origin": "*",
      });
    });
  },
};
const yggdrasil: RoutePackConfig = {
  url: "/yggdrasil",
  get: {
    handler: () => RootService.metaResponse,
    schema: { summary: "获取本 API 的元数据", tags: ["yggdrasil"], response: { 200: schemas.ResponseMeta } },
  },
  routes: [authserver, sessionserver, api, minecraftservices, textures],
};
export default yggdrasil;
