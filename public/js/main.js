import "./skinview3d.bundle.js";

class Base64 {
  static get key() {
    return "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".split("");
  }
  static encode(data) {
    let code2 = "";
    const result = [];
    for (let i of data.split("")) {
      //
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
          if (byte.length != 6) {
            //byte的长度不足6，说明它已经是最高位了
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
    for (let i = 0; i < code2.length; i += 6) {
      //原来每8位占用一个字节，现在改用每6位，不足6位的补0，然后查表，变成base64编码
      result.push(this.key[parseInt(code2.slice(i, i + 6).padEnd(6, 0), 2)]);
    }
    while (true) {
      //末尾根据情况补充"="
      if (result.length % 4 == 0) break;
      result.push("=");
    }
    return result.join("");
  }
  static decode(data) {
    //什么邪道??? ==> fetch(`data:text/plain;charset=utf-16;base64,${data}`).then(res => res.text());
    let code2 = "";
    let pointer = 0; //定义一个指针，方便查找字符串分割到哪了
    const result = [];
    for (let char of data.split("")) {
      //查表，把base64编码变回二进制
      if (char == "=") continue;
      code2 += this.key
        .findIndex((i) => i == char)
        .toString(2)
        .padStart(6, 0);
    }
    while (pointer < code2.length - (code2.length % 8)) {
      //这里是为了避免解码出\x00 ，要把code2最后不够8位的部分舍弃掉
      let bytes = 1; //编码的字节数
      let uni = "";
      if (code2.charAt(pointer) == "0") {
        //看起来这是个普通的ascii编码
        result.push(String.fromCharCode(parseInt(code2.slice(pointer, pointer + 8), 2)));
        pointer += 8;
        continue;
      }
      while (true) {
        //看起来这是一个utf8编码
        if (code2.charAt(pointer + bytes) == "1") {
          //判断编码的字节数
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

class Broadcast extends BroadcastChannel {
  constructor(name) {
    super(name);
  }
  message(messageBody, timeWindow = 100) {
    const replies = [];
    this.onmessage = (e) => replies.push(e.data);
    this.postMessage(messageBody);
    return new Promise((resolve) => setTimeout(() => resolve(replies), timeWindow));
  }
}
const simpleCSS = copyCSSSheets(document.styleSheets[0]);
const styles = copyCSSSheets(document.styleSheets[1]);

const rendered = Symbol("rendered");
const root = Symbol("root");

class BaseElem extends HTMLElement {
  //自定义元素挺不错的，就是要自己写css很烦
  constructor(selector, useShadow = true) {
    if (!selector) throw new Error("需要提供模板selector");
    super();
    this[root] = useShadow ? this.attachShadow({ mode: "closed" }) : this;
    this.template = document.querySelector(selector).content.cloneNode(true);
    this[root].adoptedStyleSheets = [simpleCSS, styles];
    this[rendered] = false;
  }
  get rendered() {
    return this[rendered];
  }
  async connectedCallback() {
    //当元素被附加到dom上时，就会调用该方法。
    this[root].append(this.template);
    try {
      await this.render();
    } catch (err) {
      console.error(err);
    }
    this[rendered] = true;
    this.classList.toggle("appear");
    this.addEventListener("animationend", () => this.classList.toggle("appear"));
    this.attributeChangedCallback("attr-changed");
  }
  attributeChangedCallback(name) {
    //当元素的被监视的属性发生变化时，就会调用该方法。
    if (!this[rendered]) return;
    const attrs = {};
    const observedAttr = this.constructor.observedAttributes || [];
    for (let name of observedAttr) {
      attrs[name] = this.getAttribute(name);
    }
    if (observedAttr.includes("attr-changed")) {
      //如果被监视属性包含attr-changed，则仅在该属性发生变化时重新渲染
      if (name == "attr-changed") {
        return this.attrRender({ ...attrs });
      }
      return;
    }
    this.attrRender({ ...attrs });
  }
  getElem(selector) {
    return this[root].querySelector(selector);
  }
  getAllElem(selector) {
    return this[root].querySelectorAll(selector);
  }
  /**
   * 重写setAttribute，防止某些情况下设置多余的属性
   * @param {string} name 属性名
   * @param {string} value 属性值
   * @param {boolean} forced 是否强制设置，默认为false
   * @returns
   */
  setAttribute(name, value, forced = false) {
    const observedAttr = this.constructor.observedAttributes || [];
    if (observedAttr.length > 0 && !observedAttr.includes(name) && !forced) {
      return;
    }
    if (typeof value == "undefined") {
      return;
    }
    if (name == "attr-changed" && !forced) {
      return super.setAttribute("attr-changed", Math.random());
    }
    super.setAttribute(name, value);
  }
  setAttributes({ ...attributes }) {
    for (let name in attributes || {}) {
      this.setAttribute(name, attributes[name] || "");
    }
  }
  async render() {}
  async attrRender() {}
}
class HeaderElem extends BaseElem {
  constructor() {
    super("#t-header");
  }
  static get observedAttributes() {
    return ["root", "name", "info"];
  }
  attrRender({ root, name, info }) {
    this.getElem("#yggdrasil-addr").textContent = root;
    this.getElem("a#yggdrasil-protocol").href = "authlib-injector:yggdrasil-server:" + encodeURIComponent(root);
    document.title = name;
    this.getElem(".info").textContent = info;
  }
  setAttribute(name, value, forced = false) {
    if (name == "server") {
      const { root, name } = value;
      super.setAttribute("root", root);
      return super.setAttribute("name", name);
    }
    if (name == "pubExtend") {
      return super.setAttribute("info", value.headerInfo);
    }
    super.setAttribute(name, value, forced);
  }
}
class UserInfoElem extends BaseElem {
  constructor() {
    super("#t-user");
  }
  static get observedAttributes() {
    return ["username", "nick-name", "role", "reg-time", "invite-code", "id", "reg-ip"];
  }
  render() {
    const [btnA, btnB] = this.getAllElem("button");
    const [newUsername, newNickName, newPassword, newPasswordAgain] = this.getAllElem("input");
    btnA.addEventListener("click", async (e) => {
      if (newPassword.value != newPasswordAgain.value) {
        return DialogBox.show("不能进行该操作", "两次输入的密码不一致");
      }
      const result = await lockBtn(e.target, (...p) => USER.editUserInfo(...p), {
        username: newUsername.value,
        password: newPassword.value,
        nickName: newNickName.value,
      });
      if (result instanceof ErrorResponse) {
        return DialogBox.show("个人信息修改失败", result.error);
      }
      this.setAttributes({ ...result });
    });
    btnB.addEventListener("click", async (e) => {
      await await lockBtn(e.target, () => USER.logout());
      USER.info();
      DialogBox.on("ok", () => window.location.reload());
      DialogBox.on("cancel", () => window.location.reload());
      DialogBox.show("操作成功", "已注销当前会话。关闭对话框即可刷新网页。");
    });
  }
  attrRender({ username, "nick-name": nickName, role, "reg-time": regTime, "invite-code": inviteCode, id, "reg-ip": regIP }) {
    const slots = this.getAllElem("strong");
    slots[0].textContent = role == "admin" ? "管理员" : "普通用户";
    slots[1].textContent = new Date(Number(regTime)).toLocaleString();
    slots[2].textContent = regIP;
    slots[3].textContent = username;
    slots[4].textContent = id;
    slots[5].textContent = nickName;
    slots[6].textContent = inviteCode;
  }
  setAttribute(name, value, forced = false) {
    const nameMap = {
      username: "username",
      nickName: "nick-name",
      regTime: "reg-time",
      regIP: "reg-ip",
      id: "id",
      role: "role",
    };
    if (name == "extend") {
      return super.setAttribute("invite-code", value.inviteCode);
    }
    if (nameMap[name]) {
      return super.setAttribute(nameMap[name], value);
    }
    super.setAttribute(name, value, forced);
  }
}
class ProfileInfoElem extends BaseElem {
  constructor() {
    super("#t-profile-info");
  }
  static get observedAttributes() {
    return ["name", "id", "skin", "cape", "model", "attr-changed"];
  }
  render() {
    const btns = this.getAllElem("button");
    const [newProfileName, profileCapeVisible, mojangProfileName, littleSkinTid, uploadFile] = this.getAllElem("input");
    const [operationType, deleteType, textureType] = this.getAllElem("select");
    btns[0].addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, (...p) => USER.editProfile(...p), this.getAttribute("id"), newProfileName.value, operationType.value, {
        capeVisible: profileCapeVisible.checked,
        profileName: mojangProfileName.value,
        littleskinTid: littleSkinTid.value,
        type: deleteType.value,
      });
      if (result instanceof ErrorResponse) {
        return DialogBox.show("角色信息修改失败", result.error);
      }
      this.setAttributes({ ...result, "attr-changed": "" });
    });
    btns[1].addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, () => USER.uploadFile(this.getAttribute("id"), textureType.value, uploadFile.files[0] || undefined));
      if (result instanceof ErrorResponse) {
        return DialogBox.show("材质上传失败", result.error);
      }
      DialogBox.show("材质上传成功", undefined);
      this.setAttributes({ ...result });
    });
    btns[2].addEventListener("click", async (e) => {
      if (!(await DialogBox.confirm("请确认", "你真的要删除这个角色吗？"))) {
        return;
      }
      const result = await lockBtn(e.target, () => USER.deleteProfile(this.getAttribute("id")));
      if (result instanceof ErrorResponse) {
        return DialogBox.show("角色删除失败", result.error);
      }
      DialogBox.show("角色删除成功", undefined);
      this.classList.toggle("disappear");
      this.addEventListener("animationend", this.remove);
    });
  }
  async attrRender({ name, id, skin, cape, model }) {
    async function load(name, url) {
      try {
        const parsedURL = new URL(url);
        parsedURL.protocol = window.location.protocol;
        const response = await fetch(parsedURL.href);
        const blob = await response.blob();
        return URL.createObjectURL(blob);
      } catch (e) {
        console.error(`加载${name}(${url})失败。`, e);
        return undefined;
      }
    }
    const slots = this.getAllElem("strong");
    const canvas = this.getElem("canvas");
    slots[0].textContent = name;
    slots[1].textContent = id;
    if (!skin) {
      canvas.style = "display:none";
      slots[2].textContent = "没有设置皮肤";
      return;
    }
    slots[2].textContent = "";
    canvas.style = "display:block";
    const animations = [new skinview3d.IdleAnimation(), new skinview3d.WalkingAnimation(), new skinview3d.RunningAnimation(), new skinview3d.FlyingAnimation(), null];
    let order = 0;
    const skinData = await load("皮肤", skin);
    const capeData = cape ? await load("披风", cape) : undefined;
    const viewer = new skinview3d.SkinViewer({
      canvas: canvas,
      width: window.innerWidth > 500 ? 500 : window.innerWidth * 0.9,
      height: 500,
      zoom: 0.8,
      nameTag: name,
      skin: skinData,
      cape: capeData,
      model,
    });
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      viewer.animation = animations[order];
      if (cape) {
        if (order == 3) {
          viewer.playerObject.backEquipment = "elytra";
        } else {
          viewer.playerObject.backEquipment = "cape";
        }
      }
      order++;
      if (order == animations.length) {
        order = 0;
      }
    });
  }
  setAttribute(name, value, forced = false) {
    if (name == "properties" && Array.isArray(value)) {
      for (const prop of value) {
        const { name: propName, value } = prop;
        if (propName == "textures") {
          try {
            const data = JSON.parse(Base64.decode(value));
            const { CAPE = {}, SKIN = {} } = data.textures;
            super.setAttribute("skin", SKIN.url);
            super.setAttribute("cape", CAPE.url);
            super.setAttribute("model", SKIN.metadata?.model);
          } catch (e) {
            console.error("解析角色材质失败:", e);
          }
        }
      }
      return;
    }
    super.setAttribute(name, value, forced);
  }
}
class newProfileElem extends BaseElem {
  constructor() {
    super("#t-new-profile");
  }
  render() {
    const [newProfileName, offlineCompatible] = this.getAllElem("input");
    this.getElem("button").addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, (...p) => USER.newProfile(...p), newProfileName.value, offlineCompatible.checked);
      if (result instanceof ErrorResponse) {
        return DialogBox.show("新建角色失败", result.error);
      }
      this.before(html("y-profile-info", result));
      newProfileName.value = "";
    });
  }
}
class RescueElem extends BaseElem {
  constructor() {
    super("#t-get-rescue-code");
  }
  render() {
    this.getElem("button").addEventListener("click", async (e) => {
      function alert() {
        if (navigator.clipboard) navigator.clipboard.writeText(window.rescueCode);
        return DialogBox.show(
          "以下是你的救援代码",
          html("h3", { style: "text-align:center" }, window.rescueCode),
          navigator.clipboard && "代码已复制到剪贴板。",
          "注意：刷新网页后，将无法再次显示救援代码。"
        );
      }
      if (window.rescueCode) {
        return alert();
      }
      const result = await lockBtn(e.target, () => USER.getUserRescueCode());
      if (result instanceof ErrorResponse) {
        return DialogBox.show("获取救援代码失败", result.error);
      }
      window.rescueCode = result.rescueCode;
      alert();
    });
  }
}
class DangerOpElem extends BaseElem {
  constructor() {
    super("#t-user-danger");
  }
  render() {
    const [username, password, passwdAgain] = this.getAllElem("input");
    const [btnLogoutAll, btnLock, btnDelete] = this.getAllElem("button");
    btnLogoutAll.addEventListener("click", async (e) => {
      if (!(await DialogBox.confirm("请确认", "你真的要注销账号的所有登录会话吗？"))) {
        return;
      }
      if (!password.value || password.value != [passwdAgain.value]) {
        return DialogBox.show("不能进行该操作", "输入的密码为空，或两次输入的密码不一致");
      }
      const result = await lockBtn(e.target, () => USER.logoutAll(username.value, password.value));
      if (result instanceof ErrorResponse) {
        return DialogBox.show("操作失败", result.error);
      }
      DialogBox.show("已注销本账户的所有会话", undefined);
      window.location.reload();
    });
    btnLock.addEventListener("click", async (e) => {
      if (!(await DialogBox.confirm("请确认", "你真的要锁定账户吗？"))) {
        return;
      }
      if (!password.value || password.value != [passwdAgain.value]) {
        return DialogBox.show("不能进行该操作", "输入的密码为空，或两次输入的密码不一致");
      }
      const result = await lockBtn(e.target, () => USER.lockUser(username.value, password.value));
      if (result instanceof ErrorResponse) {
        return DialogBox.show("锁定用户失败", result.error);
      }
      DialogBox.show("用户已经被锁定", undefined);
    });
    btnDelete.addEventListener("click", async (e) => {
      if (!(await DialogBox.confirm("请确认", "你真的要删除账户吗？"))) {
        return;
      }
      if (!password.value || password.value != [passwdAgain.value]) {
        return DialogBox.show("不能进行该操作", "输入的密码为空，或两次输入的密码不一致");
      }
      const result = await lockBtn(e.target, () => USER.deleteUser(username.value, password.value));
      if (result instanceof ErrorResponse) {
        return DialogBox.show("删除用户失败", result.error);
      }
      DialogBox.show("用户已经被删除", undefined);
      window.location.reload();
    });
  }
}
class AdminBanUserElem extends BaseElem {
  constructor() {
    super("#t-admin-ban-user");
  }
  render() {
    const [targetToBan, duration] = this.getAllElem("input");
    this.getElem("button").addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, () => USER.ban(targetToBan.value, duration.value));
      if (result instanceof ErrorResponse) {
        return DialogBox.show("未能封禁用户", result.error);
      }
      DialogBox.show(`已封禁用户：${result.nickName}`, `预计解封时间：${new Date(result.banned).toLocaleString()}`);
    });
  }
}
class AdminNewUserElem extends BaseElem {
  constructor() {
    super("#t-admin-new-user");
  }
  render() {
    const [usercacheFile, suffix, inviteCode] = this.getAllElem("input");
    const container = this.getElem(".card-container");
    usercacheFile.addEventListener("change", async function () {
      const list = new Set();
      container.innerHTML = "";
      if (!this.files[0]) {
        return;
      }
      const usercache = await fetch(URL.createObjectURL(new Blob([this.files[0]], { type: "application/json" }))).then((res) => res.json());
      if (!Array.isArray(usercache)) {
        return;
      }
      usercache.forEach((i) => list.add(i.name));
      for (const name of list) {
        container.append(html("y-usercache-info-card", { username: name + (suffix.value || "@minecraft.mc"), password: name + "1234567" }));
      }
    });
    this.getElem("button").addEventListener("click", async (e) => {
      const list = [];
      const cards = container.children;
      for (const card of cards) {
        const username = card.getAttribute("username");
        const password = card.getAttribute("password");
        if (!username) continue;
        list.push({
          username,
          password,
          nickName: username,
          inviteCode: inviteCode.value,
        });
      }
      const results = await lockBtn(e.target, () => USER.registerBatch(...list));
      for (let i in results) {
        if (results[i].error) {
          cards[i].setAttribute("status", new ErrorResponse(results[i]).error);
        } else {
          cards[i].setAttribute("status", "done");
        }
      }
    });
  }
}
class AdminInviteCodeElem extends BaseElem {
  constructor() {
    super("#t-admin-get-invite-code");
  }
  render() {
    this.getElem("button").addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, () => USER.getInviteCode(this.getElem("input").value));
      if (result instanceof ErrorResponse) {
        return DialogBox.show("获取邀请码失败", result.error);
      }
      this.getElem("textarea").innerText = result.join("\n");
    });
  }
}
class AdminSettingsElem extends BaseElem {
  constructor() {
    super("#t-admin-settings");
  }
  static get observedAttributes() {
    return ["settings"];
  }
  render() {
    const [edit, restart] = this.getAllElem("button");
    edit.addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, () => USER.settings(JSON.parse(this.getElem("textarea").value)));
      if (result instanceof ErrorResponse) {
        return DialogBox.show("修改服务器设置失败", result.error);
      }
      this.setAttributes({ ...result });
      document.querySelector("y-header").setAttributes({ ...result });
    });
    restart.addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, () => USER.restart()).catch(() => null);
      if (result instanceof ErrorResponse) {
        return DialogBox.show("发送重启指令失败", result.error);
      }
      DialogBox.show("已向服务器发送重启指令", undefined);
    });
  }
  attrRender({ settings }) {
    this.getElem("textarea").value = JSON.stringify(JSON.parse(settings), null, 2);
  }
  setAttribute(name, value, forced = false) {
    if (name == "settings") {
      return super.setAttribute(name, JSON.stringify(value));
    }
    super.setAttribute(name, value, forced);
  }
}
class AdminQueryLogElem extends BaseElem {
  constructor() {
    super("#t-admin-query-logs");
  }
  render() {
    this.getElem("button").addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, () => USER.queryLogs(this.getElem("select").value));
      if (result instanceof ErrorResponse) {
        return DialogBox.show("查询日志失败", result.error);
      }
      this.getElem("textarea").value = result;
    });
  }
}
class LoginElem extends BaseElem {
  constructor() {
    super("#t-login");
  }
  render() {
    const [username, password] = this.getAllElem("input");
    password.addEventListener("keydown", (e) => {
      if (e.key == "Enter") {
        this.getElem("button").click();
      }
    });
    this.getElem("button").addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, () => User.login(username.value, password.value));
      if (result instanceof ErrorResponse) {
        return DialogBox.show("登录失败", result.error);
      }
      USER.info(result.accessToken, result.uuid);
      return User.init(true);
    });
  }
}
class NewUserElem extends BaseElem {
  constructor() {
    super("#t-new-user");
  }
  render() {
    const [username, nickName, password, passwordAgain, inviteCode] = this.getAllElem("input");
    this.getElem("button").addEventListener("click", async (e) => {
      if (!password.value || password.value != passwordAgain.value) {
        return DialogBox.show("注册失败", "输入的密码为空，或两次输入的密码不一致");
      }
      const result = await lockBtn(e.target, (...p) => User.register(...p), {
        username: username.value,
        password: password.value,
        nickName: nickName.value,
        inviteCode: inviteCode.value,
      });
      if (result instanceof ErrorResponse) {
        return DialogBox.show("注册失败", result.error);
      }
      if (result[0].error) {
        return DialogBox.show("注册失败", new ErrorResponse(result[0]).error);
      }
      const loginRresult = await lockBtn(e.target, () => User.login(username.value, password.value));
      if (loginRresult instanceof ErrorResponse) {
        return DialogBox.show("登录失败", result.error);
      }
      USER.info(loginRresult.accessToken, loginRresult.uuid);
      return User.init(true);
    });
  }
}
class ResetPassElem extends BaseElem {
  constructor() {
    super("#t-reset-pass");
  }
  render() {
    const [username, rescueCode, password, passwordAgain] = this.getAllElem("input");
    this.getElem("button").addEventListener("click", async (e) => {
      if (!password.value || password.value != passwordAgain.value) {
        return DialogBox.show("重置密码失败", "输入的密码为空，或两次输入的密码不一致");
      }
      const result = await lockBtn(e.target, () => User.resetPass(username.value, rescueCode.value, password.value));
      if (result.error) {
        return DialogBox.show("重置密码失败", result.error);
      }
      return DialogBox.show("密码重置成功。", undefined);
    });
  }
}
class UserInfoCardElem extends BaseElem {
  constructor() {
    super("#t-user-info-card");
  }
  static get observedAttributes() {
    return ["nick-name", "id", "role", "reg-time", "banned"];
  }
  attrRender({ "nick-name": nickName, id, role, "reg-time": regTime, banned }) {
    const slots = this.getAllElem("strong");
    const ban = Number(banned);
    slots[0].textContent = id;
    slots[1].textContent = nickName;
    slots[2].textContent = role == "admin" ? "管理员" : "普通用户";
    slots[3].textContent = new Date(Number(regTime)).toLocaleString();
    slots[4].textContent = ban > 0 ? `${ban > new Date().getTime() ? "正在封禁中" : "曾被封禁"}，封禁持续至${new Date(ban).toLocaleString()}` : "没有被封禁过";
  }
  setAttribute(name, value, forced = false) {
    const nameMap = {
      nickName: "nick-name",
      regTime: "reg-time",
      id: "id",
      role: "role",
      banned: "banned",
    };
    if (nameMap[name]) {
      return super.setAttribute(nameMap[name], value);
    }
    super.setAttribute(name, value, forced);
  }
}
class QueryUserElem extends BaseElem {
  constructor() {
    super("#t-query-user");
  }
  render() {
    const [query, adminQuery] = this.getAllElem("button");
    const loadMoreBtn = html("button", "查看更多");
    const container = this.getElem(".card-container");
    async function loadMore(after = 0) {
      const result = await lockBtn(loadMoreBtn, () => USER.queryUsers(after, 10));
      if (result instanceof ErrorResponse) {
        return DialogBox.show("查询用户失败", result.error);
      }
      if (result.length == 0) {
        return loadMoreBtn.remove();
      }
      for (let singleUser of result) {
        container.append(html("y-user-info-card", singleUser));
        loadMoreBtn.setAttribute("latest", singleUser.id);
      }
      container.append(loadMoreBtn);
    }
    query.addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, () => User.queryUser(this.getElem("input").value));
      if (result instanceof ErrorResponse) {
        return DialogBox.show("查询用户失败", result.error);
      }
      container.innerHTML = "";
      container.append(html("y-user-info-card", result));
    });
    loadMoreBtn.addEventListener("click", async (e) => await loadMore(loadMoreBtn.getAttribute("latest")));
    adminQuery.addEventListener("click", async (e) => {
      container.innerHTML = "";
      await lockBtn(adminQuery, () => loadMore());
    });
  }
}
class UsercacheInfoCardElem extends BaseElem {
  constructor() {
    super("#t-usercache-info-card");
  }
  static get observedAttributes() {
    return ["username", "password", "status"];
  }
  attrRender({ username, password, status }) {
    const [name, passwd] = this.getAllElem("input");
    name.value = username;
    passwd.value = password;
    this.getElem("strong").textContent = status == "done" ? "注册成功" : status;
  }
  render() {
    const [name, passwd] = this.getAllElem("input");
    name.addEventListener("input", () => {
      this.setAttributes({ username: name.value, password: passwd.value });
    });
    passwd.addEventListener("input", () => {
      this.setAttributes({ username: name.value, password: passwd.value });
    });
    this.getElem("button").addEventListener("click", () => {
      if (!this.getAttribute("status")) this.remove();
    });
  }
}
class Render {
  static login() {
    AppElem.append(html("y-login"), html("y-new-user"), html("y-reset-pass"), html("y-query-user"));
  }
  static async user(userInfo) {
    const elemList = [];
    const { profiles, role } = userInfo;
    elemList.push(html("y-user-info", userInfo));
    for (const profileId of profiles) {
      const profile = await USER.getProfile(profileId);
      elemList.push(html("y-profile-info", profile));
    }
    elemList.push(html("y-new-profile"), html("y-query-user"), html("y-rescue-code"), html("y-user-danger"));
    if (role == "admin") {
      const settings = await USER.settings();
      elemList.push(html("y-admin-ban-user"), html("y-admin-new-user"), html("y-admin-get-invite-code"), html("y-admin-query-logs"), html("y-admin-settings", { settings }));
    }
    AppElem.append(...elemList);
  }
  static async header() {
    const settings = await User.settings();
    if (settings instanceof ErrorResponse) {
      return DialogBox.show("获取服务器配置失败", result.error);
    }
    document.body.prepend(html("y-header", settings));
  }
}

