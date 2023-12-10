import crypto from "crypto";
import fs from "node:fs/promises";
import { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods, RouteOptions } from "fastify";
import { Config, Status, ProfileData, UserData, uuid, TextureIndex, RoutePackConfig } from "./interfaces.js";
import Profile from "./profile.js";
import Session from "./session.js";
import Token from "./token.js";
import User from "./user.js";
import schemas from "./schemas.js";

/** 公共函数 */
export default class Utils {
  /**
   * 生成一个uuid
   * @param playerName (可选) 计算该玩家名对应的离线uuid
   * @returns {uuid}
   */
  static uuid(playerName?: string): uuid {
    if (playerName) {
      const md5Bytes = crypto
        .createHash("md5")
        .update("OfflinePlayer:" + playerName)
        .digest();
      md5Bytes[6] &= 0x0f; /* clear version        */
      md5Bytes[6] |= 0x30; /* set to version 3     */
      md5Bytes[8] &= 0x3f; /* clear variant        */
      md5Bytes[8] |= 0x80; /* set to IETF variant  */
      return md5Bytes.toString("hex");
    }
    return crypto.randomUUID().replace(/-/g, "");
  }
  /**
   * 计算sha256
   * @param content 要计算的内容
   * @returns sha256
   */
  static sha256(content: any): string {
    const hash = crypto.createHash("sha256");
    return hash.update(content).digest("hex");
  }
  /**
   * 对数据进行RSA-SHA1签名
   * @param dataToSign 待签数据
   * @param privateKey 用于签名的私钥
   * @returns 签名
   */
  static makeSignature(dataToSign: any, privateKey: string): string {
    const sign = crypto.createSign("RSA-SHA1");
    sign.update(dataToSign);
    sign.end();
    const signature = sign.sign(privateKey);
    return signature.toString("base64");
  }
  /** Base64编码 */
  static encodeb64(data: any): string {
    return Buffer.from(data).toString("base64");
  }
  /** Base64解码 */
  static decodeb64(data: string): string {
    return Buffer.from(data, "base64").toString("utf8");
  }
  /** 以数组作为key的Map，实现多个键对应一个值（键的数组作为真正的键） */
  static arrMap(): Map<any, any> {
    return new (class extends Map {
      constructor() {
        super();
      }
      operate(method: "get" | "has" | "delete", key: string): any {
        for (let keyarr of this.keys()) {
          if (keyarr.some((i: string) => i.toLowerCase() === key.toLowerCase())) {
            return super[method](keyarr);
          }
        }
        return false;
      }
      get(key: string): any {
        return this.operate("get", key) || undefined;
      }
      has(key: string): boolean {
        return this.operate("has", key);
      }
      delete(key: string): boolean {
        return this.operate("delete", key);
      }
    })();
  }
  /** 用于发出请求的请求头 */
  static get requestHeaders() {
    return {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 yggdrasilProxy/1.0.0",
    };
  }
}

