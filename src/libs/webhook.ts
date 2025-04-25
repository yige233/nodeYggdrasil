import crypto from "crypto";
import Utils, { Time } from "./utils.js";
import { WebHookConfig, WebHookReqInit, WebhookTypes } from "./interfaces.js";
import { pinoLogger } from "../global.js";

/** 重试次数与重试间隔的映射 */
const retrySecondMap = {
  1: "5s",
  2: "30s",
  3: "1min",
  4: "5min",
  5: "10min",
};

/** 一个实现了标准Webhook的类 */
export default class WebHook {
  /** v1类型密钥的前缀 */
  public static prefixV1 = "whsec_";
  /** v1a类型密钥的前缀 */
  public static prefixV1a = "whpk_";
  /** webhook配置 */
  private config: WebHookConfig[];
  /**
   * 构造一个WebHook实例
   * @param {WebHookConfig[]} config 包含了webhook配置的数组。由于是引用传递，所以可以动态地修改该配置，而无需重启服务。
   */
  constructor(config: WebHookConfig[]) {
    if (!Array.isArray(config)) {
      throw new Error("没有传入正确的webhook配置。检查配置文件中webhooks是否是一个数组。");
    }
    this.config = config;
  }
  /**
   * 构造一个webhook请求对象
   * @param init 请求信息，包含webhook url、 消息类型、消息id和消息内容，后两者可不提供，id可随机生成
   * @returns
   */
  static webhookReq(init: { url: string; type: WebhookTypes; messageId?: string; data?: any }): WebHookReqInit {
    const messageId = init.messageId ?? Utils.uuid();
    return {
      url: init.url,
      data: JSON.stringify({ type: init.type, timestamp: Date.now(), data: init.data ?? {} }),
      messageId,
      errorCount: 0,
      method: "POST",
      headers: {
        "content-type": "application/json;charset=utf-8",
        "webhook-id": messageId,
        "user-agent": Utils.userAgent,
      },
    };
  }
  /**
   * 对尚未实例化的webhook请求进行签名
   * @param {WebHookReqInit} requestInit 尚未实例化的webhook请求对象
   * @returns {Request} 可以用于fetch的请求对象
   */
  private signRequest(requestInit: WebHookReqInit): Request {
    const { messageId, url, data, method, headers } = requestInit;
    /** 与提供的 webhook url 对应的 webhook 配置 */
    const target = this.config.find((i) => i.url === url);
    if (!target) {
      throw Error(`请求被取消，因为未在 webhook 配置中找到与之对应的配置`);
    }
    /** 请求发送的时间戳 */
    const timestamp = Math.floor(Date.now() / 1e3).toString();
    /** 待签字符串 */
    const dataToSign = [messageId, timestamp, data].join(".");
    /** 构建请求对象，超时时间为10秒 */
    const request = new Request(url, { method, headers, body: data, signal: AbortSignal.timeout(1e4) });
    request.headers.set("webhook-timestamp", timestamp);
    /** 为payload创建签名。定义一个签名数组。 */
    const signatureArray = [];
    // 为每个签名类型创建一个签名，并将它们添加到签名数组中。
    target.secrets.forEach((secret) => {
      const { type, key } = secret;
      // 检查密钥是否以正确的前缀开头。
      if (type === "v1" && key.startsWith(WebHook.prefixV1)) {
        /** 从base64格式解码来的密钥 */
        const decodeKey = Utils.decodeb64(key.slice(WebHook.prefixV1.length));
        const signature = crypto.createHmac("sha256", decodeKey).update(dataToSign).digest("base64");
        signatureArray.push("v1," + signature);
      }
      // TODO: 待实现
      if (type === "v1a" && key.startsWith(WebHook.prefixV1a)) {
        return;
        const signature = crypto
          .sign(null, Buffer.from(dataToSign), {
            key,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
          })
          .toString("base64");
        signatureArray.push("v1a" + signature);
      }
    });
    // 没有可用签名时，取消发送webhook
    if (signatureArray.length == 0) {
      throw new Error(`请求被取消，因为没能为该请求创建任何有效的签名`);
    }
    // 将这些签名拼接为字符串（按空格分割），并设置签名请求头中。
    request.headers.set("webhook-signature", signatureArray.join(" "));
    return request;
  }
  /**
   * 发送webhook请求
   * @param {WebHookReqInit} requestInit 尚未实例化的webhook请求对象
   * @param {boolean} once 是否只发送一次请求
   */
  async send(requestInit: WebHookReqInit, once: boolean = false): Promise<string> {
    const { messageId } = requestInit;
    try {
      /** 已签名的请求 */
      const request = this.signRequest(requestInit);
      /** 响应 */
      const response = await fetch(request);
      if (!response.ok) {
        throw new Error(`异常的响应：${response.status} ${response.statusText}`);
      }
      pinoLogger.webhook(`[${messageId}] 发送成功。`);
      return "";
    } catch (error) {
      const message = `[${messageId}] 发送失败：${error.message}。`;
      // 是一次性请求
      if (once) {
        const full = message + `请求不会被再次发送，因为该请求只允许发送一次。`;
        pinoLogger.webhook(full);
        return full;
      }
      // 错误次数过多
      if (requestInit.errorCount > 5) {
        const full = message + `请求不会被再次发送，因为重试次数已耗尽。`;
        pinoLogger.webhook(full);
        return full;
      }
      requestInit.errorCount++;
      const nextTry = retrySecondMap[requestInit.errorCount];
      // 通过setTimeout来延迟执行下一次请求
      setTimeout(() => this.send(requestInit), Time.parse(nextTry));
      const full = message + `请求将在${nextTry}后进行第${requestInit.errorCount}次重试。`;
      pinoLogger.webhook(full);
      return full;
    }
  }
  /**
   * 触发一个webhook事件
   * @param type 事件类型
   * @param data 事件数据
   */
  emit<T>(type: WebhookTypes, data: T): void {
    const messageId = Utils.uuid();
    const targets = this.config.filter((i) => i.subTypes?.includes(type));
    targets.forEach((target) => {
      const requestInit = WebHook.webhookReq({ url: target.url, messageId, type, data });
      pinoLogger.webhook(`[${messageId}] URL:${target.url} => ${JSON.stringify(data)}`);
      this.send(requestInit);
    });
  }
}