class ErrorResponse {
  constructor(error) {
    this.error = `${error.error} : ${error.errorMessage || ""}`;
  }
}

class User {
  accessToken = null;
  uuid = null;
  constructor() {}
  static async init(skipFresh = false) {
    AppElem.innerHTML = "";
    const accessToken = localStorage.getItem("accessToken");
    const userId = localStorage.getItem("userId");
    if (!accessToken) {
      return Render.login();
    }
    if (!skipFresh) {
      const refresh = await User.refresh(accessToken, true);
      if (refresh instanceof ErrorResponse) {
        DialogBox.show("登录凭证已过期，请重新登录", undefined);
        USER.info();
        return Render.login();
      }
      USER.info(refresh.accessToken, refresh.uuid);
    } else {
      USER.info(accessToken, userId);
    }
    const fullUserInfo = await USER.getUserInfo(USER.uuid);
    if (fullUserInfo instanceof ErrorResponse) {
      return DialogBox.show("获取用户信息失败", fullUserInfo.error);
    }
    if (!fullUserInfo.username) {
      USER.info();
      Render.login();
      return DialogBox.show("登录凭证已过期，请重新登录", undefined);
    }
    Render.user(fullUserInfo);
  }
  static refresh(accessToken, requestUser = false) {
    return request("/server/sessions", {
      method: "post",
      body: JSON.stringify({ accessToken, requestUser }),
    });
  }
  static login(username, password) {
    return request("/server/sessions", {
      method: "put",
      body: JSON.stringify({ username, password }),
    });
  }
  static register(data) {
    return request("/server/users", {
      method: "put",
      body: JSON.stringify([data]),
    });
  }
  static getProfiles(...profiles) {
    return request("/server/profiles", {
      method: "post",
      body: JSON.stringify(profiles),
    });
  }
  static settings() {
    return request("/server/settings");
  }
  static async resetPass(username, rescueCode, newPass) {
    const userInfo = await request("/server/users?user=" + username);
    if (userInfo instanceof ErrorResponse) {
      return new ErrorResponse({ error: "无法重置密码", errorMessage: "提供的用户不存在" });
    }
    const userId = userInfo.id;
    return request("/server/user/" + userId + "/password", {
      method: "post",
      body: JSON.stringify({ rescueCode, newPass }),
    });
  }
  static queryUser(query) {
    return request("/server/users?user=" + query);
  }
  logout() {
    return request("/server/sessions", {
      method: "delete",
      body: JSON.stringify({ accessToken: this.accessToken }),
    });
  }
  logoutAll(username, password) {
    return request("/server/sessions?all=true", {
      method: "delete",
      body: JSON.stringify({ username, password }),
    });
  }
  info(accessToken, uuid) {
    this.accessToken = accessToken;
    this.uuid = uuid;
    if (accessToken) {
      localStorage.setItem("accessToken", accessToken);
    } else {
      localStorage.clear("accessToken");
    }
    if (uuid) {
      localStorage.setItem("userId", uuid);
    } else {
      localStorage.clear("userId");
    }
  }
  getUserInfo(userId) {
    return request("/server/user/" + userId, {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
      method: "get",
    });
  }
  editUserInfo(data) {
    return request("/server/user/" + this.uuid, {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
      method: "patch",
      body: JSON.stringify({ operation: "modify", data }),
    });
  }
  lockUser(username, password) {
    return request("/server/user/" + this.uuid, {
      method: "patch",
      body: JSON.stringify({ operation: "lock", data: { username, password } }),
    });
  }
  deleteUser(username, password) {
    return request("/server/user/" + this.uuid, {
      body: JSON.stringify({ username, password }),
      method: "delete",
    });
  }
  getUserRescueCode() {
    return request("/server/user/" + this.uuid + "/rescueCode", {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
    });
  }
  getProfile(profile) {
    return request("/server/profile/" + profile);
  }
  editProfile(profile, name, type, data) {
    return request("/server/profile/" + profile, {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
      method: "patch",
      body: JSON.stringify({ name, texture: { type, data } }),
    });
  }
  uploadFile(profile, type, file) {
    if (!file) {
      return new ErrorResponse({
        error: "需要提供一个材质文件",
        errorMessage: "",
      });
    }
    return request(`/server/profile/${profile}/${type == "cape" ? "cape" : "skin"}`, {
      headers: {
        Authorization: "Bearer " + this.accessToken,
        "content-type": file.type,
        "x-skin-model": type == "slim" ? "slim" : "default",
      },
      method: "put",
      body: file,
    });
  }
  deleteProfile(profile) {
    return request("/server/profile/" + profile, {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
      method: "delete",
    });
  }
  newProfile(name, offlineCompatible) {
    return request("/server/profiles", {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
      method: "put",
      body: JSON.stringify({ name, offlineCompatible }),
    });
  }
  ban(target, duration) {
    return request("/server/bans", {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
      method: "put",
      body: JSON.stringify({ target, duration }),
    });
  }
  registerBatch(...data) {
    return request("/server/users", {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
      method: "put",
      body: JSON.stringify(data),
    });
  }
  getInviteCode(count) {
    return request("/server/inviteCodes?count=" + count || 1, {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
    });
  }
  settings(data) {
    if (data) {
      return request("/server/settings", {
        headers: {
          Authorization: "Bearer " + this.accessToken,
        },
        method: "patch",
        body: JSON.stringify(data),
      });
    }
    return request("/server/settings", {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
    });
  }
  restart() {
    return request("/server", {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
      method: "post",
      body: JSON.stringify({ operation: "restart" }),
    });
  }
  queryLogs(logName) {
    logName = ["logins", "errors"].includes(logName) ? logName : "logins";
    return request("/server/logs/" + logName, {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
    });
  }
  queryUsers(after, count) {
    return request(`/server/users?after=${after}&count=${count}`, {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
    });
  }
}

