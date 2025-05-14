import "./skinview3d.bundle.js";
import "./prism.js";
import { Broadcast, API, html, Base64, ProxyObject, lockBtn, Dialog, debounce, scrollIntoView, Time } from "./utils.js";
import { foldElement, selectElement, addSectionFor, card, inputElement, inputGroup, buttonElement, searchInElement } from "./utils.js";

const broadcast = new Broadcast("yggdrasil");
const server = new API("");
const dialogBox = new Dialog("网页消息");
const serverConfig = ProxyObject.of({});
const userinfo = ProxyObject.of({});

const toHighlight = (el, inputText = el.textContent) => {
  const lang = [...el.classList].find((i) => i.startsWith("language"))?.slice(9) ?? "plain";
  const pharsed = document.createRange().createContextualFragment(Prism.highlight(inputText, Prism.languages[lang], lang));
  el.innerHTML = "";
  el.append(...pharsed.childNodes);
  return el;
};

const addSection = addSectionFor(document.querySelector(".main-content"), document.querySelector(".side-index"));
const eSpan = (...args) => html("span", ...args);
const eDiv = (...args) => html("div", ...args);
const eStrong = (...args) => html("strong", ...args);
const passLenTip = (el) => {
  serverConfig.on("r.user.passLenLimit", (val) => el.setAttribute("info", `长度需至少 ${val.detail} 位。`));
  return el;
};
const confirmBox = async (msg, confirmStr) => {
  const input = inputElement("text", { hidden: confirmStr ? undefined : true });
  input.addEventListener("input", () => input.setCustomValidity(""));
  return dialogBox.confirm(() => {
    if (confirmStr) {
      if (input.value == confirmStr) return true;
      input.setCustomValidity(`需要填写完整的 ${confirmStr} 。`);
      input.reportValidity();
      return false;
    }
    return true;
  })("请确认", typeof msg == "string" ? eSpan(msg) : msg, input);
};
function alignedItem(desc, attr = {}) {
  return (info) => {
    return (...extraElement) => eDiv({ info, ...attr }, eSpan({ class: "align-right" }, desc ?? ""), ...extraElement);
  };
}
function alignedCheckbox(desc, info, el) {
  return html("label", { info }, eSpan({ class: "align-right" }, desc), el, eSpan({ class: "checkable" }));
}
function headerSection() {
  const serverAddr = html("a", { target: "_blank" });
  const launcherProtocol = html("a", "也可以拖动此链接到支持的启动器。");
  const headerInfo = serverConfig.linkedTextNode("pubExtend.headerInfo", "");
  const serverJvm = html("pre", { class: "language-bash", style: "cursor: copy;" });
  const clientJvm = html("pre", { class: "language-bash", style: "cursor: copy;" });
  serverConfig.on("r.server.name", (e) => {
    document.title = e.detail;
    document.querySelector("span.brand").textContent = e.detail;
    document.querySelector("article.main-content > h1").textContent = e.detail;
    document.querySelector("meta[property='og:site_name']").setAttribute("content", e.detail);
  });
  serverConfig.on("r.server.homepage", (e) => {
    serverAddr.textContent = e.detail;
    serverAddr.href = e.detail;
  });
  serverConfig.on("r.server.root", (e) => {
    launcherProtocol.href = "authlib-injector:yggdrasil-server:" + encodeURIComponent(e.detail);
    const serverJvmText = `-Dminecraft.api.env=custom
-Dminecraft.api.auth.host=${e.detail}yggdrasil/authserver
-Dminecraft.api.account.host=${e.detail}yggdrasil
-Dminecraft.api.session.host=${e.detail}yggdrasil/sessionserver
-Dminecraft.api.services.host=${e.detail}yggdrasil/minecraftservices
`.trim();
    const clientJvmText = `-Dminecraft.api.session.host=${e.detail}yggdrasil/sessionserver
-Dminecraft.api.services.host=${e.detail}yggdrasil/minecraftservices
`.trim();
    toHighlight(serverJvm, serverJvmText);
    toHighlight(clientJvm, clientJvmText);
  });
  [serverJvm, clientJvm].forEach((i) =>
    i.addEventListener("click", () => {
      if (!navigator.clipboard) {
        return dialogBox.show("无法复制", "无法调用浏览器的剪贴板API。");
      }
      navigator.clipboard.writeText(i.textContent.replace(/\s/g, " "));
      dialogBox.show("复制成功", "参数已复制到剪贴板。");
    })
  );
  return addSection({
    id: "intro",
    name: () => userinfo.linkedTextNode("nickName", undefined, (nick) => (nick ? `欢迎你，${nick}` : "欢迎~")),
    desc: headerInfo,
    contentElem: [
      card(
        "配置外置登录",
        html("p", "外置登录认证服务器地址：", serverAddr),
        html("p", html("a", { href: "https://github.com/yushijinhun/authlib-injector", target: "_blank" }, "Authlib-Injector")),
        html("p", launcherProtocol),
        foldElement("服务端使用 jvm 参数配置外置登录", html("p", "在服务器启动命令中添加如下参数。点击文字可复制。"), serverJvm),
        foldElement("客户端（启动器）使用 jvm 参数配置外置登录", html("p", "添加以下 java 虚拟机参数。注意，是java 虚拟机参数（jvm 参数），而不是游戏参数。"), clientJvm)
      ),
    ],
  });
}
function loginSection(onLogin = () => undefined) {
  const input = inputGroup("object").template(
    { path: "username", valMissing: "请提供你的用户账号。", warp: alignedItem("用户账号")("也可以使用角色名称登录。") },
    { path: "password", valMissing: "请提供你的密码。", type: "password", warp: alignedItem("密码")() }
  );
  const btn = buttonElement("success", "登录", async () => {
    const { values, invalid } = input.getValues();
    if (invalid) return;
    const result = await lockBtn(btn)(server.login(values.username, values.password));
    if (result.error) {
      return dialogBox.show("登录失败", result.error);
    }
    onLogin(result.body);
  });
  return addSection({ id: "login", name: "登录", contentElem: [card("登录，以管理账号和角色。", ...input.elements, alignedItem()()(btn))] });
}
function registerSection(onLogin = async () => undefined) {
  const inputTemplate = [
    { path: "username", type: "email", valMissing: "请提供你的用户账号。", warp: alignedItem("用户账号")("邮箱格式。长度小于50个字符。") },
    { path: "nickName", warp: alignedItem("用户昵称")("长度小于50个字符。") },
    { path: "password", type: "password", valMissing: "请提供你的密码。", warp: (el) => passLenTip(alignedItem("密码")()(el)) },
    { path: "passwordAgain", type: "password", warp: alignedItem("重复密码")() },
    { path: "inviteCode", valMissing: "请提供一个邀请码。", warp: alignedItem("邀请码")("请向已经拥有账号的好友索要，或者询问管理员。") },
  ];
  const inputs = inputGroup("object")
    .template(...inputTemplate)
    .validator(({ password, passwordAgain }) => {
      if (password.val.length < serverConfig.data.user.passLenLimit) password.error("提供的密码长度太短。");
      if (password.val != passwordAgain.val) passwordAgain.error("两次密码输入不一致。");
    });
  const btn = buttonElement("success", "注册", async () => {
    const {
      values: { username, nickName, password, inviteCode },
      invalid,
    } = inputs.getValues();
    if (invalid) return;
    const result = await lockBtn(btn)(server.register(username, password, inviteCode, nickName));
    if (result.error) {
      return dialogBox.show("注册失败", result.error);
    }
    if (result.body[0]?.error) {
      return dialogBox.show("注册失败", `${result.body[0].error}: ${result.body[0].errorMessage}`);
    }
    const loginRresult = await lockBtn(btn)(server.login(username, password));
    if (loginRresult.error) {
      return dialogBox.show("登录失败", loginRresult.error);
    }
    await onLogin(loginRresult.body);
    scrollIntoView("#intro");
  });
  return addSection({ id: "register", name: "注册", contentElem: [card("注册一个账号，以使用yggdrasil外置登录。", ...inputs.elements, alignedItem()()(btn))] });
}
function resetPassSection() {
  const inputs = inputGroup("object")
    .add("username", { valMissing: "请提供你的用户账号。" }, alignedItem("用户账号")("邮箱格式的账号，或者是用户的uuid。"))
    .add("rescueCode", { valMissing: "请提供你的救援代码。" }, alignedItem("救援代码")("要找回的账户所生成的救援代码。如果该账户此前从未生成过救援代码，则无法找回密码。"))
    .add("password", { el: "password", valMissing: "请提供一个新的密码。" }, (el) => passLenTip(alignedItem("新密码")()(el)))
    .add("passwordAgain", { el: "password" }, alignedItem("重复密码")())
    .validator(({ password, passwordAgain }) => {
      if (password.val) {
        if (password.val.length < serverConfig.data.user.passLenLimit) password.error("提供的密码长度太短。");
        if (password.val !== passwordAgain.val) passwordAgain.error("两次输入的密码不一致。");
      }
    });
  const btn = buttonElement("success", "确定", async () => {
    const {
      values: { username, rescueCode, password },
      invalid,
    } = inputs.getValues();
    if (invalid) return;
    const findUser = await lockBtn(btn)(server.queryUser(username));
    if (findUser.error) {
      return dialogBox.show("查找用户失败", findUser.error);
    }
    const result = await lockBtn(btn)(server.resetPass(findUser.body.id, rescueCode, password));
    if (result.error) {
      return dialogBox.show("重置密码失败", result.error);
    }
    return dialogBox.show("密码重置成功", undefined);
  });
  return addSection({
    id: "reset-password",
    name: "重置密码",
    contentElem: [card("如果忘记了密码，可以在这里重置密码。", ...inputs.elements, alignedItem()()(btn))],
  });
}
function userInfoSection() {
  const role = userinfo.linkedTextNode("role", "user", (role) => (role == "admin" ? "管理员" : "普通用户"));
  const regTime = userinfo.linkedTextNode("regTime", 0, (time) => new Date(Number(time)).toLocaleString());
  const regIP = userinfo.linkedTextNode("regIP");
  const username = userinfo.linkedTextNode("username");
  const userId = userinfo.linkedTextNode("id");
  const nickName = userinfo.linkedTextNode("nickName");
  const remainingInviteCodeCount = userinfo.linkedTextNode("remainingInviteCodeCount");
  const maxProfileCount = userinfo.linkedTextNode("maxProfileCount");

  const inputs = inputGroup("object")
    .add("username", { el: "email", attr: { maxLength: 60 } }, alignedItem("新用户名")("使用邮箱格式，不长于60个字符。"))
    .add("nickName", { attr: { maxLength: 30 } }, alignedItem("新用户昵称")("不长于30个字符。"))
    .add("password", { el: "password" }, (el) => passLenTip(alignedItem("新密码")()(el)))
    .add("passwordAgain", { el: "password" }, alignedItem("重复密码")())
    .validator(({ username, password, passwordAgain }) => {
      if (username.val && !serverConfig.data.user.changeUserName) username.error("服务端已禁用修改用户名。");
      if (password.val) {
        if (password.val.length < serverConfig.data.user.passLenLimit) password.error("提供的密码长度太短。");
        if (password.val != passwordAgain.val) passwordAgain.error("两次输入的密码不一致。");
      }
    });
  const btnEdit = buttonElement(undefined, "修改", async () => {
    const {
      values: { username, nickName, password },
      invalid,
    } = inputs.getValues();
    if (invalid) return;
    const result = await lockBtn(btnEdit)(server.editUserInfo(username, password, nickName));
    if (result.error) {
      return dialogBox.show("个人信息修改失败", result.error);
    }
    userinfo.assign(result.body);
  });
  const btnSignOut = buttonElement("warning", "注销登录会话", async () => {
    await lockBtn(btnSignOut)(server.logout());
    server.localData();
    ["ok", "cancel"].map((i) => dialogBox.on(i, () => window.location.reload()));
    dialogBox.show("操作成功", "已注销当前会话。关闭对话框即可刷新网页。");
  });
  return addSection({
    id: "user-info",
    name: "用户信息",
    desc: "在此处查看或编辑用户的信息。",
    contentElem: [
      card(
        "查看信息",
        alignedItem("用户名")()("：", eStrong(username)),
        alignedItem("用户昵称")()("：", eStrong(nickName)),
        alignedItem("用户UID")()("：", eStrong(userId)),
        alignedItem("用户身份")()("：", eStrong(role)),
        alignedItem("用户注册IP")()("：", eStrong(regIP)),
        alignedItem("用户注册时间")()("：", eStrong(regTime)),
        alignedItem("可持有角色数")()("：", eStrong(maxProfileCount)),
        alignedItem("剩余邀请码", { info: "剩余可申请的邀请码数量" })()("：", eStrong(remainingInviteCodeCount))
      ),
      card("编辑信息", html("p", "不需要编辑的项目留空即可。"), ...inputs.elements, alignedItem()()(btnEdit)),
      card("注销登录会话", alignedItem()()(btnSignOut)),
    ],
  });
}
function profileSection(profileId) {
  function findHash(str) {
    const expHash = /[0-9a-f]{64}/i;
    const expBase64 = /(?<=value:").*?(?=")/i;
    if (expHash.test(str)) {
      return str.match(expHash)[0];
    }
    if (expBase64.test(str)) {
      const matched = str.match(expBase64)[0];
      if (!matched.startsWith("e3")) return undefined;
      const decoded = Base64.decode(matched);
      if (expHash.test(decoded)) {
        return decoded.match(expHash)[0];
      }
    }
    return undefined;
  }
  function skinPreviewer(canvas, capeControl, noSkin) {
    let order = 1;
    const animations = [new skinview3d.IdleAnimation(), new skinview3d.IdleAnimation(), new skinview3d.WalkingAnimation(), new skinview3d.RunningAnimation(), new skinview3d.FlyingAnimation(), null];
    const viewer = new skinview3d.SkinViewer({ zoom: 0.8, height: 500, canvas: canvas, width: window.innerWidth > 500 ? 500 : window.innerWidth * 0.7, animation: animations[0] });
    canvas.style = "display:block; margin: 0 auto;";
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      viewer.animation = animations[order];
      order++;
      if (order == animations.length) order = 0;
    });
    canvas.addEventListener("touchmove", (e) => e.preventDefault());
    return {
      cape: "",
      changeCape(cape, isElytra) {
        if (!cape) {
          return viewer.loadCape(null);
        }
        return viewer.loadCape(cape, isElytra ? { backEquipment: "elytra" } : undefined);
      },
      async load(name, skin, cape, model) {
        canvas.style.display = skin ? "block" : "none";
        capeControl.display = skin ? "block" : "none";
        if (!skin) {
          noSkin.textContent = "没有设置皮肤";
          return;
        }
        viewer.nameTag = name;
        await viewer.loadSkin(skin, { model });
        if (cape) {
          this.cape = cape;
          await viewer.loadCape(cape);
        } else {
          this.cape = undefined;
          await viewer.loadCape(null);
        }
      },
    };
  }
  function applyResult(result) {
    if (result.error) {
      return dialogBox.show("角色信息修改失败", result.error);
    }
    profileInfo.assign(result.body);
  }
  function cardInfoDisplay() {
    const canvas = html("canvas", { style: "user-select: none;" });
    const noSkin = html("strong");
    const capeControl = selectElement({ cape: "显示披风", elytra: "显示鞘翅", off: "不显示披风和鞘翅" }, {}, (val) =>
      val == "off" ? previewer.changeCape(null) : previewer.changeCape(previewer.cape, val == "elytra")
    );
    const previewer = skinPreviewer(canvas, capeControl, noSkin);
    profileInfo.on("r.properties", () => {
      const { name, properties = [] } = profileInfo.data;
      const textureData = properties.find((i) => i.name == "textures");
      if (textureData) {
        try {
          const data = JSON.parse(Base64.decode(textureData.value));
          const { CAPE = {}, SKIN = {} } = data.textures;
          debounce(previewer.load(name, SKIN.url, CAPE.url, SKIN.metadata?.model), 1000);
        } catch (e) {
          console.error("解析角色材质失败:", e);
        }
      }
    });
    return card(
      "角色属性",
      alignedItem("角色名称")()("：", eStrong(profileInfo.linkedTextNode("name"))),
      alignedItem("角色UUID")()("：", eStrong(profileId)),
      alignedItem("角色预览")("鼠标右击或长按可切换角色动画")("：", noSkin, capeControl),
      eDiv(canvas)
    );
  }
  function cardModifyInfo() {
    const authorizeURL =
      "https://login.live.com/oauth20_authorize.srf?client_id=00000000402b5328&response_type=code&scope=service%3A%3Auser.auth.xboxlive.com%3A%3AMBI_SSL&redirect_uri=https%3A%2F%2Flogin.live.com%2Foauth20_desktop.srf";
    const about = foldElement(
      "什么是“绑定微软账号”",
      html(
        "p",
        "基岩版玩家可借助配置了authlib-injector的Geyser（间歇泉）游玩Java版MC服务器。然而Geyser现在只支持微软账号登录了。所幸authlib-injector也能劫持Geyser验证微软账户是否拥有Minecraft的请求。"
      ),
      html(
        "p",
        "客户端在登录微软账号后，会向Geyser发送身份验证的信息，其中包含了一个唯一且不变的“用户ID”。在authlib-injector的作用下，Geyser向我们的验证服务器询问“该用户是否拥有Minecraft”，验证服务器则检索是否存在绑定了该用户ID的角色，并返回对应角色的信息，完成登录。"
      ),
      html(
        "p",
        "因此这里的“绑定”，实质上是提前获知你的微软账户的“用户ID”，并将其关联到指定的角色。这是一种单向的绑定。验证服务器不会保存除了“用户ID”以外的任何信息。该“用户ID”不是邮箱或者用户名，无法仅通过该ID找到你的微软账户。"
      ),
      html(
        "p",
        "打开",
        html("a", { href: authorizeURL, target: "_blank" }, "这个链接"),
        "并登录你的微软账号。登录成功后，网页会跳转至一个空白页面。检查页面的链接，如果链接是下面的样子：",
        toHighlight(html("pre", { class: "language-http" }, "https://login.live.com/oauth20_desktop.srf?code=xxxxx")),
        "那么复制该链接，并将其填到上面的输入框中即可。绑定操作并不需要你登录的微软账号拥有Minecraft。"
      )
    );
    const inputs = inputGroup("object")
      .add("newName", {}, alignedItem("新角色名")("该操作会使所有绑定到该角色的会话进入暂时失效状态。"))
      .add("model", { el: "select", options: { none: "不作修改", default: "steve模型（粗手臂）", slim: "alex模型（细手臂）" } }, alignedItem("角色皮肤模型")())
      .add("capeVisible", { el: "select", options: { none: "不作修改", true: "显示披风", false: "不显示披风" } }, alignedItem("披风的可见性")("不会导致服务器上的披风材质被删除。"))
      .add("unbind", { el: "checkbox" }, (el) => alignedCheckbox("解除与微软账号的绑定", undefined, el))
      .add("authCode", {}, alignedItem("微软账号授权码")("想要绑定至该角色的微软账号的授权码。如果同时勾选了“解除绑定”，会先进行解绑，然后绑定新的账户。"))
      .validator(({ authCode }) => {
        if (authCode.val) {
          try {
            const url = new URL(authCode.val);
            if (!url.searchParams.get("code")) throw undefined;
          } catch {
            return authCode.error("请提供一个包含了授权码的URL。");
          }
        }
      });
    const btn = buttonElement(undefined, "确认", async () => {
      const {
        values: { newName, model, capeVisible, unbind, authCode },
        invalid,
      } = inputs.getValues();
      if (invalid) return;
      const result = await lockBtn(btn)(
        server.editProfile(profileId, {
          name: newName || undefined,
          model: ["default", "slim"].includes(model) ? model : undefined,
          MSAuthCode: authCode ? new URL(authCode).searchParams.get("code") : undefined,
          capeVisible: capeVisible == "true" ? true : capeVisible == "false" ? false : undefined,
          unlinkMSAccount: unbind || undefined,
        })
      );
      applyResult(result);
    });
    return card("修改角色属性", ...inputs.elements, about, alignedItem()()(btn));
  }
  function cardImportTexture() {
    const exampleCommand = `/give @p minecraft:player_head[profile={id:[I;-226198466,1042830577,-1635483774,1098862885],properties:[{name:"textures",value:"e3RleHR1cmVzOntTS0lOOnt1cmw6Imh0dHA6Ly90ZXh0dXJlcy5taW5lY3JhZnQubmV0L3RleHR1cmUvMmJmMmZmNzYxNjI3NzQzMmMyMTZhYWIyY2EwMjA4ZjM5ODZlNTA5YTBkM2RmMTNmOTllODMxZjc3Yjk4OWRiNyJ9fX0="}]},minecraft:lore=['{"text":"https://namemc.com/skin/3d4991f24ccef7c3"}']]`;
    const exampleURL = "https://littleskin.cn/skinlib/show/2713";
    const methodSelect = selectElement({
      copyFromOfficial: "从官方角色获取皮肤和披风",
      importFromOfficialURL: "从官方材质URL设置皮肤",
      importFromLittleskin: "从littleSkin皮肤站获取材质",
    });
    const inputM1 = inputGroup().add("profileName", { valMissing: "请提供一个正版用户名。" }, alignedItem("正版角色名称")("可以完全复制一位正版用户的角色形象，包括皮肤和披风。"));
    const inputM2 = inputGroup()
      .add(
        "mojangSkinType",
        { el: "select", options: { default: "皮肤/默认模型(steve)", slim: "皮肤/细手臂模型(alex)", cape: "披风" } },
        alignedItem("材质的类型")("这里无法自动判断材质类型，因此需要手动指定。")
      )
      .add("officialSkinURLData", {}, alignedItem("官方材质URL")("也可填入包含材质信息的头颅获取命令。"))
      .validator((_mojangSkinType, officialSkinURLData) => {
        if (!findHash(officialSkinURLData.val)) officialSkinURLData.error("请提供一个有效的材质URL或头颅命令。");
      });
    const inputM3 = inputGroup().add("littleSkinTid", { el: "number", attr: { step: 1, min: 0 }, valMissing: "请提供一个LittleSkin材质ID。" }, alignedItem("材质ID")());
    const containerM1 = eDiv({ keywords: "copyFromOfficial", class: "import-texture-form" }, ...inputM1.elements);
    const containerM2 = html(
      "div",
      { keywords: "importFromOfficialURL", style: "display:none;", class: "import-texture-form" },
      ...inputM2.elements,
      foldElement(
        "关于头颅命令",
        html("p", "头颅命令中需要包含一串以“e3”开头的长长的乱码数据，可以在这样的头颅命令中找到皮肤的URL。例如："),
        toHighlight(html("pre", { class: "language-shell" }, exampleCommand))
      )
    );
    const containerM3 = html(
      "div",
      {
        keywords: "importFromLittleskin",
        style: "display:none;",
        class: "import-texture-form",
      },
      ...inputM3.elements,
      foldElement(
        "什么是“材质ID”",
        html("p", "“材质ID”指的是littleSkin皮肤站的材质页面url结尾的那串数字。例如：", toHighlight(html("pre", { class: "language-http" }, exampleURL)), "则其材质ID为2713。需要材质公开可见。")
      )
    );
    const btn = buttonElement(undefined, "确认", async () => {
      const type = methodSelect.value;
      const inputs = type == "copyFromOfficial" ? inputM1 : type == "importFromOfficialURL" ? inputM2 : type == "importFromLittleskin" ? inputM3 : undefined;
      const { values, invalid } = inputs.getValues();
      if (invalid) return;
      const [profileName] = type == "copyFromOfficial" ? values : [];
      const [mojangSkinType, officialSkinURLData] = type == "importFromOfficialURL" ? values : [];
      const [littleSkinTid] = type == "importFromLittleskin" ? values : [];
      const result = await lockBtn(btn)(
        server.editTexture(profileId, type, {
          profileName: profileName || undefined,
          littleskinTid: littleSkinTid || undefined,
          officialSkinInfo: type == "importFromOfficialURL" ? { textureType: mojangSkinType || undefined, hash: findHash(officialSkinURLData) } : undefined,
        })
      );
      applyResult(result);
    });
    methodSelect.addEventListener("change", () => searchInElement([containerM1, containerM2, containerM3], methodSelect.value));
    return card("导入材质", alignedItem("如何导入材质")()(methodSelect), containerM1, containerM2, containerM3, alignedItem()()(btn));
  }
  function cardUploadTexture() {
    const inputs = inputGroup("object")
      .add("model", { el: "select", options: { default: "皮肤/默认模型(steve)", slim: "皮肤/细手臂模型(alex)", cape: "披风" } }, alignedItem("材质类型")())
      .add(
        "files",
        { el: "file", attr: { accept: "image/png" }, valMissing: "请提供一个材质文件。" },
        alignedItem("选择材质文件")("仅可选择png格式的文件，并且尺寸（单位：像素）要求在64×32、64×64，或者22×17（仅披风）。")
      )
      .validator(({ files }) => {
        if (!files.val[0].type.startsWith("image/png")) files.error("提供的材质文件不是png格式。");
      });
    const btn = buttonElement(undefined, "确认", async () => {
      const {
        values: { model, files },
        invalid,
      } = inputs.getValues();
      if (invalid) return;
      const uploadResult = await lockBtn(btn)(server.uploadTexture(profileId, model, files[0]));
      if (uploadResult.error) {
        return dialogBox.show("上传材质失败", uploadResult.error);
      }
      const result = await lockBtn(btn)(server.getProfile(profileId));
      applyResult(result);
    });
    return card("上传材质", html("p", "不同于上面的导入材质，这里提供了从本机上传材质的入口。"), ...inputs.elements, alignedItem()()(btn));
  }
  function cardDeleteTexture() {
    const deleteTypes = { skin: "皮肤", cape: "披风", all: "全部材质" };
    const input = inputGroup().add("deleteType", { el: "select", options: deleteTypes }, alignedItem("我想删除")());
    const btn = buttonElement("warning", "确认", async () => {
      const { values } = input.getValues();
      const confirm = await confirmBox(eSpan(`你真的要删除该角色的 `, eSpan({ style: "color:red;" }, deleteTypes[values[0]]), ` 吗？`));
      if (!confirm) return;
      const deleteResult = await lockBtn(btn)(server.deleteTexture(profileId, values[0]));
      if (deleteResult.error) {
        return dialogBox.show("删除材质失败", deleteResult.error);
      }
      const result = await lockBtn(btn)(server.getProfile(profileId));
      applyResult(result);
    });
    return card("删除材质", html("p", "删除指定的材质。如果该材质是存储于服务器上的，且未被任何角色使用，那么会被从服务器上删除。"), ...input.elements, alignedItem()()(btn));
  }
  function cardDeleteProfile(profileSectionElem) {
    const btn = buttonElement("error", "删除角色", async () => {
      const userConfirm = await confirmBox(deleteProfileMsg, profileInfo.data.name);
      if (!userConfirm) return;
      const deleteResult = await lockBtn(btn)(server.deleteProfile(profileId));
      if (deleteResult.error) {
        return dialogBox.show("删除材质失败", deleteResult.error);
      }
      profileSectionElem.remove();
      scrollIntoView("#new-profile");
    });
    return card("删除角色", html("p", "永久删除角色，包括设置的皮肤披风。删除后，该角色就可以被其他人注册了。"), eDiv(alignedItem()()(btn)));
  }

  const profileInfo = ProxyObject.of({});
  const profileName = () => profileInfo.linkedTextNode("name", "Steve", (name) => `角色：${name}`);
  const profileDesc = profileInfo.linkedTextNode("name", "Steve", (name) => `在此处可以查看和编辑角色 ${name} 的属性。`);
  const nameNode = () => eSpan({ style: "color:red;" }, profileInfo.linkedTextNode("name"));
  const deleteProfileMsg = eSpan("你真的要删除角色 ", nameNode(), " 吗？\n请在下方输入 ", nameNode(), " 以继续操作。");

  server.getProfile(profileId).then((res) => profileInfo.assign(res.body));
  const profileSectionElem = addSection({ id: "profile-" + profileId, name: profileName, desc: profileDesc, contentElem: [] });
  profileSectionElem.append(cardInfoDisplay(), cardModifyInfo(), cardImportTexture(), cardUploadTexture(), cardDeleteTexture(), cardDeleteProfile(profileSectionElem));
  return profileSectionElem;
}
function newProfileSection() {
  const offlineCompatibleInfo = "勾选后，创建的角色的UUID将会采用和离线验证相同的计算方式。如果一个离线验证的服务器计划迁移到外置验证，那么勾选本项，可以使游戏内角色数据仍然保留（前提是ID一致）。";
  const inputs = inputGroup()
    .add(
      "name",
      { valMissing: "请提供一个角色名称。", attr: { maxLength: 30, pattern: "^[_A-Za-z0-9\\u4e00-\\u9fa5]+$", title: "角色名称只能包含字母、数字、下划线、汉字。" } },
      alignedItem("角色名称")("也就是游戏内ID。最长30位，可以使用汉字，但如果验证服务端设置了严格的名称检查，汉字名称可能会导致无法启动游戏。")
    )
    .add("offlineCompatible", { el: "checkbox" }, (el) => alignedCheckbox("兼容离线验证", offlineCompatibleInfo, el));
  const btn = buttonElement(undefined, "创建角色", async () => {
    const {
      values: [name, offlineCompatible],
      invalid,
    } = inputs.getValues();
    if (invalid) return;
    const result = await lockBtn(btn)(server.newProfile(name, offlineCompatible));
    if (result.error) {
      return dialogBox.show("新建角色失败", result.error);
    }
    const newSectionElem = profileSection(result.body.id);
    ["sideElem", "mainElem"].forEach((key) => newProfileSectionElem[key].before(newSectionElem[key]));
    scrollIntoView("#profile-" + result.body.id);
  });
  const newProfileSectionElem = addSection({
    id: "new-profile",
    name: "创建新角色",
    contentElem: [card("创建新角色", ...inputs.elements, alignedItem()()(btn))],
  });
}
function userInfoCard(result) {
  const banDesc = result.banned > 0 ? `${result.banned > new Date().getTime() ? "正在封禁中" : "曾被封禁"}，封禁持续至${new Date(result.banned).toLocaleString()}` : "没有被封禁过";
  return html(
    "div",
    alignedItem("用户：")()(eStrong(result.id)),
    alignedItem("昵称：")()(eStrong(result.nickName)),
    alignedItem("身份：")()(eStrong(result.role == "admin" ? "管理员" : "普通用户")),
    alignedItem("注册时间：")()(eStrong(new Date(result.regTime).toLocaleString())),
    alignedItem("封禁状态：")()(eStrong(banDesc))
  );
}
function queryUserSection() {
  async function loadMore(after = 0) {
    const result = await lockBtn(btnLoadMore)(server.queryUsers(after, 10));
    if (result.error) {
      return dialogBox.show("查询用户失败", result.error);
    }
    if (result.body.length == 0) {
      return btnLoadMore.remove();
    }
    for (const singleUser of result.body) {
      container.append(userInfoCard(singleUser));
      btnLoadMore.setAttribute("latest", singleUser.id);
    }
    container.append(btnLoadMore);
  }
  const btnLoadMore = buttonElement(undefined, "查看更多", () => lockBtn(btnLoadMore)(loadMore(btnLoadMore.getAttribute("latest"))));
  const container = eDiv({ class: "card-container" });
  const btnQuery = buttonElement(undefined, "查询", async () => {
    const {
      values: [username],
      invalid,
    } = inputs.getValues();
    if (invalid) return;
    const result = await lockBtn(btnQuery)(server.queryUser(username));
    if (result.error) {
      return dialogBox.show("查询用户失败", result.error);
    }
    container.innerHTML = "";
    container.append(userInfoCard(result.body));
  });
  const btnAdminQuery = alignedItem(undefined, { style: `display:${userinfo.data.role == "admin" ? "block" : "none"}` })("管理员限定")(
    buttonElement(undefined, "查看所有用户", () => {
      container.innerHTML = "";
      lockBtn(btnAdminQuery)(loadMore());
    })
  );
  userinfo.on("r.role", (e) => (btnAdminQuery.style.display = e.detail == "admin" ? "block" : "none"));
  const inputs = inputGroup().add("username", { valMissing: "请提供一个想要查询的用户名。" }, (el) => alignedItem("要查询的用户")()(el, btnQuery));
  return addSection({
    id: "query-user",
    name: "查询用户信息",
    desc: "通过用户的id、邮箱或者角色uuid查询用户的一些基本信息",
    contentElem: [card("查询用户信息", ...inputs.elements, btnAdminQuery, container)],
  });
}
function rescueSection() {
  let rescueCode;
  const btn = buttonElement("warning", "获取救援代码", async () => {
    function showCode() {
      if (navigator.clipboard) navigator.clipboard.writeText(rescueCode);
      return dialogBox.show(
        "以下是你的救援代码",
        html("p", { style: "text-align:center;font-size: 2em;margin: 0;padding: 0;" }, rescueCode),
        navigator.clipboard && "代码已复制到剪贴板。",
        "注意：刷新网页后，将无法再次显示救援代码。"
      );
    }
    if (rescueCode) {
      return showCode();
    }
    const result = await lockBtn(btn)(server.getUserRescueCode());
    if (result.error) {
      return dialogBox.show("获取救援代码失败", result.error);
    }
    rescueCode = result.body.rescueCode;
    showCode();
  });
  return addSection({
    id: "rescue",
    name: "获取救援代码",
    desc: "如果日后忘记密码，可以使用这里生成的救援代码重置密码。若账号从未生成过救援代码，则无法通过网页自助找回密码。救援代码只会显示一次，应妥善保存。",
    contentElem: [card("获取本账户的救援代码", alignedItem()()(btn))],
  });
}
function issueInviteCodeSection() {
  let rescueCode;
  const btn = buttonElement("warning", "申请邀请码", async () => {
    return;
    function showCode() {
      if (navigator.clipboard) navigator.clipboard.writeText(rescueCode);
      return dialogBox.show(
        "以下是你的救援代码",
        html("p", { style: "text-align:center;font-size: 2em;margin: 0;padding: 0;" }, rescueCode),
        navigator.clipboard && "代码已复制到剪贴板。",
        "注意：刷新网页后，将无法再次显示救援代码。"
      );
    }
    if (rescueCode) {
      return showCode();
    }
    const result = await lockBtn(btn)(server.issueInviteCode());
    if (result.error) {
      return dialogBox.show("获取救援代码失败", result.error);
    }
    rescueCode = result.body.rescueCode;
    showCode();
  });
  return addSection({
    id: "issue-invite-code",
    name: "申请邀请码(未完成)",
    desc: "申请一个邀请码，可用于新用户注册。邀请码具有30分钟有效期，申请后无论使用与否都会消耗剩余可申请次数，请按需申请。",
    contentElem: [card("申请邀请码", alignedItem()()(btn))],
  });
}
function dangerOpSection() {
  const execOperation = async (confirmMsg, bindBtn, applyingFunc) => {
    const confirmSpan = eSpan(confirmMsg, " \n请在下方输入 ", eSpan({ style: "color:red;" }, userinfo.data.username), " 以继续操作。");
    if (!(await confirmBox(confirmSpan, userinfo.data.username))) {
      return;
    }
    const {
      values: { username, password },
      invalid,
    } = inputs.getValues();
    if (invalid) return;
    const result = await lockBtn(bindBtn)(applyingFunc(username, password));
    if (result.error) {
      return dialogBox.show("操作失败", result.error);
    }
    return dialogBox.show("操作成功");
  };
  const inputs = inputGroup("object")
    .add("username", { valMissing: "请提供你的用户名。" }, alignedItem("用户账号")("危险操作需要提供账号。"))
    .add("password", { el: "password", valMissing: "请提供你的密码。" }, alignedItem("密码")("危险操作需要提供密码。"))
    .add("passwordAgain", { el: "password" }, alignedItem("重复密码")())
    .validator(({ password, passwordAgain }) => {
      if (password.val != passwordAgain.val) passwordAgain.error("两次输入的密码不一致。");
    });
  const btnSignoutAll = buttonElement("warning", "注销所有登录会话", () => execOperation("你确定要注销所有登录会话吗？", btnSignoutAll, server.logoutAll.bind(server)));
  const btnLockUser = buttonElement("error", "永久锁定账户", () => execOperation("你确定要永久锁定这个账户吗？？", btnLockUser, server.lockUser.bind(server)));
  const btnDeleteUser = buttonElement("error", "永久删除账户", () => execOperation("你确定要永久删除这个账户吗？？？", btnDeleteUser, server.deleteUser.bind(server)));
  return addSection({
    id: "danger-op",
    name: "⚠️危险操作⚠️",
    desc: "下面的操作十分危险，会导致账户永久消失（包括角色），或是永久性地无法修改任何账户相关内容。",
    contentElem: [
      card(
        "进行危险操作",
        ...inputs.elements,
        alignedItem()()(btnSignoutAll),
        alignedItem()("无法增删以及修改角色，包括角色名称、皮肤、披风和披风可见性；不能修改用户名、用户昵称和登录密码；不能找回密码；不能申请邀请码；不能查看救援代码。")(btnLockUser),
        alignedItem()("永久删除账户，包括该账户拥有的角色。")(btnDeleteUser)
      ),
    ],
  });
}
function adminSwitchSection(isEnter) {
  const desplayText = isEnter ? { title: "进入管理员页面", desc: "可以做一些只有管理员才能做的事情？" } : { title: "回到用户页面", desc: "似乎当个普通用户也不错？" };
  const btn = buttonElement("warning", desplayText.title, () => {
    if (!(userinfo.data.role == "admin")) {
      return dialogBox.show("你没有管理员权限。");
    }
    location.search = isEnter ? "?mode=admin" : "";
  });
  return addSection({
    id: "admin-switch",
    name: desplayText.title,
    desc: desplayText.desc,
    contentElem: [card(undefined, alignedItem()()(btn))],
  });
}
function banUserSection() {
  const inputs = inputGroup("object").template(
    { path: "target", valMissing: "请提供要封禁的用户账户。", warp: alignedItem("用户账户")("可以是用户UUID、角色UUID或角色名称。") },
    { path: "duration", type: "time", valMissing: "请提供封禁时长。", warp: alignedItem("封禁时长")("使用d(天), h(小时), m(分钟), s(秒), ms(毫秒) 作为时间单位。") }
  );
  const btn = buttonElement("warning", "确认", async () => {
    const {
      values: { target, duration },
      invalid,
    } = inputs.getValues();
    if (invalid) return;
    const result = await lockBtn(btn)(server.ban(target, Time.parse(duration)));
    if (result.error) {
      return dialogBox.show("未能封禁用户", result.error);
    }
    dialogBox.show(`已封禁用户：${result.body.nickName}`, `预计解封时间：${new Date(result.body.banned).toLocaleString()}`);
  });
  return addSection({
    id: "ban-user",
    name: "封禁用户",
    desc: "禁止一位用户登录，解封结束于当前时间+封禁时长。多次封禁时长不叠加。将封禁时长设为极短时长，即可视为解封用户。封禁会强制注销该用户的所有会话。被封禁期间，无法登录、无法删除用户，也不能使用该用户的邀请码注册新用户。",
    contentElem: [card("封禁用户", ...inputs.elements, alignedItem()()(btn))],
  });
}
function userCacheInfoCard(proxied, name) {
  const username = proxied.linkedTextNode(`${name}.username`);
  const password = proxied.linkedTextNode(`${name}.password`, proxied.data[name].username);
  const statusText = proxied.linkedTextNode(`${name}.status`, proxied.data[name].username);
  const removeBtn = buttonElement(undefined, "移除", () => delete proxied.data[name]);
  return eDiv({ id: name }, eDiv(eSpan("账户名称："), eStrong(username)), eDiv(eSpan("账户密码："), eStrong(password)), eDiv(eSpan("状态："), eStrong(statusText)), eDiv(removeBtn));
}
function batchRegisterSection() {
  /** 玩家信息数据 */
  const playerInfo = ProxyObject.of({});
  /** 卡片容器 */
  const container = eDiv({ class: "card-container" });
  playerInfo.on("update", () => {
    const elemnents = [...container.children];
    // 数据更新时，从容器移除数据中不存在的卡片
    elemnents.filter((elem) => !(elem.id in playerInfo.data)).map((i) => i.remove());
    // 若容器中没有对应的卡片，则添加该卡片
    for (let i in playerInfo.data) {
      if (!elemnents.find((elem) => elem.id == i)) container.append(userCacheInfoCard(playerInfo, i));
    }
  });
  /** 后缀输入框 */
  const suffixInput = inputGroup().add(
    "suffix",
    { attr: { value: "minecraft.mc", maxLength: 32, pattern: "[0-9a-z]{1,}\\.[0-9a-z]{1,}", title: "需要符合邮箱格式的后缀，不包含“@”。" }, valMissing: "请提供一个用户名后缀。" },
    alignedItem("用户名后缀")("由于用户名必须是邮箱格式，因此需要为批量创建的用户添加符合邮箱格式的后缀。如：example.com")
  );
  /** usercache.json文件输入框 */
  const fileInput = inputElement("file", { accept: "application/json" }, async () => {
    const preparedData = {};
    if (!fileInput.files[0]) return;
    const { values, invalid } = suffixInput.getValues();
    if (invalid) {
      fileInput.value = "";
      return;
    }
    const [suffix] = values;
    const usercache = await fetch(URL.createObjectURL(new Blob([fileInput.files[0]], { type: "application/json" }))).then((res) => res.json());
    if (!Array.isArray(usercache)) return;
    // 通过Set移除重复的玩家名称，并构建玩家信息数据
    new Set(usercache.map((i) => i.name)).forEach((name) => (preparedData[name] = { username: `${name}@${suffix || "minecraft.mc"}`, password: name + "1234567", status: "待注册" }));
    // 合并到玩家信息数据中
    playerInfo.assign(preparedData);
  });
  /** 邀请码输入框 */
  const inviteCodeInput = inputGroup().add("code", { valMissing: "请提供一个邀请码。" }, alignedItem("邀请码")("同单个用户注册时需要的邀请码。应使用无使用次数和频率限制的系统邀请码。"));
  /** 提交按钮 */
  const btn = buttonElement(undefined, "确认", async () => {
    const { values, invalid } = inviteCodeInput.getValues();
    if (invalid) return;
    /** 基于现有数据构建出的用于提交注册的数据 */
    const data = Object.entries(playerInfo.data).map(([k, v]) => ({ originName: k, registerData: { username: v.username, password: v.password, nickName: v.username, inviteCode: values[0] } }));
    const result = await lockBtn(btn)(server.registerBatch(...data.map((i) => i.registerData)));
    // 将结果统一视作数组处理
    const resultArray = Array.isArray(result.body) ? result.body : [result.body];
    resultArray.forEach((v, i) => {
      /** 从刚刚提取中的数据获取的键名 */
      const currentUser = data[i].originName;
      if (v.error) {
        playerInfo.data[currentUser].status = `注册失败: ${v.errorMessage}`;
      } else {
        playerInfo.data[currentUser].status = "注册成功";
      }
    });
  });
  return addSection({
    id: "batch-register",
    name: "批量用户注册",
    desc: "用于从服务器迁移用户。该操作不能为用户创建角色。",
    contentElem: [card("批量注册", alignedItem("玩家信息缓存")("即服务器产生的usercache.json。")(fileInput), ...suffixInput.elements, container, ...inviteCodeInput.elements, alignedItem()()(btn))],
  });
}
function tempInviteCodeSection() {
  const btn = buttonElement(undefined, "获取", async () => {
    const { values, invalid } = input.getValues();
    if (invalid) return;
    const result = await lockBtn(btn)(server.getInviteCode(values[0]));
    if (result.error) {
      return dialogBox.show("获取邀请码失败", result.error);
    }
    container.innerHTML = "";
    result.body.forEach((i) => container.append(eDiv(html("code", i))));
  });
  const input = inputGroup().add("count", { el: "number", attr: { step: 1, value: 1, min: 1 }, valMissing: "请提供需要生成的邀请码数量。" }, (el) => alignedItem("要获取的邀请码数量")()(el, btn));
  const container = eDiv({ class: "invite-code-container" });
  return addSection({
    id: "temp-invite-code",
    name: "获取临时邀请码",
    desc: "可以批量获取临时邀请码。每个临时邀请码拥有30分钟有效期，用后即失效。最多可一次性申请1000个临时邀请码，最多可同时存在1000个有效的临时邀请码，请按需获取。",
    contentElem: [card("获取临时邀请码", ...input.elements, html("p", "邀请码列表"), container)],
  });
}
// 管理官方玩家名单（黑名单，白名单）
function officialPlayerMgmtSection() {
  return addSection({
    id: "official-player-mgmt",
    name: "管理官方玩家名单(未完成)",
    desc: "可以在此处管理通过本验证服务器加入过游戏的玩家名单。",
    contentElem: [],
  });
}
// 管理用户可申请的邀请码
function userInviteCodeSection() {
  return addSection({
    id: "user-invite-code-mgmt",
    name: "修改用户邀请码(未完成)",
    desc: "修改用户可申请的邀请码数量。",
    contentElem: [],
  });
}
//管理用户最大可拥有角色的数量
function userMaxProfileSection() {
  return addSection({
    id: "user-max-profile-mgmt",
    name: "管理用户可拥有角色数(未完成)",
    desc: "修改特定用户可拥有的角色数量。",
    contentElem: [],
  });
}
function queryLogSection() {
  const btn = buttonElement(undefined, "查询", async () => {
    const grammerMap = { logins: "log", errors: "jsstacktrace", webhooks: "log" };
    const [logName] = input.getValues().values;
    const result = await lockBtn(btn)(server.queryLogs(logName));
    if (result.error) {
      return dialogBox.show("查询日志失败", result.error);
    }
    pre.setAttribute("class", `language-${grammerMap[logName]}`);
    toHighlight(pre, result.body);
  });
  const pre = html("pre");
  const input = inputGroup().add("logName", { el: "select", options: { logins: "登录日志", errors: "错误日志", webhooks: "WebHook调用日志" } }, (el) => alignedItem("要查询的日志")()(el, btn));
  return addSection({
    id: "query-log",
    name: "查询服务器日志",
    desc: "查看服务器的登录日志和错误日志。",
    contentElem: [card("查询日志", ...input.elements, html("p", "日志内容"), eDiv(pre))],
  });
}
function modifySettingsSection() {
  const checkboxWarp = (el, desc, info) => alignedCheckbox(desc, info, el);
  const normalWarp = (el, desc, info) => alignedItem(desc)(info)(el);
  const inputConfig = [
    { path: "pubExtend.headerInfo", type: "textarea", desc: "自定义欢迎信息" },
    { path: "server.name", type: "string", desc: "验证服务器名称", required: true },
    { path: "server.homepage", type: "url", desc: "验证服务器主页", required: true },
    { path: "server.register", type: "url", desc: "验证服务器注册页", required: true },
    { path: "server.keyReqRL", type: "time", desc: "关键请求速率限制", info: "作用于影响账户安全的API和对服务器性能开销明显的API。", required: true },
    { path: "server.proxyCount", type: "integer", min: 0, desc: "反向代理服务器的数量", info: "服务端前面代理服务器的数量。如果存在 x-forwarded-for ，这个值决定了程序信任该头中的哪个ip。" },
    { path: "server.trustXRealIP", type: "boolean", desc: "是否信任 x-real-ip 头的值", info: "该选项的优先级大于 x-forwarded-for 。" },
    { path: "user.passLenLimit", type: "integer", min: 6, desc: "用户密码长度限制", required: true },
    { path: "user.inviteCodes", type: "array", desc: "验证服务器公共注册邀请码", info: "一行一个。留空则视为不启用公共注册邀请码。" },
    { path: "user.defaultSkin", type: "boolean", desc: "是否启用默认皮肤", info: "若禁用，无皮肤角色的profile里将不会包含默认皮肤的url。" },
    { path: "user.defaultSkinURL", type: "url", desc: "默认皮肤URL", required: true },
    { path: "user.uploadTexture", type: "boolean", desc: "是否允许上传材质到服务器" },
    { path: "user.userInviteCode", type: "boolean", desc: "是否启用用户邀请码" },
    { path: "user.offlineProfile", type: "boolean", desc: "是否允许创建兼容离线模式的角色", info: "即：使用和离线模式相同的方式计算新角色的uuid。" },
    { path: "user.keyOpRL", type: "time", desc: "用户关键行为速率限制", info: "包括使用邀请码、修改用户信息、为角色绑定微软账户。", required: true },
    { path: "user.maxProfileCount", type: "integer", min: 0, desc: "新用户可拥有的最大角色数量", required: true },
    { path: "user.defaultInviteCodeCount", type: "integer", desc: "新用户默认拥有的可生成邀请码次数", required: true },
    { path: "user.tokenTTL", type: "time", desc: "身份验证令牌过期时间", required: true },
    { path: "user.officialProxy", type: "boolean", desc: "是否允许正版玩家进入游戏", info: "建议同时安装 freedomchat 插件。" },
    {
      path: "user.officialPlayerWhitelist",
      type: "boolean",
      desc: "是否启用正版玩家白名单",
      info: "在保持 officialProxy 开启的情况下，使用白名单控制可加入服务器的正版玩家。若为false，则是使用黑名单控制不可加入服务器的正版玩家。",
    },
    { path: "user.changeOfflineProfileName", type: "boolean", desc: "是否允许修改兼容离线模式的角色名称", info: "该项禁用后，已经修改了名称的角色仍然可以继续使用修改后的名称。" },
    { path: "user.changeUserName", type: "boolean", desc: "是否允许修改用户名" },
    { path: "privExtend.enableSwaggerUI", type: "boolean", desc: "是否启用 SwaggerUI", info: "开启后，可通过 /docs 查看服务器注册的所有API。" },
    { path: "skinDomains", type: "array", desc: "皮肤服务器白名单", info: "一行一个。以“.”开头，可匹配其子域名；不以“.”开头，则匹配的域名须与规则完全相同。" },
    { path: "features.username_check", type: "boolean", desc: "可选功能：username_check", info: "指示 authlib-injector 是否启用用户名验证功能。" },
    { path: "features.non_email_login", type: "boolean", desc: "可选功能：non_email_login", info: "是否支持使用邮箱之外的凭证登录, 如角色名登录。" },
    { path: "features.enable_profile_key", type: "boolean", desc: "可选功能：enable_profile_key", info: "服务器是否支持 Minecraft 的消息签名密钥对功能, 即多人游戏中聊天消息的数字签名。" },
    { path: "features.no_mojang_namespace", type: "boolean", desc: "可选功能：no_mojang_namespace", info: "是否禁用 authlib-injector 的 Mojang 命名空间。" },
    { path: "features.enable_mojang_anti_features", type: "boolean", desc: "可选功能：enable_mojang_anti_features", info: "是否开启 Minecraft 的 anti-features。" },
  ].map((i) => ({ warp: i.type == "boolean" ? checkboxWarp : normalWarp, binding: serverConfig, ...i }));
  const inputs = inputGroup("object").template(...inputConfig);
  const btnModify = buttonElement("warning", "修改", async () => {
    const settings = {};
    const { values, invalid } = inputs.getValues();
    if (invalid) return;
    Object.entries(values).forEach(([key, value]) => {
      key.split(".").reduce((ac, v, i, ar) => {
        if (ac[v] instanceof Object) return ac[v];
        ac[v] = ar.length == i + 1 ? value : {};
        return ac[v];
      }, settings);
    });
    const result = await lockBtn(btnModify)(server.modifySettings(settings));
    if (result.error) {
      return dialogBox.show("修改服务器设置失败", result.error);
    }
    serverConfig.assign(result.body);
    dialogBox.show("修改服务器设置成功");
  });
  const btnRestartServer = buttonElement("error", "重启服务器", async () => {
    const confirmMsg = eSpan("确定要重启服务器吗？\n请在下方输入 ", eSpan({ style: "color:red;" }, "重启服务器"), " 以继续操作。");
    if (!(await confirmBox(confirmMsg, "重启服务器"))) return;
    const result = await lockBtn(btnRestartServer)(server.restart());
    if (result.error) {
      return dialogBox.show("发送重启指令失败", result.error);
    }
    dialogBox.show("已向服务器发送重启指令");
  });
  const btnReload = buttonElement(undefined, "重新加载服务器配置", async () => {
    const result = await lockBtn(btnReload)(server.settings());
    if (result.error) {
      return dialogBox.show("重载配置失败", result.error);
    }
    serverConfig.assign(result.body);
  });
  return addSection({
    id: "modify-settings",
    name: "修改服务器设置",
    desc: html(
      "p",
      "可以在此修改绝大部分服务器配置。有一些配置需要重新启动服务器才能应用。不可在此修改的配置包括：",
      html("code", "webhooks"),
      "、",
      html("code", "privateKeyPath"),
      "、",
      html("code", "user.passwdHashType"),
      "、",
      html("code", "server.cors"),
      "、",
      html("code", "server.root"),
      "、",
      html("code", "server.host"),
      "和",
      html("code", "server.port"),
      "。"
    ),
    contentElem: [card("修改服务器设置", ...inputs.elements, alignedItem()()(btnReload, btnModify), alignedItem()("会导致所有登录令牌失效、尚未使用的邀请码失效。")(btnRestartServer))],
  });
}
function webhookSection() {
  function addWebHookCard() {
    const input = inputGroup().add(
      "subjects",
      {
        el: "select",
        options: {
          test: "仅用于测试",
          "server.start": "服务器启动",
          "server.killed": "服务器关闭",
          "server.error": "服务器产生了错误",
          "user.login": "用户登录",
          "user.loginWithXbox": "用户通过绑定的微软账号登录",
          "user.logout": "用户退出登录（注销所有的登录会话）",
          "user.register": "新用户注册",
          "user.lock": "用户的账户被锁定",
          "user.delete": "用户被删除",
          "user.password.reset": "用户的密码被重置",
          "user.banned": "用户被封禁",
          "user.unbanned": "用户被解封",
          "profile.create": "创建了新的角色",
          "profile.delete": "角色被删除",
          "join.yggdrasil": "用户通过本验证服务器加入多人游戏",
          "join.official": "用户通过官方验证服务器加入多人游戏",
        },
      },
      alignedItem("订阅的事件")()
    );
    return card("添加Webhook钩子", ...input.elements);
  }
  const btnListWebhooks = buttonElement(undefined, "列出所有Webhook", async () => {
    const result = await lockBtn(btnListWebhooks)(server.getWebhooks());
    if (result.error) {
      return dialogBox.show("获取Webhook列表失败", result.error);
    }
    console.log(result);
  });
  return addSection({
    id: "webhook",
    name: "管理Webhook(未完成)",
    desc: "可以在此处配置WebHook，以监听服务器产生的各种事件。",
    contentElem: [card("Webhook", alignedItem()()(btnListWebhooks)), addWebHookCard()],
  });
}
function webHookCard(webhookConfig) {
  return card();
}
function errorReqSection(desc, errName, data) {
  return addSection({
    desc,
    id: "error",
    name: "错误",
    contentElem: [card(errName, toHighlight(html("pre", { class: "language-jsstacktrace" }, data)))],
  });
}
function buildLoginPage() {
  return () => {
    async function onLogin(sessionData) {
      server.localData(sessionData.accessToken, sessionData.uuid);
      [login, register, resetPass, queryUser].forEach((i) => i.remove());
      const result = await Promise.allSettled([buildUserPage(), getSettings()]);
      result.map((i) => i.value).forEach((i) => i());
      scrollIntoView(window.location.hash || "#does-not-exist");
    }
    const login = loginSection(onLogin);
    const register = registerSection(onLogin);
    const resetPass = resetPassSection();
    const queryUser = queryUserSection();
  };
}
async function buildUserPage() {
  /** 获取完整的用户信息 */
  const fullUserInfo = await server.getUserInfo();
  // 请求失败
  if (fullUserInfo.error) {
    dialogBox.show("获取用户信息失败", fullUserInfo.error);
    return buildLoginPage;
  }
  // 未能从响应中获取到用户名，则说明登录凭证已过期，需要重新登录
  if (!fullUserInfo.body.username) {
    server.localData();
    dialogBox.show("登录凭证已过期，请重新登录");
    return buildLoginPage;
  }
  return () => {
    const isAdmin = fullUserInfo.body.role == "admin";
    const showAdminContent = new URLSearchParams(location.search).get("mode") == "admin";
    if (fullUserInfo.body.role == "admin" && showAdminContent) {
      adminSwitchSection(false),
        banUserSection(),
        userInviteCodeSection(),
        userMaxProfileSection(),
        officialPlayerMgmtSection(),
        batchRegisterSection(),
        tempInviteCodeSection(),
        queryLogSection(),
        modifySettingsSection(),
        webhookSection();
    } else {
      userInfoSection(), fullUserInfo.body.profiles.forEach(profileSection), newProfileSection(), queryUserSection(), rescueSection(), issueInviteCodeSection(), dangerOpSection();
      isAdmin && adminSwitchSection(true);
    }
    userinfo.assign(fullUserInfo.body);
  };
}
async function getSettings() {
  /** 获取服务器配置 */
  const settingsRes = await server.settings();
  if (settingsRes.error) {
    errorReqSection("获取服务器配置失败", undefined, JSON.stringify(settingsRes));
    return () => undefined;
  }
  return () => serverConfig.assign(settingsRes.body);
}
async function getPageRender() {
  const accessToken = localStorage.getItem("accessToken");
  const userId = localStorage.getItem("userId");
  // 没有从 localStorage 获取到登录凭证，则显示登录界面
  if (!accessToken) {
    return buildLoginPage;
  }
  // 是否需要刷新token。通过 broadcast 检测是否需要刷新token：如果有回应，即存在多个相同页面，则不刷新token
  let refresh = !(await broadcast.ping(50));
  // 需要刷新登录token
  if (refresh) {
    const refreshRes = await server.refresh(accessToken);
    // 刷新失败
    if (refreshRes.error) {
      // 清除本地数据，渲染登录页面
      server.localData();
      dialogBox.show("登录凭证已过期，请重新登录");
      return buildLoginPage;
    }
    // 刷新成功，设置新的登录凭证
    server.localData(refreshRes.body.accessToken, refreshRes.body.uuid);
  } else {
    // 不需要刷新，使用本地数据
    server.localData(accessToken, userId);
  }
  return buildUserPage;
}

try {
  // 渲染服务器信息页面
  headerSection();
  const pageRender = await getPageRender();
  const result = await Promise.allSettled([pageRender(), getSettings()]);
  result.map((i) => i.value).forEach((i) => i());
  scrollIntoView(window.location.hash || "#does-not-exist");
} catch (e) {
  errorReqSection("网页加载出错，错误堆栈如下：", e.error, e.stack);
}
