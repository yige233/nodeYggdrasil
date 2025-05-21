import { BanService, InviteCodeService, logService, OfficialPlayerMgmtService, ServerServices, SessionService, SettingService } from "../services/api.js";
import { RoutePackConfig } from "../libs/interfaces.js";
import schemas, { Packer } from "../libs/schemas.js";
import { CONFIG } from "../global.js";
import users from "./user.js";
import profiles from "./profile.js";
import webhooks from "./webhook.js";

/** 会话（登录相关） */
const sessions: RoutePackConfig = {
  url: "/sessions",
  /** 登录 */
  post: {
    handler: SessionService.login,
    schema: {
      summary: "用户认证(登录)",
      description: "使用用户名、密码来创建一个会话。只会返回登录令牌和用户uuid。由于登录代码套用yggdrasil的，所以如果只有一个角色时，令牌会绑定至该角色。",
      tags: ["server"],
      body: Packer.object("用户账号和密码")({ username: schemas.shared.usernameInput, password: schemas.shared.password }, "username", "password"),
      response: { 200: Packer.object("登录成功响应")({ accessToken: schemas.shared.accessToken, uuid: schemas.shared.userUuid }) },
    },
  },
  /** 刷新令牌 */
  patch: {
    handler: SessionService.refresh,
    schema: {
      summary: "刷新令牌",
      description: "实际上直接套用 yggdrasil 的刷新部分，包括请求参数，但只会返回新的登录令牌和用户uuid",
      tags: ["server"],
      body: Packer.object("提供需要刷新的令牌")({ accessToken: schemas.shared.accessToken }),
      response: { 200: Packer.object("和登录成功响应相同")({ accessToken: schemas.shared.accessToken, uuid: schemas.shared.userUuid }) },
    },
  },
  /** 注销登录 */
  delete: {
    handler: SessionService.logout,
    schema: {
      summary: "注销令牌",
      description:
        "合并了 yggdrasil 的两个api，通过查询参数来选择具体执行的操作。payload也要根据此发生变化：如要注销单个token，则仅提供该token即可。\n注销全部token则需提供账号密码，而不用提供任何token",
      tags: ["server"],
      body: Packer.object("注销所有token")({
        username: schemas.shared.username,
        password: schemas.shared.password,
        accessToken: schemas.shared.accessToken,
      }),
      querystring: Packer.object()({ all: Packer.string("是否为注销所有令牌") }),
      response: { 204: schemas.Response204.ok },
    },
  },
};
/** 设置项相关 */
const settings: RoutePackConfig = {
  url: "/settings",
  /** 获取设置项内容 */
  get: {
    handler: SettingService.getSettings,
    schema: {
      summary: "查询服务器配置和设置",
      description: "根据有无提供有效的令牌，以及该令牌是否属于管理员，会返回公开可见的配置，或是完整服务器配置。",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.shared.authorization }),
      response: { 200: schemas.Config },
    },
  },
  /** 修改设置项 */
  patch: {
    handler: SettingService.updateSettings,
    schema: {
      summary: "修改服务器配置和设置",
      description: "不能修改以下项目：server.host, server.port, server.root,server.cors, privateKeyPath, user.passwdHashType。也不能新建不存在的项目，不能删除已有项目、更改项目类型(如string=>number)",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.shared.authorization }, "authorization"),
      body: schemas.Config,
      response: { 200: schemas.Config },
    },
  },
};
/** 封禁相关 */
const bans: RoutePackConfig = {
  url: "/bans",
  /** 添加封禁 */
  post: {
    handler: BanService.addBan,
    schema: {
      summary: "封禁一位用户",
      description: "多次封禁时长不叠加。将封禁时长设为0，即可视为解封用户。封禁会强制注销该用户的所有会话。被封禁期间，无法登录、无法删除用户，也不能使用该用户的邀请码注册新用户。",
      tags: ["server"],
      body: Packer.object("封禁信息")({
        target: Packer.string("要封禁的用户，可以是uuid、用户账户、角色名称"),
        duration: Packer.integer("封禁时长(分钟)", 0),
      }),
      headers: Packer.object()({ authorization: schemas.shared.authorization }, "authorization"),
      response: { 200: schemas.PublicUserData },
    },
  },
};
/** 邀请码 */
const inviteCode: RoutePackConfig = {
  url: "/invite-codes",
  /** 生成邀请码 */
  post: {
    handler: InviteCodeService.getInvitecodes,
    schema: {
      summary: "由管理员生成邀请码",
      description: "系统性临时邀请码。管理员可以生成临时邀请码，具有30分钟有效期，使用后作废。",
      tags: ["server"],
      querystring: Packer.object()({ count: Packer.integer("要生成的邀请码数量", 1, 1000) }),
      response: {
        200: Packer.array("邀请码列表。至少包含一个。")(Packer.string("邀请码")),
      },
    },
  },
};

