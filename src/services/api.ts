import fs from "node:fs/promises";
import { FastifyRequest } from "fastify";
import Utils, { ErrorResponse, SuccessResponse } from "../libs/utils.js";
import { Config, RequestAuth, RequestRefresh, RequestSignout, uuid } from "../libs/interfaces.js";
import { AuthserverService } from "../services/yggdrasil.js";
import { TOKENSMAP, USERS, PROFILES, CONFIG, WEBHOOK, pathOf, OFFICIALPLAYERLIST, InviteCodes } from "../global.js";

export const SessionService = {
  login(request: FastifyRequest<{ Body: RequestAuth }>) {
    const response = AuthserverService.login(request);
    return new SuccessResponse({
      accessToken: response.data.accessToken,
      uuid: TOKENSMAP.get(response.data.accessToken).owner.id,
    });
  },
  refresh(request: FastifyRequest<{ Body: RequestRefresh }>) {
    const result = AuthserverService.refresh(request);
    return new SuccessResponse({ accessToken: result.data.accessToken, uuid: result.data.user?.id });
  },
  logout(request: FastifyRequest<{ Body: RequestSignout | { accessToken: uuid }; Querystring: { all: string } }>) {
    if (request.query.all) {
      return AuthserverService.logout(request as FastifyRequest<{ Body: RequestSignout }>);
    }
    return AuthserverService.invalidate(request as FastifyRequest<{ Body: { accessToken: uuid } }>);
  },
};

export const SettingService = {
  getSettings(request: FastifyRequest) {
    try {
      request.permCheck(undefined, undefined, true);
      return new SuccessResponse(CONFIG);
    } catch {
      return new SuccessResponse({
        server: {
          name: CONFIG.server.name,
          root: CONFIG.server.root,
          homepage: CONFIG.server.homepage,
          register: CONFIG.server.register,
        },
        user: {
          passLenLimit: CONFIG.user.passLenLimit,
          userInviteCode: CONFIG.user.userInviteCode,
          officialProxy: CONFIG.user.officialProxy,
          uploadTexture: CONFIG.user.uploadTexture,
          offlineProfile: CONFIG.user.offlineProfile,
          changeOfflineProfileName: CONFIG.user.changeOfflineProfileName,
        },
        features: CONFIG.features,
        pubExtend: CONFIG.pubExtend,
      });
    }
  },
  async updateSettings(request: FastifyRequest<{ Body: Partial<Config> }>) {
    request.permCheck(undefined, undefined, true);
    const newConfig: Partial<Config> = Object.assign({}, request.body);
    Utils.cleanObj(newConfig, { p: "server", c: ["host", "port", "root", "cors"] }, "privateKeyPath", "webhooks", { p: "user", c: ["passwdHashType"] });
    Utils.merge<Config>(CONFIG, newConfig);
    return new SuccessResponse(CONFIG);
  },
};

export const BanService = {
  async addBan(request: FastifyRequest<{ Body: { target: string; duration: number } }>) {
    function findUser() {
      if (USERS.has(target)) {
        return USERS.get(target);
      }
      if (PROFILES.has(target)) {
        return USERS.get(PROFILES.get(target).owner);
      }
      // 该用户不存在
      throw new ErrorResponse("BadOperation", `无效的用户或角色名。`);
    }
    request.permCheck(undefined, undefined, true);
    const { target, duration } = request.body;
    const user = findUser();
    user.ban(duration);
    if (duration > 0) {
      WEBHOOK.emit("user.banned", { id: user.id, nickName: user.nickName, expiresAt: user.banned });
    } else {
      WEBHOOK.emit("user.unbanned", { id: user.id, nickName: user.nickName });
    }
    return new SuccessResponse(user.publicUserData);
  },
};

export const InviteCodeService = {
  async getInvitecodes(request: FastifyRequest<{ Querystring: { count: number } }>) {
    request.permCheck(undefined, undefined, true);
    const { count = 1 } = request.query;
    const maxCount = 1000;
    const list = [];
    // 请求获取的邀请码太多
    if (count > maxCount) {
      throw new ErrorResponse("BadOperation", `请求的邀请码数量过多，应少于 ${maxCount} 个。`);
    }
    // 已存在的邀请码太多
    if (InviteCodes.clear() >= maxCount) {
      throw new ErrorResponse("ForbiddenOperation", "已达到邀请码数量上限，暂时无法生成邀请码。");
    }
    for (let i = 0; i < (count > 0 ? count : 1); i++) {
      list.push(InviteCodes.issue());
    }
    return new SuccessResponse(list);
  },
};

export const logService = {
  async getLog(request: FastifyRequest<{ Params: { logName: "logins" | "errors" | "webhooks" } }>) {
    request.permCheck(undefined, undefined, true);
    const content = await fs.readFile(pathOf(`/logs/${request.params.logName}.log`)).catch(() => "");
    return new SuccessResponse(content, 200, "text/plain;charset=UTF-8");
  },
};

export const ServerServices = {
  async restart(request: FastifyRequest<{ Body: { restart: boolean } }>) {
    request.permCheck(undefined, undefined, true);
    const { restart } = request.body;
    if (restart) {
      process.send({ operation: "restart" });
    }
    return new SuccessResponse(undefined, 204);
  },
};

export const OfficialPlayerMgmtService = {
  async getBlackList(request: FastifyRequest) {
    request.permCheck(undefined, undefined, true);
    return new SuccessResponse(OFFICIALPLAYERLIST.blacklist);
  },
  async updateBlackList(request: FastifyRequest<{ Body: string[] }>) {
    request.permCheck(undefined, undefined, true);
    OFFICIALPLAYERLIST.blacklist = request.body.filter((i) => /[0-9a-f]{32}/i.test(i));
    return new SuccessResponse(OFFICIALPLAYERLIST.blacklist);
  },
  async getWhiteList(request: FastifyRequest) {
    request.permCheck(undefined, undefined, true);
    return new SuccessResponse(OFFICIALPLAYERLIST.whitelist);
  },
  async updateWhiteList(request: FastifyRequest<{ Body: string[] }>) {
    request.permCheck(undefined, undefined, true);
    OFFICIALPLAYERLIST.whitelist = request.body.filter((i) => /[0-9a-f]{32}/i.test(i));
    return new SuccessResponse(OFFICIALPLAYERLIST.whitelist);
  },
  async getAllTriedJoin(request: FastifyRequest) {
    request.permCheck(undefined, undefined, true);
    return new SuccessResponse(OFFICIALPLAYERLIST.logged);
  },
};
