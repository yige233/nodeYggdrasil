import path from "node:path";
import Fastify, { FastifyInstance, FastifyRequest } from "fastify";
import publicStatic from "@fastify/static";
import Ajv, { KeywordCxt } from "ajv";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { ACCESSCONTROLLER, CONFIG, pinoLogger, PROFILES, TOKENSMAP, USERS, WEBHOOK } from "./global.js";
import { Plugin } from "./libs/utils.js";
import yggdrasil from "./routes/yggdrasil.js";
import server from "./routes/api.js";

const yggdrasilALI = { "x-authlib-injector-api-location": "/yggdrasil" };

const ajv = new Ajv({
  removeAdditional: true,
  useDefaults: true,
  coerceTypes: true,
});

ajv.addKeyword({
  keyword: "multipart",
  schemaType: "boolean",
  code(cxt: KeywordCxt) {
    cxt.ok(true);
  },
});

const app: FastifyInstance = Fastify({
  trustProxy: CONFIG.server.proxyCount || false,
  disableRequestLogging: true,
  exposeHeadRoutes: true,
  ignoreTrailingSlash: true,
  loggerInstance: pinoLogger,
});
app.setValidatorCompiler(({ schema }) => ajv.compile(schema));

await app.register(async (instance) => {
  publicStatic(instance, { root: path.resolve("./public") });
  instance.addHook("onRequest", async (_request, reply) => void reply.headers(yggdrasilALI));
});
Plugin.errorResponse(app);
Plugin.successResponse(app);
Plugin.permissionCheck(app, { USERS, PROFILES, TOKENSMAP });
Plugin.getToken(app);
Plugin.routePacker(app);
Plugin.handlePacker(app);
Plugin.allowedContentType(app);
Plugin.getIP(app, { trustXRealIP: CONFIG.server.trustXRealIP });
Plugin.rateLim(app, { gap: CONFIG.server.keyReqRateLimit, controller: ACCESSCONTROLLER });

app.setNotFoundHandler((requset, reply) => reply.replyError("NotFound", `Path not found: ${requset.url}`));
app.setErrorHandler(async (error, _requset, reply) => reply.replyError("BadOperation", `check your request: ${error.message || "something is wrong."}`));
if (CONFIG.privExtend.enableSwaggerUI) {
  await app.register(swagger, {
    swagger: {
      info: {
        title: "nodeYggdrasilServer API 测试页面",
        description: "测试本程序提供的api。以及查看对应的文档",
        version: "1.0",
      },
      tags: [
        { name: "yggdrasil", description: "Yggdrasil 服务端技术规范所规定的API" },
        { name: "server", description: "便于管理验证服务端而定义的API" },
      ],
      externalDocs: {
        url: "https://github.com/yushijinhun/authlib-injector/wiki/Yggdrasil-%E6%9C%8D%E5%8A%A1%E7%AB%AF%E6%8A%80%E6%9C%AF%E8%A7%84%E8%8C%83",
        description: "Yggdrasil 服务端技术规范(Github)",
      },
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: false },
    staticCSP: true,
    transformSpecificationClone: true,
  });
}

app.register(async (instance) => {
  instance.pack({
    url: "/",
    routes: [server, yggdrasil],
    before: function (instance) {
      instance.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, async (_request: FastifyRequest, body: string) => body);
      instance.decorateRequest("allowedContentType", null);
      instance.addHook("onRequest", async (_request, reply) => void reply.headers(Object.assign({ "content-type": "application/json; charset=utf-8" }, yggdrasilALI)));
      instance.addHook("onResponse", (request, reply) => void pinoLogger.info(`${request.getIP()} - ${request.method} ${request.url} => ${reply.statusCode}`));
    },
  });
});

const result = await app.listen({ port: CONFIG.server.port, host: CONFIG.server.host });
WEBHOOK.emit("server.start", {});
process.on("exit", () => WEBHOOK.emit("server.killed", {}));
pinoLogger.info(`yggdrasil 验证服务端: ${CONFIG.server.name} 正运行在 ${result}`);
