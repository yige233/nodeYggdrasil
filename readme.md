## node-yggdrasil-server

基于 Nodejs 的实现了[ Yggdrasil 服务端技术规范 ](https://github.com/yushijinhun/authlib-injector/wiki/Yggdrasil-%E6%9C%8D%E5%8A%A1%E7%AB%AF%E6%8A%80%E6%9C%AF%E8%A7%84%E8%8C%83)的 Yggdrasil 认证服务端

### 注意

> [!WARNING]
> 下方的部分内容已经不再适用于[Commit 270f494](https://github.com/yige233/nodeYggdrasil/commit/270f4949c3824f934d33ddf3ac43968c89148850)后的版本。
> 并且在新版的前端做完之前，都可能不会更新readme。如果有疑问，可以发discussion或issue。

### 一些特点

- 无需配置数据库。如果只是想开个原版服/有一些开服经验，但不多/嫌配置数据库麻烦(比如我)，又觉得盗版服不安全，而且玩家数量不会很多，那么我认为这种无数据库式的外置登录验证服务器还是很香的。
- [yggdrasil-mock](https://github.com/yushijinhun/yggdrasil-mock)测试结果：`73 passing (18s)  4 failing` 4 个失败的原因是，材质 url 提供的 hash 与测试程序计算得出的不符。(不是很明白测试端是怎么计算的, mojang 官方材质 url 也会这样。)
- 前后端分离。在 yggdrasil API 之外，还提供了一套简单的 restful 的 API，借此可以深度修改网页端的用户界面，不会对服务器产生影响。(项目本身也有提供一个简陋的用户界面，具有基本的功能。不介意的话也能凑合用)
- 支持开启`feature.enable_profile_key`，这样服务器就可以在`server.properties`中配置`enforce-secure-profile`为 true，以及在兼容正版用户很有用。
- 兼容正版用户加入服务器。也就是只需要服务器配置了本验证服务器就行，正版用户就可以**直接进入**服务器了。并且正版用户只需要设置一些[Java 虚拟机参数](#客户端启动器使用-jvm-参数)，就可以获得**更好**的兼容体验。

### 安装/构建

> [!WARNING]
> `npm run init`已经被弃用。

| 步骤         | 命令/操作                                                             | 说明                                                   |
| ------------ | --------------------------------------------------------------------- | ------------------------------------------------------ |
| 需求         | `Nodejs v18.16.0`                                                     |                                                        |
| 下载         | [Releases](https://github.com/yige233/nodeYggdrasil/releases/)        | 包括源代码和已经构建好的代码                           |
| 安装依赖     | `npm install --omit=dev`                                              | 不加`--omit=dev`的话，会同时下载开发需要的依赖         |
| 初始化程序   | `npm run init`                                                        | 得先创建配置文件和装数据的文件夹，程序才不会运行不起来 |
| 修改配置文件 | 打开`./data/config.json`，参考[配置文件](#配置文件)的说明，修改，保存 | 直接运行也不是不行，但是要让服务器能给其他人用是不够的 |
| 运行         | `npm start`                                                           | 也可以用 `node ./build/index.js`                       |
| 构建         | `npm run build`                                                       | 前提是安装了开发需要的依赖包                           |

### 配置文件

> [!WARNING]
> 配置文件中的部分字段名称和内容格式发生了改变。

```jsonc
{
  "server": {
    /** 服务器监听的地址(空字符串被视为监听所有地址)。可以填某个单独的IP地址；填0.0.0.0就是监听所有的ipv4地址；填127.0.0.1就是只监听本地地址。 */
    "host": "", //(关键)
    /** 验证服务器使用的端口。不和其他程序冲突了就行。如果冲突了，程序会直接运行不了。 */
    "port": 5400, //(关键)
    /** 验证服务器的名称，一些启动器会把这个显示给玩家看。 */
    "name": "NodeYggdrasilServer",
    /**
     * 验证服务器的根路径。这项是服务器最终对外开放时的根路径。用于向用户提示 Yggdrasil API 的地址(以斜杠'/'结尾)，并在用户上传材质时构建正确的材质url。
     * 也就是说填写错误的话，启动器会找不到服务器，以及不能加载用户上传的材质。
     */
    "root": "http://localhost:5400/", //(关键)
    /** 服务器的主页地址。 */
    "homepage": "http://localhost:5400/",
    /** 服务器的注册页地址。 */
    "register": "http://localhost:5400/",
    /** 关键请求速率限制。作用于影响用户账户安全的api。(毫秒) */
    "keyReqRateLimit": 300,
    /** 服务器前方的代理服务器数量，包括nginx、apache、cloudflare或者其他的cdn。
     * 该项决定了程序如何获取用户的ip地址，并避免获取到伪造的ip地址。如果此项不为0，前面的host一定要填127.0.0.1。
     */
    "proxyCount": 0,
    /** 是否信任由 x-real-ip 请求头提供的IP地址。如果为true，前面的host一定要填127.0.0.1。相对于上一项，该项的优先级最高。 */
    "trustXRealIP": false
  },
  "user": {
    /** 用户密码的hash方式。可选的有HMACsha256和sha256。 */
    "passwdHashType": "HMACsha256",
    /** 用户登录令牌的过期时间(小时)。令牌的暂时失效时间为该时间的一半。 */
    "tokenValidityPeriod": 336,
    /** 用户密码最短长度。姑且还是要注意一下密码安全（ */
    "passLenLimit": 8,
    /** 单个用户最多可以拥有的角色的数量。 */
    "maxProfileCount": 5,
    /** 系统邀请码。用户注册机制采用了邀请码机制，需要拥有邀请码才能注册。系统邀请码不受下面的使用频率限制，因此要注意防止泄露。 */
    "inviteCodes": [],
    /** 邀请码使用频率限制(分钟)。由于每个用户都会有一个邀请码，所以需要这个限制，来避免短时间内大量注册用户。新用户的邀请码会一开始就加上这个冷却时间。 */
    "inviteCodeUseRateLimit": 3600,
    /** 是否禁用用户邀请码。 */
    "disableUserInviteCode": false,
    /** 是否启用兼容正版登录(由于存在可能会带来的兼容性问题，所以默认是关闭的)。 */
    "enableOfficialProxy": false,
    /** 是否禁用从本机上传皮肤。 */
    "disableUploadTexture": false
  },
  /** 程序使用的私钥路径。通常不需要修改，而且程序会在这个默认路径下生成一个私钥。 */
  "privateKeyPath": "./data/privkey.pem",
  //
  /** 允许加载的皮肤域名。如果本服务器有用户上传的皮肤，需要把本服务器的域名填在里面。 */
  "skinDomains": ["littleskin.cn", ".littleskin.cn", "localhost", ".minecraft.net"],
  //
  "features": {
    /** 是否允许使用角色名登录。 */
    "non_email_login": true,
    /** 是否禁止带有汉字字符的玩家进入。 */
    "username_check": false,
    /** 是否支持 Minecraft 的消息签名密钥对功能。如果需要兼容正版玩家进服，最好选择开启。 */
    "enable_profile_key": false,
    /** 是否禁用 authlib-injector 的 Mojang 命名空间。不懂就不用改。 */
    "no_mojang_namespace": false,
    /** 是否开启 Minecraft 的 anti-features。不懂就不用改。 */
    "enable_mojang_anti_features": false
  },
  /** 这里是公共可见的扩展字段，可以存储一些额外的信息。 */
  "pubExtend": {
    /** 比如这个就是本项目自带的用户界面使用的一个字段，用于向所有人展示公告消息。 */
    "headerInfo": "可以是一段公告"
  },
  /** 仅管理员可见的私有扩展字段。 */
  "privExtend": {
    /** 启用内置的 swagger API 文档页面。其路径为: /docs。需要重启服务。（程序依赖的一个解析formdata的插件引入了 swagger，那么正好加以利用 */
    "enableSwaggerUI": false
  }
}
```

#### 开始使用

> [!WARNING]
> 前端界面正在重做，下方的内容仅供参考。

<i>不要忘记先修改配置文件中的关键部分。</i>

<i>要求提供用户名、角色名和 uuid 的多数场合，都是大小写不敏感的。角色名在显示时会保留大小写状态。</i>

- 服务器一开始是没有任何账户的，所以你需要打开服务器的用户注册界面，创建第一个用户。地址可以是`http://localhost:5400/`。创建第一个账户不需要使用邀请码，且会自动成为管理员账户。用户名需要是个邮箱，原因是防止某些启动器把账号+密码登录误认为角色名+密码登录。昵称目前没有任何卵用，只是觉得应该有这么个玩意……
- 然后就可以开始创建第一个角色了。角色名称可以填中文，但总长度要小于 30 位。`是否兼容离线验证`可以让生成的角色的 uuid 和离线模式的一致。可以从 Mojang 复制一位正版角色、从 littleSkin 导入材质或披风，也可以在服务器允许的情况下自行上传。
- 为服务端启用外置登录，可参见[在 Minecraft 服务端使用 authlib injector](https://github.com/yushijinhun/authlib-injector/wiki/%E5%9C%A8-Minecraft-%E6%9C%8D%E5%8A%A1%E7%AB%AF%E4%BD%BF%E7%94%A8-authlib-injector)；在 1.16 及更高版本，可以使用 jvm 参数配置外置登录。[使用 jvm 参数](#服务端使用-jvm-参数)
- 对于启动器来说，如果支持拖入，那么把网页最上方的`也可以拖动此链接到支持的启动器`拖动到启动器里就可以(对于本项目自带的用户界面)，之后登录即可。
- 管理员可以封禁一位用户。提供用户 UUID、角色 UUID 或角色名称，以及封禁时长(分钟)。多次封禁时长不叠加。将封禁时长设为 0，即可视为解封用户。封禁会强制注销该用户的所有会话。被封禁期间，无法登录、无法删除用户，也不能使用该用户的邀请码注册新用户。
- 管理员也拥有批量注册用户的权限。对于本项目自带的用户页面来说，上传`usercache.json`，就可以批量为服务器里的玩家创建账户。对于本项目自带的用户界面，批量创建后的密码是`角色名1234567`。这里同样需要邀请码，而用户邀请码同样会受到冷却的限制，所以建议使用系统邀请码。
- 管理员可以手动生成临时的邀请码，这些邀请码具有 30 分钟的有效期，使用一次后即作废。
- 管理员还可以自由修改服务器设置，可以通过 web 修改除 `privateKeyPath`、`server.host`、`server.root` 和 `server.port` 之外的任何其他配置项。但是只能修改已存在的项，不能新增项也不能删除项。有一些项需要重新启动程序才能应用。
- 为了防止忘记密码后无法登录，设计了一套救援码系统。用户登录后可以生成一个救援码，忘记密码时可以通过该救援码重置密码。救援码需要由用户自行保存，且服务器只会生成一次。对于没有生成过救援码的账户，就没法找回了。

### 邀请码是什么，可以不用吗

> [!WARNING]
> 邀请码的规则已经发生变更，特别是用户邀请码的部分。

有三种邀请码：

- 用户邀请码：不会过期、有使用频率限制、受 user.disableUserInviteCode 影响。
- 系统邀请码：可用与否取决于管理员设置、无使用频率限制。
- 临时邀请码：具有有效期、只能使用一次、只能由管理员生成，可以生成任意数量。

除了首次注册不需要邀请码，其他任何时候注册都需要提供邀请码。如果需要实现“公开注册”，只需要设置并公开一个系统邀请码即可。

### 所以到底怎么获取公钥和私钥

现在不需要知道如何获取密钥了，程序会在初始化时自己生成一个。

### 使用 jvm 参数

如果游戏版本大于等于 1.16，不用 authlib-injector，我们也可以使用外置登录服务。

#### 服务端使用 jvm 参数

在服务器启动命令中添加如下参数（其中${yggdrasilRoot}应替换为自己的 yggdrasil API 地址）：

```bash
-Dminecraft.api.env=custom
-Dminecraft.api.auth.host=${yggdrasilRoot}/authserver
-Dminecraft.api.account.host=${yggdrasilRoot}
-Dminecraft.api.session.host=${yggdrasilRoot}/sessionserver
-Dminecraft.api.services.host=${yggdrasilRoot}/minecraftservices
```

#### 客户端（启动器）使用 jvm 参数

这里只针对：想要进入配置了 nodeYggdrasil API 的服务器的正版用户。

如果仅仅是进入服务器，只需要修改 nodeYggdrasil 的相关设置即可。但由于正版玩家的游戏不认识验证服务器的公钥，这会导致：

- 由于无法验证非正版玩家的皮肤签名，正版玩家看不见非正版玩家的皮肤。
- 由于聊天签名机制的引入，正版玩家无法验证盗非正版玩家的聊天消息。版本 1.19 到 1.20.4 之前的游戏会把正版玩家踢出；1.20.4 及之后的游戏，正版玩家的客户端会拒绝显示非正版玩家的聊天消息。(可以通过安装一个插件解决：[freedomchat](https://modrinth.com/plugin/freedomchat))

因此，可以通过添加以下 java 虚拟机参数，来缓解上述问题。其中${yggdrasilRoot}应替换为自己的 yggdrasil API 地址。注意，是**java 虚拟机参数（jvm 参数）**，而不是**游戏参数**

```bash
-Dminecraft.api.session.host=${yggdrasilRoot}/sessionserver
-Dminecraft.api.services.host=${yggdrasilRoot}/minecraftservices
```

- 如果这么做了，意味着 nodeYggdrasil 将会扮演您连接到 Mojang API 的**代理**的角色。您的登录 token 会被发送到 nodeYggdrasil 服务器，最好在**完全信任** nodeYggdrasil 服务器，以及**连接安全**(nodeYggdrasil 服务器使用了 https)的情况下，再这么做。如果上述两项条件都不满足，可能会导致：
  - 登录 token 被恶意 nodeYggdrasil 服务器所有者盗用。
  - 登录 token 被恶意中间人盗用。
- 若非正版玩家的皮肤**不是由复制正版玩家的皮肤**而来，那么正版玩家仍然看不见非正版玩家的皮肤，这是由于非正版玩家的皮肤 URL 不在白名单中，因此游戏拒绝加载。目前没有解决的方法。

### demo

[https://yggdrasil.doveyige.eu.org/](https://yggdrasil.doveyige.eu.org/)是本项目的 demo 站点。可以使用下列的账号密码登录:

| 账号              | 密码   | 说明                                                               |
| ----------------- | ------ | ------------------------------------------------------------------ |
| test1@example.com | 111111 | 无角色                                                             |
| test2@example.com | 222222 | 拥有 1 个角色`character1`，有皮肤和披风                            |
| test3@example.com | 333333 | 拥有两个角色`character2`和`character3`，分别拥有一个皮肤和一个披风 |

- 服务器的根 yggdrasil API: `https://yggdrasil.doveyige.eu.org/yggdrasil`
- 关键请求速率限制：`1000ms`
- 令牌过期时间：14 天。（但服务器每天会重启所以最多 1 天就会失效）
- 进入 MC 服务器的验证时限:`30s`
- 可以使用角色名称登录
- 兼容正版玩家进入服务器
- **⚠️ 注意 ⚠️**服务器会记录账户登录时的 IP 地址。若介意请勿登录。
- 若担心登录 token 安全问题，请不要为正版用户设置[这里](#客户端启动器使用-jvm-参数)所述的 jvm 参数。或者你可以通过重新登录正版账号来使原先的登录 token 失效。
