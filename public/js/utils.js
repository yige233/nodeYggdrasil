/**
 * 创建一个元素并设置其属性、事件监听器以及子元素。
 * @param {string} tagName - 要创建的元素的标签名。
 * @param {{[key:string]:string}} attrs - 元素的属性对象，键值对形式，键为属性名，值为属性值。可不存在
 * @param {{[key:string]:(Event)=>void}} listeners - 元素的事件监听器对象，键值对形式，键为事件类型，值为对应的处理函数。可不存在，但如果要要添加事件监听器，则需要提供一个空对象。
 * @param {(Node|string)[]} children - 元素的子元素数组，可以是其他元素、文本节点等。
 * @returns {HTMLElement} 元素。
 */
export function html(tagName, attrs = {}, listeners = {}, ...children) {
  const element = document.createElement(tagName);

  if (listeners instanceof Node || typeof listeners === "string") {
    children.unshift(listeners);
  } else {
    for (const eventName in listeners) {
      if (typeof eventName !== "string") continue;
      element.addEventListener(eventName, listeners[eventName]);
    }
  }
  // 检测attrs和listeners是否是元素或文本节点，如果是，将其放入children数组
  if (attrs instanceof Node || typeof attrs === "string") {
    children.unshift(attrs);
  } else {
    for (const attrName in attrs) {
      if (typeof attrName !== "string" || typeof attrs[attrName] === "undefined") continue;
      element.setAttribute(attrName, attrs[attrName]);
    }
  }
  for (const child of children.filter((i) => i)) {
    element.append(child);
  }
  return element;
}
/** 对话框 */
export class Dialog {
  /** 对话框元素 */
  dialog;
  /** 用后自动销毁 */
  once = false;
  /**
   * 构建对话框
   * @param {string} title 对话框标题
   * @param  {HTMLElement[]} contentElem 对话框主体元素
   */
  constructor(title, ...contentElem) {
    this.dialog = html(
      "dialog",
      undefined,
      {
        cancel: () => this.close("cancel"),
        click: (e) => e.target == this.dialog && this.close("cancel"),
        contextmenu: (e) => e.preventDefault(),
      },
      html("div", html("div", { class: "dialog-title" }, title), html("div", { class: "dialog-content" }, ...contentElem), html("div", { class: "dialog-footer" }))
    );
    this.buttons(); //设置默认按钮
    document.body.append(this.dialog);
  }
  static once(...args) {
    const dialog = new Dialog();
    dialog.once = true;
    return dialog.confirm(...args);
  }
  /**
   * 添加按钮
   * @param {{[key:string]:{name:string,click:()=>boolean}|string}} buttons 键值对形式，键为按下该按钮时会触发的事件名，值是一个对象，其name属性为按钮名称，
   */
  buttons(buttons = { ok: { name: "确定", click: () => true }, cancel: { name: "取消", click: () => true } }) {
    const footer = this.dialog.querySelector(".dialog-footer");
    footer.innerHTML = ""; // 清空原有按钮
    for (const btn in buttons) {
      const [name, onClick] = (() => {
        if (typeof buttons[btn] === "string") {
          return [buttons[btn], () => true];
        }
        return [buttons[btn].name, buttons[btn].click || (() => true)];
      })();
      const btnElem = html("button", { class: btn == "ok" ? "success" : undefined }, name);
      btnElem.addEventListener("click", () => onClick() && this.close(btn)); // 按下按钮时关闭对话框，并传递按钮对应的事件名称
      footer.append(btnElem);
    }
    return this;
  }
  /**
   * 修改对话框内容,并可选地修改对话框标题与内容
   * @param {string} title 新的标题
   * @param  {(Node|string|number)[]} contentElem 新的对话框主体
   */
  show(title, ...contentElem) {
    const content = this.dialog.querySelector(".dialog-content");
    title && (this.dialog.querySelector(".dialog-title").textContent = title);
    content.innerHTML = "";
    if (contentElem.length > 0) {
      content.append(...contentElem);
    }
    this.dialog.showModal();
  }
  /**
   * 显示一个确认框。会强制使用默认按钮。
   * @param {string} title 新的标题
   * @param  {(Node|string|number)[]} contentElem 新的对话框主体
   * @returns {Promise<boolean>} 一个Promise，当对话框关闭时返回true或false
   */
  confirm(onOK = () => true, onCancel = () => true) {
    return (...args) => {
      return new Promise((resolve) => {
        this.buttons({ ok: { name: "确定", click: onOK }, cancel: { name: "取消", click: onCancel } });
        this.on("ok", () => resolve(true));
        this.on("cancel", () => resolve(false));
        this.show(...args);
      });
    };
  }
  /**
   * 关闭对话框。可以显式调用此方法并传入自定义事件名，触发监听该事件的回调，而不修改对话框按钮
   * @param {string} returnValue 对话框关闭时返回的值
   */
  close(returnValue) {
    this.dialog.close(returnValue);
  }
  /**
   * 监听按钮事件。实际上是监听对话框关闭事件
   * @param {string} eventName 事件名称，实际上是对话框关闭时的`returnValue`。默认是`ok`和`cancel`（通过默认的`buttons()`方法设置）
   * @param {(Event)=>void} callbackFunc 回调
   */
  on(eventName, callbackFunc) {
    let callbackClose = (e) => {
      const result = this.dialog.returnValue;
      this.dialog.removeEventListener("close", callbackClose);
      try {
        result == eventName && callbackFunc(e);
      } catch (e) {
        console.error("Error on handling dialog Event:", e);
      }
      if (this.once) {
        this.remove();
      }
    };
    this.dialog.addEventListener("close", callbackClose);
    return this;
  }
  /** 移除对话框 */
  remove() {
    this.dialog.remove();
  }
  /**
   * 对`this.dialog.querySelectorAll`和`querySelector`的简单包装
   * @param {string} selector 选择器
   * @returns
   */
  $(selector) {
    return this.dialog.querySelector(selector);
  }
  $a(selector) {
    return this.dialog.querySelectorAll(selector);
  }
}