/** 对话框 */
class Dialog {
  /** 对话框元素 */
  dialog;
  /** 用后自动销毁 */
  once = false;
  /**
   * 构建对话框
   * @param {string} title 对话框标题
   * @param  {...HTMLElement} contentElem 对话框主体元素
   */
  constructor(title, ...contentElem) {
    this.dialog = html(
      "dialog",
      {},
      {
        cancel: () => this.close("cancel"),
        click: (e) => e.target == this.dialog && this.close("cancel"),
      },
      html("div", html("div", { class: "dialog-title" }, title), html("div", { class: "dialog-content" }, {}, ...contentElem), html("div", { class: "dialog-footer" }))
    );
    this.buttons(); //设置默认按钮
    document.body.append(this.dialog);
  }
  /**
   * 添加按钮。如果存在buttons.ok，会将回车事件绑定到ok按钮
   * @param {} buttons 键值对形式，键为按下该按钮时会触发的事件名，值是按钮的文本名称
   */
  buttons(buttons = { ok: "确定", cancel: "取消" }) {
    const footer = this.dialog.querySelector(".dialog-footer");
    footer.innerHTML = ""; //清空原有按钮
    if (buttons.ok)
      this.dialog.addEventListener("keydown", (e) => {
        if (e.key == "Enter") this.close("ok");
      });
    for (const btn in buttons) {
      const btnElem = html("span", { class: "text-btn" }, buttons[btn]);
      btnElem.addEventListener("click", () => this.close(btn)); //按下按钮时关闭对话框，并传递按钮对应的事件名称
      footer.append(btnElem);
    }
  }
  /**
   * 修改对话框内容,并可选地修改对话框标题与内容
   * @param {string} title 新的标题
   * @param  {...any} contentElem 新的对话框主体
   */
  show(title, ...contentElem) {
    const content = this.dialog.querySelector(".dialog-content");
    title && (this.dialog.querySelector(".dialog-title").innerText = title);
    if (contentElem.length > 0) {
      const elemArray = contentElem.filter((i) => i);
      content.innerHTML = "";
      content.append(...elemArray);
    }
    this.dialog.showModal();
  }
  /**
   * 关闭对话框
   * @param {} returnValue 对话框关闭时返回的值
   */
  close(returnValue) {
    this.dialog.close(returnValue);
  }
  /**
   * 显示一个确认框。会强制使用默认按钮。
   * @param  {...any} args 同 show() 的参数
   * @returns
   */
  confirm(...args) {
    return new Promise((resolve) => {
      this.buttons();
      this.on("ok", () => resolve(true));
      this.on("cancel", () => resolve(false));
      this.show(...args);
    });
  }
  /**
   * 监听按钮事件。实际上是监听对话框关闭事件
   * @param {string} eventName 事件名称，来自于 Dialog.buttons()。默认是ok和cancel
   * @param {Function} callbackFunc 回调
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
  }
  /** 移除对话框 */
  remove() {
    this.dialog.remove();
  }
}

