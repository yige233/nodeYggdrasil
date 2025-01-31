import { RoutePackConfig } from "../libs/interfaces.js";
import schemas, { Packer } from "../libs/schemas.js";
import { WebhookServices } from "../services/webhook.js";

const test: RoutePackConfig = {
  url: "/test",
  /** 测试 webhook 配置 */
  post: {
    handler: WebhookServices.test,
    schema: {
      summary: "测试 webhook 配置。",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.shared.authorization }),
      body: Packer.object("测试数据")({
        data: Packer.object("要通过测试发送的数据")({}),
        type: Packer.string("该测试将触发的事件类型"),
      }),
      response: { 204: schemas.Response204.ok, 503: schemas.ResponseError },
    },
  },
};

const operation: RoutePackConfig = {
  url: "/:id",
  /** 删除 webhook 配置 */
  delete: {
    handler: WebhookServices.remove,
    schema: {
      summary: "删除 webhook 配置。",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.shared.authorization }),
      response: { 204: schemas.Response204.ok },
    },
  },
  /** 修改 webhook 配置 */
  patch: {
    handler: WebhookServices.update,
    schema: {
      summary: "修改 webhook 配置。对于两个数组类型的数据subTypes和secrets，新的数据将会直接替换旧有的数据。",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.shared.authorization }),
      body: schemas.WebhookConfig,
      response: { 200: schemas.WebhookConfig },
    },
  },
  routes: [test],
};

const webhooks: RoutePackConfig = {
  url: "/webhooks",
  /** 获取所有 webhook 配置 */
  get: {
    handler: WebhookServices.get,
    schema: {
      summary: "获取所有 webhook 配置。实际上相当于单独列出config.webooks",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.shared.authorization }),
      response: { 200: schemas.Config.properties.webhooks },
    },
  },
  /** 添加新的 webhook 配置 */
  post: {
    handler: WebhookServices.add,
    schema: {
      summary: "添加新的 webhook 配置。",
      tags: ["server"],
      headers: Packer.object()({ authorization: schemas.shared.authorization }),
      body: schemas.WebhookConfig,
      response: { 201: schemas.WebhookConfig },
    },
  },
  routes: [operation],
  before: function (instance) {
    instance.addHook(
      "onRequest",
      instance.packHandle((request) => {
        request.permCheck(undefined, undefined, true);
        return false;
      })
    );
  },
};

export default webhooks;
