import { FastifyInstance, FastifyRequest } from "fastify";
import { RoutePackConfig } from "../libs/interfaces.js";
import { ApiService, SessionserverService } from "../services/yggdrasil.js";
import schemas, { Packer } from "../libs/schemas.js";
import { ProfileService } from "../services/profile.js";

const textureType: RoutePackConfig = {
  url: "/:textureType",
  get: {
    handler: ProfileService.getTexture,
    schema: {
      summary: "获取用户指定材质的url",
      description: "若param中的角色id存在，且该角色拥有对应的材质，则会通过302重定向到该材质的URL。",
      tags: ["server"],
      params: Packer.object()({ uuid: schemas.shared.userUuid, textureType: schemas.shared.textureType }, "uuid", "textureType"),
      response: { 302: schemas.Response204.ok },
    },
  },
  /** 上传材质 */
  put: {
    handler: ProfileService.uploadTexture,
    schema: {
      summary: "从用户侧上传材质",
      description: "payload只接受png，大小在5kb以内。若上传皮肤，需要额外提供x-skin-model请求头，指示皮肤使用的模型。旧有的材质会被删除。需要提供有效的令牌。",
      tags: ["server"],
      params: Packer.object()({ uuid: schemas.shared.userUuid, textureType: schemas.shared.textureType }, "uuid", "textureType"),
      consumes: ["image/png"],
      headers: Packer.object()(
        {
          authorization: schemas.shared.authorization,
          "content-type": Packer.string("必须是 image/png", "image/png"),
          "x-skin-model": Packer.string("确定上传材质要应用到的模型", "slim", "default"),
        },
        "authorization",
        "content-type"
      ),
      response: { 204: schemas.Response204.ok },
    },
  },
  /** 删除材质 */
  delete: {
    handler: ApiService.deleteTexture,
    schema: {
      summary: "删除指定的材质",
      description: "需要提供有效的令牌。",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.shared.authorization }, "authorization"),
      params: Packer.object()(
        { uuid: schemas.shared.profileUuid, textureType: Packer.string("要删除的材质类型。特别地，可以使用“all”来指定删除所有材质。", "skin", "cape", "all") },
        "uuid",
        "textureType"
      ),
      response: { 204: schemas.Response204.ok },
    },
  },
  before: function (instance: FastifyInstance) {
    instance.addContentTypeParser("image/png", async function (_request: FastifyRequest, payload) {
      return await new Promise((resolve, reject) => {
        try {
          const chunks = [];
          payload.on("data", (chunk: Buffer) => chunks.push(chunk));
          payload.on("end", () => {
            resolve(Buffer.concat(chunks));
          });
        } catch (err) {
          err.statusCode = 400;
          reject(err);
        }
      });
    });
    instance.addHook("onRequest", instance.allowedContentType("image/png"));
    instance.addHook("onRequest", instance.packHandle(ApiService.textureAaccessCheck));
  },
};

const textures: RoutePackConfig = {
  url: "/textures",
  patch: {
    handler: ProfileService.importTexture,
    schema: {
      summary: "导入角色的材质",
      description: "需要提供有效的令牌。根据operation所指定的操作，需要提供相应的数据。",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.shared.authorization }, "authorization"),
      params: Packer.object()({ uuid: schemas.shared.userUuid }, "uuid"),
      querystring: Packer.object()({
        operation: Packer.string("对材质的操作类型", "copyFromOfficial", "importFromLittleskin", "importFromOfficialURL"),
      }),
      body: Packer.object("执行上述操作类型要用到的数据")({
        profileName: Packer.string("复制该值对应的正版角色的材质，包括披风(当上述 operation 为 copyFromOfficial 时)"),
        littleskinTid: Packer.string("复制该值对应的 littleskin 皮肤库中的材质(仅支持公开材质)(当上述 operation 为 importFromLittleskin 时)"),
        officialSkinInfo: Packer.object("通过官方材质设置皮肤(当上述 operation 为 importFromOfficialURL 时)")({
          textureType: Packer.string("材质类型", "default", "slim", "cape"),
          hash: Packer.string("官方材质的hash值"),
        }),
      }),
      response: { 200: schemas.PublicProfileData },
    },
  },
  routes: [textureType],
};
/** 单个角色相关 */
const profile: RoutePackConfig = {
  url: "/:uuid",
  /** 获取角色信息 */
  get: {
    handler: SessionserverService.getProfile,
    schema: {
      summary: "查询指定角色的完整信息",
      description: "结果包含角色属性，可选是否包含签名。需要提供有效的令牌。",
      tags: ["server"],
      params: Packer.object()({ uuid: schemas.shared.userUuid }, "uuid"),
      querystring: Packer.object()({ unsigned: schemas.shared.unsigned }),
      response: { 200: schemas.PublicProfileData },
    },
  },
  /** 修改角色信息 */
  patch: {
    handler: ProfileService.updateInfo,
    schema: {
      summary: "修改角色的部分信息",
      description: "可以修改角色名称和披风可见性；可以绑定和解绑微软账户。需要提供有效的令牌。如果修改了角色名称，那么会同时使所有绑定了该角色的令牌进入暂时失效状态。",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.shared.authorization }, "authorization"),
      params: Packer.object()({ uuid: schemas.shared.userUuid }, "uuid"),
      body: Packer.object()({
        name: Packer.string("新的角色名称，为空则视为不作修改。"),
        model: Packer.string("角色使用的模型。", "default", "slim"),
        capeVisible: Packer.boolean("披风的可见性，即是否隐藏披风。披风的材质不会被删除。"),
        unlinkMSAccount: Packer.boolean("是否解除该角色与微软账户的绑定。"),
        MSAuthCode: Packer.string("想要绑定至该角色的微软账号的授权码。提供该项会导致API对该用户触发关键操作冷却。如果同时提供了本项与 unlinkMSAccount ，会先进行解绑，然后绑定新的账户。"),
      }),
      response: { 200: schemas.PublicProfileData },
    },
  },
  /** 删除角色 */
  delete: {
    handler: ProfileService.delete,
    schema: {
      summary: "删除角色",
      description: "会同时删除上传到服务器的材质。需要提供有效的令牌。",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.shared.authorization }, "authorization"),
      params: Packer.object()({ uuid: schemas.shared.userUuid }, "uuid"),
      response: { 204: schemas.Response204.ok },
    },
  },
  /** 材质相关 */
  routes: [textures],
};
/** 角色这一集合相关 */
const profiles: RoutePackConfig = {
  url: "/profiles",
  /** 新建角色 */
  post: {
    handler: ProfileService.newProfile,
    schema: {
      summary: "新建一个角色",
      description: "角色名区分大小写，且长度在30字符以内。",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.shared.authorization }, "authorization"),
      body: Packer.object("需要提供的数据和选项")({
        name: Packer.string("新角色的名称"),
        offlineCompatible: Packer.boolean("对于该角色，是否采用与离线模式相同的uuid计算方式"),
      }),
      response: { 201: schemas.PublicProfileData },
    },
  },
  routes: [profile],
};

export default profiles;
