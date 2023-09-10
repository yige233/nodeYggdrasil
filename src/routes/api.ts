import { FastifyRequest } from "fastify";
import { CONFIG, ErrorResponse, PROFILEMAP, SuccessResponse, TOKENSMAP, USERSMAP } from "../libs/utils.js";
import Profile from "../libs/profile.js";
import User from "../libs/user.js";
import { Config, RequestAuth, RequestRefresh, RequestSignout, RoutePackConfig, uuid } from "../libs/interfaces.js";
import { ApiRoute, AuthserverRoute, Root, SessionserverRoute } from "./yggdrasil.js";
import Textures from "../libs/textures.js";
import schemas, { Packer } from "../libs/schemas.js";

/** 会话（登录相关） */
const sessions: RoutePackConfig = {
  /** 登录 */
  put: {
    handler: function (request: FastifyRequest<{ Body: RequestAuth }>) {
      request.rateLim(request.body.username || "");
      const result = AuthserverRoute.authenticate(request);
      return new SuccessResponse({
        accessToken: result.data.accessToken,
        uuid: TOKENSMAP.get(result.data.accessToken).owner.id,
      });
    },
    schema: {
      summary: "用户认证(登录)",
      description: "使用用户名、密码来创建一个会话。只会返回登录令牌和用户uuid。由于登录代码套用yggdrasil的，所以如果只有一个角色时，令牌会绑定至该角色。",
      tags: ["server"],
      body: Packer.object("用户账号和密码")({ username: schemas.sharedVars.username, password: schemas.sharedVars.password }, "username", "password"),
      response: { 200: Packer.object("登录成功响应")({ accessToken: schemas.sharedVars.accessToken, uuid: schemas.sharedVars.userUuid }) },
    },
  },
  /** 刷新令牌 */
  post: {
    handler: function (request: FastifyRequest<{ Body: RequestRefresh }>) {
      const result = AuthserverRoute.refresh(request);
      return new SuccessResponse({ accessToken: result.data.accessToken, uuid: result.data.user?.id });
    },
    schema: {
      summary: "刷新令牌",
      description: "实际上直接套用 yggdrasil 的刷新部分，包括请求参数，但只会返回新的登录令牌和用户uuid",
      tags: ["server"],
      body: Packer.object("提供需要刷新的令牌")({ accessToken: schemas.sharedVars.accessToken }),
      response: { 200: Packer.object("和登录成功响应相同")({ accessToken: schemas.sharedVars.accessToken, uuid: schemas.sharedVars.userUuid }) },
    },
  },
  /** 注销登录 */
  delete: {
    handler: function (request: FastifyRequest<{ Body: RequestSignout & { accessToken: uuid }; Querystring: { all: string } }>) {
      if (request.query.all) {
        request.rateLim(request.body.username || "");
        return AuthserverRoute.signout(request as FastifyRequest<{ Body: RequestSignout }>);
      }
      return AuthserverRoute.invalidate(request as FastifyRequest<{ Body: { accessToken: uuid } }>);
    },
    schema: {
      summary: "注销令牌",
      description:
        "合并了 yggdrasil 的两个api，通过查询参数来选择具体执行的操作。payload也要根据此发生变化：如要注销单个token，则仅提供该token即可。\n注销全部token则需提供账号密码，而不用提供任何token",
      tags: ["server"],
      body: Packer.object("注销所有token")({
        username: schemas.sharedVars.username,
        password: schemas.sharedVars.password,
        accessToken: schemas.sharedVars.accessToken,
      }),
      querystring: Packer.object()({ all: Packer.string("是否为注销所有令牌") }),
      response: { 204: schemas.Response204.ok },
    },
  },
};
/** 单个用户相关 */
const user: RoutePackConfig = {
  /** 获取用户信息 */
  get: {
    handler: function (request: FastifyRequest<{ Params: { uuid: uuid } }>) {
      const uuid: uuid = request.params.uuid;
      if (!USERSMAP.has(uuid)) {
        //用户不存在
        throw new ErrorResponse("NotFound", "User not found.");
      }
      const user = USERSMAP.get(uuid);
      try {
        request.permCheck(uuid);
        return new SuccessResponse(user.privateUserData);
      } catch {
        return new SuccessResponse(user.publicUserData);
      }
    },
    schema: {
      summary: "获取单个用户的信息",
      description: "根据有无提供有效的令牌，会分别返回两种结果：公开的用户数据和私人可见的用户数据",
      tags: ["server"],
      params: Packer.object()({ uuid: schemas.sharedVars.userUuid }, "uuid"),
      headers: Packer.object()({ authorization: schemas.sharedVars.authorization }),
      response: { 200: schemas.PrivateUserData },
    },
  },
  /** 更新用户信息 */
  patch: {
    handler: async function (request: FastifyRequest<{ Params: { uuid: uuid }; Body: { username: string; password: string; nickName: string } }>) {
      const uuid: uuid = request.params.uuid,
        { username = null, password = null, nickName = null } = request.body;
      request.permCheck(uuid);
      const user = USERSMAP.get(uuid);
      const result = await user.setUserInfo(username, password, nickName);
      return new SuccessResponse(result.privateUserData);
    },
    schema: {
      summary: "更新用户的信息",
      description: "目前可以修改以下项目：用户账户、密码和昵称。需要提供有效的令牌。",
      tags: ["server"],
      params: Packer.object()({ uuid: schemas.sharedVars.userUuid }, "uuid"),
      headers: Packer.object()({ authorization: schemas.sharedVars.authorization }, "authorization"),
      body: Packer.object()({
        username: schemas.sharedVars.username,
        password: schemas.sharedVars.password,
        nickName: Packer.string("用户的昵称"),
      }),
      response: {
        200: schemas.PrivateUserData,
      },
    },
  },
  /** 删除（注销）用户 */
  delete: {
    handler: async function (request: FastifyRequest<{ Params: { uuid: uuid } }>) {
      const uuid: uuid = request.params.uuid;
      request.permCheck(uuid);
      await USERSMAP.get(uuid).save(true);
      return new SuccessResponse(undefined, 204);
    },
    schema: {
      summary: "删除用户",
      description: "删除指定的用户数据，包括拥有的角色和材质。需要提供有效的令牌",
      tags: ["server"],
      params: Packer.object()({ uuid: schemas.sharedVars.userUuid }, "uuid"),
      headers: Packer.object()({ authorization: schemas.sharedVars.authorization }, "authorization"),
      response: {
        204: schemas.Response204.ok,
      },
    },
  },
  routes: [
    {
      url: "/rescueCode",
      config: {
        /** 获取用户的救援码 */
        get: {
          handler: async function (request: FastifyRequest<{ Params: { uuid: uuid } }>) {
            const uuid: uuid = request.params.uuid;
            request.permCheck(uuid);
            const rescueCode = await USERSMAP.get(uuid).getRescueCode();
            return new SuccessResponse({ rescueCode });
          },
          schema: {
            summary: "获取用户的救援码",
            description: "只有在用户尚未生成救援码，且提供了有效的令牌时，才能通过此api获得救援码。",
            tags: ["server"],
            params: Packer.object()({ uuid: schemas.sharedVars.userUuid }, "uuid"),
            headers: Packer.object()({ authorization: schemas.sharedVars.authorization }, "authorization"),
            response: {
              200: Packer.object("用户的救援码")({
                rescueCode: Packer.string("救援码"),
              }),
            },
          },
        },
      },
    },
    {
      url: "/password",
      config: {
        /** 忘记密码时，重置用户密码 */
        post: {
          handler: async function (request: FastifyRequest<{ Params: { uuid: uuid }; Body: { rescueCode: string; newPass: string } }>) {
            const uuid: uuid = request.params.uuid;
            request.rateLim(uuid);
            const { rescueCode = null, newPass = null } = request.body;
            return User.resetPass(uuid, rescueCode, newPass);
          },
          schema: {
            summary: "重置用户的密码",
            description: "一种可以自助重置密码的手段。重置密码后，原有的救援码会失效，而用户可以重新生成救援码。",
            tags: ["server"],
            params: Packer.object()({ uuid: schemas.sharedVars.userUuid }, "uuid"),
            body: Packer.object("重置密码需要提供的信息")(
              {
                rescueCode: Packer.string("该用户的救援码"),
                newPass: Packer.string("该用户的新密码"),
              },
              "rescueCode",
              "newPass"
            ),
            response: { 204: schemas.Response204.ok },
          },
        },
      },
    },
  ],
};
/** 用户这一集合相关 */
const users: RoutePackConfig = {
  /** 可以通过用户账户查询用户信息 */
  get: {
    handler: async (request: FastifyRequest<{ Querystring: { user: string } }>, reply) => {
      const username = request.query.user;
      if (!username) {
        throw new ErrorResponse("BadOperation", "Query param 'user' is required.");
      }
      if (USERSMAP.has(username)) {
        reply.header("Location", `./user/${USERSMAP.get(username).id}`);
        reply.status(302);
        reply.send();
        return false;
      }
      throw new ErrorResponse("NotFound", `The queried user '${username}' is not found.`);
    },
    schema: {
      summary: "查询账户信息",
      description: "通过'user'请求参数，来查找对应的用户。通过302重定向自动跳转到对应用户的信息api端点。",
      tags: ["server"],
      querystring: Packer.object()({ user: schemas.sharedVars.username }, "user"),
      response: { 302: schemas.Response204.ok },
    },
  },
  /** 注册新用户 */
  put: {
    handler: async (request) => {
      const users = request.body,
        result = [];
      let maxRegisterCount: number = 1;
      request.rateLim(request.getIP());
      if (!Array.isArray(users)) {
        return new SuccessResponse(result);
      }
      if (request.getToken() && request.permCheck(undefined, undefined, true)) {
        //如果携带了 Authorization 头，并且 accessToken 的所有者是管理员，那么他可以一次性注册大量用户
        maxRegisterCount = users.length;
      }
      for (let i = 0; i < maxRegisterCount; i++) {
        const { username = null, password = null, inviteCode = null, nickName = null } = request.body[i];
        try {
          const user = await User.register({ username, password, inviteCode, nickName, ip: request.getIP() });
          result.push(user.yggdrasilData);
        } catch (err) {
          if (err instanceof ErrorResponse) {
            result.push({ error: err.error, errorMessage: err.errorMessage });
          }
        }
      }
      return new SuccessResponse(result);
    },
    schema: {
      summary: "注册新用户",
      description: "注册新用户。如果提供了有效的令牌，且令牌所有者是管理员，那么可以一次性注册大量用户。",
      tags: ["server"],
      body: Packer.array("注册数据列表")(
        Packer.object()(
          {
            username: schemas.sharedVars.username,
            password: schemas.sharedVars.password,
            inviteCode: Packer.string("邀请码"),
            nickName: Packer.string("该用户的昵称"),
          },
          "username",
          "password",
          "inviteCode"
        )
      ),
      response: {
        200: Packer.array("注册成功的用户的列表(可能为空)")(
          Packer.object()(
            Object.assign({}, schemas.MinimumUserData.properties, {
              error: Packer.string("注册该账户时产生的错误(若注册成功，则不存在)"),
              errorMessage: Packer.string("错误信息(同上)"),
            })
          )
        ),
      },
    },
    defaultResponse: false,
  },
};
const profile: RoutePackConfig = {
  /** 获取角色信息 */
  get: {
    handler: SessionserverRoute.profile,
    schema: {
      summary: "查询指定角色的完整信息",
      description: "结果包含角色属性，可选是否包含签名。需要提供有效的令牌。",
      tags: ["server"],
      params: Packer.object()({ uuid: schemas.sharedVars.userUuid }, "uuid"),
      querystring: Packer.object()({ unsigned: schemas.sharedVars.unsigned }),
      response: { 200: schemas.PublicProfileData },
    },
  },
  /** 修改角色信息 */
  patch: {
    handler: async (request: FastifyRequest<{ Body: { name: string; texture: { type: "mojang" | "littleskin" | "capeVisible" | "delete"; data: any } }; Params: { uuid: uuid } }>) => {
      const {
        name = null,
        texture: { type = null, data = {} },
      } = request.body;
      const uuid = request.params.uuid;
      request.permCheck(undefined, uuid);
      const profile = PROFILEMAP.get(uuid);
      if (name) {
        //设置新的角色名称
        await profile.setName(name);
        for (let accessToken of USERSMAP.get(profile.owner).tokens) {
          //吊销正在使用这个角色的所有token
          const token = TOKENSMAP.get(accessToken);
          if (token.profile && token.profile == profile.id && accessToken != request.getToken()) {
            token.invalidate();
          }
        }
      }
      if (type && ["mojang", "littleskin", "capeVisible", "delete"].includes(type)) {
        //设置材质或删除材质
        await profile.setTexture(type, data);
      }
      return new SuccessResponse(profile.getYggdrasilData(true));
    },
    schema: {
      summary: "修改角色的信息",
      description: "需要提供有效的令牌。如果修改了角色名称，那么会同时注销所有绑定了该角色的令牌。不会删除进行这一操作的令牌。",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.sharedVars.authorization }, "authorization"),
      params: Packer.object()({ uuid: schemas.sharedVars.userUuid }, "uuid"),
      body: Packer.object()({
        name: Packer.string("新的角色名称，为空则视为不作修改"),
        texture: Packer.object("新的材质数据")({
          type: Packer.string("对材质的操作类型，为 none 则视为不进行操作", "mojang", "littleskin", "delete", "capeVisible", "none"),
          data: Packer.object("执行上述操作类型要用到的数据")({
            profileName: Packer.string("(mojang)复制该值对应的正版角色的材质，包括披风(当上述 type 为 mojang 时)"),
            littleskinTid: Packer.string("(littleskin)复制该值对应的 littleskin 皮肤库中的材质(仅支持公开材质)(当上述 type 为 littleskin 时)"),
            type: Packer.string("(delete)删除此处type所指定的材质(当上述 type 为 delete 时)", "skin", "cape", "all"),
            capeVisible: Packer.boolean("(capeVisible)披风的可见性，即是否隐藏披风。披风的材质不会被删除。"),
          }),
        }),
      }),
      response: { 200: schemas.PublicProfileData },
    },
  },
  /** 删除角色 */
  delete: {
    handler: async (request: FastifyRequest<{ Params: { uuid: uuid } }>) => {
      const uuid = request.params.uuid;
      request.permCheck(undefined, uuid);
      await PROFILEMAP.get(uuid).save(true);
      return new SuccessResponse(undefined, 204);
    },
    schema: {
      summary: "删除角色",
      description: "会同时删除上传到服务器的材质。需要提供有效的令牌。",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.sharedVars.authorization }, "authorization"),
      params: Packer.object()({ uuid: schemas.sharedVars.userUuid }, "uuid"),
      response: { 204: schemas.Response204.ok },
    },
  },
  routes: [
    {
      url: "/:textureType",
      before: function (instance) {
        instance.addContentTypeParser("image/png", async function (_request: FastifyRequest, payload) {
          return await new Promise((resolve, reject) => {
            try {
              const chunks = [];
              payload.on("data", (chunk: any) => chunks.push(chunk));
              payload.on("end", () => {
                resolve(Buffer.concat(chunks));
              });
            } catch (err) {
              err.statusCode = 400;
              reject(err);
            }
          });
        });
        instance.addHook("onRequest", instance.packHandle(ApiRoute.accessibilityCheck));
      },
      config: {
        /** 上传材质 */
        put: {
          handler: async (request: FastifyRequest<{ Params: { uuid: uuid; textureType: "skin" | "cape" }; Body: Buffer }>) => {
            const { uuid, textureType } = request.params,
              maxImgSize = 5 * 1024,
              model = request.headers["x-skin-model"] == "slim" ? "slim" : "default";
            const profile = PROFILEMAP.get(uuid);
            request.rateLim(profile.owner);
            if (Number(request.headers["content-length"]) >= maxImgSize) {
              throw new ErrorResponse("UnprocessableEntity", `Image size too large: ${request.headers["content-length"]}B > 5120B`);
            }
            const image = await Textures.check(request.body, textureType);
            await profile.setTexture("upload", {
              upload: {
                type: textureType == "skin" ? model : "cape",
                file: image,
              },
            });
            return new SuccessResponse(undefined, 204);
          },
          schema: {
            summary: "修改角色的信息",
            description: "payload只接受png，大小在5kb以内。若上传皮肤，需要额外提供x-skin-model请求头，指示皮肤使用的模型。旧有的材质会被删除。需要提供有效的令牌。",
            tags: ["server"],
            params: Packer.object()({ uuid: schemas.sharedVars.userUuid, textureType: schemas.sharedVars.textureType }, "uuid", "textureType"),
            consumes: ["image/png"],
            headers: Packer.object()(
              { authorization: schemas.sharedVars.authorization, "content-type": schemas.sharedVars.contentTypePng, "x-skin-model": Packer.string("确定上传材质要应用到的模型", "slim", "default") },
              "authorization",
              "content-type"
            ),
            response: { 204: schemas.Response204.ok },
          },
        },
        /** 删除材质 */
        delete: {
          handler: ApiRoute.delProfile,
          schema: {
            summary: "删除材质",
            description: "需要提供有效的令牌。",
            tags: ["server"],
            headers: Packer.object()({ authorization: schemas.sharedVars.authorization }, "authorization"),
            params: Packer.object()({ uuid: schemas.sharedVars.profileUuid, textureType: schemas.sharedVars.textureType }, "uuid", "textureType"),
            response: { 204: schemas.Response204.ok },
          },
        },
      },
    },
  ],
};

