import crypto, { KeyObject } from "crypto";
import fs from "node:fs/promises";
import { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods, RouteOptions } from "fastify";
import { Status, uuid, RoutePackConfig, ObjBlackList } from "./interfaces.js";
import Token from "./token.js";
import schemas from "./schemas.js";
import User from "./user.js";
import Profile from "./profile.js";

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
   * 生成4096位rsa密钥对
   * @param modulusLength 密钥长度，默认2048
   */
  static getRSAKeyPair(modulusLength: number = 2048): Promise<{ publicKey: KeyObject; privateKey: KeyObject }> {
    const options = {
      modulusLength,
      publicExponent: 0x10001,
    };
    return new Promise((resolve, reject) => {
      crypto.generateKeyPair("rsa", options, (err, publicKey, privateKey) => {
        if (err) return reject(err);
        resolve({ publicKey, privateKey });
      });
    });
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
  static makeSignature(dataToSign: any, privateKey: KeyObject): string {
    const sign = crypto.createSign("RSA-SHA1");
    sign.update(dataToSign);
    sign.end();
    return sign.sign(privateKey, "base64");
  }
  /**
   * 替换pem格式密钥的开头和结束部分的标记
   * @param keyObj 密钥对象
   * @param rsaInHeader 是否在标记中添加 RSA ，默认为false
   * @returns string
   */
  static keyRepack(keyObj: KeyObject, rsaInHeader: boolean = false): string {
    function formatStr(pos: "BEGIN" | "END") {
      return `-----${pos} ${rsaInHeader ? "RSA " : ""}${keyObj.type.toUpperCase()} KEY-----`;
    }
    const keyArr = keyObj
      .export({ type: keyObj.type == "public" ? "spki" : "pkcs8", format: "pem" })
      .toString()
      .split("\n");
    keyArr[0] = formatStr("BEGIN");
    keyArr[keyArr.length - 2] = formatStr("END");
    return keyArr.join("\n");
  }
  /** Base64编码 */
  static encodeb64(data: any): string {
    return Buffer.from(data).toString("base64");
  }
  /** Base64解码 */
  static decodeb64(data: string): string {
    return Buffer.from(data, "base64").toString("utf8");
  }
  /**
   * 清理对象，将预定义的黑名单属性从目标内删除
   * @param target 清理目标对象
   * @param blacklist 黑名单
   */
  static cleanObj(target: object, ...blacklist: ObjBlackList[]) {
    for (let i of blacklist) {
      if (typeof i == "string") {
        delete target[i];
        continue;
      }
      Utils.cleanObj(target[i.p], ...i.c);
    }
  }
  /** 用于发出请求的请求头 */
  static get requestHeaders() {
    return {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 yggdrasilProxy/1.0.0",
    };
  }
}