async function request(url, init) {
  const result = await fetch(url, {
    headers: Object.assign(
      {
        "content-type": "application/json",
      },
      init?.headers || {}
    ),
    method: (init?.method || "get").toUpperCase(),
    body: init?.body || null,
  });
  const json = await (/application\/json/i.test(result.headers.get("content-type")) ? result.json() : result.text()).catch((err) => {
    return { error: result.status || err.message, errorMessage: result.statusText || "" };
  });
  if (result.ok) {
    return json;
  }
  return new ErrorResponse(json);
}

async function lockBtn(btn, promise, ...params) {
  btn.setAttribute("disabled", "disabled");
  try {
    return await promise(...params);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    btn.removeAttribute("disabled");
  }
}

/**
 * 创建一个元素并设置其属性、事件监听器以及子元素。
 * @param {string} tagName - 要创建的元素的标签名。
 * @param {Object} attrs - 元素的属性对象，键值对形式，键为属性名，值为属性值。可不存在，但如果要要添加事件监听器，则需要提供一个空对象。
 * @param {Object} linteners - 元素的事件监听器对象，键值对形式，键为事件类型，值为对应的处理函数。可不存在
 * @param {Array} children - 元素的子元素数组，可以是其他元素、文本节点等。
 * @returns {HTMLElement} - 元素。
 */