export class Plugin {
  /** 失败响应 */
  static errorResponse(instance: FastifyInstance) {
    instance.decorateReply("replyError", function (error: Status, errorMessage: string, cause?: string): void {
      const code =
        error == "BadOperation" || error == "IllegalArgument"
          ? 400
          : error == "Unauthorized"
          ? 401
          : error == "ForbiddenOperation"
          ? 403
          : error == "NotFound"
          ? 404
          : error == "MethodNotAllowed"
          ? 405
          : error == "ContentTooLarge"
          ? 413
          : error == "UnsupportedMediaType"
          ? 415
          : error == "UnprocessableEntity"
          ? 422
          : error == "TooManyRequests"
          ? 429
          : 500;
      this.status(code);
      this.send({
        error: error + "Exception",
        errorMessage,
        cause,
      });
    });
  }
  /** 成功响应 */
  static successResponse(instance: FastifyInstance): void {
    instance.decorateReply("replySuccess", function (data: any, code: number = 200) {
      if (code == 204) {
        this.status(204);
        this.removeHeader("content-type");
        return this.send();
      }
      return this.send(data);
    });
  }
  /** 从请求中获取ip */
  static getIP(
    instance: FastifyInstance,
    options: {
      trustXRealIP: boolean;
    }
  ): void {
    instance.decorateRequest("getIP", function (): string {
      const xRealIP = this.headers["x-real-ip"] ?? undefined;
      if (xRealIP && options.trustXRealIP) {
        //存在 x-real-ip 头，信任该请求头提供的ip地址
        return typeof xRealIP == "string" ? xRealIP : xRealIP[0];
      }
      return this.ip;
    });
  }
  /** 限制请求速度 */
  static rateLim(
    instance: FastifyInstance,
    options: {
      gap: number;
    } = { gap: 100 }
  ): void {
    instance.decorateRequest("rateLim", function (key: string, ms?: number): true {
      if (!ACCESSCONTROLLER.test(key, ms || options.gap)) {
        //限制请求速率
        throw new ErrorResponse("ForbiddenOperation", "Operating too fast.");
      }
      return true;
    });
  }
  /** 从请求中获取 AccessToken */
  static getToken(instance: FastifyInstance): void {
    instance.decorateRequest("getToken", function (): string {
      if (!this.headers.authorization) return null;
      const result = this.headers.authorization.match(/(?<=Bearer )[0-9a-f]{32}/g);
      return result ? result[0] : null;
    });
  }
  /** 权限检查 */
  static permissionCheck(instance: FastifyInstance): void {
    instance.decorateRequest("permCheck", function (userId?: uuid, profileId?: uuid, checkAdmin?: boolean): true {
      const accessToken: uuid = this.getToken();
      let user = userId;
      if (userId && !USERSMAP.has(userId)) {
        //提供了用户id，但用户id无效
        throw new ErrorResponse("NotFound", "Invalid user.");
      }
      if (profileId) {
        //提供了角色id，但角色id无效
        if (!PROFILEMAP.has(profileId)) {
          //提供的uuid无效
          throw new ErrorResponse("NotFound", "Profile Not Found.");
        }
        user = PROFILEMAP.get(profileId).owner;
      }
      if (Token.validate(accessToken, undefined, user) != "valid" || (checkAdmin && TOKENSMAP.get(accessToken).owner.role != "admin")) {
        //提供的令牌无效；或者要求是管理员，但提供的 token 属于一般用户
        throw new ErrorResponse("ForbiddenOperation", "Invalid token.");
      }
      return true;
    });
  }
  /** 为options请求设置响应头 */
  static allowedMethod(instance: FastifyInstance) {
    instance.decorateReply("allowedMethod", function (...allowedMethod: ("post" | "put" | "delete" | "patch")[]): void {
      this.headers({
        Allow: allowedMethod.join(",").toUpperCase(),
        "Access-Control-Allow-Methods": allowedMethod.join(",").toUpperCase(),
        "Access-Control-Allow-Headers": "content-type,authorization",
      });
      this.status(200);
      this.send();
    });
  }
  /** 重新包装路由方法 */
  static routePacker(instance: FastifyInstance) {
    instance.decorate("pack", function (url: string, config: RoutePackConfig) {
      /** 通常使用的 http 方法 */
      const normalMethods: Set<HTTPMethods> = new Set(["get", "post", "patch", "put", "delete", "options"]);
      const definedMethods = [];
      const routes: RouteOptions[] = [];
      for (const method of normalMethods) {
        const configPart = config[method];
        if (!configPart) {
          continue;
        }
        const options: RouteOptions = {
          url,
          method,
          attachValidation: true,
          handler: this.packHandle(configPart.handler, configPart.rateLim),
          schema: configPart.schema,
        };
        if (configPart.defaultResponse) {
          options.schema.response = Object.assign({ "4xx": schemas.ResponseError }, configPart.schema.response);
        }
        definedMethods.push(method);
        routes.push(options);
        normalMethods.delete(method);
      }
      if (normalMethods.size < 6) {
        for (const method of normalMethods) {
          routes.push({
            url,
            method,
            attachValidation: true,
            handler: async function (request: FastifyRequest, reply: FastifyReply) {
              const reqMethod = request.method.toLowerCase();
              if (reqMethod == "options") {
                return reply.allowedMethod(...definedMethods);
              }
              if (!definedMethods.includes(reqMethod)) {
                reply.header("Allow", definedMethods.join(", ").toUpperCase());
                reply.replyError("MethodNotAllowed", `Method: ${request.method} is not allowed.`);
              }
            },
            schema:
              method == "options"
                ? { summary: "查询该 api 支持的请求方法", tags: ["X-HIDDEN"], response: { 200: schemas.Response204.ok } }
                : { summary: "该请求方法不被允许，因此会始终返回 405 Method Not Allowed。", tags: ["X-HIDDEN"], response: { 405: schemas.ResponseError } },
          });
        }
      }
      for (const routeOpt of routes) {
        this.route(routeOpt);
      }
      if (config.routes) {
        this.register(
          async function (instance: FastifyInstance) {
            for (const route of config.routes) {
              if (route.before) {
                await route.before(instance);
              }
              instance.pack(route.url, route.config);
            }
          },
          { prefix: url }
        );
      }
    });
  }
  /** 包装应用代码 */
  static handlePacker(instance: FastifyInstance) {
    instance.decorate("packHandle", function (handler: (request: FastifyRequest, reply: FastifyReply) => any, rateLim?: (request: FastifyRequest) => string | Promise<string>) {
      return async function packedHandler(request: FastifyRequest, reply: FastifyReply) {
        try {
          if (request.validationError) {
            const {
              validationContext,
              validation: { instancePath, keyword, message },
            } = request.validationError;
            throw new ErrorResponse("BadOperation", `Validation failed of the ${validationContext}: ${keyword} of ${instancePath} ${message}.`);
          }
          if (rateLim) {
            const rateLimKey = await rateLim(request);
            request.rateLim(rateLimKey);
          }
          const result = await handler(request, reply);
          if (result instanceof SuccessResponse) {
            return result.response(reply);
          }
          if (result == false) {
            return;
          }
          instance.log.error(new Error(`意外的响应体类型: ${handler}`));
          reply.replySuccess(result);
        } catch (err) {
          if (err instanceof ErrorResponse) {
            return err.response(reply);
          }
          const traceId = Utils.uuid();
          err.trace = traceId;
          instance.log.error(err);
          reply.replyError("InternalError", `Something is wrong... Trace id: ${traceId}`);
        }
      };
    });
  }
}

