import { FastifyReply, FastifyRequest } from "fastify";
import { ErrorResponse, SuccessResponse } from "../libs/utils.js";
import User from "../libs/user.js";
import { MinimumUserData, RequestSignout, uuid } from "../libs/interfaces.js";
import { CONFIG, USERS, WEBHOOK, Settings } from "../global.js";

interface newUserBody {
  username: string;
  password: string;
  inviteCode?: string;
  nickName?: string;
}

export const UserServices = {
  get(request: FastifyRequest<{ Params: { uuid: uuid } }>) {
    const uuid: uuid = request.params.uuid;
    if (!USERS.has(uuid)) {
      throw new ErrorResponse("NotFound", "用户不存在。");
    }
    const user = USERS.get(uuid);
    try {
      request.permCheck(uuid);
      return new SuccessResponse(user.privateUserData);
    } catch {
      return new SuccessResponse(user.publicUserData);
    }
  },
  async update(request: FastifyRequest<{ Params: { uuid: uuid }; Body: { username?: string; password?: string; nickName?: string; maxProfileCount?: number } }>) {
    const uuid: uuid = request.params.uuid,
      { username, password, nickName, maxProfileCount } = request.body || {};
    if (maxProfileCount) {
      request.permCheck(uuid, undefined, true);
      const user = USERS.get(uuid);
      if (!user) throw new ErrorResponse("NotFound", "用户不存在。");
      user.maxProfileCount = maxProfileCount;
      return new SuccessResponse(undefined, 204);
    }
    const { user } = request.permCheck(uuid);
    request.rateLim(user.id, "updateUserData", Settings.dev ? CONFIG.server.keyReqRL : CONFIG.user.keyOpRL);
    const resultUser = user.setUserInfo(username, password, nickName);
    return new SuccessResponse(resultUser.privateUserData);
  },
  async lock(request: FastifyRequest<{ Body: RequestSignout }>) {
    const { username, password } = request.body || {};
    request.rateLim(username || "", "authenticate");
    const user = User.authenticate(username, password);
    user.makeReadonly();
    WEBHOOK.emit("user.lock", { nickName: user.nickName, id: user.id, ip: request.getIP() });
    return new SuccessResponse(undefined, 204);
  },
  async delete(request: FastifyRequest<{ Params: { uuid: uuid }; Body: RequestSignout }>) {
    request.rateLim(request.body.username || "", "authenticate");
    const uuid: uuid = request.params.uuid;
    const { username = null, password = null }: RequestSignout = request.body;
    const user = User.authenticate(username, password);
    const webhookMessage = { nickName: user.nickName, id: user.id, ip: request.getIP() };
    if (user.id != uuid) {
      throw new ErrorResponse("BadOperation", "无效的用户。");
    }
    await user.deleteAccount();
    WEBHOOK.emit("user.delete", webhookMessage);
    return new SuccessResponse(undefined, 204);
  },
  async generateRescueCode(request: FastifyRequest<{ Params: { uuid: uuid } }>) {
    const uuid: uuid = request.params.uuid;
    const { user } = request.permCheck(uuid);
    const rescueCode = user.generateRescueCode();
    return new SuccessResponse({ rescueCode });
  },
  async generateInviteCode(request: FastifyRequest<{ Params: { uuid: uuid } }>) {
    const uuid: uuid = request.params.uuid;
    const { user } = request.permCheck(uuid);
    const inviteCode = user.generateInviteCode();
    return new SuccessResponse({ inviteCode });
  },
  async resetPassword(request: FastifyRequest<{ Params: { uuid: uuid }; Body: { rescueCode: string; newPass: string } }>) {
    const uuid: uuid = request.params.uuid;
    // 重置密码的速率限制是30秒
    request.rateLim(uuid, "resetPassword", "30s");
    const { rescueCode = null, newPass = null } = request.body;
    const user = User.resetPass(uuid, rescueCode, newPass);
    WEBHOOK.emit("user.password.reset", { id: user.id, nickName: user.nickName, ip: request.getIP() });
    return new SuccessResponse(undefined, 204);
  },
  async editRemainingInviteCode(request: FastifyRequest<{ Params: { uuid: uuid }; Body: { addCount: number } }>) {
    const uuid: uuid = request.params.uuid;
    request.permCheck(undefined, undefined, true);
    const user = USERS.get(uuid);
    if (user) {
      user.remainingInviteCodeCount += request.body.addCount;
      return new SuccessResponse({ remainingInviteCodeCount: user.remainingInviteCodeCount });
    }
    throw new ErrorResponse("NotFound", "用户不存在。");
  },
  async queryUser(request: FastifyRequest<{ Querystring: { user: string; after: string; count: number } }>, reply: FastifyReply) {
    function findStartIndex() {
      const after = request.query.after;
      if (USERS.has(after)) {
        return USERS.data.findIndex(USERS.compareFunc(after)) + 1;
      }
      return 0;
    }
    const { user: username } = request.query;
    if (username) {
      if (USERS.has(username)) {
        reply.header("Location", `${request.routeOptions.url}/${USERS.get(username).id}`);
        reply.status(302);
        reply.send();
        return false;
      }
      throw new ErrorResponse("NotFound", `用户不存在：${username} 。`);
    }
    if (request.query.after) {
      request.permCheck(undefined, undefined, true);
      const count = request.query.count > 0 ? request.query.count : 10;
      if (count > 100) {
        throw new ErrorResponse("BadOperation", "单次最多只能查询 100 个用户。");
      }
      const startIndex = findStartIndex();
      const list = USERS.data.map((user, index) => {
        if (index >= startIndex && index < startIndex + count) {
          return user.publicUserData;
        }
      });
      return new SuccessResponse(list.filter((i) => i));
    }
    throw new ErrorResponse("BadOperation", `缺少如下参数: “user”或“after”。`);
  },
  async newUser(request: FastifyRequest<{ Body: newUserBody | newUserBody[] }>) {
    const rawRegList = Array.isArray(request.body) ? request.body : [request.body];
    request.rateLim(request.getIP(), "newUser");
    //如果携带了 Authorization 头，并且 accessToken 的所有者是管理员，那么他可以一次性注册大量用户
    const regList = request.getToken() && request.permCheck(undefined, undefined, true) ? rawRegList : rawRegList.slice(0, 1);
    const result: (MinimumUserData | { error: string; errorMessage: string })[] = regList.map((i) => {
      const { username, password, inviteCode = null, nickName = null } = i;
      try {
        const user = User.register({ username, password, inviteCode, nickName, ip: request.getIP() });
        WEBHOOK.emit("user.register", {
          id: user.id,
          nickName: user.nickName,
          ip: user.regIP,
          from: {
            type: user.extend.source,
            id: user.extend.source == "user" ? USERS.get(user.extend.source).id : undefined,
            nickName: user.extend.source == "user" ? USERS.get(user.extend.source).nickName : undefined,
          },
        });
        return user.yggdrasilData;
      } catch (err) {
        if (err instanceof ErrorResponse) {
          return { error: err.error, errorMessage: err.errorMessage };
        }
        throw err;
      }
    });
    if (result.find((i) => "id" in i)) return new SuccessResponse(result.length == 1 ? result[0] : result, 201);
    return new SuccessResponse(result.length == 1 ? result[0] : result, 400);
  },
};
