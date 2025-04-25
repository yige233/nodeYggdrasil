import crypto, { KeyObject } from "crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { FastifyInstance, FastifyReply, FastifyRequest, RouteOptions } from "fastify";
import { Status, uuid, RoutePackConfig, HTTPMethods, ObjBlackList, Config } from "./interfaces.js";
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
    const options = { modulusLength, publicExponent: 0x10001 };
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
  static sha256(content: crypto.BinaryLike): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }
  /**
   * 对数据进行RSA-SHA1签名
   * @param dataToSign 待签数据
   * @param privateKey 用于签名的私钥
   * @returns 签名
   */
  static makeSignature(dataToSign: crypto.BinaryLike, privateKey: KeyObject): string {
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
  static encodeb64(data: string): string {
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
  static merge<T>(source: T, newObj: Partial<T>) {
    for (const key in newObj) {
      if (!newObj.hasOwnProperty(key)) continue;
      if (source[key] instanceof Array && newObj[key] instanceof Array) {
        (source[key] as any[]) = (newObj[key] as any[]).filter((i) => typeof i == "string");
        continue;
      }
      if (typeof source[key] == "object") {
        Utils.merge<T[Extract<keyof T, string>]>(source[key], newObj[key]);
        continue;
      }
      if (typeof source[key] === typeof newObj[key] && source[key] !== null && newObj[key] !== null) {
        source[key] = newObj[key];
      }
    }
  }
  static dataDir(DATADIR: string): (...subPath: string[]) => string {
    return (...subPath: string[]) => path.join(DATADIR, ...subPath);
  }
  static async readJSON<RawType extends object>(filePath: string, errCallback = () => undefined) {
    const content = await fs.readFile(filePath).catch(errCallback);
    return {
      filePath,
      asArray(uniqueKeyName: string, defaltValue = []) {
        /** 原始数据 */
        const data: RawType[] = content ? JSON.parse(content.toString("utf-8")) : defaltValue;
        /** 代理后的数据 */
        if (!Array.isArray(data)) throw new Error("提供的数据文件不是数组");
        /**
         * @param initialFunc 初始化数据，将原始数据实例化为特定的对象
         * @param compareFunc 比较函数，该函数接受一个搜索字符串，返回一个函数，该函数接受数组中的元素，返回一个布尔值
         * @returns
         */
        return function <T extends object>(
          toInitialized = (_data: RawType): T => undefined,
          compareFunc = (_searchStr: string) =>
            (_element: T | RawType): boolean =>
              true,
          toRawType = (data: T): RawType | T => data
        ) {
          const writeFile = debounce(() => fs.writeFile(filePath, JSON.stringify(initializedData.map(toRawType), null, 2)));
          const initialFunc = (data: RawType) => {
            const proxied = proxyObject(toInitialized(data));
            proxied.on("update", writeFile);
            return proxied.data;
          };
          const initializedData = data.map(initialFunc);
          const proxied = proxyObject(data);
          proxied.on("r.length", writeFile);
          return {
            /** 数据 */
            data: initializedData,
            compareFunc,
            save: writeFile,
            get: (input: string) => initializedData.find(compareFunc(input)),
            has: (input: string) => initializedData.some(compareFunc(input)),
            add(input: RawType) {
              if (this.has(input[uniqueKeyName])) {
                return false;
              }
              const result = initializedData.push(initialFunc(input));
              proxied.data.push(input);
              return result;
            },
            delete(input: string) {
              const index = initializedData.findIndex(compareFunc(input));
              if (index == -1) return false;
              initializedData.splice(index, 1);
              proxied.data.splice(index, 1);
              return true;
            },
            get size() {
              return initializedData.length;
            },
          };
        };
      },
      asObject(defaltValue: Partial<RawType> = {}) {
        const writeFile = debounce(() => fs.writeFile(filePath, JSON.stringify(data, null, 2)));
        const data: RawType = content ? JSON.parse(content.toString("utf-8")) : defaltValue;
        const proxied = proxyObject(data);
        proxied.on("update", writeFile);
        return proxied;
      },
    };
  }
  /**
   * 对外发出请求。添加了一些默认选项，如UA 和 content-type
   * @param url 请求url
   * @param options 除 RequestInit 外，还包括：fallback: 如果请求失败，则返回该对象; timeout: 超时时间，单位为ms，默认为5s; json: 需要序列化的json body;
   * @returns
   */
  static async fetch<T>(
    url: string,
    options: RequestInit & {
      /** 需要序列化的form data */
      formdata?: {};
      /** 需要序列化的json body */
      json?: {};
      /** 如果请求失败，则返回该对象 */
      fallback?: T;
      /** 超时时间，单位为ms，默认为5s */
      timeout?: number | string;
    } = {}
  ): Promise<any | T> {
    function formdata(data: { [key: string]: string }) {
      const form = new URLSearchParams();
      Object.entries(data).forEach(([k, v]) => form.append(k, v));
      return form;
    }
    const contentType = options.json ? "application/json;charset=utf-8" : options.formdata ? "application/x-www-form-urlencoded" : undefined;
    const body = options.json ? JSON.stringify(options.json) : options.formdata ? formdata(options.formdata) : options.body;
    const headers = new Headers({
      accpet: "application/json",
      "content-type": contentType,
      "user-agent": Utils.userAgent,
      ...options.headers,
    });
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(Time.parse(options.timeout || "5s")),
        ...options,
        body: body,
        headers: headers,
      });
      if (response.ok) {
        return response.headers.get("content-type")?.includes("application/json") ? response.json() : response.blob();
      }
      throw { fetchError: response.status };
    } catch (e) {
      if (typeof options.fallback != "undefined") {
        return options.fallback;
      }
      throw e;
    }
  }
  static get userAgent() {
    return `nodeYggdrasil/${process.env.npm_package_version || "1.0.0"}`;
  }
}

