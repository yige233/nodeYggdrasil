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

class Render {
  static login() {
    const loginElem = document.querySelector("#t-login").content.cloneNode(true);
    const [usernameLogin, passwordLogin] = loginElem.querySelectorAll("input");
    loginElem.querySelector("button").addEventListener("click", async (e) => {
      e.target.setAttribute("disabled", "disabled");
      const result = await User.login(usernameLogin.value, passwordLogin.value);
      e.target.removeAttribute("disabled");
      if (result instanceof ErrorResponse) {
        return alert("登录失败。\n" + result.error);
      }
      user.info(result.accessToken, result.uuid);
      alert("登录成功");
      return User.init(true);
    });
    const regElem = document.querySelector("#t-new-user").content.cloneNode(true);
    const [usernameReg, nickName, passwordReg, passwordAgainReg, inviteCode] = regElem.querySelectorAll("input");
    regElem.querySelector("button").addEventListener("click", async (e) => {
      if (passwordReg.value != passwordAgainReg.value) {
        return alert("两次输入的密码不一致");
      }
      e.target.setAttribute("disabled", "disabled");
      const result = await User.register({
        username: usernameReg.value,
        password: passwordReg.value,
        nickName: nickName.value,
        inviteCode: inviteCode.value,
      });
      e.target.removeAttribute("disabled");
      if (result[0].error) {
        return alert("注册失败。\n" + new ErrorResponse(result[0]).error);
      }
      alert("注册成功，现在可以登录了。");
    });
    const resetPassElem = document.querySelector("#t-reset-pass").content.cloneNode(true);
    const [usernameReset, rescueCode, passwordReset, passwordResetAgain] = resetPassElem.querySelectorAll("input");
    resetPassElem.querySelector("button").addEventListener("click", async (e) => {
      if (passwordReset.value != passwordResetAgain.value) {
        return alert("两次输入的密码不一致");
      }
      e.target.setAttribute("disabled", "disabled");
      const result = await User.resetPass(usernameReset.value, rescueCode.value, passwordReset.value);
      e.target.removeAttribute("disabled");
      if (result?.error) {
        return alert("重置密码失败。\n" + new ErrorResponse(result).error);
      }
      alert("密码重置成功。");
    });
    appElem.append(loginElem, regElem, resetPassElem);
  }
  static async user(userInfo) {
    const {
      profiles,
      username,
      nickName = username,
      role,
      regTime,
      regIP,
      extend: { inviteCode },
    } = userInfo;
    const userElem = document.querySelector("#t-user").content.cloneNode(true);
    const placeholder = userElem.querySelectorAll("strong");
    const [btnA, btnB, btnC] = userElem.querySelectorAll("button");
    const [newUsername, newNickName, newPassword, newPasswordAgain] = userElem.querySelectorAll("input");
    placeholder[0].innerText = role == "admin" ? "管理员" : "普通用户";
    placeholder[1].innerText = new Date(regTime).toLocaleString();
    placeholder[2].innerText = regIP;
    placeholder[3].innerText = username;
    placeholder[4].innerText = nickName;
    placeholder[5].innerText = inviteCode;
    btnA.addEventListener("click", async (e) => {
      if (newPassword.value != [newPasswordAgain.value]) {
        return alert("两次输入的密码不一致");
      }
      e.target.setAttribute("disabled", "disabled");
      const result = await user.editUserInfo({
        username: newUsername.value,
        password: newPassword.value,
        nickName: newNickName.value,
      });
      e.target.removeAttribute("disabled");
      if (result instanceof ErrorResponse) {
        return alert("修改个人信息失败。\n" + result.error);
      }
      alert("修改个人信息成功。");
    });
    btnB.addEventListener("click", async (e) => {
      user.logout().then(() => alert("已注销当前会话"));
    });
    btnC.addEventListener("click", async (e) => {
      if (!confirm("你真的要删除账户吗？")) {
        return;
      }
      e.target.setAttribute("disabled", "disabled");
      const result = await user.deleteUser();
      e.target.removeAttribute("disabled");
      if (result instanceof ErrorResponse) {
        return alert("删除用户失败。\n" + result.error);
      }
      alert("用户已经被删除。");
    });
    appElem.append(userElem);
    for (const profileId of profiles) {
      const profile = await user.getProfile(profileId);
      const profileElem = document.querySelector("#t-profile-info").content.cloneNode(true);
      const [newProfileName, profileCapeVisible, mojangProfileName, littleSkinTid, uploadFile] = profileElem.querySelectorAll("input");
      const [oprationType, deleteType, textureType] = profileElem.querySelectorAll("select");
      const placeholder = profileElem.querySelectorAll("strong");
      const { CAPE = null, SKIN = {} } = JSON.parse(Base64.decode(profile.properties[0].value)).textures;
      placeholder[0].innerText = profile.name;
      placeholder[1].append(SKIN.url ? Render.img(SKIN.url) : "无");
      placeholder[2].append(CAPE && CAPE.url ? Render.img(CAPE.url) : "无");
      profileElem.querySelectorAll("button")[0].addEventListener("click", async (e) => {
        e.target.setAttribute("disabled", "disabled");
        const result = await user.editProfile(profile.id, newProfileName.value, oprationType.value, {
          capeVisible: profileCapeVisible.checked,
          profileName: mojangProfileName.value,
          littleskinTid: littleSkinTid.value,
          type: deleteType.value,
        });
        e.target.removeAttribute("disabled");
        if (result instanceof ErrorResponse) {
          return alert("角色信息修改失败。\n" + result.error);
        }
        alert("角色信息修改成功。");
      });
      profileElem.querySelectorAll("button")[1].addEventListener("click", async (e) => {
        e.target.setAttribute("disabled", "disabled");
        const result = await user.uploadFile(profile.id, textureType.value, uploadFile.files || undefined);
        e.target.removeAttribute("disabled");
        if (result instanceof ErrorResponse) {
          return alert("材质上传失败。\n" + result.error);
        }
        alert("材质上传成功。");
      });
      profileElem.querySelectorAll("button")[2].addEventListener("click", async (e) => {
        if (!confirm("你真的要删除这个角色吗？")) {
          return;
        }
        e.target.setAttribute("disabled", "disabled");
        const result = await user.deleteProfile(profile.id);
        e.target.removeAttribute("disabled");
        if (result instanceof ErrorResponse) {
          return alert("删除角色失败。\n" + result.error);
        }
        alert("成功删除角色。");
      });
      appElem.append(profileElem);
    }
    const newProfileElem = document.querySelector("#t-new-profile").content.cloneNode(true);
    const [newProfileName, offlineCompatible] = newProfileElem.querySelectorAll("input");
    newProfileElem.querySelector("button").addEventListener("click", async (e) => {
      e.target.setAttribute("disabled", "disabled");
      const result = await user.newProfile(newProfileName.value, offlineCompatible.checked);
      e.target.removeAttribute("disabled");
      if (result instanceof ErrorResponse) {
        return alert("新建角色失败。\n" + result.error);
      }
      alert("新建角色成功，刷新页面以设置新的角色。");
    });
    appElem.append(newProfileElem);
    const getRescueCodeElem = document.querySelector("#t-get-rescue-code").content.cloneNode(true);
    getRescueCodeElem.querySelector("button").addEventListener("click", async (e) => {
      if (window.rescueCode) {
        return alert("你的救援代码是: " + window.rescueCode + " 。注意：刷新网页后，将无法再次显示救援代码。");
      }
      e.target.setAttribute("disabled", "disabled");
      const result = await user.getUserRescueCode();
      e.target.removeAttribute("disabled");
      if (result instanceof ErrorResponse) {
        return alert("获取救援代码失败。\n" + result.error);
      }
      window.rescueCode = result.rescueCode;
      alert("你的救援代码是: " + result.rescueCode + " 。注意：刷新网页后，将无法再次显示救援代码。");
    });
    appElem.append(getRescueCodeElem);
    if (role == "admin") {
      const adminBanUserElem = document.querySelector("#t-admin-ban-user").content.cloneNode(true);
      const adminNewUserElem = document.querySelector("#t-admin-new-user").content.cloneNode(true);
      const adminSettingsElem = document.querySelector("#t-admin-settings").content.cloneNode(true);
      const settings = await user.settings();
      const [targetToBan, duration] = adminBanUserElem.querySelectorAll("input");
      const [usercacheFile, suffix, inviteCode] = adminNewUserElem.querySelectorAll("input");
      const textarea = adminSettingsElem.querySelector("textarea");
      adminSettingsElem.querySelector("textarea").value = JSON.stringify(settings, null, 2);
      adminBanUserElem.querySelector("button").addEventListener("click", async (e) => {
        e.target.setAttribute("disabled", "disabled");
        const result = await user.ban(targetToBan.value, duration.value);
        e.target.removeAttribute("disabled");
        if (result instanceof ErrorResponse) {
          return alert("未能封禁用户。\n" + result.error);
        }
        alert(`已封禁用户：${result.nickName}\n预计解封时间：${new Date(result.banned).toLocaleString()}`);
      });
      adminNewUserElem.querySelector("button").addEventListener("click", async (e) => {
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
        e.target.setAttribute("disabled", "disabled");
        const result = await user.registerBatch(...list);
        e.target.removeAttribute("disabled");
        alert("即将打开批量注册的结果。");
        const blob = new Blob([JSON.stringify(result, null, 2)], {
          type: "application/json",
        });
        window.open(URL.createObjectURL(blob), "_blank");
      });
      adminSettingsElem.querySelector("button").addEventListener("click", async (e) => {
        e.target.setAttribute("disabled", "disabled");
        const result = await user.settings(JSON.parse(textarea.value));
        e.target.removeAttribute("disabled");
        if (result instanceof ErrorResponse) {
          return alert("修改服务器设置失败。\n" + result.error);
        }
        alert("已修改服务器设置。");
      });
      appElem.append(adminBanUserElem, adminNewUserElem, adminSettingsElem);
    }
  }
  static async header() {
    const headerElem = document.querySelector("#t-header").content.cloneNode(true);
    const settings = await User.settings();
    if (settings instanceof ErrorResponse) {
      return alert("获取服务器配置失败。\n" + result.error);
    }
    const yggdrasilAddr = settings.server.root + "yggdrasil";
    document.title = settings.server.name;
    headerElem.querySelector("#yggdrasil-addr").innerHTML = yggdrasilAddr;
    headerElem.querySelector("a#yggdrasil-protocol").href = "authlib-injector:yggdrasil-server:" + encodeURIComponent(yggdrasilAddr);
    headerElem.querySelector(".info").innerText = settings.pubExtend.headerInfo || "";
    document.body.prepend(headerElem);
  }
  static img(url) {
    const img = document.createElement("img");
    img.src = url;
    return img;
  }
}