/** 角色这一集合相关 */
const profiles: RoutePackConfig = {
  /** 批量获取角色 */
  post: {
    handler: ApiRoute.profiles,
    schema: {
      summary: "批量查询角色名称所对应的角色",
      description: "支持角色uuid和角色名称查询。uuid必须为小写，角色名区分大小写。",
      tags: ["server"],
      body: schemas.RequestProfilesQuery,
      response: { 200: Packer.array("不包含角色属性")(schemas.PublicProfileData) },
    },
  },
  /** 新建角色 */
  put: {
    handler: async (request: FastifyRequest<{ Body: { name: string; offlineCompatible: boolean } }>) => {
      const accessToken: uuid = request.getToken();
      const { name, offlineCompatible = true } = request.body;
      const result = await Profile.new(name, TOKENSMAP.get(accessToken).owner.id, offlineCompatible);
      return new SuccessResponse(result.getYggdrasilData(true));
    },
    schema: {
      summary: "新建一个角色",
      description: "角色名区分大小写，且长度在30字符以内。",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.sharedVars.authorization }, "authorization"),
      body: Packer.object("需要提供的数据和选项")({
        name: Packer.string("新角色的名称"),
        offlineCompatible: Packer.boolean("对于该角色，是否采用与离线模式相同的uuid计算方式"),
      }),
      response: { 200: schemas.PublicProfileData },
    },
  },
};
/** 设置项相关 */
const settings: RoutePackConfig = {
  /** 获取设置项内容 */
  get: {
    handler: (request) => {
      try {
        request.permCheck(undefined, undefined, true);
        return new SuccessResponse(CONFIG.content);
      } catch {
        return new SuccessResponse({
          server: {
            name: CONFIG.content.server.name,
            root: CONFIG.content.server.root,
            homepage: CONFIG.content.server.homepage,
            register: CONFIG.content.server.register,
          },
          user: {
            passLenLimit: CONFIG.content.user.passLenLimit,
            disableUserInviteCode: CONFIG.content.user.disableUserInviteCode,
            enableOfficialProxy: CONFIG.content.user.enableOfficialProxy,
            disableUploadTexture: CONFIG.content.user.disableUploadTexture,
          },
          features: CONFIG.content.features,
          pubExtend: CONFIG.content.pubExtend,
        });
      }
    },
    schema: {
      summary: "查询服务器配置和设置",
      description: "根据有无提供有效的令牌，以及该令牌是否属于管理员，会返回公开可见的配置，或是完整服务器配置。",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.sharedVars.authorization }),
      response: { 200: schemas.Config },
    },
  },
  /** 修改设置项 */
  patch: {
    handler: async (request) => {
      function compare(newItem: any, oldItem: any): any {
        if (typeof newItem == typeof oldItem) {
          //两者type相同
          if (Array.isArray(newItem) == Array.isArray(oldItem)) {
            //两者均为数组，或均不是数组
            return newItem;
          }
          return oldItem;
        }
        return oldItem;
      }
      function assign(background: object, layer: object): any {
        const result = {};
        for (let i in background) {
          if (typeof background[i] == "object" && !Array.isArray(background[i])) {
            result[i] = assign(background[i], layer[i]);
            continue;
          }
          result[i] = layer != undefined && layer[i] != undefined ? compare(layer[i], background[i]) : background[i];
          if (Array.isArray(background[i])) {
            result[i] = result[i].filter((i: any): boolean => typeof i == "string");
          }
        }
        return result;
      }
      request.permCheck(undefined, undefined, true);
      let newConfig: Partial<Config> = request.body;
      if (newConfig?.server?.host) delete newConfig?.server.host;
      if (newConfig?.server?.port) delete newConfig?.server.port;
      if (newConfig?.server?.root) delete newConfig?.server.root;
      if (newConfig?.privateKeyPath) delete newConfig?.privateKeyPath;
      if (newConfig?.publicKeyPath) delete newConfig?.publicKeyPath;
      CONFIG.content = assign(CONFIG.content, newConfig);
      await CONFIG.save();
      return new SuccessResponse(CONFIG.content);
    },
    schema: {
      summary: "修改服务器配置和设置",
      description: "不能修改以下项目：server.host, server.port, server.root, privateKeyPath, publicKeyPathpublicKeyPath。也不能新建不存在的项目，不能删除已有项目、更改项目类型(如string=>number)",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.sharedVars.authorization }, "authorization"),
      response: { 200: schemas.Config },
    },
  },
};
/** 封禁相关 */
const bans: RoutePackConfig = {
  /** 添加封禁 */
  put: {
    handler: async (request: FastifyRequest<{ Body: { target: string; duration: number } }>) => {
      request.permCheck(undefined, undefined, true);
      const { target, duration } = request.body;
      return await User.ban(target, Number(duration));
    },
    schema: {
      summary: "封禁一位用户",
      description: "多次封禁时长不叠加。将封禁时长设为0，即可视为解封用户。封禁会强制注销该用户的所有会话。被封禁期间，无法登录、无法删除用户，也不能使用该用户的邀请码注册新用户。",
      tags: ["server"],
      body: Packer.object("封禁信息")({
        target: Packer.string("要封禁的用户，可以是uuid、用户账户、角色名称"),
        duration: Packer.number("封禁时长(分钟)"),
      }),
      headers: Packer.object()({ authorization: schemas.sharedVars.authorization }, "authorization"),
      response: { 200: schemas.PublicUserData },
    },
  },
};
const server: RoutePackConfig = {
  routes: [
    { url: "/sessions", config: sessions },
    { url: "/user/:uuid", config: user },
    { url: "/users", config: users },
    { url: "/profiles", config: profiles },
    { url: "/profile/:uuid", config: profile },
    { url: "/settings", config: settings },
    { url: "/bans", config: bans },
    {
      url: "/textures/:hash",
      config: {
        get: {
          handler: async (request: FastifyRequest<{ Params: { hash: uuid } }>, reply) => await Root.textures(request, reply),
          schema: {
            summary: "获取hash对应的材质文件",
            tags: ["server"],
            params: Packer.object("材质hash")({ hash: schemas.sharedVars.hashUUid }, "hash"),
            response: { 200: Packer.typeNull("材质图片(.png)") },
            produces: ["image/png"],
          },
        },
      },
    },
  ],
};

export default server;