export class Time {
  static get s() {
    return 1000;
  }
  static get m() {
    return Time.s * 60;
  }
  static get h() {
    return Time.m * 60;
  }
  static get d() {
    return Time.h * 24;
  }
  /**
   * 将提供的带单位的时间字符串转换为毫秒时间。
   * @param input 时间字符串，如"11h,2m,3s"。可以在单个参数中使用","分隔，也可直接提供多个参数。
   * @returns {number}毫秒时间
   */
  static parse(...input: (string | number)[]): number {
    return input
      .join(",")
      .split(",")
      .filter((i) => i)
      .map(Time.parseSingle)
      .reduce((acc, cur) => acc + cur, 0);
  }
  /**
   * 简化自 https://github.com/vercel/ms 。只保留了h,m,s,ms四个单位；无法解析字符串和解析的数字过大的情况下默认返回0。
   * @param timeString 时间字符串
   * @returns
   */
  static parseSingle(timeString: string | number): number {
    if (typeof timeString == "number") return timeString;
    const match = /^(-?(?:\d+)?\.?\d+) *(|ms|s|m|h|d)?$/i.exec(timeString);
    if (!match) {
      return 0;
    }
    const n = parseFloat(match[1]);
    if (n > Number.MAX_SAFE_INTEGER) return 0;
    const type = (match[2] || "ms").toLowerCase();
    switch (type) {
      case "d":
        return n * Time.d;
      case "h":
        return n * Time.h;
      case "m":
        return n * Time.m;
      case "s":
        return n * Time.s;
      case "ms":
        return n;
      default:
        return 0;
    }
  }
}