class ErrorResponse {
  constructor(error) {
    this.error = `${error.error} : ${error.errorMessage}`;
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
    return request("./server/sessions", {
      method: "post",
      body: JSON.stringify({ accessToken, requestUser }),
    });
  }
  static login(username, password) {
    return request("./server/sessions", {
      method: "put",
      body: JSON.stringify({ username, password }),
    });
  }
  static register(data) {
    return request("./server/users", {
      method: "put",
      body: JSON.stringify([data]),
    });
  }
  static getProfiles(...profiles) {
    return request("./server/profiles", {
      method: "post",
      body: JSON.stringify(profiles),
    });
  }
  static settings() {
    return request("./server/settings");
  }
  static async resetPass(username, rescueCode, newPass) {
    const userInfo = await request("./server/users?user=" + username);
    if (userInfo instanceof ErrorResponse) {
      return { error: userInfo, errorMessage: "" };
    }
    const userId = userInfo.id;
    return request("./server/user/" + userId + "/password", {
      method: "post",
      body: JSON.stringify({ rescueCode, newPass }),
    });
  }
  logout() {
    return request("./server/sessions", {
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
    return request("./server/user/" + userId, {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
      method: "get",
    });
  }
  editUserInfo(data) {
    return request("./server/user/" + this.uuid, {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
      method: "patch",
      body: JSON.stringify(data),
    });
  }
  deleteUser() {
    return request("./server/user/" + this.uuid, {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
      method: "delete",
    });
  }
  getUserRescueCode() {
    return request("./server/user/" + this.uuid + "/rescueCode", {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
    });
  }
  getProfile(profile) {
    return request("./server/profile/" + profile);
  }
  editProfile(profile, name, type, data) {
    return request("./server/profile/" + profile, {
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
        "content-type": file[0].type,
        "x-skin-model": type == "slim" ? "slim" : "default",
      },
      method: "put",
      body: file[0],
    });
  }
  deleteProfile(profile) {
    return request("./server/profile/" + profile, {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
      method: "delete",
    });
  }
  newProfile(name, offlineCompatible) {
    return request("./server/profiles", {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
      method: "put",
      body: JSON.stringify({ name, offlineCompatible }),
    });
  }
  ban(target, duration) {
    return request("./server/bans", {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
      method: "put",
      body: JSON.stringify({ target, duration }),
    });
  }
  registerBatch(...data) {
    return request("./server/users", {
      headers: {
        Authorization: "Bearer " + this.accessToken,
      },
      method: "put",
      body: JSON.stringify(data),
    });
  }
  settings(data) {
    if (data) {
      return request("./server/settings", {
        headers: {
          Authorization: "Bearer " + this.accessToken,
        },
        method: "patch",
        body: JSON.stringify(data),
      });
    }
    return request("./server/settings", {
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
  const json = await result.json().catch(() => null);
  if (result.ok) {
    return json;
  }
  return new ErrorResponse(json);
}
const broadcast = new Broadcast("Pages");

const appElem = document.body.querySelector(".app");
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
