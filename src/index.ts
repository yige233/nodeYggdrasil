import path from "node:path";
import Fastify, { FastifyInstance } from "fastify";
import publicStatic from "@fastify/static";
import Ajv, { KeywordCxt } from "ajv";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import fs from "fs/promises";
import { CONFIG, Plugin } from "./libs/utils.js";
import yggdrasil from "./routes/yggdrasil.js";
import server from "./routes/api.js";

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
  trustProxy: CONFIG.content.server.proxyCount || false,
  disableRequestLogging: true,
  exposeHeadRoutes: true,
  ignoreTrailingSlash: true,
  logger: {
    formatters: {
      level(label) {
        return { level: label.toUpperCase() };
      },
    },
    stream: {
      write(msg) {
        const { level, time, msg: message, err = null } = JSON.parse(msg);
        const date = new Date(time).toLocaleString();
        if (level == "ERROR") {
          const prettyMsg = [`[${date}] [${level}] ${message}`, `  type:${err.type}`, `  message:${err.message}`, `  stack:${err.stack}`, `  traceId:${err.trace || null}`];
          fs.appendFile("./data/errors.log", `${prettyMsg.join("\r\n")}\r\n`);
        }
        process.stdout.write(`[${date}] [${level}] ${message} ${level == "ERROR" ? err.trace : ""}\r\n`);
      },
    },
  },
});
app.setValidatorCompiler(({ schema }) => ajv.compile(schema));

await app.register(publicStatic, {
  root: path.resolve("./public"),
});
Plugin.errorResponse(app);
Plugin.successResponse(app);
Plugin.permissionCheck(app);
Plugin.allowedMethod(app);
Plugin.getToken(app);
Plugin.routePacker(app);
Plugin.handlePacker(app);
Plugin.getIP(app, {
  trustXRealIP: CONFIG.content.server.trustXRealIP,
});
Plugin.rateLim(app, {
  gap: CONFIG.content.server.keyReqRateLimit,
});

app.setNotFoundHandler((requset, reply) => reply.replyError("NotFound", `Path not found: ${requset.url}`));

if (CONFIG.content.privExtend.enableSwaggerUI) {
  await app.register(swagger, {
    swagger: {
      info: {
        title: "nodeYggdrasilServer API 测试页面",
        description: "测试本程序提供的api。以及查看对应的文档",
        version: "1.0",
      },
      tags: [
        { name: "ydddrasil", description: "Yggdrasil 服务端技术规范所规定的API" },
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
    uiConfig: {
      docExpansion: "list",
      deepLinking: false,
    },
    staticCSP: true,
    transformSpecificationClone: true,
  });
}

app.register(async (instance) => {
  instance.addHook("onRequest", async (_request, reply) => {
    reply.headers({
      "content-type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "X-Authlib-Injector-API-Location": "./yggdrasil/", // 使用相对 URL
    });
  });
  instance.addHook("onResponse", (request, reply) => {
    instance.log.info(`${request.getIP()} use ${request.method} for ${request.url} => ${reply.statusCode}`);
  });
  instance.pack("/", {
    routes: [
      { url: "/yggdrasil", config: yggdrasil },
      { url: "/server", config: server },
    ],
  });
});

const result = await app.listen({
  port: CONFIG.content.server.port,
  host: CONFIG.content.server.host,
});
app.log.info(`yggdrasil 验证服务端: ${CONFIG.content.server.name} 正运行在 ${result}`);
