import { FastifyReply, FastifyRequest } from "fastify";
import Utils, { ErrorResponse, SuccessResponse } from "../libs/utils.js";
import { WebHookConfig, WebHookReqInit, WebhookTypes } from "../libs/interfaces.js";
import { CONFIG, pinoLogger, WEBHOOK } from "../global.js";
import WebHook from "../libs/webhook.js";

const { webhooks } = CONFIG;

export const WebhookServices = {
  get() {
    return new SuccessResponse(webhooks);
  },
  async add(request: FastifyRequest<{ Body: WebHookConfig }>, reply: FastifyReply) {
    const { url, subTypes, secrets, active } = request.body;
    if (webhooks.find((i) => i.url == request.body.url)) {
      throw new ErrorResponse("BadOperation", "Provided webhook already exist.");
    }
    if (secrets.length == 0) {
      throw new ErrorResponse("BadOperation", "Secrets field should contain at least 1 key config object.");
    }
    if (!url || subTypes.length == 0) {
      throw new ErrorResponse("BadOperation", "URL and subTypes field should not be empty.");
    }
    const id = Utils.uuid();
    const webhookConfig = { id, url, subTypes, secrets, active: active ?? false };
    webhooks.push(webhookConfig);
    reply.header("Location", `/${id}`);
    return new SuccessResponse(webhookConfig, 201);
  },
  async remove(request: FastifyRequest<{ Params: { id: string } }>) {
    const targetIndex = webhooks.findIndex((i) => i.id == request.params.id);
    if (targetIndex == -1) {
      throw new ErrorResponse("NotFound", "Target webhook not found.");
    }
    webhooks.splice(targetIndex, 1);
    return new SuccessResponse(undefined, 204);
  },
  async update(request: FastifyRequest<{ Params: { id: string }; Body: WebHookConfig }>) {
    const target = webhooks.find((i) => i.id == request.params.id);
    if (!target) {
      throw new ErrorResponse("NotFound", "Target webhook not found.");
    }
    Utils.merge<WebHookConfig>(target, { ...request.body });
    const { subTypes, secrets } = request.body;
    if (subTypes) {
      target.subTypes = subTypes;
    }
    if (secrets) {
      target.secrets = secrets;
    }
    return new SuccessResponse(target);
  },
  async test(request: FastifyRequest<{ Params: { id: string }; Body: { data: {}; type: WebhookTypes } }>) {
    const { data = { message: "this is a test message." }, type } = request.body;
    request.rateLim(request.params.id, "testWebhook");
    const target = webhooks.find((i) => i.id == request.params.id);
    if (!target) {
      throw new ErrorResponse("NotFound", "Target webhook not found.");
    }
    const requestInit: WebHookReqInit = WebHook.webhookReq({ url: target.url, data, type: type ?? "test" });
    pinoLogger.webhook(`[${requestInit.messageId}] URL:${target.url} => ${JSON.stringify(data)}`);
    const result = await WEBHOOK.send(requestInit, true);
    if (!result) {
      return new SuccessResponse(undefined, 204);
    }
    throw new ErrorResponse("ServiceUnavailable", result);
  },
};