export class Base64 {
  static get key() {
    return "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");
  }
  /**
   * 编码字符串数据为base64。
   * @param {string} data 要编码的数据
   * @returns {string}
   */
  static encode(data) {
    let code2 = "";
    const result = [];
    for (let i of data.split("")) {
      const charCode2 = i.charCodeAt(0).toString(2);
      if (i.charCodeAt(0) < 128) {
        //这里要补足8位
        code2 += charCode2.padStart(8, 0);
      } else {
        //这之外的字符，就不是btoa能处理的了，需要将unicode转换为utf-8
        let bytes = 1; //表示utf8将占用的字节数
        const utf8 = [];
        const uni2 = charCode2.split("").reverse().join(""); //将字符串反转，便于从低位开始操作
        for (let i = 0; i < uni2.length; i += 6) {
          const byte = uni2.slice(i, i + 6).split(""); //获取低6位，这时它还是反转的状态，所以下面的操作也要反着来
          //byte的长度不足6，说明它已经是最高位了
          if (byte.length != 6) {
            while (byte.length < 8 - bytes) byte.push(0); //中间用0补足至 8 - bytes 位
            while (byte.length < 8) byte.push(1); //最高位用1填充，共填充 bytes 位，达到8位
            utf8.push(...byte);
            break;
          }
          utf8.push(...byte, 0, 1); //低位向前补上"10"，变成8位
          bytes++;
        }
        code2 += utf8.reverse().join(""); //这里再给它反转回来
      }
    }
    //原来每8位占用一个字节，现在改用每6位，不足6位的补0，然后查表，变成base64编码
    for (let i = 0; i < code2.length; i += 6) {
      result.push(this.key[parseInt(code2.slice(i, i + 6).padEnd(6, 0), 2)]);
    }
    //末尾根据情况补充"="
    while (true) {
      if (result.length % 4 == 0) break;
      result.push("=");
    }
    return result.join("");
  }
  /**
   * 将base64编码的数据解码。
   * @param {string} data base64编码的数据
   * @returns {string}
   */
  static decode(data) {
    // 什么邪道??? ==> fetch(`data:text/plain;charset=utf-16;base64,${data}`).then(res => res.text());
    let code2 = "";
    let pointer = 0; //定义一个指针，方便查找字符串分割到哪了
    const result = [];
    //查表，把base64编码变回二进制
    for (let char of data.split("")) {
      if (char == "=") continue;
      code2 += this.key
        .findIndex((i) => i == char)
        .toString(2)
        .padStart(6, 0);
    }
    //这里是为了避免解码出\x00 ，要把code2最后不够8位的部分舍弃掉
    while (pointer < code2.length - (code2.length % 8)) {
      let bytes = 1; //编码的字节数
      let uni = "";
      //看起来这是个普通的ascii编码
      if (code2.charAt(pointer) == "0") {
        result.push(String.fromCharCode(parseInt(code2.slice(pointer, pointer + 8), 2)));
        pointer += 8;
        continue;
      }
      //看起来这是一个utf8编码
      while (true) {
        //判断编码的字节数
        if (code2.charAt(pointer + bytes) == "1") {
          uni += code2.slice(pointer + 8 * bytes + 2, pointer + 8 * (bytes + 1)); //获取对应字节的低6位，接在 uni 的后面
          bytes++;
          continue;
        }
        result.push(String.fromCharCode(parseInt(code2.slice(pointer + bytes, pointer + 8) + uni, 2))); //最后把剩下的接在 uni 的前面
        pointer += 8 * bytes;
        break;
      }
    }
    return result.join("");
  }
}
/** 与其他页面通信的广播 */
export class Broadcast extends BroadcastChannel {
  constructor(name) {
    super(name);
    this.listen("ping", () => this.broadcast("pong"));
  }
  /**
   * 发送ping消息，并等待回应。
   * @param {number} timeout ping超时，单位ms，默认500ms
   * @returns {Promise<boolean>}
   */
  ping(timeout = 500) {
    this.broadcast("ping", undefined);
    return new Promise((resolve) => {
      setTimeout(() => resolve(false), timeout);
      this.listen("pong", () => resolve(true));
    });
  }
  /**
   * 广播消息。
   * @param {string} eventName 广播事件名称
   * @param {any} data 发送的数据
   * @returns
   */
  broadcast(eventName, data = undefined) {
    this.postMessage({ event: eventName, data });
  }
  /**
   * 监听指定的广播事件。
   * @param {string} eventName 事件名称
   * @param {(data:any)=>void} handler 回调处理函数
   */
  listen(eventName, handler) {
    this.addEventListener("message", (e) => {
      const { event, data } = e.data;
      if (event === eventName) handler(data);
    });
  }
}