export class ArrayMap<_K, V> extends Map<string[], V> {
  operate(method: "get" | "has" | "delete", key: string | string[]): any {
    let Truekey: string = key instanceof Array ? key[0] : key;
    for (let keyarr of this.keys()) {
      if (!Truekey) return false;
      if (keyarr.some((i: string) => i.toLowerCase() === Truekey.toLowerCase())) {
        return super[method](keyarr);
      }
    }
    return false;
  }
  get(key: string | string[]): V {
    return this.operate("get", key) || undefined;
  }
  has(key: string | string[]): boolean {
    return this.operate("has", key);
  }
  delete(key: string | string[]): boolean {
    return this.operate("delete", key);
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
      controller: AccessControl;
    } = { gap: 100, controller: new AccessControl() }
  ): void {
    instance.decorateRequest("rateLim", function (key: string, ms?: number): true {
      if (!options.controller.test(key, ms || options.gap)) {
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
  /** 从请求中获取 AccessToken */
  static allowedContentType(instance: FastifyInstance): void {
    instance.decorate("allowedContentType", function (...allowedContentTypes: string[]) {
      return instance.packHandle(function (request) {
        const current = request.headers["content-type"];
        if (current && !allowedContentTypes.includes(current)) {
          throw new ErrorResponse("UnsupportedMediaType", `Unsupported content-type: ${current}`);
        }
        return false;
      });
    });
  }
  /** 权限检查 */
  static permissionCheck(
    instance: FastifyInstance,
    Maps: {
      USERSMAP: ArrayMap<string[], User>;
      PROFILEMAP: ArrayMap<[string, string], Profile>;
      TOKENSMAP: Map<string, Token>;
    }
  ): void {
    const { USERSMAP, PROFILEMAP, TOKENSMAP } = Maps;
    instance.decorateRequest("permCheck", function (userId?: uuid, profileId?: uuid, checkAdmin?: boolean): true {
      const accessToken: uuid = this.getToken();
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
        userId = PROFILEMAP.get(profileId).owner;
      }
      if (Token.validate(accessToken, undefined, userId) != "valid" || (checkAdmin && TOKENSMAP.get(accessToken).owner.role != "admin")) {
        //提供的令牌无效；或者要求是管理员，但提供的 token 属于一般用户
        throw new ErrorResponse("ForbiddenOperation", "Invalid token.");
      }
      return true;
    });
  }
  /** 重新包装路由方法 */
  static routePacker(instance: FastifyInstance) {
    instance.decorate("pack", function (url: string, config: RoutePackConfig) {
      /** 通常使用的 http 方法 */
      const normalMethods: Set<HTTPMethods> = new Set(["get", "post", "patch", "put", "delete", "options"]);
      const definedMethods = [];
      for (const method of normalMethods) {
        const configPart = config[method];
        if (!configPart) continue;
        const options: RouteOptions = {
          url,
          method,
          attachValidation: true,
          handler: this.packHandle(configPart.handler),
          schema: configPart.schema,
        };
        if (!configPart.customResponse) {
          options.schema.response = Object.assign({ "4xx": schemas.ResponseError }, configPart.schema.response);
        }
        if (configPart.before) {
          configPart.before(this);
        }
        this.route(options);
        definedMethods.push(method);
        normalMethods.delete(method);
      }
      if (definedMethods.length) {
        for (const method of normalMethods) {
          this.route({
            url,
            method,
            attachValidation: true,
            handler: async function (request: FastifyRequest, reply: FastifyReply) {
              const reqMethod = request.method.toLowerCase();
              if (reqMethod == "options") {
                reply.headers({
                  Allow: definedMethods.join(",").toUpperCase(),
                  "Access-Control-Allow-Methods": definedMethods.join(",").toUpperCase(),
                  "Access-Control-Allow-Headers": "content-type,authorization",
                });
                reply.status(200);
                reply.send();
                return false;
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
      if (config.routes) {
        for (const route of config.routes) {
          this.register(
            async function (instance: FastifyInstance) {
              instance.pack(route.url, route.config);
            },
            { prefix: url }
          );
        }
      }
    });
  }
  /** 包装应用代码 */
  static handlePacker(instance: FastifyInstance) {
    instance.decorate("packHandle", function (handler: (request: FastifyRequest, reply: FastifyReply) => SuccessResponse<any> | false | Promise<SuccessResponse<any> | false>) {
      return async function packedHandler(request: FastifyRequest, reply: FastifyReply) {
        try {
          if (request.validationError) {
            const { validationContext } = request.validationError;
            throw new ErrorResponse("BadOperation", `Validation failed of the ${validationContext}.`);
          }
          const result = await handler(request, reply);
          if (result instanceof SuccessResponse) {
            return result.response(reply);
          }
          if (result == false) {
            return;
          }
          instance.log.error(new Error(`意外的响应体类型: ${result} ,位于 ${handler}`));
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

/** 管理JSON文件 */
const JsonFilePath = Symbol("JsonFilePath");

export class JSONFile {
  /**
   * 读取一个json文件
   * @param filePath 文件路径
   * @param onError 若读取失败，调用的函数，传入一个Error对象。函数返回的结果会被作为默认值。
   * @returns
   */
  static async read<T>(filePath: string): Promise<T> {
    const content = await fs.readFile(filePath).catch(() => "{}");
    let data: T = JSON.parse(content.toString("utf-8"));
    data[JsonFilePath] = filePath;
    return data;
  }
  /** 保存一个文件对象 */
  static async save(fileObj: any) {
    let filePath: string = fileObj[JsonFilePath];
    if (!filePath) throw new Error("无法保存: 没有从对象中获得有效的保存路径");
    await fs.writeFile(fileObj[JsonFilePath], JSON.stringify(fileObj, null, 2));
  }
}
/** 用于速率限制的Map */
export class AccessControl extends Map {
  /**
   * 对访问做出速率限制。返回的布尔值表示了当次调用是否在速率限制之内。（距离上次调用，是否已经间隔了足够长）
   * @param name 受到速率限制的对象
   * @param rate (默认:100) 限制的速率，毫秒
   * @returns {true}
   */
  test(name: string, rate: number = 100): boolean {
    const now: number = new Date().getTime(); //调用时，记录现在的时间
    if (!this.has(name)) {
      //首次调用，记录请求时长
      this.set(name, now);
      return true;
    }
    const lastAccess: number = this.get(name); //上次调用的时间
    if (now >= rate + lastAccess) {
      //时间间隔已经达到要求
      this.set(name, now); //重新设置调用时间
      return true;
    }
    return false;
  }
}
