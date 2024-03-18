import styles from "../css/main.css" assert { type: "css" };
import simpleCSS from "../css/simple.min.css" assert { type: "css" };
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
    this.attributeChangedCallback();
  }
  attributeChangedCallback() {
    //当元素的被监视的属性发生变化时，就会调用该方法。
    if (!this[rendered]) return;
    const attrs = {};
    for (let name of this.constructor.observedAttributes || []) {
      attrs[name] = this.getAttribute(name);
    }
    this.attrRender({ ...attrs });
  }
  getElem(selector) {
    return this[root].querySelector(selector);
  }
  getAllElem(selector) {
    return this[root].querySelectorAll(selector);
  }
  setAttributes({ ...attributes }) {
    for (let name in attributes || {}) {
      if (Object.is(attributes[name], null)) {
        this.removeAttribute(name);
      }
      attributes[name] && this.setAttribute(name, attributes[name] || "");
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
  setAttributes({ server: { root, name }, pubExtend: { headerInfo } }) {
    super.setAttributes({ root: root + "yggdrasil", name, info: headerInfo });
  }
}
class UserInfoElem extends BaseElem {
  constructor() {
    super("#t-user");
  }
  static get observedAttributes() {
    return ["username", "nickName", "role", "regTime", "inviteCode", "id", "regIP"];
  }
  render() {
    const [btnA, btnB] = this.getAllElem("button");
    const [newUsername, newNickName, newPassword, newPasswordAgain] = this.getAllElem("input");
    btnA.addEventListener("click", async (e) => {
      if (newPassword.value != newPasswordAgain.value) {
        return alert("两次输入的密码不一致");
      }
      const result = await lockBtn(e.target, (...p) => user.editUserInfo(...p), {
        username: newUsername.value,
        password: newPassword.value,
        nickName: newNickName.value,
      });
      if (result instanceof ErrorResponse) {
        return alert("修改个人信息失败。\n" + result.error);
      }
      this.setAttributes({ ...result });
    });
    btnB.addEventListener("click", async (e) => {
      user.logout().then(() => {
        alert("已注销当前会话");
        window.location.reload();
      });
    });
  }
  attrRender({ username, nickName, role, regTime, inviteCode, id, regIP }) {
    const slots = this.getAllElem("strong");
    slots[0].textContent = role == "admin" ? "管理员" : "普通用户";
    slots[1].textContent = new Date(Number(regTime)).toLocaleString();
    slots[2].textContent = regIP;
    slots[3].textContent = username;
    slots[4].textContent = id;
    slots[5].textContent = nickName;
    slots[6].textContent = inviteCode;
  }
  setAttributes({ username, nickName = username, id, role, regTime, regIP, extend: { inviteCode } }) {
    super.setAttributes({ username, nickName, role, regTime, regIP, inviteCode, id });
  }
}
class ProfileInfoElem extends BaseElem {
  constructor() {
    super("#t-profile-info");
  }
  static get observedAttributes() {
    return ["name", "id", "skin", "cape", "model"];
  }
  render() {
    const btns = this.getAllElem("button");
    const [newProfileName, profileCapeVisible, mojangProfileName, littleSkinTid, uploadFile] = this.getAllElem("input");
    const [operationType, deleteType, textureType] = this.getAllElem("select");
    btns[0].addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, (...p) => user.editProfile(...p), this.getAttribute("id"), newProfileName.value, operationType.value, {
        capeVisible: profileCapeVisible.checked,
        profileName: mojangProfileName.value,
        littleskinTid: littleSkinTid.value,
        type: deleteType.value,
      });
      if (result instanceof ErrorResponse) {
        return alert("角色信息修改失败。\n" + result.error);
      }
      this.setAttributes({ ...result });
    });
    btns[1].addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, () => user.uploadFile(this.getAttribute("id"), textureType.value, uploadFile.files[0] || undefined));
      if (result instanceof ErrorResponse) {
        return alert("材质上传失败。\n" + result.error);
      }
      alert("材质上传成功。");
    });
    btns[2].addEventListener("click", async (e) => {
      if (!confirm("你真的要删除这个角色吗？")) {
        return;
      }
      const result = await lockBtn(e.target, () => user.deleteProfile(this.getAttribute("id")));
      if (result instanceof ErrorResponse) {
        return alert("删除角色失败。\n" + result.error);
      }
      this.classList.toggle("disappear");
      this.addEventListener("animationend", this.remove);
    });
  }
  attrRender({ name, id, skin, cape, model }) {
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
    const viewer = new skinview3d.SkinViewer({
      canvas: canvas,
      width: window.innerWidth > 500 ? 500 : window.innerWidth * 0.9,
      height: 500,
      zoom: 0.8,
      nameTag: name,
      skin,
      cape,
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
  setAttributes({ name, properties: [{ value }], id }) {
    const { CAPE = {}, SKIN = {} } = JSON.parse(Base64.decode(value)).textures;
    super.setAttributes({ name, skin: SKIN.url, cape: CAPE.url || null, id, model: SKIN.metadata?.model || null });
  }
}
class newProfileElem extends BaseElem {
  constructor() {
    super("#t-new-profile");
  }
  render() {
    const [newProfileName, offlineCompatible] = this.getAllElem("input");
    this.getElem("button").addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, (...p) => user.newProfile(...p), newProfileName.value, offlineCompatible.checked);
      if (result instanceof ErrorResponse) {
        return alert("新建角色失败。\n" + result.error);
      }
      const profileElem = document.createElement("y-profile-info");
      profileElem.setAttributes({ ...result });
      this.before(profileElem);
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
      if (window.rescueCode) {
        return alert("你的救援代码是: " + window.rescueCode + " 。注意：刷新网页后，将无法再次显示救援代码。");
      }
      const result = await lockBtn(e.target, () => user.getUserRescueCode());
      if (result instanceof ErrorResponse) {
        return alert("获取救援代码失败。\n" + result.error);
      }
      window.rescueCode = result.rescueCode;
      alert("你的救援代码是: " + result.rescueCode + " 。注意：刷新网页后，将无法再次显示救援代码。");
    });
  }
}
class DangerOpElem extends BaseElem {
  constructor() {
    super("#t-user-danger");
  }
  render() {
    const [usernameInput, passwdInput, passwdAgainInput] = this.getAllElem("input");
    const [btnLock, btnDelete] = this.getAllElem("button");
    btnLock.addEventListener("click", async (e) => {
      if (!confirm("你真的要锁定账户吗？")) {
        return;
      }
      if (passwdInput.value != [passwdAgainInput.value]) {
        return alert("两次输入的密码不一致");
      }
      const result = await lockBtn(e.target, () => user.lockUser(usernameInput.value, passwdInput.value));
      if (result instanceof ErrorResponse) {
        return alert("锁定用户失败。\n" + result.error);
      }
      alert("用户已经被锁定。");
    });
    btnDelete.addEventListener("click", async (e) => {
      if (!confirm("你真的要删除账户吗？")) {
        return;
      }
      if (passwdInput.value != [passwdAgainInput.value]) {
        return alert("两次输入的密码不一致");
      }
      const result = await lockBtn(e.target, () => user.deleteUser(usernameInput.value, passwdInput.value));
      if (result instanceof ErrorResponse) {
        return alert("删除用户失败。\n" + result.error);
      }
      alert("用户已经被删除。");
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
      const result = await lockBtn(e.target, () => user.ban(targetToBan.value, duration.value));
      if (result instanceof ErrorResponse) {
        return alert("未能封禁用户。\n" + result.error);
      }
      alert(`已封禁用户：${result.nickName}\n预计解封时间：${new Date(result.banned).toLocaleString()}`);
    });
  }
}
class AdminNewUserElem extends BaseElem {
  constructor() {
    super("#t-admin-new-user");
  }
  render() {
    const [usercacheFile, suffix, inviteCode] = this.getAllElem("input");
    this.getElem("button").addEventListener("click", async (e) => {
      const list = [];
      if (!usercacheFile.files[0]) {
        return alert("请提供usercache.json。");
      }
      const usercache = await fetch(URL.createObjectURL(new Blob([usercacheFile.files[0]], { type: "application/json" }))).then((res) => res.json());
      if (!Array.isArray(usercache)) {
        return alert("请提供正确的usercache.json。");
      }
      for (const user of usercache) {
        const { name = null } = user;
        if (!name) continue;
        list.push({
          username: name + suffix.value || "@minecraft.mc",
          password: name + "1234567",
          nickName: name,
          inviteCode: inviteCode.value,
        });
      }
      const result = await lockBtn(e.target, () => user.registerBatch(...list));
      alert("即将打开批量注册的结果。");
      const blob = new Blob([JSON.stringify(result, null, 2)], {
        type: "application/json",
      });
      window.open(URL.createObjectURL(blob), "_blank");
    });
  }
}
class AdminInviteCodeElem extends BaseElem {
  constructor() {
    super("#t-admin-get-invite-code");
  }
  render() {
    this.getElem("button").addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, () => user.getInviteCode(this.getElem("input").value));
      if (result instanceof ErrorResponse) {
        return alert("获取邀请码失败。\n" + result.error);
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
      const result = await lockBtn(e.target, () => user.settings(JSON.parse(this.getElem("textarea").value)));
      if (result instanceof ErrorResponse) {
        return alert("修改服务器设置失败。\n" + result.error);
      }
      this.setAttributes({ ...result });
      document.querySelector("y-header").setAttributes({ ...result });
    });
    restart.addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, () => user.restart()).catch(() => null);
      if (result instanceof ErrorResponse) {
        return alert("发送重启指令失败。\n" + result.error);
      }
      alert("已向服务器发送重启指令。");
    });
  }
  attrRender({ settings }) {
    this.getElem("textarea").value = JSON.stringify(JSON.parse(settings), null, 2);
  }
  setAttributes({ ...settings }) {
    super.setAttributes({ settings: JSON.stringify(settings) });
  }
}
class AdminQueryLogElem extends BaseElem {
  constructor() {
    super("#t-admin-query-logs");
  }
  render() {
    this.getElem("button").addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, () => user.queryLogs(this.getElem("select").value));
      if (result instanceof ErrorResponse) {
        return alert("查询日志失败。\n" + result.error);
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
    const [usernameLogin, passwordLogin] = this.getAllElem("input");
    this.getElem("button").addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, () => User.login(usernameLogin.value, passwordLogin.value));
      if (result instanceof ErrorResponse) {
        return alert("登录失败。\n" + result.error);
      }
      user.info(result.accessToken, result.uuid);
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
      if (password.value != passwordAgain.value) {
        return alert("两次输入的密码不一致");
      }
      const result = await lockBtn(e.target, (...p) => User.register(...p), {
        username: username.value,
        password: password.value,
        nickName: nickName.value,
        inviteCode: inviteCode.value,
      });
      if (result instanceof ErrorResponse) {
        return alert("注册失败。\n" + result.error);
      }
      if (result[0].error) {
        return alert("注册失败。\n" + new ErrorResponse(result[0]).error);
      }
      alert("注册成功，现在可以登录了。");
    });
  }
}
class ResetPassElem extends BaseElem {
  constructor() {
    super("#t-reset-pass");
  }
  render() {
    const [usernameReset, rescueCode, passwordReset, passwordResetAgain] = this.getAllElem("input");
    this.getElem("button").addEventListener("click", async (e) => {
      if (passwordReset.value != passwordResetAgain.value) {
        return alert("两次输入的密码不一致");
      }
      const result = await lockBtn(e.target, () => User.resetPass(usernameReset.value, rescueCode.value, passwordReset.value));
      if (result?.error) {
        return alert("重置密码失败。\n" + new ErrorResponse(result).error);
      }
      alert("密码重置成功。");
    });
  }
}
class UserInfoCardElem extends BaseElem {
  constructor() {
    super("#t-user-info-card");
  }
  static get observedAttributes() {
    return ["nickName", "id", "role", "regTime", "banned"];
  }
  attrRender({ nickName, id, role, regTime, banned }) {
    const slots = this.getAllElem("strong");
    const ban = Number(banned);
    slots[0].textContent = id;
    slots[1].textContent = nickName;
    slots[2].textContent = role == "admin" ? "管理员" : "普通用户";
    slots[3].textContent = new Date(Number(regTime)).toLocaleString();
    slots[4].textContent = ban > 0 ? `${ban > new Date().getTime() ? "正在封禁中" : "曾被封禁"}，封禁持续至${new Date(ban).toLocaleString()}` : "没有被封禁过";
  }
  setAttributes({ nickName, id, role, regTime, banned }) {
    super.setAttributes({ nickName, id, role, regTime, banned });
  }
}
class QueryUserElem extends BaseElem {
  constructor() {
    super("#t-query-user");
  }
  render() {
    const [query, adminQuery] = this.getAllElem("button");
    const loadMoreBtn = document.createElement("button");
    loadMoreBtn.textContent = "查看更多";
    const container = this.getElem(".query-result-container");
    async function loadMore(after = 0) {
      const result = await lockBtn(loadMoreBtn, () => user.queryUsers(after, 10));
      if (result instanceof ErrorResponse) {
        return alert("查询用户失败。\n" + result.error);
      }
      if (result.length == 0) {
        return loadMoreBtn.remove();
      }
      for (let singleUser of result) {
        const card = document.createElement("y-user-info-card");
        card.setAttributes({ ...singleUser });
        container.append(card);
        loadMoreBtn.setAttribute("latest", singleUser.id);
      }
      container.append(loadMoreBtn);
    }
    query.addEventListener("click", async (e) => {
      const result = await lockBtn(e.target, () => User.queryUser(this.getElem("input").value));
      if (result instanceof ErrorResponse) {
        return alert("查询用户失败。\n" + result.error);
      }
      container.innerHTML = "";
      const card = document.createElement("y-user-info-card");
      card.setAttributes({ ...result });
      container.append(card);
    });
    loadMoreBtn.addEventListener("click", async (e) => await loadMore(loadMoreBtn.getAttribute("latest")));
    adminQuery.addEventListener("click", async (e) => {
      container.innerHTML = "";
      await lockBtn(adminQuery, () => loadMore());
    });
  }
}
class Render {
  static login() {
    appElem.append(document.createElement("y-login"), document.createElement("y-new-user"), document.createElement("y-reset-pass"), document.createElement("y-query-user"));
  }
  static async user(userInfo) {
    const elemList = [];
    const { profiles, role } = userInfo;
    const userElem = document.createElement("y-user-info");
    userElem.setAttributes({ ...userInfo });
    elemList.push(userElem);
    for (const profileId of profiles) {
      const profile = await user.getProfile(profileId);
      const profileElem = document.createElement("y-profile-info");
      profileElem.setAttributes({ ...profile });
      elemList.push(profileElem);
    }
    elemList.push(document.createElement("y-new-profile"), document.createElement("y-query-user"), document.createElement("y-rescue-code"), document.createElement("y-user-danger"));
    if (role == "admin") {
      const adminSettingsElem = document.createElement("y-admin-settings");
      const settings = await user.settings();
      adminSettingsElem.setAttributes({ ...settings });
      elemList.push(
        document.createElement("y-admin-ban-user"),
        document.createElement("y-admin-new-user"),
        document.createElement("y-admin-get-invite-code"),
        document.createElement("y-admin-query-logs"),
        adminSettingsElem
      );
    }
    appElem.append(...elemList);
  }
  static async header() {
    const headerElem = document.createElement("y-header");
    const settings = await User.settings();
    if (settings instanceof ErrorResponse) {
      return alert("获取服务器配置失败。\n" + result.error);
    }
    headerElem.setAttributes(settings);
    document.body.prepend(headerElem);
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
    appElem.innerHTML = "";
    const accessToken = localStorage.getItem("accessToken");
    const userId = localStorage.getItem("userId");
    if (!accessToken) {
      return Render.login();
    }
    if (!skipFresh) {
      const refresh = await User.refresh(accessToken, true);
      if (refresh instanceof ErrorResponse) {
        user.info();
        Render.login();
        return alert("登录凭证已过期，请重新登录。");
      }
      user.info(refresh.accessToken, refresh.uuid);
    } else {
      user.info(accessToken, userId);
    }
    const fullUserInfo = await user.getUserInfo(user.uuid);
    if (fullUserInfo instanceof ErrorResponse) {
      return alert("获取用户信息失败。\n" + fullUserInfo.error);
    }
    if (!fullUserInfo.username) {
      user.info();
      Render.login();
      return alert("登录凭证已过期，请重新登录。");
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
      return { error: userInfo, errorMessage: "" };
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
    console.log("Error:", err);
  } finally {
    btn.removeAttribute("disabled");
  }
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
  };
  for (let tag in list) {
    customElements.define(`${prefix}-${tag}`.toLocaleLowerCase(), list[tag]);
  }
})("y");

const broadcast = new Broadcast("Pages");
const appElem = document.querySelector(".app");
const user = new User();
try {
  let skipFresh = false;
  await Render.header();
  if ((await broadcast.message("hello?")).length > 0) {
    skipFresh = true;
  }
  User.init(skipFresh);
} catch (err) {
  document.title = "Error!!";
  const pre = document.createElement("pre");
  pre.innerHTML = "网页加载出错，错误堆栈如下：\n" + err.stack;
  appElem.append(pre);
}
broadcast.onmessage = function (e) {
  if (e.data == "hello?") {
    broadcast.postMessage("hi!");
  }
};