function html(tagName, ...args) {
  let [attrs = {}, listeners = {}, ...children] = args;
  const element = document.createElement(tagName);
  const ifELem = [];
  // 检测attrs和listeners是否是元素或文本节点，如果是，将其放入children数组
  if (attrs instanceof HTMLElement || typeof attrs === "string") {
    ifELem.push(attrs);
    attrs = {};
  }
  if (listeners instanceof HTMLElement || typeof listeners === "string") {
    ifELem.push(listeners);
    listeners = {};
  }
  children.unshift(...ifELem);
  // 处理attrs
  for (const attrName in attrs) {
    if (typeof attrName !== "string" || typeof attrs[attrName] === "undefined") continue;
    element.setAttribute(attrName, attrs[attrName]);
  }

  // 处理listeners
  for (const eventName in listeners) {
    if (typeof eventName !== "string") continue;
    element.addEventListener(eventName, listeners[eventName]);
  }

  // 添加children
  for (const child of children) {
    element.append(child);
  }

  return element;
}

/**
 * 将通过 cssText 创建的 CSSStyleSheet 复制到构造的 CSSStyleSheet，以用于adoptedStyleSheets
 * @param {CSSStyleSheet} src 源 CSSStyleSheet
 * @returns {CSSStyleSheet}
 */