export class API {
  id;
  token;
  username;
  serverAddr;
  constructor(serverAddr) {
    this.serverAddr = serverAddr;
  }
  async request(expression = "get /", body = undefined, headers = {}) {
    const [method = "get", url = "/"] = expression.split(" ");
    const fullURL = `${this.serverAddr}/server${url}`;
    const appliedHeaders = {
      "content-type": "application/json",
      authorization: this.token ? "Bearer " + this.token : undefined,
      ...headers,
    };
    for (const i of Object.keys(appliedHeaders)) {
      if (appliedHeaders[i] === undefined) {
        delete appliedHeaders[i];
      }
    }
    !body && delete appliedHeaders["content-type"];
    const res = await fetch(fullURL, {
      method: method.toUpperCase(),
      headers: appliedHeaders,
      body: body ? (appliedHeaders["content-type"]?.includes("json") ? JSON.stringify(body) : body) : undefined,
    });
    const parser = (res.headers.get("content-type") || "").includes("json") ? "json" : "text";
    const result = {
      url: fullURL,
      status: res.status,
      body: await res[parser]().catch(() => undefined),
      get error() {
        const { error, errorMessage } = this.body || { error: res.status, errorMessage: res.statusText };
        return error && (this.status < 200 || this.status > 300) ? `${error}: ${errorMessage}` : null;
      },
    };
    return result;
  }
  localData(token, id) {
    this.token = token;
    this.id = id;
    if (token) {
      localStorage.setItem("accessToken", token);
    } else {
      localStorage.clear("accessToken");
    }
    if (id) {
      localStorage.setItem("userId", id);
    } else {
      localStorage.clear("userId");
    }
  }
  register(username, password, inviteCode, nickName) {
    return this.request("post /users", { username, password, inviteCode, nickName }, { authorization: undefined });
  }
  login(username, password) {
    this.username = username;
    return this.request("post /sessions", { username, password });
  }
  refresh(token = this.token, requestUser = true) {
    return this.request(
      "patch /sessions",
      {
        accessToken: token,
        requestUser,
      },
      { Authorization: undefined }
    );
  }
  logout() {
    const req = this.request("delete /sessions", { accessToken: this.token }, { Authorization: undefined });
    this.token = undefined;
    return req;
  }
  logoutAll(username, password) {
    return this.request("delete /sessions?all=true", { username, password }, { Authorization: undefined });
  }
  settings() {
    return this.request("get /settings");
  }
  getUserInfo() {
    return this.request(`get /users/${this.id}`);
  }
  editUserInfo(username, password, nickName) {
    return this.request(`patch /users/${this.id}`, { username, password, nickName });
  }
  lockUser(username, password) {
    return this.request(`patch /users/lock`, { username, password });
  }
  deleteUser(username, password) {
    return this.request(`delete /users/${this.id}`, { username, password });
  }
  getUserRescueCode() {
    return this.request(`get /users/${this.id}/rescue-code`);
  }
  getProfile(profileId) {
    return this.request(`get /profiles/${profileId}`);
  }
  editProfile(profileId, data) {
    return this.request(`patch /profiles/${profileId}`, { ...data });
  }
  editTexture(profileId, type, data) {
    return this.request(`patch /profiles/${profileId}/textures?operation=${type}`, { ...data });
  }
  deleteTexture(profileId, target) {
    return this.request(`delete /profiles/${profileId}/textures/${target}`, undefined, { "content-type": undefined });
  }
  uploadTexture(profileId, type, file) {
    return this.request(`put /profiles/${profileId}/textures/${type == "cape" ? "cape" : "skin"}`, file, {
      "content-type": file.type,
      "x-skin-model": type == "slim" ? "slim" : "default",
    });
  }
  deleteProfile(profileId) {
    return this.request(`delete /profiles/${profileId}`);
  }
  newProfile(name, offlineCompatible) {
    return this.request(`post /profiles`, { name, offlineCompatible });
  }
  ban(target, duration) {
    return this.request(`post /bans`, { target, duration });
  }
  registerBatch(...data) {
    return this.request("post /users", data);
  }
  getInviteCode(count = 1) {
    return this.request("post /invite-codes?count=" + count, undefined, { "content-type": undefined });
  }
  issueInviteCode() {
    return this.request("get /invite-codes");
  }
  modifySettings(data) {
    return this.request("patch /settings", data);
  }
  queryUsers(after, count) {
    return this.request(`get /users?after=${after}&count=${count}`);
  }
  queryUser(query) {
    return this.request(`get /users?user=${query}`, undefined, { authorization: undefined });
  }
  queryLogs(logName) {
    return this.request("get /logs/" + logName);
  }
  resetPass(id, rescueCode, newPassword) {
    return this.request(`patch /users/${id}/password`, { rescueCode, newPassword });
  }
  restart() {
    return this.request("patch /", { restart: true });
  }
  getWebhooks() {
    return this.request("get /webhooks");
  }
  addWebhook(webhookConfig) {
    return this.request("post /webhooks", { ...webhookConfig });
  }
  editWebhook(id, webhookConfig) {
    return this.request(`patch /webhooks/${id}`, { ...webhookConfig });
  }
}

