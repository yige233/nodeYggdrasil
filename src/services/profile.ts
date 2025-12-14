import { FastifyReply, FastifyRequest } from "fastify";
import { ErrorResponse, SuccessResponse, Time } from "../libs/utils.js";
import Profile from "../libs/profile.js";
import { model, TextureData, uuid } from "../libs/interfaces.js";
import { checkTexture } from "../libs/textures.js";
import { TOKENSMAP, PROFILES, WEBHOOK, CONFIG } from "../global.js";

interface importTextureBody {
  /** 正版用户id */
  profileName?: string;
  /** littleskin的皮肤id */
  littleskinTid?: string;
  /** 通过官方材质hash来获取材质 */
  officialSkinInfo?: {
    /** 材质类型 */
    textureType?: model | "cape";
    /** 材质hash */
    hash: string;
  };
}

export const ProfileService = {
  async updateInfo(request: FastifyRequest<{ Body: { name?: string; model?: "default" | "slim"; capeVisible?: boolean; unlinkMSAccount?: true }; Params: { uuid: uuid } }>) {
    const { name, model, capeVisible, unlinkMSAccount = false } = request.body;
    const uuid = request.params.uuid;
    const { user, profile } = request.permCheck(undefined, uuid);
    // 设置新的角色名称
    if (name) {
      profile.setValue("name", name);
      // 强制使绑定至该角色的所有令牌进入暂时失效状态
      user.tokens.forEach((accessToken) => {
        const token = TOKENSMAP.get(accessToken);
        if (token.profile && token.profile === profile.id) {
          token.forcedTvalid = true;
        }
      });
    }
    if (["default", "slim"].includes(model)) {
      profile.textureManager().setModel(model);
    }
    if (typeof capeVisible === "boolean") {
      profile.setValue("capeVisible", capeVisible);
    }
    if (unlinkMSAccount === true) {
      profile.setValue("linkedMSUserId", null);
    }
    return new SuccessResponse(profile.getYggdrasilData(true));
  },
  async linkMSAccount(request: FastifyRequest<{ Params: { uuid: uuid }; Querystring: { step: "issue" | "verify"; code?: string } }>) {
    const { uuid } = request.params;
    const { step, code } = request.query;
    const { user, profile } = request.permCheck(undefined, uuid);
    if (step === "issue") {
      request.rateLim(user.id, "issueMSAuthDeviceCode", CONFIG.user.keyOpRL);
      const result = await Profile.createAuthFlow();
      return new SuccessResponse(result, 201);
    }
    if (step === "verify") {
      request.rateLim(user.id, "verifyMSAuthDeviceCode", Time.parse("5s"));
      const { retryAfter, accessToken } = await Profile.verifyAuthFlow(code);
      if (retryAfter) return new SuccessResponse({ retryAfter }, 202);
      if (accessToken) {
        const msUserId = await Profile.getMSAccountId(accessToken);
        profile.setValue("linkedMSUserId", msUserId);
        return new SuccessResponse(profile.getYggdrasilData(true));
      }
    }
  },
  async delete(request: FastifyRequest<{ Params: { uuid: uuid } }>) {
    const uuid = request.params.uuid;
    const { user, profile } = request.permCheck(undefined, uuid);
    const webhookMessage = {
      id: profile.id,
      name: profile.name,
      owner: profile.owner
        ? {
            id: profile.owner ?? undefined,
            nickName: user.nickName,
          }
        : undefined,
    };
    await user.deleteProfile(uuid);
    WEBHOOK.emit("profile.delete", webhookMessage);
    return new SuccessResponse(undefined, 204);
  },
  getTexture(request: FastifyRequest<{ Params: { uuid: uuid; textureType: "skin" | "cape" } }>, reply: FastifyReply) {
    const { uuid, textureType } = request.params;
    const profile = PROFILES.get(uuid);
    if (!profile) {
      throw new ErrorResponse("NotFound", "提供的角色ID无效。");
    }
    const texture: TextureData = profile.textures[textureType.toUpperCase()];
    if (texture) {
      reply.header("Location", texture.url);
      reply.status(302);
      reply.send();
      return false;
    }
    throw new ErrorResponse("NotFound", "请求的材质不存在。");
  },
  async importTexture(request: FastifyRequest<{ Querystring: { operation: "copyFromOfficial" | "importFromLittleskin" | "importFromOfficialURL" }; Params: { uuid: uuid }; Body: importTextureBody }>) {
    function takeAction() {
      if (!operation) {
        throw new ErrorResponse("BadOperation", "需要提供“操作类型”参数。");
      }
      if (operation === "copyFromOfficial") {
        return profile.textureManager().copyFromOfficial(request.body.profileName);
      }
      if (operation === "importFromLittleskin") {
        return profile.textureManager().importFromLittleskin(request.body.littleskinTid);
      }
      if (operation === "importFromOfficialURL") {
        const { textureType, hash } = request.body.officialSkinInfo;
        return profile.textureManager().importFromOfficialURL(hash, textureType);
      }
    }
    const operation = request.query.operation;
    const uuid = request.params.uuid;
    const { profile } = request.permCheck(undefined, uuid);
    await takeAction();
    return new SuccessResponse(profile.getYggdrasilData(true));
  },
  async uploadTexture(request: FastifyRequest<{ Params: { uuid: uuid; textureType: "skin" | "cape" }; Body: Buffer }>) {
    const { uuid, textureType } = request.params,
      /** 允许的最大材质大小 */
      maxImgSize = 5 * 1024,
      model = request.headers["x-skin-model"] === "slim" ? "slim" : "default";

    const profile = PROFILES.get(uuid);
    request.rateLim(profile.owner, "uploadTexture");
    if (Number(request.headers["content-length"]) >= maxImgSize) {
      throw new ErrorResponse("ContentTooLarge", `提供的图片超过允许的最大大小(5KB)。`);
    }
    const image = await checkTexture(request.body, textureType);
    profile.textureManager().uploadTexture(image, textureType === "skin" ? model : "cape");
    return new SuccessResponse(undefined, 204);
  },
  newProfile(request: FastifyRequest<{ Body: { name: string; offlineCompatible: boolean } }>, reply: FastifyReply) {
    const { user } = request.permCheck();
    const { name, offlineCompatible = false } = request.body;
    const result = Profile.new(name, user.id, offlineCompatible);
    WEBHOOK.emit("profile.create", {
      id: result.id,
      name: result.name,
      owner: {
        id: user.id,
        nickName: user.nickName,
      },
    });
    reply.header("Location", `/${result.id}`);
    return new SuccessResponse(result.getYggdrasilData(true), 201);
  },
  corsPreflight(_request: FastifyRequest, reply: FastifyReply) {
    reply.headers({
      Allow: "GET,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Methods": "GET,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "content-type,authorization,x-skin-model",
    });
    return new SuccessResponse(undefined, 200);
  },
};