function copyCSSSheets(src) {
  const styleSheet = new CSSStyleSheet();
  for (let i = 0; i < src.cssRules.length; i++) {
    styleSheet.insertRule(src.cssRules.item(i).cssText);
  }
  return styleSheet;
}

(function defineElem(prefix = "custom") {
  const list = {
    header: HeaderElem,
    "user-info": UserInfoElem,
    "profile-info": ProfileInfoElem,
    "new-profile": newProfileElem,
    "rescue-code": RescueElem,
    "user-danger": DangerOpElem,
    "admin-ban-user": AdminBanUserElem,
    "admin-new-user": AdminNewUserElem,
    "admin-get-invite-code": AdminInviteCodeElem,
    "admin-settings": AdminSettingsElem,
    "admin-query-logs": AdminQueryLogElem,
    "reset-pass": ResetPassElem,
    "new-user": NewUserElem,
    login: LoginElem,
    "user-info-card": UserInfoCardElem,
    "query-user": QueryUserElem,
    "usercache-info-card": UsercacheInfoCardElem,
  };
  for (let tag in list) {
    customElements.define(`${prefix}-${tag}`.toLocaleLowerCase(), list[tag]);
  }
})("y");

const broadcast = new Broadcast("Pages");
const DialogBox = new Dialog("网页消息");
const AppElem = document.querySelector(".app");
const USER = new User();
try {
  let skipFresh = false;
  await Render.header();
  if ((await broadcast.message("hello?")).length > 0) {
    skipFresh = true;
  }
  User.init(skipFresh);
} catch (err) {
  document.title = "Error!!";
  AppElem.append(html("pre", "网页加载出错，错误堆栈如下：\n" + err.stack));
}
broadcast.onmessage = function (e) {
  if (e.data == "hello?") {
    broadcast.postMessage("hi!");
  }
};