const officialPlayerMgmt: RoutePackConfig = {
  url: "/official-player-list",
  routes: [
    {
      url: "/blacklist",
      get: {
        handler: () => OfficialPlayerMgmtService.getBlackList,
        schema: {
          summary: "获取正版玩家黑名单",
          description: "获取正版玩家黑名单，返回一个uuid数组。",
          tags: ["server"],
          response: { 200: Packer.array("uuid数组")(schemas.shared.profileUuid) },
        },
      },
      patch: {
        handler: OfficialPlayerMgmtService.updateBlackList,
        schema: {
          summary: "更新正版玩家黑名单",
          description: "更新正版玩家黑名单，传入一个uuid数组。",
          tags: ["server"],
          body: Packer.array("uuid数组")(schemas.shared.profileUuid),
          response: { 200: Packer.array("uuid数组")(schemas.shared.profileUuid) },
        },
      },
    },
    {
      url: "/whitelist",
      get: {
        handler: () => OfficialPlayerMgmtService.getWhiteList,
        schema: {
          summary: "获取正版玩家白名单",
          description: "获取正版玩家白名单，返回一个uuid数组。",
          tags: ["server"],
          response: { 200: Packer.array("uuid数组")(schemas.shared.profileUuid) },
        },
      },
      patch: {
        handler: OfficialPlayerMgmtService.updateWhiteList,
        schema: {
          summary: "更新正版玩家白名单",
          description: "更新正版玩家白名单，传入一个uuid数组。",
          tags: ["server"],
          body: Packer.array("uuid数组")(schemas.shared.profileUuid),
          response: { 200: Packer.array("uuid数组")(schemas.shared.profileUuid) },
        },
      },
    },
    {
      url: "/logged-players",
      get: {
        handler: OfficialPlayerMgmtService.getAllTriedJoin,
        schema: {
          summary: "获取所有尝试过加入服务器的正版玩家",
          description: "获取所有尝试过加入服务器的正版玩家，返回一个uuid数组。",
          tags: ["server"],
          response: { 200: Packer.array("uuid数组")(schemas.shared.profileUuid) },
        },
      },
    },
  ],
};

/** 登录日志 */
const logs: RoutePackConfig = {
  url: "/logs/:logName",
  get: {
    handler: logService.getLog,
    schema: {
      summary: "查看服务器日志",
      description: "管理员可以通过此API查看服务器产生的日志。",
      tags: ["server"],
      params: Packer.object()({ logName: Packer.string("日志类型", "logins", "errors", "webhooks") }),
      response: { 200: Packer.string("日志") },
      produces: ["text/plain"],
    },
  },
};

const server: RoutePackConfig = {
  url: "/server",
  routes: [sessions, users, profiles, settings, bans, inviteCode, webhooks, logs, officialPlayerMgmt],
  patch: {
    handler: ServerServices.restart,
    schema: {
      summary: "重新启动服务",
      description: "管理员可以通过该API重启服务。不能通过该API得知重启是否完成。",
      tags: ["server"],
      body: Packer.object("目前只有 restart 一个属性")({ restart: Packer.boolean("重启服务") }),
      response: { 204: schemas.Response204.ok },
    },
  },
  before: function (instance) {
    instance.addHook("onRequest", async (_request, reply) => {
      reply.headers({ "Access-Control-Allow-Origin": CONFIG.server.cors });
    });
  },
};

export default server;