export class Plugin {
  /** 失败响应 */
  static errorResponse(instance: FastifyInstance) {
    const statusList = {
      BadOperation: 400,
      IllegalArgument: 400,
      Unauthorized: 401,
      ForbiddenOperation: 403,
      NotFound: 404,
      MethodNotAllowed: 405,
      ContentTooLarge: 413,
      UnsupportedMediaType: 415,
      UnprocessableEntity: 422,
      TooManyRequests: 429,
      ServiceUnavailable: 503,
      InternalError: 500,
    };
    instance.decorateReply("replyError", function (error: Status, errorMessage: string, cause?: string): void {
      const code = statusList[error] || 500;
      this.status(code);
      this.send({ error: error + "Exception", errorMessage, cause });
    });
  }
  /** 成功响应 */
  static successResponse(instance: FastifyInstance): void {
    instance.decorateReply("replySuccess", function <T>(data: T, code: number = 200): void {
      this.status(code);
      if (code == 204) {
        this.removeHeader("content-type");
        return this.send();
      }
      return this.send(data);
    });
  }
  /** 从请求中获取ip */
  static getIP(instance: FastifyInstance, options: { trustXRealIP: boolean }): void {
    instance.decorateRequest("getIP", function (): string {
      const xRealIP = this.headers["x-real-ip"] ?? undefined;
      // 存在 x-real-ip 头，信任该请求头提供的ip地址
      if (xRealIP && options.trustXRealIP) {
        return typeof xRealIP == "string" ? xRealIP : xRealIP[0];
      }
      return this.ip;
    });
  }
  /** 限制请求速度 */
  static rateLim(instance: FastifyInstance, options: { gap: string | number; controller: ThrottleController } = { gap: 100, controller: new ThrottleController() }): void {
    instance.decorateRequest("rateLim", function (key: string, operation: string, ms?: number | string): true {
      if (!options.controller.test(`${key}.${operation}`, Time.parse(ms || options.gap))) {
        throw new ErrorResponse("TooManyRequests", "你的操作速度过快，请稍后再试。");
      }
      return true;
    });
  }
  /** 从请求中获取 AccessToken */
  static getToken(instance: FastifyInstance): void {
    instance.decorateRequest("getToken", function (): string | null {
      if (!this.headers.authorization) return null;
      return this.headers.authorization.match(/(?<=Bearer )[0-9a-f]{32}/g)?.[0] ?? null;
    });
  }
  /** 从请求中获取 AccessToken */
  static allowedContentType(instance: FastifyInstance): void {
    instance.decorate("allowedContentType", function (...allowedContentTypes: string[]) {
      return instance.packHandle(function (request) {
        const current = request.headers["content-type"];
        if (current && !allowedContentTypes.some((i) => current.split(";").includes(i))) {
          throw new ErrorResponse("UnsupportedMediaType", `不支持的 content-type: ${current}`);
        }
        return false;
      });
    });
  }
  /** 权限检查 */
  static permissionCheck(
    instance: FastifyInstance,
    Maps: {
      USERS: { data: User[]; has: (userId: uuid) => boolean; get: (userId: uuid) => User | undefined };
      PROFILES: { data: Profile[]; has: (profileId: uuid) => boolean; get: (profileId: uuid) => Profile | undefined };
      TOKENSMAP: Map<string, Token>;
    }
  ): void {
    const { USERS, PROFILES, TOKENSMAP } = Maps;
    instance.decorateRequest("permCheck", function (userId?: uuid, profileId?: uuid, checkAdmin?: boolean): { token: uuid; user: User; profile?: Profile } {
      const accessToken: uuid = this.getToken();
      // 提供了用户id，但用户id无效
      if (userId && !USERS.has(userId)) {
        throw new ErrorResponse("NotFound", "无效的用户。");
      }
      // 提供了角色id，但角色id无效
      if (profileId && !PROFILES.has(profileId)) {
        throw new ErrorResponse("NotFound", "无效的角色。");
      }
      const user = TOKENSMAP.get(accessToken)?.owner;
      const profile = PROFILES.get(profileId);
      // 验证令牌
      if (Token.validate(accessToken, undefined, user?.id || profile?.owner) != "valid") {
        throw new ErrorResponse("ForbiddenOperation", "无效的令牌。");
      }
      // 要求是管理员，但提供的 token 属于一般用户
      if (checkAdmin && user?.role != "admin") {
        throw new ErrorResponse("ForbiddenOperation", "没有权限进行请求的操作。");
      }
      return { token: accessToken, user, profile };
    });
  }
  /** 重新包装路由方法 */
  static routePacker(instance: FastifyInstance): void {
    instance.decorate("pack", function (config: RoutePackConfig) {
      const buildDefinedRouteOption = (url: string, method: HTTPMethods, handlerConfig: RoutePackConfig[HTTPMethods]): RouteOptions => {
        const options: RouteOptions = { url, method, attachValidation: true, handler: this.packHandle(handlerConfig.handler), schema: handlerConfig.schema || undefined };
        if (!handlerConfig.customResponse && options.schema?.response) {
          options.schema.response = Object.assign({ "4xx": schemas.ResponseError }, handlerConfig.schema?.response ?? {});
        }
        return options;
      };
      const buildUndefinedRouteOption = (url: string, method: HTTPMethods): RouteOptions => {
        function handerForOption(_request: FastifyRequest, reply: FastifyReply) {
          reply.headers({
            Allow: definedMethods.join(",").toUpperCase(),
            "Access-Control-Allow-Methods": definedMethods.join(",").toUpperCase(),
            "Access-Control-Allow-Headers": "content-type,authorization",
          });
          return new SuccessResponse(undefined, 200);
        }
        function handerForOther(request: FastifyRequest, reply: FastifyReply) {
          reply.header("Allow", definedMethods.join(", ").toUpperCase());
          throw new ErrorResponse("MethodNotAllowed", `不允许使用的 HTTP 方法: ${request.method} 。`);
        }
        const schemaForOption = { summary: "查询该 api 支持的请求方法", tags: ["X-HIDDEN"], response: { 200: schemas.Response204.ok } };
        const schemaForOther = { summary: "该请求方法不被允许，因此会始终返回 405 Method Not Allowed。", tags: ["X-HIDDEN"], response: { 405: schemas.ResponseError } };
        return {
          url,
          method,
          attachValidation: true,
          handler: this.packHandle(method.toLocaleLowerCase() == "options" ? handerForOption : handerForOther),
          schema: method.toLocaleLowerCase() == "options" ? schemaForOption : schemaForOther,
        };
      };
      /** 通常使用的 http 方法 */
      const normalMethods: Set<HTTPMethods> = new Set(["get", "post", "patch", "put", "delete", "options"]);
      const definedMethods = [];
      const { url } = config;
      config.before && config.before(this);
      normalMethods.forEach((method) => {
        const handlerConfig = config[method];
        if (handlerConfig) {
          definedMethods.push(method);
          this.route(buildDefinedRouteOption(url, method, handlerConfig));
          return;
        }
        definedMethods.length && this.route(buildUndefinedRouteOption(url, method));
      });
      (config.routes || []).forEach((route) => this.register(async (instance) => instance.pack(route), { prefix: url }));
    });
  }
  /** 包装应用代码 */
  static handlePacker(instance: FastifyInstance): void {
    instance.decorate("packHandle", function (handler: (request: FastifyRequest, reply: FastifyReply) => SuccessResponse<any> | false | Promise<SuccessResponse<any>>) {
      return async function packedHandler(request: FastifyRequest, reply: FastifyReply) {
        try {
          if (request.validationError) {
            const { validationContext } = request.validationError;
            throw new ErrorResponse("BadOperation", `验证请求失败： ${validationContext}.`);
          }
          const result = await handler(request, reply);
          if (result instanceof SuccessResponse) {
            return result.response(reply);
          }
          if (result == false || result == undefined || result == null) {
            return;
          }
          instance.log.error(new Error(`意外的响应体类型: ${Object.getPrototypeOf(result).constructor.name}, 源于 ${handler}`));
          reply.replySuccess(result);
        } catch (err) {
          if (err instanceof ErrorResponse) {
            return err.response(reply);
          }
          const traceId = Utils.uuid();
          err.trace = traceId;
          instance.log.error(err);
          reply.replyError("InternalError", `服务器出现内部错误。跟踪ID: ${traceId}`);
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
  /** 指定content-type */
  type: string;
  constructor(data: T, code: number = 200, type?: string) {
    this.data = data;
    this.code = code;
    this.type = type || undefined;
  }
  response(reply: FastifyReply) {
    if (this.type) {
      reply.type(this.type);
    }
    reply.replySuccess(this.data, this.code);
  }
}

/** 用于速率限制的Map */
export class ThrottleController extends Map {
  /**
   * 对访问做出速率限制。返回的布尔值表示了当次调用是否在速率限制之内。（距离上次调用，是否已经间隔了足够长）
   * @param name 受到速率限制的对象
   * @param rate (默认:100) 限制的速率，毫秒
   * @returns {true}
   */
  test(name: string, rate: number = 100): boolean {
    name = Utils.sha256(name);
    const now: number = Date.now(); // 调用时，记录现在的时间
    if (!this.has(name)) {
      // 首次调用，记录请求时长
      this.set(name, now);
      return true;
    }
    const lastAccess: number = this.get(name); // 上次调用的时间
    if (now >= rate + lastAccess) {
      // 时间间隔已经达到要求
      this.set(name, now); // 重新设置调用时间
      return true;
    }
    return false;
  }
}

/**
 * 为一个对象创建赋值监听器
 * @param {object} target 要监听的对象
 * @returns
 */
export function proxyObject<T extends object>(target: T) {
  function dispatchEvent(keyPath: string, value = undefined) {
    // 属性更新时触发的通用update事件
    eventTarget.dispatchEvent(new CustomEvent("update", { detail: { path: keyPath, value } }));
    // 属性更新时触发的root.keyPath事件
    eventTarget.dispatchEvent(new CustomEvent(keyPath, { detail: value }));
  }
  function handler(...parentKeys: string[]) {
    const getKeyPath = (key: string) => [...parentKeys, key].join(".");
    return {
      get(target: T, key: string) {
        if (typeof target[key] === "object" && target[key] !== null && ["Object", "Array"].includes(target[key].constructor.name)) {
          return new Proxy(target[key], handler(...parentKeys, key));
        }
        return target[key];
      },
      set(target: T, key: string, value: any) {
        const result = Reflect.set(target, key, value);
        dispatchEvent(getKeyPath(key), value);
        return result;
      },
      deleteProperty(target: T, key: string) {
        const result = Reflect.deleteProperty(target, key);
        dispatchEvent(getKeyPath(key));
        return result;
      },
    };
  }
  /** 在事件中代表根对象的字符 */
  const root = "r";
  const eventTarget = new EventTarget();
  const rootHandler = handler(root);
  return {
    on: eventTarget.addEventListener.bind(eventTarget),
    remove: eventTarget.removeEventListener.bind(eventTarget),
    data: new Proxy(target, rootHandler),
    get root() {
      return root;
    },
    /**
     * 合并一个对象到现有的被监听的对象，确保其可以触发属性更新事件。
     * @param {object} object 新对象
     */
    assign(object: object) {
      const assignFunc = (src: object, from: object) => {
        for (const key in from) {
          if (typeof from[key] === "object" && !Array.isArray(from[key])) {
            if (typeof src[key] !== "object") {
              src[key] = {};
            }
            assignFunc(src[key], from[key]);
            continue;
          }
          src[key] = from[key];
        }
      };
      assignFunc(this.data, object);
    },
  };
}

export function debounce(warpped: () => void, timeWithin = 100) {
  let timer: NodeJS.Timeout;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(() => warpped(), timeWithin);
  };
}

export async function buildDataDir(dataDir = "./data") {
  const pathOf = Utils.dataDir(dataDir);
  const log = (msg: string) => console.log(`[BuildDataDir] ${msg}`);
  const defaultConfig: Config = {
    server: {
      host: "",
      port: 5400,
      name: "NodeYggdrasilServer",
      root: "http://localhost:5400/",
      homepage: "http://localhost:5400/",
      register: "http://localhost:5400/",
      proxyCount: 0,
      trustXRealIP: false,
      keyReqRL: "300ms",
    },
    user: {
      inviteCodes: [],
      defaultSkin: true,
      passLenLimit: 8,
      uploadTexture: true,
      officialProxy: false,
      userInviteCode: true,
      offlineProfile: true,
      defaultSkinURL: "http://textures.minecraft.net/texture/31f477eb1a7beee631c2ca64d06f8f68fa93a3386d04452ab27f43acdf1b60cb",
      passwdHashType: "HMACsha256",
      keyOpRL: "1h",
      maxProfileCount: 5,
      tokenTTL: "336h",
      defaultInviteCodeCount: 5,
      officialPlayerWhitelist: false,
      changeOfflineProfileName: true,
    },
    privateKeyPath: pathOf("privkey.pem"),
    skinDomains: ["littleskin.cn", ".littleskin.cn", "localhost", ".minecraft.net"],
    features: {
      non_email_login: true,
      username_check: false,
      enable_profile_key: true,
      no_mojang_namespace: false,
      enable_mojang_anti_features: false,
    },
    pubExtend: {
      headerInfo: "node-yggdrasil-server",
    },
    privExtend: {
      enableSwaggerUI: false,
    },
    webhooks: [],
  };
  const configStr = JSON.stringify(defaultConfig, null, 2);
  log(`正在创建配置文件，位置：${pathOf()}`);
  await fs.mkdir(pathOf("textures"), { recursive: true });
  await fs.mkdir(pathOf("logs"), { recursive: true });
  try {
    await fs.writeFile(pathOf("config.json"), configStr, { flag: "wx" });
  } catch {
    await fs.writeFile(pathOf("config.json.example"), configStr);
  }
  try {
    await fs.access(pathOf("privkey.pem"));
    log("该位置存在私钥，跳过生成私钥步骤。");
  } catch {
    const options: crypto.RSAKeyPairKeyObjectOptions = { modulusLength: 4096, publicExponent: 0x10001 };
    const privateKey: KeyObject = await new Promise((resolve, reject) => {
      crypto.generateKeyPair("rsa", options, (err, _publicKey, privateKey) => (err ? reject(err) : resolve(privateKey)));
    });
    await fs.writeFile(pathOf("privkey.pem"), privateKey.export({ type: "pkcs8", format: "pem" }), { flag: "wx" });
  }
  log(`创建配置文件创建完成，位置：${pathOf()}`);
  return Buffer.from(configStr);
}