export class ProxyObject extends EventTarget {
  /** 被监听的数据 */
  data;
  constructor(target) {
    super();
    this.data = new Proxy(target, this.proxyHandler(ProxyObject.root));
  }
  /** 在事件中代表根对象的字符 */
  static get root() {
    return "r";
  }
  /**
   * 为一个对象创建赋值监听器
   * @param {{}|[]} target 要监听的对象
   * @returns
   */
  static of(target) {
    return target instanceof ProxyObject ? target : new ProxyObject(target);
  }
  proxyHandler(...parentKeys) {
    const dispatch = this.dispatch.bind(this);
    const handler = this.proxyHandler.bind(this);
    const getKeyPath = (key) => [...parentKeys, key].join(".");
    return {
      get(target, key) {
        if (typeof target[key] === "object" && target[key] !== null) {
          return new Proxy(target[key], handler(...parentKeys, key));
        }
        return target[key];
      },
      set(target, key, value) {
        const result = Reflect.set(target, key, value);
        dispatch(getKeyPath(key), value);
        return result;
      },
      deleteProperty(target, key) {
        const result = Reflect.deleteProperty(target, key);
        dispatch(getKeyPath(key));
        return result;
      },
    };
  }
  dispatch(keyPath, value) {
    // 属性更新时触发的通用update事件
    this.dispatchEvent(new CustomEvent("update", { detail: { path: keyPath, value } }));
    // 属性更新时触发的root.keyPath事件
    this.dispatchEvent(new CustomEvent(keyPath, { detail: value }));
  }
  /**
   * 合并一个对象到现有的被监听的对象，确保其可以触发属性更新事件。
   * @param {object} object 新对象
   */
  assign(object) {
    const assignFunc = (src, from) => {
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
  }
  /**
   * 创建一个与数据相关联的文本节点
   * @param {string} dataPath 数据路径
   * @param {Function} prcooessFunc 对属性值的处理回调
   * @returns
   */
  linkedTextNode(dataPath, initValue = "", prcooessFunc = (text) => text) {
    const textNode = document.createTextNode(prcooessFunc(initValue));
    this.on(ProxyObject.root + "." + dataPath, (e) => (textNode.textContent = prcooessFunc(e.detail)));
    return textNode;
  }
  get on() {
    return this.addEventListener;
  }
  get remove() {
    return this.removeEventListener;
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
  static parse(...input) {
    return input
      .join(",")
      .split(",")
      .filter((i) => i)
      .map(Time.parseSingle)
      .reduce((acc, cur) => acc + cur, 0);
  }
  static parseSingle(timeString) {
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
/**
 * 锁定按钮，直到`promise`执行完毕
 * @param {HTMLButtonElement} btn 按钮元素
 * @returns (promise)=>Promise\<any\>
 */
export function lockBtn(btn) {
  btn.setAttribute("disabled", "disabled");
  return async (promise) => {
    try {
      return await promise;
    } catch (err) {
      console.error("Error:", err);
    } finally {
      btn.removeAttribute("disabled");
    }
  };
}
/**
 * 如果`target`是函数，则执行并返回其返回值；否则返回其自身
 * @param {any} target 一个任意对象
 * @returns
 */
function execFunction(target) {
  return typeof target === "function" ? target() : target;
}
/**
 * 添加项目到页面
 * @param {Element} mainRoot 主要根元素
 * @param {Element} sideRoot 次要根元素
 * @returns
 */
export function addSectionFor(mainRoot, sideRoot) {
  /**
   * 为页面添加项目。
   * @param {Object} option - 项目配置
   * @param {string} option.id 项目id
   * @param {string|Text} option.name 项目名称
   * @param {string|Text} option.desc 项目介绍
   * @param {(string|Node)[]} option.contentElem 项目内部元素列表
   */
  return function ({ id, name, desc, contentElem = [] }) {
    const sideElem = html("div", { class: "appear" }, html("a", { class: "pseudo button", href: `#${id}` }, execFunction(name)));
    const mainElem = html("div", { class: "appear" }, html("h2", { id }, execFunction(name)), desc && html("p", desc), ...contentElem.map((i) => execFunction(i)));
    [sideElem, mainElem].forEach((el) => el.addEventListener("animationend", () => el.classList.remove("appear")));
    sideRoot.append(sideElem);
    mainRoot.append(mainElem);
    return {
      sideElem,
      mainElem,
      get append() {
        return mainElem.append.bind(mainElem);
      },
      remove() {
        [sideElem, mainElem].forEach((el) => {
          el.classList.add("disappear");
          el.addEventListener("animationend", el.remove);
        });
      },
    };
  };
}
/**
 * 创建输入框。
 * @param {string} type 输入框类型
 * @param {{[key:string]:string}} attrs 输入框的属性
 * @param {(value:any)=>void} onInput 输入框触发输入事件时的回调
 * @returns
 */
export function inputElement(type = "text", attrs, onInput = () => undefined) {
  const attributes = { type, ...attrs };
  const input = html("input", attributes, {
    input: () => {
      const value = attributes.type == "number" ? parseInt(input.value) : input.value;
      onInput(value);
    },
  });
  return input;
}
/**
 * 从元素数组中搜索含有指定关键词的元素。元素必须有`keywords`属性。`searchStr`不为空时，没有命中的元素会被隐藏。
 * @param {Element[]} elementArr 元素数组
 * @param {string} searchStr 关键词
 */
export function searchInElement(elementArr, searchStr) {
  for (const optionElem of elementArr) {
    const keywords = optionElem.getAttribute("keywords") || "";
    if (optionElem.textContent.includes(searchStr) || keywords.includes(searchStr)) {
      optionElem.style.display = "block";
    } else {
      optionElem.style.display = "none";
    }
  }
}
/**
 * 创建一个卡片
 * @param {Element} header 卡片头部元素
 * @param  {(Element|Node)[]} contentElem 卡片内容元素
 * @returns
 */
export function card(header, ...contentElem) {
  return html("article", { class: "card" }, header && html("header", execFunction(header)), ...contentElem.map((i) => execFunction(i)));
}
/**
 * 创建一个按钮
 * @param {string} type 按钮类型
 * @param {string|Node} text 按钮文字
 * @param {(event:Event)=>void} onClick 按钮点击事件
 * @returns
 */
export function buttonElement(type, text, onClick = () => null) {
  return html("button", { class: type }, { click: onClick }, text);
}
/**
 * 创建一个可展开的折叠元素
 * @param {(string|Node)} summary 被折叠的内容的简介
 * @param  {(string|Node)[]} contentElem 被折叠的内容
 * @returns
 */
export function foldElement(summary, ...contentElem) {
  return html("details", html("summary", summary), ...contentElem.map((i) => execFunction(i)));
}
/**
 * 创建选择框。
 * @param {{[key:string]:string}} options 选择框对应的配置项
 * @returns
 */
export function selectElement(options = {}, attrs = {}, onChange = () => undefined) {
  const selectElem = html("select", attrs, { change: (e) => onChange(e.target.value) });
  Object.entries(options).forEach(([key, value]) => {
    const optionElem = html("option", { value: key }, value);
    selectElem.append(optionElem);
  });
  return selectElem;
}
/**
 * 一组输入框。
 * @param {"array"|"object"} valueFormat 获取值时的返回值格式。可选值：`array`、`object`。默认为`array`。
 * @returns
 */
export function inputGroup(valueFormat = "array") {
  function getValue(input) {
    return input.type == "file"
      ? input.files
      : input.type == "checkbox"
      ? input.checked
      : input.type == "number"
      ? parseInt(input.value || 0)
      : input.getAttribute("type") == "array"
      ? input.value.split("\n").filter((i) => i)
      : input.value;
  }
  const inputs = [];
  const customValidators = [];
  let onNewInput = () => undefined;
  return {
    /**
     * 获取所有通过add方法添加的元素。
     * @returns {Element[]}
     */
    get elements() {
      return inputs.map((i) => i.elem);
    },
    /**
     * 获取所有通过add方法添加的元素的值。
     * @returns {{details:{[key:string]:{val:any,el:Element,error:(ewrror:string)=>undefined}}|[{val:any,el:Element,error:(ewrror:string)=>undefined}],values:{[key:string]:any}|any[],invalid:boolean}}
     */
    getValues() {
      return {
        /** 所有元素的值 */
        get details() {
          const buildObj = (input) => ({ val: getValue(input), el: input, error: (error) => input.setCustomValidity(error) });
          if (valueFormat == "array") return inputs.map((i) => buildObj(i.input));
          if (valueFormat == "object") {
            const result = {};
            inputs.forEach((i) => (result[i.input.name] = buildObj(i.input)));
            return result;
          }
        },
        get values() {
          if (valueFormat == "array") return this.details.map((i) => i.val);
          if (valueFormat == "object") {
            const result = {};
            Object.values(this.details).forEach(({ el, val }) => (result[el.name] = val));
            return result;
          }
        },
        get invalid() {
          const missingValidity = inputs.every(({ input }) => {
            const missing = input.validity.valueMissing;
            missing && input.setCustomValidity(input.getAttribute("val-missing"));
            return !missing;
          });
          missingValidity && customValidators.forEach((f) => f());
          for (const { input } of inputs) {
            if (input.validity.valid) continue;
            Promise.resolve(isVisible(input))
              .then((res) => (res ? undefined : scrollIntoView(input, 0)))
              .then(() => input.reportValidity());
            return true;
          }
          return false;
        },
      };
    },
    /**
     *添加输入框。
     * @param {string} name 输入框的name属性。在该inputGroup中，该name必须唯一。
     * @param {{el:string|Element,valMissing?:string,options?:{},attr?:{}}} props 输入框的属性。el:描述该输入框的类型，或者是一个`inputLike`元素，包括`input`、`textarea`和`select`。options:`select`元素的选项。attr:其他属性。
     * @param {(input:Element)=>Element} warp 用于包装输入框的函数，传入输入框本身，返回包装后的元素。
     */
    add(name, props = {}, warp = (i) => i) {
      const { el = "text", valMissing } = props;
      const push = (input) => {
        input.addEventListener("input", () => input.setCustomValidity(""));
        if (valMissing && typeof valMissing === "string") {
          input.setAttribute("required", "");
          input.setAttribute("val-missing", valMissing);
        }
        const warpped = warp(input);
        inputs.push({ input, elem: warpped });
        onNewInput(warpped);
        return this;
      };
      if (inputs.find(({ input }) => input.getAttribute("name") === name)) {
        throw new Error(`重复的 name：${name}`);
      }
      if (el instanceof Element) {
        !el.name && el.setAttribute("name", name);
        return push(el);
      }
      if (el == "textarea") {
        return push(html(el, { name, ...props.attr }));
      }
      if (el == "select") {
        return push(selectElement(props.options || {}, { name, ...props.attr }));
      }
      if (el == "array") {
        const desc = "该字段为数组，每行为解析为数组中的一个元素";
        return push(html("textarea", { name, placeholder: desc, title: desc, type: "array", ...props.attr }));
      }
      return push(inputElement(el, { name, ...props.attr }));
    },
    /**
     * 为输入框添加额外的验证器。
     * @param {(values:(string|number)[])=>string} validateFunc 验证函数。按add顺序传入所有元素的值，返回错误信息，或者undefined表示无错误。
     */
    validator(validateFunc) {
      const f = valueFormat == "object" ? () => validateFunc(this.getValues().details) : () => validateFunc(...this.getValues().details);
      customValidators.push(f);
      return this;
    },
    /**
     * 通过配置模板添加输入框。
     * @param  {{
     *    type:"boolean"|"string"|"url"|"intger"|"time"|"textarea"|"array"|"select"|"password",
     *    path:string,
     *    desc:string,
     *    required?:boolean,
     *    valMissing?:string,
     *    options?:{[key:string]:string},
     *    info?:string,
     *    attr?:{},
     *    binding?:ProxyObject,
     *    warp?:(input:Element,desc:string,info:string)=>Element,
     * }[]} config 配置项
     */
    template(...config) {
      const add = (item, el, binding = (val) => (el.value = val)) => {
        const warp = item.warp ? (el) => item.warp(el, item.desc, item.info) : (el) => el;
        item.binding && item.binding.on("r." + item.path, ({ detail }) => binding(detail));
        this.add(item.path, { el, attr: item.attr, valMissing: item.required || item.valMissing ? item.valMissing ?? "请填写该项。" : undefined }, warp);
      };
      const validator = (warpped = () => undefined, name) => {
        this.validator((details) => {
          const thisDetail = details[name] || details.find(({ el }) => el.getAttribute("name") == name);
          warpped(thisDetail);
        });
      };
      config.forEach((item) => {
        const type = item.type ?? "string";
        if (type === "boolean") {
          const el = inputElement("checkbox");
          return add(item, el, (val) => (el.checked = val));
        }
        if (type === "string") {
          return add(item, inputElement("text"));
        }
        if (type === "integer") {
          return add(item, inputElement("number", { min: item.min ?? 0, step: 1 }));
        }
        if (type === "textarea") {
          return add(item, html("textarea"));
        }
        if (type === "select") {
          return add(item, selectElement(item.options));
        }
        if (type === "time") {
          const desc = "语义化的时间格式，如 34m,6s。\n可以使用 d, h, m, s, ms 5个单位；可以使用逗号来组合不同单位的时间。\n可以使用负号：`1h,-5m`等于`55m`。";
          validator((thisDetail) => Time.parse(thisDetail.val) <= 0 && thisDetail.error("时间格式错误，或者输入的值小于等于0。"), item.path);
          return add(item, inputElement("text", { placholder: desc, title: desc }));
        }
        if (type === "array") {
          const desc = "该字段为数组，每行为解析为数组中的一个元素";
          const el = html("textarea", { placeholder: desc, title: desc, type: "array" });
          return add(item, el, (val) => (el.value = val.join("\n")));
        }
        return add(item, inputElement(item.type));
      });
      return this;
    },
    /**
     * inputGroup的`add()`方法被调用时，会执行的函数，传入由`add()`方法添加的，并且被`warp()`后的元素。
     * @param {(element:Element)=>undefined} callbackFunc 回调函数
     */
    onNewInput(callbackFunc = () => undefined) {
      onNewInput = callbackFunc;
    },
  };
}
// https://github.com/w3c/csswg-drafts/issues/3744#issuecomment-1806939380
export async function scrollIntoView(selector, timeout = 500) {
  const target = typeof selector == "string" ? document.querySelector(selector) : selector;
  if (!target) return Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, timeout));
  return new Promise((resolve) => {
    if ("onscrollend" in window) {
      document.addEventListener("scrollend", resolve, { once: true });
      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    } else {
      target.scrollIntoView({ block: "center", inline: "nearest" });
      resolve();
    }
  });
}
export function isVisible(element) {
  const rect = element.getBoundingClientRect();
  const viewHeight = Math.max(document.documentElement.clientHeight, window.innerHeight) * 0.9;
  const viewWidth = Math.max(document.documentElement.clientWidth, window.innerWidth) * 0.9;
  return !(rect.bottom < 0 || rect.top > viewHeight || rect.right < 0 || rect.left > viewWidth);
}
export function debounce(warpped = () => undefined, timeWithin = 100) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => warpped(...args), timeWithin);
  };
}