export class ErrorResponse {
  error: Status;
  errorMessage: string;
  cause?: string;
  constructor(error: Status, errorMessage: string, cause?: string) {
    this.error = error;
    this.errorMessage = errorMessage;
    this.cause = cause;
  }
  response(reply: FastifyReply) {
    reply.replyError(this.error, this.errorMessage, this.cause);
  }
}

export class SuccessResponse<T> {
  data: T;
  code: number;
  constructor(data: any, code: number = 200) {
    this.data = data;
    this.code = code;
  }
  response(reply: FastifyReply) {
    reply.replySuccess(this.data, this.code);
  }
}

/** 一个json文件对象 */
export class JsonFile<T> {
  /** json文件路径 */
  path: string;
  /** json文件内容 */
  content: T;
  constructor(filePath: string, content: any) {
    this.path = filePath;
    this.content = content;
  }
  /**
   * 读取json文件
   * @param filePath 文件路径
   * @param onError (可选) 读取出错时的回调函数。可以返回一个对象作为读取失败后返回的默认值。
   * @returns {JsonFile}
   */
  static async read(filePath: string, onError?: (err: Error) => void | any): Promise<JsonFile<any>> {
    try {
      const content = await fs.readFile(filePath);
      const json = JSON.parse(content.toString());
      return new JsonFile(filePath, json);
    } catch (err) {
      let json = {};
      if (onError) {
        json = onError(err) ?? {};
      }
      return new JsonFile(filePath, json);
    }
  }
  /** 保存文件 */
  async save(): Promise<void> {
    try {
      await fs.writeFile(this.path, JSON.stringify(this.content, null, 2));
    } catch (err) {
      throw new Error("保存文件失败：" + err.message);
    }
  }
  /** 重新加载文件 */
  async reload(): Promise<boolean> {
    try {
      const content = await fs.readFile(this.path);
      this.content = JSON.parse(content.toString());
      return true;
    } catch {
      return false;
    }
  }
}

/** 用于速率限制的Map */
class accessControl extends Map {
  constructor() {
    super();
  }
  /**
   * 对访问做出速率限制。返回的布尔值表示了当次调用是否在速率限制之内。（距离上次调用，是否已经间隔了足够长）
   * @param name 受到速率限制的对象
   * @param rate (默认:100) 限制的速率，毫秒
   * @returns {true}
   */
  test(name: string, rate: number = 100): boolean {
    const now: number = new Date().getTime(); //调用时，记录现在的时间
    if (this.has(name)) {
      //并非首次调用
      const lastAccess = this.get(name); //上次调用的时间
      if (now >= rate + lastAccess) {
        //时间间隔已经达到要求
        this.set(name, now); //重新设置调用时间
        return true;
      }
      return false;
    }
    //首次调用，记录请求时长
    this.set(name, now);
    return true;
  }
}

//全大写的常量，被程序全局依赖
/** 程序设置 */
export const CONFIG: JsonFile<Config> = await JsonFile.read("./data/config.json", (e) => {
  throw new Error("读取配置文件失败: " + e.message);
});
/** 用户数据，可存储到json文件 */
export const USERS: JsonFile<{ [key: uuid]: UserData }> = await JsonFile.read("./data/users.json");
/** 角色数据，可存储到json文件 */
export const PROFILES: JsonFile<{ [key: uuid]: ProfileData }> = await JsonFile.read("./data/profiles.json");
/** 材质目录 */
export const TEXTURES: JsonFile<TextureIndex> = await JsonFile.read("./data/textures.json");
/** 私钥数据 */
export const PRIVATEKEY = await fs.readFile(CONFIG.content.privateKeyPath).catch((e) => {
  throw new Error("读取私钥失败: " + e.message);
});
/** 公钥数据 */
export const PUBLICKEY = await fs.readFile(CONFIG.content.publicKeyPath).catch((e) => {
  throw new Error("读取公钥失败: " + e.message);
});
/** 用户数据Map */
export const USERSMAP = User.buildMap();
/** 角色数据Map */
export const PROFILEMAP = Profile.buildMap();
/** 令牌数据Map，仅存在于内存 */
export const TOKENSMAP: Map<uuid, Token> = new Map();
/** 会话数据Map，仅存在于内存 */
export const SESSIONMAP: Map<string, Session> = new Map();
/** 访问控制器使用的Map */
export const ACCESSCONTROLLER = new accessControl();
